import { cn } from "@/lib/utils";

interface VerificationBadgeProps {
  tier: string | null | undefined;
  className?: string;
  size?: "sm" | "md";
}

const SIZE_PX: Record<NonNullable<VerificationBadgeProps["size"]>, number> = {
  sm: 14,
  md: 18,
};

export function VerificationBadge({ tier, className, size = "sm" }: VerificationBadgeProps) {
  if (tier !== "silver" && tier !== "blue") return null;
  const px = SIZE_PX[size];
  const isBlue = tier === "blue";
  const fill = isBlue ? "#1D9BF0" : "#9CA3AF";
  const label = isBlue ? "Verified notable account" : "Verified identity";
  return (
    <span
      className={cn("inline-flex items-center shrink-0", className)}
      title={label}
      aria-label={label}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-hidden="true"
      >
        <path
          d="M12 1.5l2.25 1.95 2.97-.32 1.55 2.55 2.83.94-.32 2.97L23 12l-1.72 2.4.32 2.98-2.83.93-1.55 2.56-2.97-.33L12 22.5l-2.25-1.96-2.97.33-1.55-2.56-2.83-.93.32-2.98L1 12l1.72-2.41-.32-2.97 2.83-.94L6.78 3.13l2.97.32L12 1.5z"
          fill={fill}
        />
        <path
          d="M9.5 12.5l1.9 1.9 3.6-4.4"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </span>
  );
}
