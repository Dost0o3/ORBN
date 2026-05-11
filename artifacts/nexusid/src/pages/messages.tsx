import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  MessageSquare,
  MoreVertical,
  Search,
  Send,
  ShieldAlert,
  ShieldOff,
  Timer,
  Plus,
  Undo2,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { MobileFeedTopBar } from "@/components/app-layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  useGetMe,
  useGetUserById,
  useListDirectConversations,
  useGetDirectConversationMessages,
  useSendDirectMessage,
  useSendTypingIndicator,
  useSearchUsers,
  useBlockUser,
  useUnblockUser,
  useReportUser,
  useListMyBlocks,
  getSearchUsersQueryKey,
  getGetUserByIdQueryKey,
  getListDirectConversationsQueryKey,
  getGetDirectConversationMessagesQueryKey,
  getGetUnreadDirectMessageCountQueryKey,
  getListMyBlocksQueryKey,
  type DirectConversationSummary,
  type DirectMessage,
  type UserProfile,
} from "@workspace/api-client-react";
import { useDmInboxStream } from "@/hooks/use-dm-inbox-stream";
import { isOnline } from "@/hooks/use-presence-heartbeat";

const TTL_OPTIONS: Array<{ label: string; seconds: number | null }> = [
  { label: "Off", seconds: null },
  { label: "1 min", seconds: 60 },
  { label: "1 hr", seconds: 60 * 60 },
  { label: "24 hr", seconds: 60 * 60 * 24 },
];

function useQueryParams(): URLSearchParams {
  const [location] = useLocation();
  return useMemo(() => {
    const idx = location.indexOf("?");
    return new URLSearchParams(idx === -1 ? "" : location.slice(idx));
  }, [location]);
}

