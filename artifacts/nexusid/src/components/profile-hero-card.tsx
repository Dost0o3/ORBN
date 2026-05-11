import type { ComponentType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Crown, Zap, Eye, Ghost, MapPin, Globe, Calendar, Activity, Link2, Check, Flame, Award, Sparkles, Mic, Radio, UserPlus, Users, Network, Heart, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import ProfileQR from "@/components/profile-qr";
import { VerificationBadge } from "@/components/verification-badge";
import { usePowerScoreStream } from "@/hooks/use-power-score-stream";
import { useStreak, useAchievements } from "@/hooks/use-streak-achievements";

const ACHIEVEMENT_ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  Sparkles, Mic, Radio, UserPlus, Users, Network, Heart, Trophy, Award, Flame,
};

function AchievementIcon({ name, className }: { name?: string | null; className?: string }) {
  const Comp: ComponentType<{ className?: string }> = name ? (ACHIEVEMENT_ICON_MAP[name] ?? Award) : Award;
  return <Comp className={className ?? "w-2.5 h-2.5 text-[#34D399]"} />;
}

interface PowerBreakdown {
  network: number;
  content: number;
  activity: number;
  reputation: number;
}

interface PowerScore {
  score: number;
  rank: string;
  breakdown: PowerBreakdown;
}

interface Profile {
  id: string;
  username: string;
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  location?: string | null;
  website?: string | null;
  occupation?: string | null;
  gender?: string | null;
  phone?: string | null;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  bountiesWon?: number;
  skills?: string[];
  isFollowing?: boolean;
  createdAt?: string;
  verificationTier?: string | null;
}

interface PostLike {
  id: string | number;
  createdAt: string;
}

interface Views {
  identifiedViews: number;
  ghostViews: number;
}

interface ProfileHeroCardProps {
  profile: Profile;
  powerScore?: PowerScore | null;
  posts?: PostLike[];
  views?: Views | null;
  mine: boolean;
  ghostOn?: boolean;
  onToggleGhost?: () => void;
  onFollow?: () => void;
  followBusy?: boolean;
  rightAction?: React.ReactNode;
}

const RANK_STYLE: Record<string, { color: string; glow: string }> = {
  RECRUIT: { color: "#9CA3AF", glow: "rgba(156,163,175,0.45)" },
  OPERATIVE: { color: "#60A5FA", glow: "rgba(96,165,250,0.55)" },
  "RISING FORCE": { color: "#34D399", glow: "rgba(52,211,153,0.55)" },
  "INNER CIRCLE": { color: "#E8754A", glow: "rgba(232,117,74,0.65)" },
  "THE DON": { color: "#DC143C", glow: "rgba(220,20,60,0.70)" },
};
const FALLBACK_STYLE = { color: "#E8754A", glow: "rgba(232,117,74,0.55)" };

export function styleForRank(rank?: string) {
  if (!rank) return FALLBACK_STYLE;
  return RANK_STYLE[rank.toUpperCase()] ?? FALLBACK_STYLE;
}

function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0);
  const frame = useRef<number | null>(null);
  const fromRef = useRef(0);
  useEffect(() => {
    if (typeof window === "undefined") { setValue(target); return; }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setValue(target); fromRef.current = target; return; }
    const start = performance.now();
    const from = fromRef.current;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [target, durationMs]);
  return value;
}

