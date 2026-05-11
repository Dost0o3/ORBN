import { cn } from "@/lib/utils";

const rankStyles: Record<string, { label: string; className: string }> = {
  "THE DON": { label: "THE DON", className: "text-[#DC143C] border-[#DC143C]/40 bg-[#DC143C]/8" },
  "INNER CIRCLE": { label: "INNER CIRCLE", className: "text-purple-400 border-purple-500/40 bg-purple-500/8" },
  "RISING FORCE": { label: "RISING FORCE", className: "text-[#E8754A] border-[#E8754A]/40 bg-[#E8754A]/8" },
  "OPERATIVE": { label: "OPERATIVE", className: "text-blue-400 border-blue-500/40 bg-blue-500/8" },
  "RECRUIT": { label: "RECRUIT", className: "text-white/35 border-white/15 bg-white/4" },
};

interface PowerBadgeProps {
  score?: number | null;
  rank?: string | null;
  showRank?: boolean;
  size?: "xs" | "sm";
}

export default function PowerBadge({ score, rank, showRank = false, size = "xs" }: PowerBadgeProps) {
  if (score == null) return null;

  const style = rank ? (rankStyles[rank] ?? rankStyles["RECRUIT"]) : null;
  const textSize = size === "sm" ? "text-[10px]" : "text-[9px]";

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <span className={cn(textSize, "font-black text-[#E8754A] tabular-nums neon-text-gold")}>
        ⚡{score}
      </span>
      {showRank && style && (
        <span className={cn(textSize, "font-black border px-1 py-0.5 uppercase tracking-wider backdrop-blur-sm shadow-[0_0_8px_currentColor]/20", style.className)}>
          {style.label}
        </span>
      )}
    </span>
  );
}
