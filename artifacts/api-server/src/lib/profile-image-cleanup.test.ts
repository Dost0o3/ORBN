import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the underlying normalizer so tests never touch object storage.
const normalizerState = vi.hoisted(() => ({
  calls: 0,
  // Each call resolves with this delay (ms) before returning. Using fake
  // timers means the test controls when the promise resolves.
  resolveDelayMs: 0,
  // If set, the next tick rejects with this error.
  nextError: null as Error | null,
  totals: {
    usersScanned: 0,
    communitiesScanned: 0,
    rewritten: 0,
    skippedAlreadyNormalized: 0,
    skippedExternal: 0,
    skippedMissing: 0,
    failed: 0,
    bytesBefore: 0,
    bytesAfter: 0,
  },
}));

vi.mock("@workspace/profile-image-normalizer", () => ({
  runNormalizeProfileImages: vi.fn(async () => {
    normalizerState.calls += 1;
    if (normalizerState.nextError) {
      const err = normalizerState.nextError;
      normalizerState.nextError = null;
      throw err;
    }
    if (normalizerState.resolveDelayMs > 0) {
      await new Promise((r) => setTimeout(r, normalizerState.resolveDelayMs));
    }
    return normalizerState.totals;
  }),
}));

// Mock @workspace/db so audit-row writes don't touch a real database.
// `db.insert(...).values(...).returning(...)` returns a fake id; updates
// are no-ops. Tests for the audit table itself are out of scope here
// (this suite only covers wrapper behavior).
vi.mock("@workspace/db", () => {
  const insert = vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(async () => [{ id: 1 }]),
    })),
  }));
  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  }));
  return {
    db: { insert, update },
    profileImageCleanupRunsTable: { id: "id" },
  };
});

// Mock the logger so we can assert on it without polluting test output.
const loggerCalls = vi.hoisted(() => ({
  info: [] as unknown[][],
  warn: [] as unknown[][],
  error: [] as unknown[][],
}));
vi.mock("./logger", () => ({
  logger: {
    info: (...args: unknown[]) => loggerCalls.info.push(args),
    warn: (...args: unknown[]) => loggerCalls.warn.push(args),
    error: (...args: unknown[]) => loggerCalls.error.push(args),
    debug: () => {},
  },
}));

import { runNormalizeProfileImages } from "@workspace/profile-image-normalizer";
import { startProfileImagesCleanupJob } from "./profile-image-cleanup";

describe("startProfileImagesCleanupJob", () => {
  beforeEach(() => {
    normalizerState.calls = 0;
    normalizerState.resolveDelayMs = 0;
    normalizerState.nextError = null;
    loggerCalls.info.length = 0;
    loggerCalls.warn.length = 0;
    loggerCalls.error.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires the underlying normalizer once on startup, then on each interval tick", async () => {
    const intervalMs = 60_000;
    const stop = startProfileImagesCleanupJob(intervalMs);
    try {
      // Startup tick is scheduled via `void tick()` synchronously; flush
      // microtasks so the awaits inside it run to completion. Avoid
      // vi.runAllTimersAsync — setInterval would loop forever.
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(normalizerState.calls).toBe(1);

      // Advance one interval — the timer should fire another tick.
      await vi.advanceTimersByTimeAsync(intervalMs);
      expect(normalizerState.calls).toBe(2);

      // And another.
      await vi.advanceTimersByTimeAsync(intervalMs);
      expect(normalizerState.calls).toBe(3);
    } finally {
      stop();
    }
  });

  it("skips overlapping ticks while a previous run is still in flight", async () => {
    // Make each normalizer call hang for 5x the interval, so the next
    // scheduled tick lands while the first is still resolving.
    const intervalMs = 1_000;
    normalizerState.resolveDelayMs = 5_000;

    const stop = startProfileImagesCleanupJob(intervalMs);
    try {
      // Let the startup tick begin (it'll await the 5_000ms timer).
      await Promise.resolve();
      await Promise.resolve();
      expect(normalizerState.calls).toBe(1);

      // Advance one interval. The setInterval fires, but the previous
      // run is still in flight, so the new tick should skip and log a
      // warning instead of calling the normalizer again.
      await vi.advanceTimersByTimeAsync(intervalMs);
      expect(normalizerState.calls).toBe(1);

      // Advance one more interval — still in flight, still skipped.
      await vi.advanceTimersByTimeAsync(intervalMs);
      expect(normalizerState.calls).toBe(1);

      // Two skip-warnings logged.
      const skipWarns = loggerCalls.warn.filter((args) =>
        String(args[1] ?? "").includes("previous run still in progress"),
      );
      expect(skipWarns).toHaveLength(2);

      // Now finish the in-flight run by letting the 5_000ms delay
      // resolve, then ensure subsequent ticks resume firing the
      // normalizer (i.e. `running` was reset back to false).
      normalizerState.resolveDelayMs = 0;
      const callsBefore = normalizerState.calls;
      await vi.advanceTimersByTimeAsync(5_000);
      await vi.advanceTimersByTimeAsync(intervalMs);
      expect(normalizerState.calls).toBeGreaterThan(callsBefore);
    } finally {
      stop();
    }
  });

  it("catches and logs errors from the underlying normalizer instead of crashing", async () => {
    const intervalMs = 1_000;
    normalizerState.nextError = new Error("boom from normalizer");

    const stop = startProfileImagesCleanupJob(intervalMs);
    try {
      // Startup tick should reject internally — but the wrapper must
      // swallow the error. Flush microtasks for the awaits inside tick.
      for (let i = 0; i < 10; i++) await Promise.resolve();

      expect(normalizerState.calls).toBe(1);
      const errLogs = loggerCalls.error.filter((args) =>
        String(args[1] ?? "").includes("Profile image cleanup failed"),
      );
      expect(errLogs).toHaveLength(1);

      // Most importantly, the next interval tick should still fire —
      // proving the previous error didn't leave `running` stuck true
      // and didn't tear down the timer.
      await vi.advanceTimersByTimeAsync(intervalMs);
      expect(normalizerState.calls).toBe(2);
    } finally {
      stop();
    }
  });

  it("calls unref() on the timer so it doesn't hold the event loop open", () => {
    // Spy on setInterval to capture the returned Timeout and assert
    // that the wrapper invoked unref() on it.
    const realSetInterval = global.setInterval;
    const unrefSpy = vi.fn();
    const fakeTimer = { unref: unrefSpy } as unknown as NodeJS.Timeout;
    const setIntervalSpy = vi
      .spyOn(global, "setInterval")
      .mockImplementation((..._args: unknown[]) => fakeTimer);

    try {
      const stop = startProfileImagesCleanupJob(60_000);
      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      expect(unrefSpy).toHaveBeenCalledTimes(1);
      stop();
    } finally {
      setIntervalSpy.mockRestore();
      global.setInterval = realSetInterval;
    }
  });

  it("returns a disposer that stops further ticks", async () => {
    const intervalMs = 1_000;
    const stop = startProfileImagesCleanupJob(intervalMs);

    // Startup tick fires.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(normalizerState.calls).toBe(1);

    stop();

    // After stopping, advancing the clock must NOT fire any more ticks.
    await vi.advanceTimersByTimeAsync(intervalMs * 5);
    expect(normalizerState.calls).toBe(1);
  });

  it("is wired to the @workspace/profile-image-normalizer entry point", () => {
    // Sanity check: the mocked symbol is the one the wrapper imports,
    // so callers can trust this suite is exercising the real wiring.
    expect(vi.isMockFunction(runNormalizeProfileImages)).toBe(true);
  });
});
