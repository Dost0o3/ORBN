import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { useUser } from "@clerk/react";
import { Link, useLocation } from "wouter";
import {
  Home, Search, Briefcase, Users, Bell, Brain, Sparkles, X, Plus, LogOut,
  Zap, Target, Lock, TrendingUp, Heart, Crown, UserIcon, Menu, Settings, Sun, Moon, Ghost,
  MessageSquare, Shield,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSignOut } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useGetUnreadNotificationCount, useGetUnreadDirectMessageCount, useGetMe, useGetPowerScore, useSetGhostMode, getGetMeQueryKey, getGetUnreadDirectMessageCountQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import NeuralBackground from "@/components/neural-background";

// ─── Ghost Mode toggle (sidebar) ──────────────────────────────────────
// Reads server state from useGetMe and writes through useSetGhostMode.
// Mirrors the ghost flag into localStorage so the rest of the app
// (e.g. profile-view recording) can read it synchronously without a hook.
export function GhostModeToggle({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const { data: me } = useGetMe();
  const setGhostMode = useSetGhostMode();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const ghostOn = me?.ghostMode === true;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem("nexusid-ghost-mode", String(ghostOn)); } catch { /* ignore */ }
  }, [ghostOn]);

  const handleToggle = async () => {
    if (setGhostMode.isPending) return;
    const next = !ghostOn;
    try { localStorage.setItem("nexusid-ghost-mode", String(next)); } catch { /* ignore */ }
    try {
      await setGhostMode.mutateAsync({ data: { enabled: next } });
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({
        title: next ? "Ghost Mode on" : "Ghost Mode off",
        description: next
          ? "Profile views are hidden. New posts will be Anonymous."
          : "Your views and posts are attributed to you again.",
      });
    } catch {
      try { localStorage.setItem("nexusid-ghost-mode", String(ghostOn)); } catch { /* ignore */ }
      toast({ title: "Could not update Ghost Mode", description: "Please try again.", variant: "destructive" });
    }
  };

  if (variant === "mobile") {
    return (
      <button
        data-ghost-mode-toggle
        onClick={handleToggle}
        aria-pressed={ghostOn}
        disabled={setGhostMode.isPending}
        className={cn(
          "w-full flex items-center gap-3 px-5 py-3 transition-colors text-left",
          ghostOn ? "text-[#E8754A] bg-[#E8754A]/8" : "text-white/55 hover:text-white/85 hover:bg-white/3"
        )}
      >
        <Ghost className="w-5 h-5 shrink-0" />
        <span className="text-sm font-bold tracking-wide flex-1">Ghost Mode</span>
        <span
          className={cn(
            "text-[10px] font-black px-2 py-0.5 border uppercase tracking-wider",
            ghostOn ? "border-[#E8754A]/40 text-[#E8754A] bg-[#E8754A]/10" : "border-white/15 text-white/45"
          )}
        >
          {ghostOn ? "On" : "Off"}
        </span>
      </button>
    );
  }

  return (
    <button
      data-ghost-mode-toggle
      onClick={handleToggle}
      aria-pressed={ghostOn}
      disabled={setGhostMode.isPending}
      title={ghostOn ? "Ghost Mode is on — turn off" : "Ghost Mode is off — turn on"}
      className={cn(
        "group relative flex items-center gap-3 px-4 py-2.5 text-[11px] font-bold tracking-[0.1em] uppercase transition-all duration-300 w-full text-left border-l-2",
        ghostOn
          ? "text-[#E8754A] bg-gradient-to-r from-[#E8754A]/15 via-[#E8754A]/8 to-transparent border-[#E8754A]"
          : "text-white/40 hover:text-[#E8754A]/90 hover:bg-[#E8754A]/5 border-transparent hover:border-[#E8754A]/40"
      )}
    >
      <Ghost className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">Ghost Mode</span>
      <span
        className={cn(
          "ml-auto text-[9px] font-black px-1.5 py-0.5 border tracking-wider",
          ghostOn ? "border-[#E8754A]/50 text-[#E8754A] bg-[#E8754A]/10" : "border-white/15 text-white/40"
        )}
      >
        {ghostOn ? "On" : "Off"}
      </span>
    </button>
  );
}

// ─── Mobile Drawer Context ─────────────────────────────────────────────
// Pages can call openDrawer() to open the secondary-nav left drawer
interface DrawerCtx { open: boolean; openDrawer: () => void; closeDrawer: () => void; }
const DrawerContext = createContext<DrawerCtx>({ open: false, openDrawer: () => {}, closeDrawer: () => {} });
export function useMobileDrawer() { return useContext(DrawerContext); }

