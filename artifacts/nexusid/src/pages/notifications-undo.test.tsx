import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Hoisted state shared with the api-client + fetch mocks so each test can
// stage its own notifications payload and observe how the page reacts.
const mocks = vi.hoisted(() => ({
  notifications: [] as Array<Record<string, unknown>>,
  refetch: vi.fn(async () => undefined),
  markAllMutate: vi.fn(async () => undefined),
  fetchImpl: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  useListNotifications: () => ({
    data: { notifications: mocks.notifications, unreadCount: 0 },
    refetch: mocks.refetch,
  }),
  useMarkAllNotificationsRead: () => ({
    mutateAsync: mocks.markAllMutate,
    isPending: false,
  }),
}));

// MobileFeedTopBar pulls in the entire app shell (Clerk, wouter, theme,
// power-score, etc.). We don't need any of that to exercise the Undo
// affordance, so stub it out to a no-op.
vi.mock("@/components/app-layout", () => ({
  MobileFeedTopBar: () => null,
}));

import NotificationsPage from "./notifications";

// Helper: build an autonomy notification whose single sub-entry was
// executed `executedAgoMs` milliseconds ago. Each test uses a unique
// label so within-row queries can locate the entry without colliding.
function autonomyNotification(opts: {
  notifId: number;
  actionId: number;
  label: string;
  executedAgoMs: number;
  reverted?: boolean;
}): Record<string, unknown> {
  const executedAt = new Date(Date.now() - opts.executedAgoMs).toISOString();
  return {
    id: opts.notifId,
    type: "agent_executed",
    message: "Soul Twin acted on your behalf.",
    read: false,
    createdAt: executedAt,
    metadata: {
      count: 1,
      actions: [
        {
          actionId: opts.actionId,
          kind: "follow",
          label: opts.label,
          link: `/profile/u-${opts.actionId}`,
          auditLink: `/ai/soul-twin?action=${opts.actionId}`,
          executedAt,
          reverted: opts.reverted ?? false,
        },
      ],
    },
  };
}

beforeEach(() => {
  mocks.notifications = [];
  mocks.refetch.mockClear();
  mocks.markAllMutate.mockClear();
  mocks.fetchImpl.mockReset();
  // Default: empty queue. Tests that exercise undo override the impl.
  mocks.fetchImpl.mockImplementation(async (url: string) => {
    if (typeof url === "string" && url.includes("/queue")) {
      return {
        ok: true,
        json: async () => ({ actions: [] }),
      } as unknown as Response;
    }
    return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
  });
  globalThis.fetch = mocks.fetchImpl as unknown as typeof fetch;
});

describe("<NotificationsPage /> — autonomy Undo affordance", () => {
  it("clicking Undo on a fresh entry flips it to a struck-through 'Reverted' badge and removes the button", async () => {
    const label = "Followed @alice-fresh";
    mocks.notifications = [
      autonomyNotification({
        notifId: 1,
        actionId: 42,
        label,
        executedAgoMs: 1_000, // well within UNDO_GRACE_MS (10 min)
      }),
    ];

    // Wire the undo POST to (a) return success and (b) mutate the
    // notifications fixture so the post-undo refetch picks up the
    // reverted=true flag the server would have stamped on the metadata.
    mocks.fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url !== "string") {
        return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      }
      if (url.includes("/queue")) {
        return { ok: true, json: async () => ({ actions: [] }) } as unknown as Response;
      }
      if (url.includes("/agent/executed/42/undo") && init?.method === "POST") {
        // Server-side: mark the matching entry reverted. The page's
        // refetch() + loadQueue() chain will re-render against this.
        mocks.notifications = [
          autonomyNotification({
            notifId: 1,
            actionId: 42,
            label,
            executedAgoMs: 1_000,
            reverted: true,
          }),
        ];
        return {
          ok: true,
          json: async () => ({ success: true, reverted: true, kind: "follow" }),
        } as unknown as Response;
      }
      return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
    });

    render(<NotificationsPage />);

    // Pre-click: label is a clickable anchor (not struck through), Undo
    // button is present.
    const labelLink = await screen.findByRole("link", { name: label });
    expect(labelLink.tagName).toBe("A");
    expect(labelLink.className).not.toMatch(/line-through/);
    expect(screen.queryByText(/^Reverted$/)).toBeNull();

    const undoBtn = screen.getByRole("button", { name: /Undo/i });
    expect(undoBtn).toBeInTheDocument();

    // Click Undo — page POSTs, refetches, then re-renders with the
    // server's mutated metadata.
    const user = userEvent.setup();
    await user.click(undoBtn);

    await waitFor(() => {
      expect(mocks.refetch).toHaveBeenCalled();
    });

    // Post-click assertions: "Reverted" badge present, label rendered as
    // a struck-through span (no longer an anchor), Undo button gone.
    await waitFor(() => {
      expect(screen.getByText(/^Reverted$/)).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: label })).toBeNull();
    const struck = screen.getByText(label);
    expect(struck.className).toMatch(/line-through/);
    expect(screen.queryByRole("button", { name: /Undo/i })).toBeNull();

    // Sanity: the POST hit the correct endpoint with the correct method.
    const undoCall = mocks.fetchImpl.mock.calls.find(
      ([u, init]) =>
        typeof u === "string" &&
        u.includes("/agent/executed/42/undo") &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    expect(undoCall).toBeTruthy();
  });

  it("does NOT render an Undo button when the entry's executedAt is past UNDO_GRACE_MS", async () => {
    const label = "Followed @alice-stale";
    mocks.notifications = [
      autonomyNotification({
        notifId: 2,
        actionId: 99,
        label,
        // 15 min ago — UNDO_GRACE_MS is 10 min, so the client must
        // refuse to render the button (mirrors the server-side 410).
        executedAgoMs: 15 * 60 * 1000,
      }),
    ];

    render(<NotificationsPage />);

    // The label still appears as a normal anchor (the entry is shown as
    // historical context), but no Undo button is rendered for it.
    const labelLink = await screen.findByRole("link", { name: label });
    const row = labelLink.closest("li");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByRole("button", { name: /Undo/i })).toBeNull();
    // And no "Reverted" badge either — it was simply never undone, just
    // aged out of the grace window.
    expect(within(row as HTMLElement).queryByText(/^Reverted$/)).toBeNull();
  });

  it("does NOT render an Undo button when the entry is already marked reverted", async () => {
    const label = "Followed @alice-already-reverted";
    mocks.notifications = [
      autonomyNotification({
        notifId: 3,
        actionId: 7,
        label,
        executedAgoMs: 1_000,
        reverted: true,
      }),
    ];

    render(<NotificationsPage />);

    expect(await screen.findByText(/^Reverted$/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Undo/i })).toBeNull();
    // Label is rendered as the struck-through span variant.
    const struck = screen.getByText(label);
    expect(struck.className).toMatch(/line-through/);
  });
});