export function PowerScoreDial({ score, rank, breakdown, userId }: { score: number; rank: string; breakdown: PowerBreakdown; userId?: string }) {
  const { live, pulse } = usePowerScoreStream(userId);
  const effectiveScore = live?.score ?? score;
  const effectiveRank = live?.rank ?? rank;
  const effectiveBreakdown = live?.breakdown ?? breakdown;
  const style = styleForRank(effectiveRank);
  const animated = useCountUp(effectiveScore, 1100);
  const pct = Math.min(1, effectiveScore / 1000);
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    if (pulse > 0) {
      setPulsing(true);
      const t = setTimeout(() => setPulsing(false), 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [pulse]);
  const radius = 56;
  const stroke = 8;
  const cx = 70;
  const cy = 70;
  const sweep = 270;
  const start = 135;
  const circumference = 2 * Math.PI * radius;
  const arcLen = (sweep / 360) * circumference;
  const filledLen = arcLen * pct;

  const subs: Array<{ key: string; value: number; max: number; color: string }> = [
    { key: "Network", value: effectiveBreakdown.network, max: 300, color: "#60A5FA" },
    { key: "Content", value: effectiveBreakdown.content, max: 300, color: "#E8754A" },
    { key: "Activity", value: effectiveBreakdown.activity, max: 200, color: "#34D399" },
    { key: "Rep", value: effectiveBreakdown.reputation, max: 200, color: "#DC143C" },
  ];

  return (
    <div
      className={cn("relative w-[140px] h-[140px] shrink-0 transition-transform", pulsing && "scale-[1.04]")}
      aria-label={`Power Score ${effectiveScore} out of 1000, rank ${effectiveRank}${live ? ", live" : ""}`}
    >
      <svg width="140" height="140" viewBox="0 0 140 140" className="drop-shadow-[0_0_12px_var(--glow)]" style={{ ["--glow" as never]: style.glow }}>
        <defs>
          <linearGradient id="ps-grad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={style.color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={style.color} />
          </linearGradient>
        </defs>
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${circumference}`}
          transform={`rotate(${start} ${cx} ${cy})`}
        />
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="url(#ps-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filledLen} ${circumference}`}
          transform={`rotate(${start} ${cx} ${cy})`}
          style={{ transition: "stroke-dasharray 1.1s cubic-bezier(0.16,1,0.3,1)" }}
        />
        {Array.from({ length: 11 }).map((_, i) => {
          const angle = (start + (sweep * i) / 10) * (Math.PI / 180);
          const r1 = radius + stroke / 2 + 2;
          const r2 = r1 + (i % 5 === 0 ? 5 : 3);
          return (
            <line
              key={i}
              x1={cx + r1 * Math.cos(angle)}
              y1={cy + r1 * Math.sin(angle)}
              x2={cx + r2 * Math.cos(angle)}
              y2={cy + r2 * Math.sin(angle)}
              stroke="rgba(232,117,74,0.35)"
              strokeWidth="1"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <Crown
          className="w-3.5 h-3.5 mb-0.5"
          style={{ color: style.color, filter: `drop-shadow(0 0 4px ${style.glow})` }}
        />
        <div
          className="font-black tabular-nums leading-none"
          style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, color: style.color, textShadow: `0 0 12px ${style.glow}` }}
        >
          {animated}
        </div>
        <div className="text-[8px] font-black uppercase tracking-[0.2em] text-white/45 mt-0.5">{effectiveRank}</div>
        {live && (
          <div className="absolute top-1.5 right-1.5 flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-emerald-400">
            <span className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" /> LIVE
          </div>
        )}
      </div>
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full flex gap-1.5 mt-2 pt-2">
        {subs.map((s) => (
          <div
            key={s.key}
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: s.color, opacity: 0.35 + 0.65 * Math.min(1, s.value / s.max), boxShadow: `0 0 4px ${s.color}` }}
            title={`${s.key}: ${s.value}/${s.max}`}
            aria-label={`${s.key}: ${s.value} out of ${s.max}`}
          />
        ))}
      </div>
    </div>
  );
}

export function StreakChip({ userId }: { userId?: string }) {
  const streak = useStreak(userId);
  if (!streak || streak.currentStreak <= 0) return null;
  return (
    <div
      className="inline-flex items-center gap-1 h-5 px-1.5 border border-[#E8754A]/35 bg-[#E8754A]/8 text-[10px] font-black uppercase tracking-wider text-[#E8754A]"
      title={`${streak.currentStreak} day streak · longest ${streak.longestStreak}`}
      aria-label={`${streak.currentStreak} day streak`}
    >
      <Flame className="w-2.5 h-2.5" />
      {streak.currentStreak}d
    </div>
  );
}