function ConversationRow({
  conv,
  active,
  isTyping,
  myUserId,
  onSelect,
}: {
  conv: DirectConversationSummary;
  active: boolean;
  isTyping: boolean;
  myUserId: string | null;
  onSelect: () => void;
}) {
  const peer = conv.peer;
  const preview = conv.lastMessage?.content ?? "Start a conversation…";
  const when = conv.lastMessage?.createdAt ?? conv.lastMessageAt;
  const peerOnline = isOnline(peer.lastSeenAt ?? null);
  // Sent/Read indicator on the conversation list itself (task #67) — only
  // when MY last message is the most recent one in the thread, so the row
  // can mirror what the open-thread bubble shows. We deliberately suppress
  // the indicator while the peer is composing a reply because "typing…"
  // already replaces the preview text and stacking both reads as noise.
  const lastMessage = conv.lastMessage ?? null;
  const lastIsMine =
    !!lastMessage && !!myUserId && lastMessage.senderId === myUserId;
  const showStatus = lastIsMine && !isTyping;
  const statusRead = !!lastMessage?.readAt;
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-l-2",
        active
          ? "bg-[#E8754A]/8 border-[#E8754A]"
          : "border-transparent hover:bg-white/3 hover:border-[#E8754A]/30",
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="w-10 h-10 border border-[#E8754A]/20">
          <AvatarImage src={peer.avatarUrl ?? undefined} />
          <AvatarFallback className="text-xs bg-[#E8754A]/10 text-[#E8754A] font-bold">
            {(peer.displayName ?? peer.username ?? "U")[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {peerOnline && (
          <span
            aria-label="Online now"
            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#22c55e] ring-2 ring-black"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white/85 truncate">
            {peer.displayName ?? peer.username}
          </span>
          <span className="ml-auto text-[10px] text-white/30 font-bold uppercase tracking-wider shrink-0">
            {when
              ? formatDistanceToNow(new Date(when), { addSuffix: false })
              : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p
            className={cn(
              "text-xs truncate flex-1",
              isTyping
                ? "text-[#E8754A] font-bold italic"
                : conv.unreadCount > 0
                  ? "text-white/85 font-bold"
                  : "text-white/45 font-medium",
            )}
          >
            {isTyping ? (
              "typing…"
            ) : (
              <>
                {conv.lastMessage?.expiresAt ? (
                  <Timer className="inline w-3 h-3 mr-1 -mt-0.5 text-[#E8754A]/70" />
                ) : null}
                {showStatus && (
                  <span
                    aria-label={statusRead ? "Read" : "Sent"}
                    title={
                      statusRead && lastMessage?.readAt
                        ? `Read ${formatDistanceToNow(new Date(lastMessage.readAt), { addSuffix: true })}`
                        : "Sent"
                    }
                    data-testid={
                      statusRead
                        ? "conv-status-read"
                        : "conv-status-sent"
                    }
                    className={cn(
                      "inline-flex items-center mr-1 -mt-0.5 align-middle",
                      statusRead ? "text-[#E8754A]" : "text-white/35",
                    )}
                  >
                    <CheckCheck className="w-3 h-3" />
                  </span>
                )}
                {preview}
              </>
            )}
          </p>
          {conv.unreadCount > 0 && (
            <span className="bg-[#DC143C] text-white text-[9px] font-black w-4 h-4 flex items-center justify-center shrink-0">
              {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function MessageBubble({
  msg,
  mine,
}: {
  msg: DirectMessage;
  mine: boolean;
}) {
  const expiresAt = msg.expiresAt ? new Date(msg.expiresAt) : null;
  // Treat the message as expired if the server flagged it OR if the local
  // clock has passed `expiresAt` (so the placeholder appears the instant the
  // timer hits zero, without waiting for a refetch).
  const isExpired =
    msg.expired === true ||
    (expiresAt !== null && expiresAt.getTime() <= Date.now());
  // Soul Twin DM undo (task #72): the cache writes a synthetic `unsent`
  // flag onto the affected row when the dm-inbox `unsent` SSE arrives, so
  // the bubble flips to a tombstone immediately for both parties without
  // waiting for a refetch (which would simply drop the row, since the
  // server hard-deletes it). Distinct copy from the self-destruct
  // placeholder so the recipient sees this was a deliberate retraction
  // rather than a TTL.
  const isUnsent = (msg as { unsent?: boolean }).unsent === true;
  const isPlaceholder = isExpired || isUnsent;
  const expiresIn =
    !isPlaceholder && expiresAt
      ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000))
      : null;
  return (
    <div
      className={cn(
        "flex flex-col max-w-[78%]",
        mine ? "items-end self-end" : "items-start self-start",
      )}
    >
      <div
        className={cn(
          "px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words",
          isPlaceholder
            ? "bg-white/4 text-white/40 italic font-medium border border-dashed border-white/15 flex items-center gap-2"
            : mine
              ? "bg-[#E8754A] text-black font-medium"
              : "bg-white/8 text-white/90 font-medium border border-white/10",
        )}
        data-testid={isUnsent ? "msg-unsent" : isExpired ? "msg-expired" : "msg-bubble"}
      >
        {isUnsent ? (
          <>
            <Undo2 className="w-3.5 h-3.5 shrink-0" />
            <span>{mine ? "You unsent this message" : "This message was unsent"}</span>
          </>
        ) : isExpired ? (
          <>
            <Timer className="w-3.5 h-3.5 shrink-0" />
            <span>This message has self-destructed</span>
          </>
        ) : (
          msg.content
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-white/30 font-bold uppercase tracking-wider">
        <span>
          {msg.createdAt
            ? formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })
            : ""}
        </span>
        {expiresIn !== null && (
          <>
            <span>·</span>
            <span className="flex items-center gap-1 text-[#E8754A]/75">
              <Timer className="w-3 h-3" />
              {expiresIn >= 3600
                ? `${Math.round(expiresIn / 3600)}h`
                : expiresIn >= 60
                  ? `${Math.round(expiresIn / 60)}m`
                  : `${expiresIn}s`}{" "}
              left
            </span>
          </>
        )}
        {mine && !isPlaceholder && (
          <>
            <span>·</span>
            {msg.readAt ? (
              <span
                className="flex items-center gap-1 text-[#E8754A]"
                data-testid="status-read"
                title={`Read ${formatDistanceToNow(new Date(msg.readAt), { addSuffix: true })}`}
              >
                <CheckCheck className="w-3 h-3" />
                Read
              </span>
            ) : (
              <span
                className="flex items-center gap-1 text-white/40"
                data-testid="status-sent"
              >
                <Check className="w-3 h-3" />
                Sent
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function NewMessageDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (user: UserProfile) => void;
}) {
  const [q, setQ] = useState("");
  const searchParams = { q: q || undefined, limit: 20 };
  const { data } = useSearchUsers(searchParams, {
    query: {
      queryKey: getSearchUsersQueryKey(searchParams),
      enabled: open,
    },
  });
  const { data: me } = useGetMe();
  const users = (data?.users ?? []).filter((u) => u.id !== me?.id);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-black border border-[#E8754A]/25 max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8754A]/15">
          <span className="font-black text-sm uppercase tracking-wider text-white/90">
            New message
          </span>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/70 transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-[#E8754A]/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or username"
              className="pl-9 bg-white/5 border-white/15 text-sm"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {users.length === 0 ? (
            <div className="py-8 text-center text-white/30 text-sm font-medium">
              No users found
            </div>
          ) : (
            users.map((u) => (
              <button
                key={u.id}
                onClick={() => onPick(u)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors text-left"
              >
                <Avatar className="w-9 h-9 border border-[#E8754A]/20">
                  <AvatarImage src={u.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-xs bg-[#E8754A]/10 text-[#E8754A] font-bold">
                    {(u.displayName ?? u.username ?? "U")[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white/85 truncate">
                    {u.displayName ?? u.username}
                  </div>
                  <div className="text-xs text-white/35 truncate">
                    @{u.username}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ReportDialog({
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("");
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-black border border-[#E8754A]/25 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="font-black text-sm uppercase tracking-wider text-white/90">
            Report user
          </span>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/70 transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-white/50 mb-3 font-medium">
          Tell our moderators what's wrong. The user will also be blocked.
        </p>
        <Textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What happened? (optional)"
          rows={4}
          maxLength={1000}
          className="resize-none bg-white/5 border-white/15 text-sm"
        />
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            onClick={onClose}
            className="bg-transparent border border-white/15 text-white/70 hover:bg-white/5 font-black uppercase tracking-wider text-[11px]"
          >
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit(reason.trim())}
            disabled={isPending}
            className="bg-[#DC143C] hover:bg-[#ff3358] text-white font-black uppercase tracking-wider text-[11px]"
          >
            {isPending ? "Submitting…" : "Report & block"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatThread({
  conversationId,
  draftPeer,
  peerIsTyping,
  onMessageSent,
  onBack,
}: {
  conversationId: number | null;
  draftPeer: UserProfile | null;
  peerIsTyping: boolean;
  onMessageSent: (newConversationId: number, peer: UserProfile) => void;
  onBack: () => void;
}) {
  const { data: me } = useGetMe();
  const { data, isLoading } = useGetDirectConversationMessages(
    conversationId ?? 0,
    {},
    {
      query: {
        queryKey: getGetDirectConversationMessagesQueryKey(conversationId ?? 0),
        enabled: conversationId !== null,
      },
    },
  );
  const queryClient = useQueryClient();
  const sendMessage = useSendDirectMessage();
  const sendTyping = useSendTypingIndicator();
  const lastTypingSentRef = useRef<number>(0);
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();
  const reportUser = useReportUser();
  const { data: blocksData } = useListMyBlocks({
    query: { queryKey: getListMyBlocksQueryKey() },
  });
  const blockedIds = new Set(blocksData?.blockedUserIds ?? []);
  const [content, setContent] = useState("");
  const [ttlSeconds, setTtlSeconds] = useState<number | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const peer: UserProfile | null =
    draftPeer ?? (data?.peer as UserProfile | undefined) ?? null;
  const messages = (data?.messages ?? []) as DirectMessage[];
  const peerOnline = isOnline(peer?.lastSeenAt ?? null);
  const isBlocked = peer ? blockedIds.has(peer.id) : false;

  const handleTyping = (next: string) => {
    setContent(next);
    if (!peer || !next.trim()) return;
    // Throttle typing pings — once every ~2.5s while composing is enough for
    // the recipient to see a steady "typing…" without spamming the server.
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2500) return;
    lastTypingSentRef.current = now;
    sendTyping
      .mutateAsync({ data: { recipientId: peer.id } })
      .catch(() => {
        /* typing pings are best-effort */
      });
  };

  // Close the action menu when clicking outside.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const refreshAfterModeration = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListMyBlocksQueryKey() }),
      queryClient.invalidateQueries({
        queryKey: getListDirectConversationsQueryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: getGetUnreadDirectMessageCountQueryKey(),
      }),
    ]);
  };

  const handleBlock = async () => {
    if (!peer) return;
    setMenuOpen(false);
    try {
      await blockUser.mutateAsync({ userId: peer.id });
      await refreshAfterModeration();
      toast({ title: `Blocked @${peer.username}` });
    } catch {
      toast({
        title: "Could not block user",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleUnblock = async () => {
    if (!peer) return;
    setMenuOpen(false);
    try {
      await unblockUser.mutateAsync({ userId: peer.id });
      await refreshAfterModeration();
      toast({ title: `Unblocked @${peer.username}` });
    } catch {
      toast({
        title: "Could not unblock user",
        variant: "destructive",
      });
    }
  };

  const handleReport = async (reason: string) => {
    if (!peer) return;
    try {
      await reportUser.mutateAsync({
        userId: peer.id,
        data: {
          reason: reason || undefined,
          conversationId: conversationId ?? null,
        },
      });
      // Reporting also blocks, per the dialog copy.
      await blockUser.mutateAsync({ userId: peer.id });
      await refreshAfterModeration();
      setReportOpen(false);
      toast({ title: "Report submitted", description: "User has been blocked." });
    } catch {
      toast({
        title: "Could not submit report",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, conversationId]);

  // Whenever a thread becomes visible, refresh the unread badge — the GET above
  // marks messages read server-side, but the badge query needs to be invalidated.
  useEffect(() => {
    if (conversationId !== null) {
      queryClient.invalidateQueries({
        queryKey: getGetUnreadDirectMessageCountQueryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: getListDirectConversationsQueryKey(),
      });
    }
  }, [conversationId, queryClient, data]);

  const handleSend = async () => {
    if (!peer || !content.trim() || sendMessage.isPending) return;
    try {
      const sent = await sendMessage.mutateAsync({
        data: {
          recipientId: peer.id,
          content: content.trim(),
          ...(ttlSeconds ? { ttlSeconds } : {}),
        },
      });
      setContent("");
      // For a brand-new conversation, the API created one — pick up its id and
      // hand it back to the parent so the URL/selection update.
      if (conversationId === null) {
        onMessageSent(sent.conversationId, peer);
        setLocation(`/messages?c=${sent.conversationId}`);
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getGetDirectConversationMessagesQueryKey(
            sent.conversationId,
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: getListDirectConversationsQueryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: getGetUnreadDirectMessageCountQueryKey(),
        }),
      ]);
    } catch {
      toast({
        title: "Could not send message",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!peer) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-white/25 px-6 text-center">
        <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">
          Pick a conversation or start a new one.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8754A]/15 bg-black/40">
        <button
          onClick={onBack}
          className="lg:hidden text-white/45 hover:text-white/85 transition-colors -ml-1"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Avatar className="w-9 h-9 border border-[#E8754A]/20">
          <AvatarImage src={peer.avatarUrl ?? undefined} />
          <AvatarFallback className="text-xs bg-[#E8754A]/10 text-[#E8754A] font-bold">
            {(peer.displayName ?? peer.username ?? "U")[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white/90 truncate">
              {peer.displayName ?? peer.username}
            </span>
            {peerOnline && (
              <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#22c55e]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                Online
              </span>
            )}
          </div>
          <div className="text-[11px] text-white/35 truncate">
            {peerIsTyping ? (
              <span className="text-[#E8754A] font-bold italic">typing…</span>
            ) : (
              <>@{peer.username}</>
            )}
          </div>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="text-white/45 hover:text-white/85 transition-colors p-1"
            aria-label="Conversation actions"
            data-testid="button-conversation-actions"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-40 w-44 bg-black border border-[#E8754A]/25 shadow-lg">
              {isBlocked ? (
                <button
                  onClick={handleUnblock}
                  disabled={unblockUser.isPending}
                  data-testid="button-unblock-user"
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-white/85 hover:bg-white/5 transition-colors"
                >
                  <ShieldOff className="w-3.5 h-3.5 text-[#E8754A]" />
                  Unblock user
                </button>
              ) : (
                <button
                  onClick={handleBlock}
                  disabled={blockUser.isPending}
                  data-testid="button-block-user"
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-white/85 hover:bg-white/5 transition-colors"
                >
                  <ShieldOff className="w-3.5 h-3.5 text-[#DC143C]" />
                  Block user
                </button>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }}
                data-testid="button-open-report"
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-white/85 hover:bg-white/5 transition-colors border-t border-white/5"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-[#DC143C]" />
                Report user
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2.5"
      >
        {isLoading && conversationId !== null ? (
          <div className="text-center text-white/30 text-xs font-bold uppercase tracking-wider py-6">
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-white/30 text-sm font-medium py-6">
            No messages yet. Say hello.
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                msg={m}
                mine={m.senderId === me?.id}
              />
            ))}
            {peerIsTyping && (
              <div className="flex items-center gap-1.5 self-start text-[11px] font-bold italic text-white/55 px-1">
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-white/55 animate-pulse" />
                  <span
                    className="w-1 h-1 rounded-full bg-white/55 animate-pulse"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="w-1 h-1 rounded-full bg-white/55 animate-pulse"
                    style={{ animationDelay: "300ms" }}
                  />
                </span>
                {peer.displayName ?? peer.username} is typing…
              </div>
            )}
          </>
        )}
      </div>

      {isBlocked ? (
        <div
          className="border-t border-[#DC143C]/30 bg-[#DC143C]/5 px-4 py-4 text-center"
          data-testid="banner-user-blocked"
        >
          <p className="text-xs text-white/70 font-medium mb-2">
            You blocked @{peer.username}. They can't message you and won't appear in your inbox.
          </p>
          <button
            onClick={handleUnblock}
            disabled={unblockUser.isPending}
            className="text-[11px] font-black uppercase tracking-wider text-[#E8754A] hover:text-[#ffb48c] transition-colors"
          >
            Unblock to send messages
          </button>
        </div>
      ) : (
      <div className="border-t border-[#E8754A]/15 bg-black/40 px-3 py-3 space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
          <Timer className="w-3 h-3 text-[#E8754A]/70" />
          <span className="text-white/40">Self-destruct</span>
          {TTL_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setTtlSeconds(opt.seconds)}
              className={cn(
                "px-2 py-0.5 border transition-colors",
                ttlSeconds === opt.seconds
                  ? "border-[#E8754A] text-[#E8754A] bg-[#E8754A]/10"
                  : "border-white/10 text-white/40 hover:text-white/70",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            value={content}
            onChange={(e) => handleTyping(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Write a message…"
            rows={1}
            className="resize-none bg-white/5 border-white/15 text-sm min-h-[40px] max-h-32"
          />
          <Button
            onClick={handleSend}
            disabled={!content.trim() || sendMessage.isPending}
            className="bg-[#E8754A] hover:bg-[#ffb48c] text-black font-black uppercase tracking-wider text-[11px] px-3 py-2 h-10 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      )}
      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmit={handleReport}
        isPending={reportUser.isPending || blockUser.isPending}
      />
    </div>
  );
}

export default function MessagesPage() {
  const queryParams = useQueryParams();
  const initialConvParam = queryParams.get("c");
  const initialPeerParam = queryParams.get("to");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data } = useListDirectConversations({
    query: { queryKey: getListDirectConversationsQueryKey(), refetchInterval: 30000 },
  });
  const conversations = (data?.conversations ?? []) as DirectConversationSummary[];
  // Needed to decide whether the conversation row's last message is mine
  // and so should show the Sent/Read indicator (task #67).
  const { data: me } = useGetMe();

  const [selectedId, setSelectedId] = useState<number | null>(
    initialConvParam ? Number(initialConvParam) : null,
  );
  const [draftPeer, setDraftPeer] = useState<UserProfile | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);

  // Map of peerUserId -> timestamp until which they're considered "typing".
  // We expire entries client-side so the indicator naturally goes away when
  // the sender stops pinging.
  const [typingUntil, setTypingUntil] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Presence heartbeat is mounted app-wide near the auth provider, so peers
  // see us online whenever we have the app open — not just on this page.

  useDmInboxStream(true, (ev) => {
    if (ev.type === "message") {
      // Refresh the conversation list so previews/order/unread badge update,
      // and the open thread (if any) so the new bubble appears.
      queryClient.invalidateQueries({
        queryKey: getListDirectConversationsQueryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: getGetDirectConversationMessagesQueryKey(ev.message.conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: getGetUnreadDirectMessageCountQueryKey(),
      });
    } else if (ev.type === "read") {
      // Peer just opened the thread — refresh it so own bubbles flip from
      // "Sent" to "Read", AND refresh the conversation list so the row's
      // Sent/Read indicator (task #67) flips in real time too. Without the
      // second invalidation the sidebar would stay stale until the 30s
      // poll fired.
      queryClient.invalidateQueries({
        queryKey: getGetDirectConversationMessagesQueryKey(ev.conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: getListDirectConversationsQueryKey(),
      });
    } else if (ev.type === "expired") {
      // A self-destructing DM just hit its TTL on the server. Refresh the
      // affected thread so the bubble flips to the "self-destructed"
      // placeholder immediately, and refresh the conversation list so any
      // preview text drops away too.
      queryClient.invalidateQueries({
        queryKey: getGetDirectConversationMessagesQueryKey(ev.conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: getListDirectConversationsQueryKey(),
      });
    } else if (ev.type === "unsent") {
      // A Soul Twin DM the recipient may have already seen was just
      // retracted on the server. Server hard-deletes the row, so a plain
      // refetch would simply make the bubble vanish — instead we mutate
      // the cached query in place and stamp `unsent: true` on the
      // matching message so MessageBubble flips to a tombstone
      // ("This message was unsent") for both parties immediately.
      // Conversation list still gets invalidated so the preview text
      // falls back to the prior message.
      queryClient.setQueryData<{ messages: DirectMessage[]; peer: unknown }>(
        getGetDirectConversationMessagesQueryKey(ev.conversationId),
        (old) => {
          if (!old) return old;
          let touched = false;
          const messages = old.messages.map((m) => {
            if (m.id !== ev.messageId) return m;
            touched = true;
            return { ...m, content: "", unsent: true } as DirectMessage;
          });
          return touched ? { ...old, messages } : old;
        },
      );
      queryClient.invalidateQueries({
        queryKey: getListDirectConversationsQueryKey(),
      });
    } else if (ev.type === "typing") {
      // Treat typing pings as fresh for ~5s. The sender re-pings every 2.5s
      // while composing, so the indicator stays steady, then fades.
      setTypingUntil((m) => ({ ...m, [ev.fromUserId]: Date.now() + 5000 }));
    }
  });

  const isPeerTyping = (peerId: string): boolean =>
    (typingUntil[peerId] ?? 0) > now;

  // If the URL says we want to compose a new DM to a specific user, look them up.
  // The `to` param can be either a user id (UUID) or a username — UUID lookups go
  // through GET /users/:id, while name lookups fall back to a fuzzy search.
  const looksLikeUuid = !!initialPeerParam && /^[0-9a-f-]{20,}$/i.test(initialPeerParam);
  const { data: peerById } = useGetUserById(initialPeerParam ?? "", {
    query: {
      queryKey: getGetUserByIdQueryKey(initialPeerParam ?? ""),
      enabled: !!initialPeerParam && !initialConvParam && looksLikeUuid,
    },
  });
  const peerSearchParams = { q: initialPeerParam ?? undefined, limit: 5 };
  const { data: peerLookup } = useSearchUsers(peerSearchParams, {
    query: {
      queryKey: getSearchUsersQueryKey(peerSearchParams),
      enabled: !!initialPeerParam && !initialConvParam && !looksLikeUuid,
    },
  });
  useEffect(() => {
    if (!initialPeerParam || initialConvParam) return;
    const candidate: UserProfile | undefined = looksLikeUuid
      ? (peerById as UserProfile | undefined)
      : (peerLookup?.users ?? []).find(
          (u) =>
            u.id === initialPeerParam || u.username === initialPeerParam,
        );
    if (!candidate) return;
    const existing = conversations.find((c) => c.peer.id === candidate.id);
    if (existing) {
      setSelectedId(existing.id);
      setDraftPeer(null);
      setLocation(`/messages?c=${existing.id}`, { replace: true });
    } else {
      setDraftPeer(candidate);
      setSelectedId(null);
    }
  }, [
    initialPeerParam,
    initialConvParam,
    looksLikeUuid,
    peerById,
    peerLookup,
    conversations,
    setLocation,
  ]);

  // Auto-select the first conversation on desktop if nothing chosen yet.
  useEffect(() => {
    if (
      selectedId === null &&
      !draftPeer &&
      !initialConvParam &&
      !initialPeerParam &&
      conversations.length > 0 &&
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches
    ) {
      setSelectedId(conversations[0].id);
    }
  }, [
    conversations,
    selectedId,
    draftPeer,
    initialConvParam,
    initialPeerParam,
  ]);

  const handlePickNew = (user: UserProfile) => {
    setShowNewDialog(false);
    const existing = conversations.find((c) => c.peer.id === user.id);
    if (existing) {
      setSelectedId(existing.id);
      setDraftPeer(null);
      setLocation(`/messages?c=${existing.id}`);
    } else {
      setDraftPeer(user);
      setSelectedId(null);
    }
  };

  const showThread = selectedId !== null || draftPeer !== null;

  return (
    <>
      <MobileFeedTopBar
        title="Messages"
        right={
          !showThread ? (
            <button
              onClick={() => setShowNewDialog(true)}
              className="text-[#E8754A] hover:text-[#ffb48c] transition-colors p-1"
              aria-label="New message"
            >
              <Plus className="w-5 h-5" />
            </button>
          ) : undefined
        }
      />
      <div className="lg:max-w-5xl lg:mx-auto pt-[52px] lg:pt-6 px-0 lg:px-4 pb-0">
        <div className="hidden lg:flex items-end justify-between mb-4 px-2">
          <div>
            <div className="text-[10px] text-[#E8754A]/50 font-black uppercase tracking-[0.2em] mb-1">
              Channel
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight">
              Messages
            </h1>
          </div>
          <Button
            onClick={() => setShowNewDialog(true)}
            className="bg-[#E8754A] hover:bg-[#ffb48c] text-black font-black uppercase tracking-wider text-[11px] gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> New
          </Button>
        </div>

        <div className="flex h-[calc(100dvh-52px)] lg:h-[calc(100dvh-140px)] bg-black border border-[#E8754A]/12">
          {/* Conversation list — hidden on mobile when a thread is open */}
          <aside
            className={cn(
              "flex-col w-full lg:w-80 lg:shrink-0 border-r border-[#E8754A]/12 overflow-y-auto",
              showThread ? "hidden lg:flex" : "flex",
            )}
          >
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center px-6 py-16 text-white/30">
                <MessageSquare className="w-8 h-8 mb-3 opacity-25" />
                <p className="text-sm font-medium mb-3">No conversations yet</p>
                <Button
                  onClick={() => setShowNewDialog(true)}
                  size="sm"
                  className="bg-[#E8754A]/10 hover:bg-[#E8754A]/20 border border-[#E8754A]/30 text-[#E8754A] font-black uppercase tracking-wider text-[11px]"
                >
                  Start one
                </Button>
              </div>
            ) : (
              conversations.map((c) => (
                <ConversationRow
                  key={c.id}
                  conv={c}
                  active={c.id === selectedId}
                  isTyping={isPeerTyping(c.peer.id)}
                  myUserId={me?.id ?? null}
                  onSelect={() => {
                    setSelectedId(c.id);
                    setDraftPeer(null);
                    setLocation(`/messages?c=${c.id}`);
                  }}
                />
              ))
            )}
          </aside>

          {/* Thread panel */}
          <section
            className={cn(
              "flex-1 flex-col min-w-0",
              showThread ? "flex" : "hidden lg:flex",
            )}
          >
            <ChatThread
              conversationId={selectedId}
              draftPeer={draftPeer}
              peerIsTyping={(() => {
                const activePeerId =
                  draftPeer?.id ??
                  conversations.find((c) => c.id === selectedId)?.peer.id ??
                  null;
                return activePeerId ? isPeerTyping(activePeerId) : false;
              })()}
              onMessageSent={(id, peer) => {
                setSelectedId(id);
                setDraftPeer(peer);
              }}
              onBack={() => {
                setSelectedId(null);
                setDraftPeer(null);
                setLocation("/messages");
              }}
            />
          </section>
        </div>
      </div>

      <NewMessageDialog
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onPick={handlePickNew}
      />
    </>
  );
}
