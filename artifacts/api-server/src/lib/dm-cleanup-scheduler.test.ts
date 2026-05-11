import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

// Stub out the database module so the scheduler's audit-row insert/update
// chain doesn't require a real connection. The scheduler is the unit under
// test here; the sweep itself is dependency-injected per test.
vi.mock("@workspace/db", () => {
  const insertChain = {
    values: () => ({
      returning: () => Promise.resolve([{ id: 1 }]),
    }),
  };
  const updateChain = {
    set: () => ({
      where: () => Promise.resolve([]),
    }),
  };
  return {
    db: {
      insert: () => insertChain,
      update: () => updateChain,
      delete: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }),
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    },
    directConversationsTable: {},
    directMessagesTable: {},
    directMessageCleanupRunsTable: { id: "id" },
  };
});

const warnSpy = vi.fn();
const infoSpy = vi.fn();
const errorSpy = vi.fn();
vi.mock("./logger", () => ({
  logger: {
    warn: (...a: unknown[]) => warnSpy(...a),
    info: (...a: unknown[]) => infoSpy(...a),
    error: (...a: unknown[]) => errorSpy(...a),
    debug: () => {},
  },
}));

import { startDirectMessagesCleanupJob } from "./dm-cleanup";

const okResult = { deletedCount: 0, conversationsUpdated: 0 };

describe("startDirectMessagesCleanupJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    warnSpy.mockClear();
    infoSpy.mockClear();
    errorSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fires the sweep once immediately on startup", async () => {
    const sweep = vi.fn().mockResolvedValue(okResult);
    const stop = startDirectMessagesCleanupJob(1000, { sweep });
    // Flush the `void tick()` microtask queued at startup.
    await vi.advanceTimersByTimeAsync(0);
    expect(sweep).toHaveBeenCalledTimes(1);
    stop();
  });

  it("fires another sweep after one full interval has elapsed", async () => {
    const sweep = vi.fn().mockResolvedValue(okResult);
    const stop = startDirectMessagesCleanupJob(1000, { sweep });
    await vi.advanceTimersByTimeAsync(0);
    expect(sweep).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(sweep).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(sweep).toHaveBeenCalledTimes(3);
    stop();
  });

  it("skips the next tick when the previous sweep is still running and emits a warn", async () => {
    let resolveFirst: (v: typeof okResult) => void = () => {};
    const sweep = vi
      .fn<() => Promise<typeof okResult>>()
      .mockImplementationOnce(
        () =>
          new Promise<typeof okResult>((res) => {
            resolveFirst = res;
          }),
      )
      .mockResolvedValue(okResult);

    const stop = startDirectMessagesCleanupJob(1000, { sweep });
    await vi.advanceTimersByTimeAsync(0);
    expect(sweep).toHaveBeenCalledTimes(1);

    // The first sweep is still pending. Advancing one interval should fire
    // the scheduled tick, but the overlap guard must short-circuit it.
    await vi.advanceTimersByTimeAsync(1000);
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ job: "dm-cleanup" }),
      expect.stringMatching(/previous run still in progress/i),
    );

    // Resolve the first sweep so the running flag clears, then the next
    // tick should run normally.
    resolveFirst(okResult);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sweep).toHaveBeenCalledTimes(2);
    stop();
  });

  it("returned teardown clears the interval and prevents further ticks", async () => {
    const sweep = vi.fn().mockResolvedValue(okResult);
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    const stop = startDirectMessagesCleanupJob(1000, { sweep });
    await vi.advanceTimersByTimeAsync(0);
    expect(sweep).toHaveBeenCalledTimes(1);

    stop();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    // Even after several intervals worth of fake time, no further sweeps
    // should fire — the interval has been torn down.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sweep).toHaveBeenCalledTimes(1);

    clearIntervalSpy.mockRestore();
  });

  it("calls unref() on the underlying interval timer so it doesn't keep the event loop alive", async () => {
    const sweep = vi.fn().mockResolvedValue(okResult);
    const unrefSpy = vi.fn();
    const fakeSetInterval = vi.spyOn(global, "setInterval");

    const stop = startDirectMessagesCleanupJob(1000, { sweep });

    expect(fakeSetInterval).toHaveBeenCalledTimes(1);
    const timer = fakeSetInterval.mock.results[0]?.value as NodeJS.Timeout;
    // The fake-timer object exposes unref. We can't observe the call after
    // the fact, so re-verify the contract by spying ahead of a second call.
    expect(typeof timer.unref).toBe("function");
    stop();

    // Now spy on unref before the second start to assert it's invoked.
    const realSetInterval = global.setInterval.bind(global);
    vi.stubGlobal(
      "setInterval",
      ((cb: (...args: unknown[]) => void, ms?: number) => {
        const t = realSetInterval(cb, ms) as NodeJS.Timeout;
        t.unref = unrefSpy as unknown as NodeJS.Timeout["unref"];
        return t;
      }) as unknown as typeof setInterval,
    );

    const stop2 = startDirectMessagesCleanupJob(1000, { sweep });
    expect(unrefSpy).toHaveBeenCalledTimes(1);
    stop2();

    fakeSetInterval.mockRestore();
  });
});