export function AchievementIcons({ userId, max = 5 }: { userId?: string; max?: number }) {
  const items = useAchievements(userId);
  if (!items.length) return null;
  return (
    <div className="inline-flex items-center gap-1" aria-label={`${items.length} achievements`}>
      {items.slice(0, max).map((a) => (
        <span
          key={a.key}
          title={`${a.title} — ${a.description}`}
          className="inline-flex items-center justify-center w-5 h-5 border border-[#34D399]/30 bg-[#34D399]/8 text-[10px]"
          aria-label={a.title}
        >
          <AchievementIcon name={a.icon} />

        </span>
      ))}
      {items.length > max && (
        <span className="text-[9px] font-black text-white/45">+{items.length - max}</span>
      )}
    </div>
  );
}

export function StatTile({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const v = useCountUp(value);
  return (
    <div className="flex-1 min-w-0">
      <div
        className="font-black tabular-nums leading-none"
        style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, color: accent ?? "#fff" }}
      >
        {v}
      </div>
      <div className="text-[9px] text-white/35 font-black uppercase tracking-[0.18em] mt-1">{label}</div>
    </div>
  );
}

export function ActivityHeatmap({ posts }: { posts: PostLike[] }) {
  const buckets = useMemo(() => {
    const days = 90;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const counts: number[] = Array.from({ length: days }, () => 0);
    for (const p of posts) {
      const d = new Date(p.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      d.setHours(0, 0, 0, 0);
      const diff = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diff >= 0 && diff < days) counts[days - 1 - diff]! += 1;
    }
    return counts;
  }, [posts]);

  const max = Math.max(1, ...buckets);
  const totalPosts = buckets.reduce((a, b) => a + b, 0);
  const activeDays = buckets.filter((c) => c > 0).length;

  return (
    <div className="border-t border-[#E8754A]/10 pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-[#E8754A]/55" />
          <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#E8754A]/55">90-Day Output</span>
        </div>
        <span className="text-[9px] font-black tabular-nums text-white/40">
          {totalPosts} dispatches · {activeDays} active days
        </span>
      </div>
      <div className="grid grid-cols-[repeat(45,1fr)] gap-[2px]" role="img" aria-label={`Activity heatmap: ${totalPosts} posts across ${activeDays} active days in the last 90 days`}>
        {buckets.map((c, i) => {
          const intensity = c === 0 ? 0 : 0.18 + 0.82 * (c / max);
          return (
            <div
              key={i}
              className="aspect-square"
              style={{
                background: c === 0 ? "rgba(255,255,255,0.04)" : `rgba(232,117,74,${intensity})`,
                boxShadow: c > 0 ? `0 0 ${4 * intensity}px rgba(232,117,74,${intensity * 0.6})` : undefined,
              }}
              title={c > 0 ? `${c} dispatch${c === 1 ? "" : "es"}` : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

export function HoloAvatar({ src, fallback, style }: { src?: string; fallback: string; style: { color: string; glow: string } }) {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ rx: 0, ry: 0, mx: 50, my: 50 });

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setT({ rx: (0.5 - y) * 16, ry: (x - 0.5) * 16, mx: x * 100, my: y * 100 });
  };
  const onLeave = () => setT({ rx: 0, ry: 0, mx: 50, my: 50 });

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="relative w-24 h-24 shrink-0"
      style={{ perspective: "600px" }}
    >
      <div
        className="absolute -inset-1.5 rounded-full pointer-events-none"
        style={{
          background: `conic-gradient(from 0deg, ${style.color}, transparent 35%, ${style.color} 70%, transparent)`,
          filter: `blur(0.5px) drop-shadow(0 0 8px ${style.glow})`,
          animation: "holo-spin 8s linear infinite",
          opacity: 0.85,
        }}
      />
      <div
        className="absolute inset-0 rounded-full overflow-hidden border-2 transition-transform duration-150 ease-out"
        style={{
          transform: `rotateX(${t.rx}deg) rotateY(${t.ry}deg)`,
          transformStyle: "preserve-3d",
          borderColor: style.color,
          boxShadow: `0 0 18px ${style.glow}, inset 0 0 10px rgba(0,0,0,0.5)`,
        }}
      >
        <Avatar className="w-full h-full">
          <AvatarImage src={src ?? undefined} className="object-cover" />
          <AvatarFallback className="text-2xl bg-black text-[#E8754A] font-black">{fallback}</AvatarFallback>
        </Avatar>
        <div
          className="absolute inset-0 pointer-events-none mix-blend-overlay"
          style={{
            background: `radial-gradient(circle at ${t.mx}% ${t.my}%, rgba(255,255,255,0.55), transparent 45%)`,
            opacity: 0.7,
          }}
        />
      </div>
      <style>{`@keyframes holo-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function formatJoined(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function lastDispatchLabel(posts: PostLike[]) {
  if (!posts.length) return null;
  const latest = posts.reduce((acc, p) => {
    const t = new Date(p.createdAt).getTime();
    return t > acc ? t : acc;
  }, 0);
  if (!latest) return null;
  const diffMs = Date.now() - latest;
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "moments ago";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

export default function ProfileHeroCard({
  profile,
  powerScore,
  posts = [],
  views,
  mine,
  ghostOn,
  onToggleGhost,
  onFollow,
  followBusy,
  rightAction,
}: ProfileHeroCardProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const rankName = powerScore?.rank ?? "RECRUIT";
  const style = styleForRank(rankName);
  const joined = formatJoined(profile.createdAt);
  const lastSeen = lastDispatchLabel(posts);

  const copyLink = async () => {
    try {
      const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const url = `${window.location.origin}${basePath}/profile/${profile.id}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Profile link copied" });
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div
      className="relative bg-[#0a0a0a] border border-[#E8754A]/15 mb-4 overflow-hidden"
      style={{ boxShadow: `0 0 40px -20px ${style.glow}` }}
    >
      <div
        className="h-28 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, #000 0%, #0a0a0a 50%, #000 100%)` }}
      >
        {profile.coverUrl ? (
          <img src={profile.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />
        ) : (
          <>
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{ backgroundImage: "repeating-linear-gradient(45deg, #E8754A 0px, #E8754A 1px, transparent 0px, transparent 28px)" }}
            />
            <div
              className="absolute inset-0 opacity-30"
              style={{ background: `radial-gradient(circle at 80% 20%, ${style.glow}, transparent 60%)` }}
            />
          </>
        )}
        {powerScore && (
          <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 bg-black/65 border" style={{ borderColor: `${style.color}55` }}>
            <Crown className="w-3 h-3" style={{ color: style.color }} />
            <span className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: style.color }}>
              {rankName}
            </span>
          </div>
        )}
      </div>

      <div className="px-5 pb-5 -mt-12 relative">
        <div className="flex items-end justify-between mb-3 gap-3">
          <HoloAvatar src={profile.avatarUrl ?? undefined} fallback={profile.displayName?.[0] ?? "U"} style={style} />
          <div className="flex items-center gap-2 mb-1">
            <ProfileQR
              username={profile.username}
              displayName={profile.displayName}
              avatarUrl={profile.avatarUrl}
              rank={rankName}
              rankColor={style.color}
            />
            <button
              onClick={copyLink}
              className="flex items-center gap-1 text-[10px] h-7 px-2.5 bg-transparent border border-white/12 text-white/55 hover:border-[#E8754A]/40 hover:text-[#E8754A] font-black uppercase tracking-wider transition-colors"
              aria-label="Copy profile link"
            >
              {copied ? <Check className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
              {copied ? "Copied" : "Share"}
            </button>
            {rightAction ?? (
              !mine && onFollow && (
                <button
                  onClick={onFollow}
                  disabled={followBusy}
                  className={cn(
                    "text-[10px] h-7 px-3 font-black uppercase tracking-wider transition-colors",
                    profile.isFollowing
                      ? "bg-transparent border border-[#E8754A]/22 text-white/45 hover:border-[#DC143C]/40 hover:text-[#DC143C]"
                      : "bg-[#E8754A] text-black border border-[#E8754A] hover:bg-[#E8754A]/90",
                  )}
                >
                  {profile.isFollowing ? "Unfollow" : "Follow"}
                </button>
              )
            )}
          </div>
        </div>

        <div className="mb-2">
          <div className="font-black text-2xl tracking-tight uppercase leading-tight inline-flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {profile.displayName}
            <VerificationBadge tier={profile.verificationTier} size="md" />
          </div>
          <div className="text-sm text-[#E8754A]/60 font-bold">@{profile.username}</div>
        </div>
        {profile.bio && <p className="text-sm leading-relaxed text-white/65 mb-3">{profile.bio}</p>}

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-white/35 font-bold uppercase tracking-wider mb-4">
          {profile.occupation && (
            <span className="flex items-center gap-1 text-[#E8754A]/70"><Crown className="w-3 h-3" />{profile.occupation}</span>
          )}
          {profile.location && (
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{profile.location}</span>
          )}
          {profile.website && (
            <a href={profile.website ?? ""} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[#E8754A]/55 hover:text-[#E8754A]">
              <Globe className="w-3 h-3" />{profile.website.replace(/^https?:\/\//, "")}
            </a>
          )}
          {profile.phone && mine && (
            <span className="flex items-center gap-1"><span className="text-[#E8754A]/55">☎</span>{profile.phone}</span>
          )}
          {joined && (
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Joined {joined}</span>
          )}
          {lastSeen && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
              Last dispatch {lastSeen}
            </span>
          )}
        </div>

        <div className="flex items-center gap-5 border-t border-[#E8754A]/10 pt-4">
          {powerScore && (
            <PowerScoreDial score={powerScore.score} rank={powerScore.rank} breakdown={powerScore.breakdown} />
          )}
          <div className="flex-1 grid grid-cols-3 gap-3">
            <StatTile label="Followers" value={profile.followersCount ?? 0} accent="#E8754A" />
            <StatTile label="Following" value={profile.followingCount ?? 0} />
            <StatTile label="Dispatches" value={profile.postsCount ?? 0} />
          </div>
        </div>

        {powerScore && (
          <div className="grid grid-cols-4 gap-2 mt-4">
            {([
              { label: "Network", value: powerScore.breakdown.network, max: 300, color: "#60A5FA" },
              { label: "Content", value: powerScore.breakdown.content, max: 300, color: "#E8754A" },
              { label: "Activity", value: powerScore.breakdown.activity, max: 200, color: "#34D399" },
              { label: "Reputation", value: powerScore.breakdown.reputation, max: 200, color: "#DC143C" },
            ]).map(({ label, value, max, color }) => {
              const pct = Math.min(100, (value / max) * 100);
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[8px] font-black uppercase tracking-[0.15em] text-white/40">{label}</span>
                    <span className="text-[9px] font-black tabular-nums" style={{ color }}>{value}</span>
                  </div>
                  <div className="h-1 bg-white/5 overflow-hidden">
                    <div
                      className="h-full transition-all duration-700 ease-out"
                      style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(views || mine) && (
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[#E8754A]/8">
            {views && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-white/40">
                <Eye className="w-3 h-3" />
                <span className="tabular-nums text-white/70 font-black">{views.identifiedViews}</span> profile views
              </span>
            )}
            {mine && views && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-white/25">
                <Ghost className="w-3 h-3" />
                <span className="tabular-nums font-black">{views.ghostViews}</span> ghost
              </span>
            )}
            {mine && onToggleGhost && (
              <button
                onClick={onToggleGhost}
                className={cn(
                  "ml-auto flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 border transition-colors",
                  ghostOn
                    ? "border-[#DC143C]/45 bg-[#DC143C]/8 text-[#DC143C]/85"
                    : "border-white/12 bg-black text-white/35 hover:border-white/25",
                )}
                aria-pressed={ghostOn}
              >
                <Ghost className="w-3 h-3" />
                Ghost {ghostOn ? "On" : "Off"}
              </button>
            )}
          </div>
        )}

        {((profile.skills && profile.skills.length > 0) || (profile.bountiesWon ?? 0) > 0) && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {(profile.bountiesWon ?? 0) > 0 && (
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 border border-[#DC143C]/45 text-[#DC143C]/85 bg-[#DC143C]/8">
                <Zap className="w-3 h-3 inline -mt-0.5 mr-1" />
                Bounty Hunter · {profile.bountiesWon}W
              </span>
            )}
            {profile.skills?.map((s: string) => (
              <span key={s} className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 border border-[#E8754A]/22 text-[#E8754A]/72 bg-[#E8754A]/5">
                {s}
              </span>
            ))}
          </div>
        )}

        <ActivityHeatmap posts={posts} />
      </div>
    </div>
  );
}
