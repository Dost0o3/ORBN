import { Link } from "wouter";
import { Crown, TrendingUp, ArrowUpRight, RefreshCw } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useGetDarkHorses } from "@workspace/api-client-react";
import type { DarkHorse } from "@workspace/api-client-react";

const rankIcon = (rank: number) => {
  if (rank === 1) return <Crown className="w-4 h-4 text-[#E8754A]" />;
  if (rank === 2) return <Crown className="w-4 h-4 text-white/55" />;
  if (rank === 3) return <Crown className="w-4 h-4 text-[#CD7F32]" />;
  return <ArrowUpRight className="w-4 h-4 text-[#E8754A]/60" />;
};

const rankBg = (rank: number) => {
  if (rank === 1) return "border-[#E8754A]/50 bg-[#E8754A]/6";
  if (rank === 2) return "border-white/20 bg-white/3";
  if (rank === 3) return "border-[#CD7F32]/35 bg-[#CD7F32]/5";
  return "border-[#E8754A]/10 bg-black";
};

export default function LeaderboardPage() {
  const { data, isLoading } = useGetDarkHorses();
  const horses: DarkHorse[] = (data?.horses ?? []) as DarkHorse[];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="text-center mb-10">
        <div className="text-[10px] text-[#E8754A]/45 font-black uppercase tracking-[0.3em] mb-3">AI-Curated · Weekly</div>
        <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tight leading-none mb-3 italic" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          <span className="text-[#DC143C]">DARK</span> HORSES
        </h1>
        <p className="text-[11px] text-white/32 font-bold uppercase tracking-widest">
          The professionals nobody saw coming — until now
        </p>
        {data?.updatedAt && (
          <div className="text-[10px] text-white/20 font-bold mt-2 uppercase tracking-wider">
            Last updated: {new Date(data.updatedAt).toLocaleDateString()}
          </div>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-2 text-white/30 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Analyzing the network...
        </div>
      )}

      <div className="space-y-2.5">
        {horses.map((h: DarkHorse) => (
          <Link key={h.rank} href={`/profile/${h.user.id}`}>
            <div className={`border p-4 cursor-pointer hover:border-[#E8754A]/35 transition-all ${rankBg(h.rank)}`}>
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center gap-1 w-10 shrink-0">
                  {rankIcon(h.rank)}
                  <span className="text-[13px] font-black tabular-nums text-white/40" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    #{h.rank}
                  </span>
                </div>

                <Avatar className={`w-11 h-11 border-2 shrink-0 ${h.rank === 1 ? "border-[#E8754A]/60" : "border-white/15"}`}>
                  <AvatarImage src={h.user.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-sm bg-[#E8754A]/10 text-[#E8754A] font-black">{h.user.displayName?.[0] ?? "?"}</AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-black text-sm uppercase tracking-tight truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {h.user.displayName}
                    </span>
                    {h.growthPercent > 0 && (
                      <span className="text-[9px] font-black text-[#E8754A] bg-[#E8754A]/10 px-1.5 py-0.5 shrink-0">
                        +{h.growthPercent}%
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-white/30 font-bold mb-1.5">@{h.user.username}</div>
                  <p className="text-[11px] text-white/50 italic leading-tight">{h.insight}</p>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[10px] text-[#E8754A]/45 font-black uppercase tracking-wider mb-0.5">PWR</div>
                  <div className="text-xl font-black text-[#E8754A] tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {h.powerScore}
                  </div>
                </div>
              </div>

              {h.rank <= 3 && (
                <div className="mt-3 flex items-center gap-2">
                  <TrendingUp className="w-3 h-3 text-[#E8754A]/40 shrink-0" />
                  <div className="flex-1 h-0.5 bg-white/5">
                    <div
                      className="h-0.5 bg-[#E8754A]"
                      style={{ width: `${Math.min(100, h.powerScore / 10)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </Link>
        ))}

        {!isLoading && horses.length === 0 && (
          <div className="text-center py-16 text-white/25 text-sm font-medium">
            The algorithm is still watching. Check back soon.
          </div>
        )}
      </div>
    </div>
  );
}
