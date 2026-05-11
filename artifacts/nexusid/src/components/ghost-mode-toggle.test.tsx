import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Hoisted state shared with the api-client mock so tests can drive the
// "current user has ghostMode on/off" + watch what enabled value the
// mutation was called with.
const mocks = vi.hoisted(() => ({
  meGhostMode: false as boolean,
  setGhostModeMutate: vi.fn(async (_args: { data: { enabled: boolean } }) => undefined),
  invalidateQueries: vi.fn(async () => undefined),
  toast: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetMe: () => ({ data: { ghostMode: mocks.meGhostMode } }),
  useGetUnreadNotificationCount: () => ({ data: { count: 0 } }),
  useGetUnreadDirectMessageCount: () => ({ data: { count: 0 } }),
  useGetPowerScore: () => ({ data: { score: 0, rank: "RECRUIT" } }),
  useSetGhostMode: () => ({ mutateAsync: mocks.setGhostModeMutate, isPending: false }),
  getGetMeQueryKey: () => ["getMe"],
  getGetUnreadDirectMessageCountQueryKey: () => ["unreadDM"],
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: { id: "clerk_x" }, isSignedIn: true, isLoaded: true }),
}));

import { GhostModeToggle } from "./app-layout";

function renderToggle() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GhostModeToggle />
    </QueryClientProvider>,
  );
}

describe("<GhostModeToggle /> — sidebar Ghost Mode UX", () => {
  beforeEach(() => {
    mocks.meGhostMode = false;
    mocks.setGhostModeMutate.mockClear();
    mocks.setGhostModeMutate.mockImplementation(async () => undefined);
    mocks.invalidateQueries.mockClear();
    mocks.toast.mockClear();
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("reflects server-persisted off-state on initial render", () => {
    renderToggle();
    const btn = screen.getByRole("button", { name: /Ghost Mode/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn).toHaveTextContent(/Off/);
  });

  it("reflects server-persisted on-state on initial render (the 'persists across reload' contract)", () => {
    mocks.meGhostMode = true;
    renderToggle();
    const btn = screen.getByRole("button", { name: /Ghost Mode/i });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toHaveTextContent(/On/);
  });

  it("calls the API with enabled:true, invalidates getMe, and shows the success toast on toggle on", async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole("button", { name: /Ghost Mode/i }));

    await waitFor(() => {
      expect(mocks.setGhostModeMutate).toHaveBeenCalledTimes(1);
    });
    expect(mocks.setGhostModeMutate).toHaveBeenCalledWith({ data: { enabled: true } });
    // After a successful flip we must invalidate the /me query so the rest
    // of the app picks up the new server state — that's what makes the
    // toggle "persist across navigation/reload" within the SPA.
    expect(mocks.invalidateQueries).toHaveBeenCalled();
    // Success toast confirms to the user that Ghost Mode is now on.
    const toastCall = mocks.toast.mock.calls.find(
      (call) => typeof call[0]?.title === "string" && call[0].title.includes("Ghost Mode on"),
    );
    expect(toastCall).toBeTruthy();
  });

  it("rolls back localStorage and toasts an error if the API call fails", async () => {
    mocks.setGhostModeMutate.mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole("button", { name: /Ghost Mode/i }));

    await waitFor(() => {
      const errToast = mocks.toast.mock.calls.find(
        (call) => typeof call[0]?.title === "string" && call[0].title.includes("Could not update Ghost Mode"),
      );
      expect(errToast).toBeTruthy();
    });
    // localStorage should reflect the original (off) state after rollback.
    expect(window.localStorage.getItem("nexusid-ghost-mode")).toBe("false");
  });
});