// ─── Desktop sidebar nav items ─────────────────────────────────────────
const navItems = [
  { icon: Home, label: "Feed", href: "/feed" },
  { icon: UserIcon, label: "Profile", href: "/profile/me" },
  { icon: Search, label: "Explore", href: "/explore" },
  { icon: Heart, label: "Connect", href: "/connect" },
  { icon: Briefcase, label: "Jobs", href: "/jobs" },
  { icon: Users, label: "Communities", href: "/communities" },
  { icon: Bell, label: "Notifications", href: "/notifications" },
  { icon: MessageSquare, label: "Messages", href: "/messages" },
  { icon: Target, label: "Bounty Board", href: "/bounties" },
  { icon: Lock, label: "Inner Circles", href: "/circles" },
  { icon: TrendingUp, label: "Dark Horses", href: "/leaderboard" },
  { icon: Brain, label: "Soul Twin", href: "/ai/soul-twin" },
  { icon: Sparkles, label: "Career Oracle", href: "/ai/career-oracle" },
  { icon: Crown, label: "Pricing", href: "/pricing" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

// Admin-only nav item (rendered conditionally below for users with isAdmin).
// Labelled "Moderation" rather than "Reports" because the same page surface
// will grow other moderator tools over time (user actioning, ban audit log,
// etc.); using the broader noun avoids needing to rename it again later.
const adminNavItem = { icon: Shield, label: "Moderation", href: "/admin/reports" } as const;

// Secondary nav shown in the mobile drawer (excludes items on bottom tab bar)
const drawerItems = [
  { icon: Heart, label: "Connect", href: "/connect" },
  { icon: MessageSquare, label: "Messages", href: "/messages" },
  { icon: Briefcase, label: "Jobs", href: "/jobs" },
  { icon: Users, label: "Communities", href: "/communities" },
  { icon: Target, label: "Bounty Board", href: "/bounties" },
  { icon: Lock, label: "Inner Circles", href: "/circles" },
  { icon: TrendingUp, label: "Dark Horses", href: "/leaderboard" },
  { icon: Brain, label: "Soul Twin", href: "/ai/soul-twin" },
  { icon: Sparkles, label: "Career Oracle", href: "/ai/career-oracle" },
  { icon: Crown, label: "Pricing", href: "/pricing" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

// ─── Desktop NavItem ───────────────────────────────────────────────────
function ThemeToggleBtn() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-1.5 hover:bg-white/5 text-white/25 hover:text-[#E8754A]/70 transition-colors"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
    </button>
  );
}

function NavItem({
  icon: Icon, label, href, badge,
}: { icon: LucideIcon; label: string; href: string; badge?: number }) {
  const [location] = useLocation();
  const active = location === href || location.startsWith(href + "/");
  return (
    <Link href={href} className={cn(
      "group relative flex items-center gap-3 px-4 py-2.5 text-[11px] font-bold tracking-[0.1em] uppercase transition-all duration-300",
      active
        ? "text-[#E8754A] bg-gradient-to-r from-[#E8754A]/15 via-[#E8754A]/8 to-transparent border-l-2 border-[#E8754A] neon-text-gold"
        : "text-white/40 hover:text-[#E8754A]/90 hover:bg-[#E8754A]/5 border-l-2 border-transparent hover:border-[#E8754A]/40"
    )}>
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#E8754A] shadow-[0_0_8px_rgba(232,117,74,0.8)]" />}
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      {badge && badge > 0 ? (
        <span className="ml-auto bg-[#DC143C] text-white text-[9px] font-black w-4 h-4 flex items-center justify-center">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

// ─── Desktop PowerScore Bar ────────────────────────────────────────────
function PowerScoreBar({ score }: { score: number }) {
  const level = score < 100 ? "Recruit" : score < 300 ? "Operative" : score < 600 ? "Associate" : "Capo";
  const pct = Math.min(100, (score / 1000) * 100);
  return (
    <div className="relative px-3 py-2.5 glass-subtle mx-3 mb-2 scan-pulse">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-[#E8754A] drop-shadow-[0_0_4px_rgba(232,117,74,0.8)]" />
          <span className="text-[9px] font-black text-[#E8754A]/70 uppercase tracking-[0.15em]">Power Score</span>
        </div>
        <span className="text-[11px] font-black text-[#E8754A] tabular-nums neon-text-gold">{score}</span>
      </div>
      <div className="relative w-full h-1 bg-black/60 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#E8754A] via-[#ffb48c] to-[#E8754A] shadow-[0_0_8px_rgba(232,117,74,0.6)]"
          style={{ width: `${pct}%`, backgroundSize: "200% 100%", animation: "holo-shift 3s ease infinite" }}
        />
      </div>
      <div className="text-[9px] text-white/40 font-bold uppercase tracking-wider mt-1">{level}</div>
    </div>
  );
}

// ─── Desktop Sidebar ───────────────────────────────────────────────────
function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user } = useUser();
  const signOut = useSignOut();
  const { data: notifData } = useGetUnreadNotificationCount();
  const { data: dmData } = useGetUnreadDirectMessageCount({ query: { queryKey: getGetUnreadDirectMessageCountQueryKey(), refetchInterval: 30000 } });
  const { data: me } = useGetMe();
  const unreadCount = notifData?.count ?? 0;
  const unreadDmCount = dmData?.count ?? 0;
  const { data: powerScoreData } = useGetPowerScore(me?.id ?? "");
  const powerScore = powerScoreData?.score ?? 0;

  return (
    <div className="flex flex-col h-full glass-strong border-r border-[#E8754A]/15">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-[#E8754A]/15 relative">
        <div className="relative">
          <img src="/nexusid/orbn-logo.png" alt="ORBN" className="w-7 h-7 relative z-10 object-contain" />
          <div className="absolute inset-0 bg-[#E8754A]/40 blur-md rounded-full" />
        </div>
        <span className="font-black text-sm tracking-tight relative holo-text" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          ORBN
        </span>
        {onClose && (
          <button onClick={onClose} className="ml-auto text-white/30 hover:text-white/70 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <nav className="flex-1 py-3 px-0 overflow-y-auto">
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            badge={
              item.href === "/notifications"
                ? unreadCount
                : item.href === "/messages"
                  ? unreadDmCount
                  : undefined
            }
          />
        ))}
        {me?.isAdmin === true && <NavItem {...adminNavItem} />}
        <div className="mt-2 pt-2 border-t border-[#E8754A]/10">
          <GhostModeToggle variant="desktop" />
        </div>
      </nav>
      <div className="p-3 border-t border-[#E8754A]/15 space-y-2">
        <Link
          href="/create-post"
          className="group relative flex items-center justify-center gap-2 w-full bg-gradient-to-r from-[#E8754A] via-[#ffb48c] to-[#E8754A] text-black text-[11px] font-black py-2.5 px-3 uppercase tracking-[0.12em] transition-all duration-300 neon-gold hover:neon-gold-strong overflow-hidden"
          style={{ fontFamily: "'Space Grotesk', sans-serif", backgroundSize: "200% 100%" }}
        >
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
          <Plus className="w-3.5 h-3.5 relative z-10" />
          <span className="relative z-10">New Post</span>
        </Link>
        <div className="flex items-center gap-2 px-1 pt-1">
          <Link href="/profile/me" className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-75 transition-opacity">
            <Avatar className="w-7 h-7 border border-[#E8754A]/20">
              <AvatarImage src={me?.avatarUrl ?? user?.imageUrl ?? undefined} />
              <AvatarFallback className="text-xs bg-[#E8754A]/10 text-[#E8754A] font-bold">{(me?.displayName ?? user?.firstName ?? "U")[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold truncate text-white/80">{me?.displayName ?? user?.fullName ?? user?.username}</div>
              <div className="text-[10px] text-white/30 truncate">@{me?.username ?? user?.username ?? "user"}</div>
            </div>
          </Link>
          <ThemeToggleBtn />
          <button
            onClick={() => signOut()}
            className="p-1.5 hover:bg-white/5 text-white/25 hover:text-white/70 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
        <PowerScoreBar score={powerScore} />
      </div>
    </div>
  );
}

// ─── Mobile Left Drawer ───────────────────────────────────────────────
// Slides in from the LEFT — Instagram-style
function MobileLeftDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useUser();
  const signOut = useSignOut();
  const { data: notifData } = useGetUnreadNotificationCount();
  const { data: dmData } = useGetUnreadDirectMessageCount({ query: { queryKey: getGetUnreadDirectMessageCountQueryKey(), refetchInterval: 30000 } });
  const { data: me } = useGetMe();
  const unreadCount = notifData?.count ?? 0;
  const unreadDmCount = dmData?.count ?? 0;
  const { data: powerScoreData } = useGetPowerScore(me?.id ?? "");
  const powerScore = powerScoreData?.score ?? 0;
  const [location] = useLocation();

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 lg:hidden transition-opacity duration-300",
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}
    >
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-[82vw] max-w-xs bg-black border-r border-[#E8754A]/20 flex flex-col transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E8754A]/15">
          <div className="relative">
            <img src="/nexusid/orbn-logo.png" alt="ORBN" className="w-7 h-7 relative z-10 object-contain" />
            <div className="absolute inset-0 bg-[#E8754A]/40 blur-md rounded-full" />
          </div>
          <span className="font-black text-sm tracking-tight flex-1 holo-text" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            ORBN
          </span>
          <button onClick={onClose} className="text-white/35 hover:text-white/70 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3">
          {drawerItems.map((item) => {
            const active = location === item.href || location.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-4 px-5 py-3.5 transition-colors relative",
                  active
                    ? "text-[#E8754A] bg-[#E8754A]/8"
                    : "text-white/55 hover:text-white/85 hover:bg-white/3"
                )}
              >
                {active && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#E8754A]" />}
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="text-sm font-bold tracking-wide">{item.label}</span>
                {item.href === "/notifications" && unreadCount > 0 && (
                  <span className="ml-auto bg-[#DC143C] text-white text-[9px] font-black w-4.5 h-4.5 flex items-center justify-center px-1">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
                {item.href === "/messages" && unreadDmCount > 0 && (
                  <span className="ml-auto bg-[#DC143C] text-white text-[9px] font-black w-4.5 h-4.5 flex items-center justify-center px-1">
                    {unreadDmCount > 9 ? "9+" : unreadDmCount}
                  </span>
                )}
              </Link>
            );
          })}
          {me?.isAdmin === true && (
            <Link
              href="/admin/reports"
              onClick={onClose}
              className={cn(
                "flex items-center gap-4 px-5 py-3.5 transition-colors relative",
                location === "/admin/reports" || location.startsWith("/admin/reports/")
                  ? "text-[#E8754A] bg-[#E8754A]/8"
                  : "text-white/55 hover:text-white/85 hover:bg-white/3"
              )}
            >
              <Shield className="w-5 h-5 shrink-0" />
              <span className="text-sm font-bold tracking-wide">Moderation</span>
            </Link>
          )}
        </nav>

        {/* Ghost Mode toggle */}
        <div className="border-t border-[#E8754A]/10">
          <GhostModeToggle variant="mobile" />
        </div>

        {/* Power score */}
        <div className="px-4 py-2 border-t border-[#E8754A]/10">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#E8754A]" />
              <span className="text-[10px] font-black text-[#E8754A]/70 uppercase tracking-wider">Power Score</span>
            </div>
            <span className="text-sm font-black text-[#E8754A]">{powerScore}</span>
          </div>
          <div className="w-full h-1 bg-white/8 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#E8754A] to-[#ffb48c]"
              style={{ width: `${Math.min(100, (powerScore / 1000) * 100)}%` }}
            />
          </div>
        </div>

        {/* User row + sign out */}
        <div className="px-5 py-4 border-t border-[#E8754A]/10 flex items-center gap-3">
          <Link href="/profile/me" onClick={onClose} className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar className="w-9 h-9 border border-[#E8754A]/25 shrink-0">
              <AvatarImage src={me?.avatarUrl ?? user?.imageUrl ?? undefined} />
              <AvatarFallback className="text-xs bg-[#E8754A]/10 text-[#E8754A] font-bold">{(me?.displayName ?? user?.firstName ?? "U")[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white/85 truncate">{me?.displayName ?? user?.fullName ?? user?.username}</div>
              <div className="text-xs text-white/35 truncate">@{me?.username ?? user?.username ?? "user"}</div>
            </div>
          </Link>
          <button
            onClick={() => { signOut(); onClose(); }}
            className="text-white/30 hover:text-white/70 transition-colors p-2"
            title="Sign out"
          >
            <LogOut className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile Bottom Tab Bar ────────────────────────────────────────────
// Instagram-style 5 tabs: Feed | Explore | + | Notifications | Profile
function MobileBottomNav({ onMenuTap }: { onMenuTap: () => void }) {
  const { user } = useUser();
  const { data: me } = useGetMe();
  const [location] = useLocation();
  const { data: notifData } = useGetUnreadNotificationCount();
  const unreadCount = notifData?.count ?? 0;

  const isFeed = location === "/feed" || location.startsWith("/feed/");
  const isExplore = location === "/explore" || location.startsWith("/explore/");
  const isNotif = location === "/notifications";
  const isProfile = location === "/profile/me";

  return (
    <div
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-md border-t border-white/8"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center h-14">
        {/* Feed */}
        <Link href="/feed" className={cn(
          "flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors",
          isFeed ? "text-white" : "text-white/38"
        )}>
          <Home className={cn("w-6 h-6", isFeed && "fill-white")} strokeWidth={isFeed ? 2.5 : 1.5} />
          {isFeed && <span className="w-1 h-1 rounded-full bg-white" />}
        </Link>

        {/* Explore */}
        <Link href="/explore" className={cn(
          "flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors",
          isExplore ? "text-white" : "text-white/38"
        )}>
          <Search className="w-6 h-6" strokeWidth={isExplore ? 2.5 : 1.5} />
          {isExplore && <span className="w-1 h-1 rounded-full bg-white" />}
        </Link>

        {/* Create post — center, square like IG */}
        <Link href="/create-post" className="flex-1 flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-white/70 rounded-lg flex items-center justify-center">
            <Plus className="w-5 h-5 text-white/85" strokeWidth={2} />
          </div>
        </Link>

        {/* Notifications */}
        <Link href="/notifications" className={cn(
          "flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors relative",
          isNotif ? "text-white" : "text-white/38"
        )}>
          <div className="relative">
            <Bell className="w-6 h-6" strokeWidth={isNotif ? 2.5 : 1.5} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 bg-[#DC143C] text-white text-[9px] font-black px-0.5 flex items-center justify-center leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>
          {isNotif && <span className="w-1 h-1 rounded-full bg-white" />}
        </Link>

        {/* Profile avatar OR hamburger (shows avatar when on profile, hamburger for others) */}
        {isProfile ? (
          <Link href="/profile/me" className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full">
            <div className="w-7 h-7 rounded-full border-2 border-white overflow-hidden">
              <Avatar className="w-full h-full">
                <AvatarImage src={me?.avatarUrl ?? user?.imageUrl ?? undefined} className="object-cover" />
                <AvatarFallback className="text-[10px] bg-white/10 text-white font-bold">{(me?.displayName ?? user?.firstName ?? "U")[0].toUpperCase()}</AvatarFallback>
              </Avatar>
            </div>
            <span className="w-1 h-1 rounded-full bg-white" />
          </Link>
        ) : (
          <button
            onClick={onMenuTap}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full text-white/38 hover:text-white/70 transition-colors"
          >
            <Avatar className="w-7 h-7 rounded-full border border-white/25 overflow-hidden">
              <AvatarImage src={me?.avatarUrl ?? user?.imageUrl ?? undefined} className="object-cover" />
              <AvatarFallback className="text-[10px] bg-white/10 text-white/60 font-bold">{(me?.displayName ?? user?.firstName ?? "U")[0].toUpperCase()}</AvatarFallback>
            </Avatar>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Mobile Feed Top Bar ──────────────────────────────────────────────
// Instagram-style top bar shown on the Feed page (and similar pages)
export function MobileFeedTopBar({ title, right }: { title?: string; right?: ReactNode }) {
  const { openDrawer } = useMobileDrawer();
  return (
    <div
      className="lg:hidden fixed top-0 left-0 right-0 z-30 h-[52px] bg-black/95 backdrop-blur-md border-b border-white/6 flex items-center px-4 gap-3"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <button onClick={openDrawer} className="text-white/70 hover:text-white transition-colors -ml-1 p-1">
        <Menu className="w-6 h-6" />
      </button>
      <span className="flex-1 text-center font-black text-base tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        {title ?? <span className="text-[#E8754A]">ORBN</span>}
      </span>
      {right ?? <div className="w-8" />}
    </div>
  );
}

// ─── AppLayout ────────────────────────────────────────────────────────
export default function AppLayout({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <DrawerContext.Provider value={{
      open: drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
    }}>
      <div className="min-h-screen flex relative">
        <NeuralBackground />

        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col w-52 xl:w-60 shrink-0 h-screen sticky top-0 z-20">
          <Sidebar />
        </aside>

        {/* Main content — mobile: pb-14 for bottom nav */}
        <main className="flex-1 min-w-0 lg:max-h-screen lg:overflow-y-auto pb-14 lg:pb-0 relative z-10">
          {children}
        </main>

        {/* Mobile components */}
        <MobileLeftDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <MobileBottomNav onMenuTap={() => setDrawerOpen(true)} />
      </div>
    </DrawerContext.Provider>
  );
}
