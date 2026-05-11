import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useGetMe,
  useListUserReports,
  useUpdateUserReportStatus,
  useGetUserReportConversation,
  useListAdminUsers,
  useSetUserAdmin,
  getListUserReportsQueryKey,
  getGetUserReportConversationQueryKey,
  getListAdminUsersQueryKey,
  type UserReport,
  type UserProfile,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ShieldCheck, ShieldOff, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type StatusFilter = "pending" | "reviewed" | "dismissed" | "actioned" | "all";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  reviewed: "Reviewed",
  dismissed: "Dismissed",
  actioned: "Actioned",
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  reviewed: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  dismissed: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  actioned: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

function ReportRow({
  report,
  onUpdate,
  onViewConversation,
}: {
  report: UserReport;
  onUpdate: (status: "reviewed" | "dismissed" | "actioned") => void;
  onViewConversation: () => void;
}) {
  const reporter = report.reporter;
  const reported = report.reported;
  return (
    <Card className="p-4 space-y-3 bg-[#161616] border-[#262626]" data-testid={`report-row-${report.id}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="text-muted-foreground">Reporter:</span>
            <Link href={`/profile/${reporter?.id ?? ""}`} className="flex items-center gap-2 hover:underline">
              <Avatar className="w-5 h-5">
                <AvatarImage src={reporter?.avatarUrl ?? undefined} />
                <AvatarFallback>{reporter?.displayName?.[0] ?? "?"}</AvatarFallback>
              </Avatar>
              <span className="font-medium">{reporter?.displayName ?? "Unknown"}</span>
              <span className="text-muted-foreground">@{reporter?.username}</span>
            </Link>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="text-muted-foreground">Reported:</span>
            <Link href={`/profile/${reported?.id ?? ""}`} className="flex items-center gap-2 hover:underline">
              <Avatar className="w-5 h-5">
                <AvatarImage src={reported?.avatarUrl ?? undefined} />
                <AvatarFallback>{reported?.displayName?.[0] ?? "?"}</AvatarFallback>
              </Avatar>
              <span className="font-medium">{reported?.displayName ?? "Unknown"}</span>
              <span className="text-muted-foreground">@{reported?.username}</span>
            </Link>
          </div>
        </div>
        <div className="text-right space-y-1 shrink-0">
          <Badge className={STATUS_TONE[report.status] ?? ""} variant="outline">
            {STATUS_LABEL[report.status] ?? report.status}
          </Badge>
          <div className="text-xs text-muted-foreground">
            {new Date(report.createdAt).toLocaleString()}
          </div>
        </div>
      </div>

      {report.reason ? (
        <div className="text-sm whitespace-pre-wrap rounded-sm bg-black/30 border border-[#262626] p-3">
          {report.reason}
        </div>
      ) : (
        <div className="text-sm italic text-muted-foreground">No reason provided.</div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {report.conversationId != null && (
          <Button
            size="sm"
            variant="outline"
            onClick={onViewConversation}
            data-testid={`button-view-conversation-${report.id}`}
          >
            View conversation
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onUpdate("reviewed")}
          data-testid={`button-mark-reviewed-${report.id}`}
        >
          Mark reviewed
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onUpdate("dismissed")}
          data-testid={`button-dismiss-${report.id}`}
        >
          Dismiss
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={() => onUpdate("actioned")}
          data-testid={`button-action-${report.id}`}
        >
          Mark actioned
        </Button>
      </div>
    </Card>
  );
}

function ConversationDialog({
  reportId,
  open,
  onOpenChange,
}: {
  reportId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const enabled = open && reportId != null;
  const { data, isLoading, error } = useGetUserReportConversation(
    reportId ?? 0,
    undefined,
    {
      query: {
        enabled,
        queryKey: getGetUserReportConversationQueryKey(reportId ?? 0),
      },
    },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conversation snippet</DialogTitle>
        </DialogHeader>
        {isLoading && (
          <div className="text-sm text-muted-foreground">Loading messages…</div>
        )}
        {error && (
          <div className="text-sm text-red-400">Could not load conversation.</div>
        )}
        {data && data.messages.length === 0 && (
          <div className="text-sm text-muted-foreground">No messages found.</div>
        )}
        <div className="space-y-2">
          {data?.messages.map((m) => (
            <div
              key={m.id}
              className="text-sm p-2 rounded-sm bg-black/30 border border-[#262626]"
            >
              <div className="text-[11px] text-muted-foreground mb-1 flex justify-between">
                <span>From: {m.senderId}</span>
                <span>{new Date(m.createdAt).toLocaleString()}</span>
              </div>
              <div className="whitespace-pre-wrap break-words">{m.content || <em className="text-muted-foreground">(empty)</em>}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminReportsPage() {
  const { data: me, isLoading: meLoading } = useGetMe();
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [activeReportId, setActiveReportId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isAdmin = me?.isAdmin === true;

  const { data, isLoading, error, refetch } = useListUserReports(
    { status },
    {
      query: {
        enabled: isAdmin,
        queryKey: getListUserReportsQueryKey({ status }),
      },
    },
  );

  const updateMutation = useUpdateUserReportStatus();

  const handleUpdate = async (
    reportId: number,
    next: "reviewed" | "dismissed" | "actioned",
  ) => {
    try {
      await updateMutation.mutateAsync({
        reportId,
        data: { status: next },
      });
      toast({ title: `Report ${next}` });
      await queryClient.invalidateQueries({
        queryKey: getListUserReportsQueryKey({ status }),
      });
    } catch {
      toast({
        title: "Could not update report",
        variant: "destructive",
      });
    }
  };

  if (meLoading) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Loading…</div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <Card className="p-6 bg-[#161616] border-[#262626]">
          <h1 className="text-lg font-semibold mb-1">Moderator access required</h1>
          <p className="text-sm text-muted-foreground">
            You need admin permissions to view reported users.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="heading-admin-reports">
            Reported users
          </h1>
          <p className="text-sm text-muted-foreground">
            Triage incoming reports filed from DM threads.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as StatusFilter)}
          >
            <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
              <SelectItem value="actioned">Actioned</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
            Refresh
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading reports…</div>
      )}
      {error && (
        <div className="text-sm text-red-400">Failed to load reports.</div>
      )}
      {data && data.reports.length === 0 && (
        <Card className="p-8 bg-[#161616] border-[#262626] text-center text-sm text-muted-foreground" data-testid="empty-reports">
          No {status === "all" ? "" : status} reports.
        </Card>
      )}

      <div className="space-y-3">
        {data?.reports.map((r) => (
          <ReportRow
            key={r.id}
            report={r}
            onUpdate={(next) => handleUpdate(r.id, next)}
            onViewConversation={() => setActiveReportId(r.id)}
          />
        ))}
      </div>

      <ConversationDialog
        reportId={activeReportId}
        open={activeReportId != null}
        onOpenChange={(open) => !open && setActiveReportId(null)}
      />

      <AdminRosterPanel currentUserId={me?.id ?? null} />
    </div>
  );
}

// ─── Admin roster management ───────────────────────────────────────────────
// Lets the existing admins promote a user to admin or demote one back.
// Self-demotion is blocked server-side (returns 400) — we still hide the
// "Demote" button on the row representing the current viewer to make that
// clear before the server says no.
function AdminRosterPanel({ currentUserId }: { currentUserId: string | null }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  // We only fire the search query when the user has typed something — this
  // keeps the default state focused on the "current admins" list.
  const trimmedSearch = searchInput.trim();

  const adminsQuery = useListAdminUsers(
    { adminOnly: true, limit: 100 },
    {
      query: {
        queryKey: getListAdminUsersQueryKey({ adminOnly: true, limit: 100 }),
      },
    },
  );

  const searchQuery = useListAdminUsers(
    { q: trimmedSearch, limit: 25 },
    {
      query: {
        enabled: trimmedSearch.length > 0,
        queryKey: getListAdminUsersQueryKey({ q: trimmedSearch, limit: 25 }),
      },
    },
  );

  const setAdminMutation = useSetUserAdmin();

  const invalidateLists = async () => {
    // Both lists may overlap (a freshly-promoted user shows up in adminsQuery
    // AND in any active search), so invalidate both.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey({ adminOnly: true, limit: 100 }) }),
      trimmedSearch.length > 0
        ? queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey({ q: trimmedSearch, limit: 25 }) })
        : Promise.resolve(),
    ]);
  };

  const handleSetAdmin = async (target: UserProfile, nextIsAdmin: boolean) => {
    try {
      await setAdminMutation.mutateAsync({
        userId: target.id,
        data: { isAdmin: nextIsAdmin },
      });
      toast({
        title: nextIsAdmin
          ? `${target.displayName} promoted to admin`
          : `${target.displayName} is no longer an admin`,
      });
      await invalidateLists();
    } catch {
      toast({
        title: nextIsAdmin ? "Could not promote user" : "Could not demote user",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="p-4 space-y-4 bg-[#161616] border-[#262626]" data-testid="card-admin-roster">
      <div>
        <h2 className="text-lg font-semibold tracking-tight" data-testid="heading-admin-roster">
          Moderator roster
        </h2>
        <p className="text-sm text-muted-foreground">
          Promote a user to admin or demote an existing admin. You can&rsquo;t demote yourself.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Current admins</div>
        {adminsQuery.isLoading && <div className="text-sm text-muted-foreground">Loading admins&hellip;</div>}
        {adminsQuery.error && <div className="text-sm text-red-400">Failed to load admins.</div>}
        {adminsQuery.data && adminsQuery.data.users.length === 0 && (
          <div className="text-sm text-muted-foreground" data-testid="empty-admins">No admins yet.</div>
        )}
        <div className="space-y-1.5">
          {adminsQuery.data?.users.map((u) => (
            <UserRosterRow
              key={u.id}
              user={u}
              isAdmin
              isSelf={u.id === currentUserId}
              busy={setAdminMutation.isPending}
              onPromote={() => handleSetAdmin(u, true)}
              onDemote={() => handleSetAdmin(u, false)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-[#262626]">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Promote a user</div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by username or display name"
            className="pl-8"
            data-testid="input-admin-search"
          />
        </div>
        {trimmedSearch.length > 0 && (
          <div className="space-y-1.5">
            {searchQuery.isLoading && <div className="text-sm text-muted-foreground">Searching&hellip;</div>}
            {searchQuery.data && searchQuery.data.users.length === 0 && (
              <div className="text-sm text-muted-foreground" data-testid="empty-admin-search">No users match.</div>
            )}
            {searchQuery.data?.users.map((u) => (
              <UserRosterRow
                key={u.id}
                user={u}
                isAdmin={u.isAdmin === true}
                isSelf={u.id === currentUserId}
                busy={setAdminMutation.isPending}
                onPromote={() => handleSetAdmin(u, true)}
                onDemote={() => handleSetAdmin(u, false)}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function UserRosterRow({
  user,
  isAdmin,
  isSelf,
  busy,
  onPromote,
  onDemote,
}: {
  user: UserProfile;
  isAdmin: boolean;
  isSelf: boolean;
  busy: boolean;
  onPromote: () => void;
  onDemote: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 p-2 rounded-sm bg-black/30 border border-[#262626]"
      data-testid={`admin-roster-row-${user.id}`}
    >
      <Avatar className="w-7 h-7">
        <AvatarImage src={user.avatarUrl ?? undefined} />
        <AvatarFallback>{user.displayName?.[0] ?? "?"}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{user.displayName}</div>
        <div className="text-xs text-muted-foreground truncate">@{user.username}</div>
      </div>
      {isAdmin && (
        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
          Admin
        </Badge>
      )}
      {isAdmin ? (
        // Hide the demote button on the current viewer's own row — the
        // server will reject self-demotion with 400 anyway, but hiding it
        // keeps the UI honest.
        !isSelf && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onDemote}
            data-testid={`button-demote-${user.id}`}
          >
            <ShieldOff className="w-3.5 h-3.5 mr-1" />
            Demote
          </Button>
        )
      ) : (
        <Button
          size="sm"
          variant="default"
          disabled={busy}
          onClick={onPromote}
          data-testid={`button-promote-${user.id}`}
        >
          <ShieldCheck className="w-3.5 h-3.5 mr-1" />
          Promote
        </Button>
      )}
    </div>
  );
}
