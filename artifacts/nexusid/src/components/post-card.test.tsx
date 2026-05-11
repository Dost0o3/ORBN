import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import PostCard from "./post-card";

// Hoisted mocks shared between describe blocks. We mock the generated
// API hooks (we're testing the rendering branches, not the network) and
// Clerk's useUser so we can flip "viewer is author" vs "viewer is
// someone else" without mounting Clerk.
const mocks = vi.hoisted(() => ({
  clerkUserId: null as string | null,
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: mocks.clerkUserId ? { id: mocks.clerkUserId } : null, isSignedIn: !!mocks.clerkUserId, isLoaded: true }),
}));

// Per-test override for the mocked comments list so individual cases can
// stage authored / anonymous / mine comment fixtures without re-mocking
// the whole module.
const apiMocks = vi.hoisted(() => ({
  comments: [] as unknown[],
  blockedUserIds: [] as string[],
}));

vi.mock("@workspace/api-client-react", () => ({
  useLikePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnlikePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCommentAnonymity: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRepostPost: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBlockUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnblockUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReportUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useListMyBlocks: () => ({ data: { blockedUserIds: apiMocks.blockedUserIds } }),
  useGetPostComments: () => ({ data: { comments: apiMocks.comments } }),
  getGetPostCommentsQueryKey: () => ["comments"],
  getListMyBlocksQueryKey: () => ["myBlocks"],
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function renderPost(post: Record<string, unknown>, opts?: { showComments?: boolean }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const memory = memoryLocation({ path: "/feed" });
  return render(
    <QueryClientProvider client={qc}>
      <Router hook={memory.hook}>
        <PostCard post={post} showComments={opts?.showComments ?? false} />
      </Router>
    </QueryClientProvider>,
  );
}

describe("<PostCard /> — anonymous (Ghost Mode) rendering", () => {
  beforeEach(() => {
    mocks.clerkUserId = null;
    apiMocks.comments = [];
    apiMocks.blockedUserIds = [];
  });

  it("renders 'Anonymous' (not the real author name) for a non-author viewer when isAnonymous=true", () => {
    // The server already redacts `author` to null for non-author viewers
    // when isAnonymous=true. The card must NOT leak any other identity.
    mocks.clerkUserId = "clerk_other_viewer";
    renderPost({
      id: 1,
      content: "secret thoughts",
      author: null,
      isAnonymous: true,
      isLiked: false,
      likesCount: 0,
      commentsCount: 0,
      repostsCount: 0,
      hashtags: [],
      createdAt: new Date().toISOString(),
    });
    expect(screen.getByText("Anonymous")).toBeInTheDocument();
    expect(screen.getByText("Ghost")).toBeInTheDocument();
    // No accidental link to a profile (the avatar/name should not be a link).
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("does NOT redact for a non-anonymous post — shows the real author and links to their profile", () => {
    mocks.clerkUserId = "clerk_other_viewer";
    renderPost({
      id: 2,
      content: "loud and proud",
      author: {
        id: "u_real",
        clerkId: "clerk_author",
        username: "realauthor",
        displayName: "Real Author",
        avatarUrl: null,
        bountiesWon: 0,
      },
      isAnonymous: false,
      isLiked: false,
      likesCount: 0,
      commentsCount: 0,
      repostsCount: 0,
      hashtags: [],
      createdAt: new Date().toISOString(),
    });
    expect(screen.getByText("Real Author")).toBeInTheDocument();
    expect(screen.queryByText("Anonymous")).toBeNull();
    expect(screen.queryByText("Ghost")).toBeNull();
    // Profile link present for non-anonymous posts.
    const links = screen.getAllByRole("link");
    expect(links.some((l) => l.getAttribute("href")?.includes("/profile/u_real"))).toBe(true);
  });

  it("still renders 'Anonymous' for the author themselves — visible identity is driven entirely by isAnonymous, not by viewer", () => {
    // Even when the server returns the author's profile to the author
    // themselves (so they can use the delete dropdown via the isOwner
    // clerkId check), the public-facing label on the card stays
    // "Anonymous" so the author can SEE that the post is anonymous to
    // everyone else. This pins down the contract: a future change that
    // flips the visible name to the real author when viewer == author
    // would silently teach users they're not actually anonymous.
    mocks.clerkUserId = "clerk_author";
    renderPost({
      id: 3,
      content: "my own ghost post",
      author: {
        id: "u_self",
        clerkId: "clerk_author",
        username: "selfauthor",
        displayName: "Self Author",
        avatarUrl: null,
        bountiesWon: 0,
      },
      isAnonymous: true,
      isLiked: false,
      likesCount: 0,
      commentsCount: 0,
      repostsCount: 0,
      hashtags: [],
      createdAt: new Date().toISOString(),
    });
    expect(screen.getByText("Anonymous")).toBeInTheDocument();
    expect(screen.getByText("Ghost")).toBeInTheDocument();
    expect(screen.queryByText("Self Author")).toBeNull();
    expect(screen.queryByText("@selfauthor")).toBeNull();
  });
});

describe("<PostCard /> — comment-row Block / Report overflow menu", () => {
  beforeEach(() => {
    mocks.clerkUserId = null;
    apiMocks.comments = [];
    apiMocks.blockedUserIds = [];
  });

  // The post card already exposes Block / Report on the post header. Task
  // #65 extends the same flow to comment rows so a viewer can act without
  // navigating to the offender's profile first. The menu must:
  //   - appear on someone-else's authored comments
  //   - be hidden on anonymous comments (no identity to block/report)
  //   - be hidden on the viewer's own comments
  it("shows the overflow trigger only on someone-else's non-anonymous comment", () => {
    mocks.clerkUserId = "clerk_viewer";
    apiMocks.comments = [
      {
        id: 11,
        content: "yours truly",
        isAnonymous: false,
        author: { id: "u_viewer", clerkId: "clerk_viewer", displayName: "Me", avatarUrl: null, verificationTier: null },
      },
      {
        id: 12,
        content: "from a stranger",
        isAnonymous: false,
        author: { id: "u_other", clerkId: "clerk_other", displayName: "Stranger", avatarUrl: null, verificationTier: null },
      },
      {
        id: 13,
        content: "hidden voice",
        isAnonymous: true,
        author: null,
      },
    ];
    renderPost({
      id: 99,
      content: "thread starter",
      author: { id: "u_op", clerkId: "clerk_op", displayName: "OP", username: "op", avatarUrl: null, bountiesWon: 0 },
      isAnonymous: false,
      isLiked: false,
      likesCount: 0,
      commentsCount: 3,
      repostsCount: 0,
      hashtags: [],
      createdAt: new Date().toISOString(),
    }, { showComments: true });

    // Only the stranger's comment exposes the overflow menu — not the
    // viewer's own and not the anonymous one.
    expect(screen.getByLabelText("More actions for comment by Stranger")).toBeInTheDocument();
    expect(screen.queryByLabelText("More actions for comment by Me")).toBeNull();
  });
});
