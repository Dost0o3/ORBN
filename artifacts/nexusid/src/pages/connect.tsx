import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Heart, X, Star, MapPin, Sparkles, Users, Loader2, RefreshCw } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface Candidate {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  location: string | null;
  skills: string[];
  powerScore: number;
  rank: string;
  compatibilityScore: number;
  reasons: string[];
}

interface MatchedUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

async function fetchCandidates(): Promise<Candidate[]> {
  const r = await fetch(`${basePath}/api/match/candidates?limit=15`);
  if (!r.ok) throw new Error("Failed to fetch candidates");
  const data = await r.json();
  return data.candidates ?? [];
}

async function postSwipe(targetUserId: string, direction: "like" | "pass" | "superlike") {
  const r = await fetch(`${basePath}/api/match/swipe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUserId, direction }),
  });
  if (!r.ok) throw new Error("Swipe failed");
  return r.json() as Promise<{ matched: boolean; target: MatchedUser | null }>;
}

function rankColor(rank: string): string {
  switch (rank) {
    case "THE DON": return "text-primary border-primary";
    case "CAPO": return "text-primary/90 border-primary/60";
    case "SOLDIER": return "text-amber-400 border-amber-400/60";
    case "ASSOCIATE": return "text-zinc-300 border-zinc-400/60";
    default: return "text-zinc-500 border-zinc-600";
  }
}

function CompatBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary via-primary to-amber-300 transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[10px] font-black tracking-wider text-primary tabular-nums">{score}%</span>
    </div>
  );
}

function SwipeCard({
  candidate,
  onSwipe,
  isTop,
}: {
  candidate: Candidate;
  onSwipe: (direction: "like" | "pass" | "superlike") => void;
  isTop: boolean;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-18, 0, 18]);
  const likeOpacity = useTransform(x, [20, 150], [0, 1]);
  const passOpacity = useTransform(x, [-150, -20], [1, 0]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const threshold = 120;
    if (info.offset.x > threshold) onSwipe("like");
    else if (info.offset.x < -threshold) onSwipe("pass");
  };

  return (
    <motion.div
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDragEnd={handleDragEnd}
      style={{ x, rotate }}
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
      whileTap={{ cursor: "grabbing" }}
      initial={{ scale: isTop ? 1 : 0.95, opacity: isTop ? 1 : 0.6 }}
      animate={{ scale: isTop ? 1 : 0.95, opacity: isTop ? 1 : 0.6 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <Card className="relative h-full w-full overflow-hidden bg-zinc-950 border-2 border-border/60 shadow-2xl select-none">
        {/* Cover */}
        <div className="relative h-44 sm:h-52 overflow-hidden">
          {candidate.coverUrl ? (
            <img src={candidate.coverUrl} alt="" className="w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-zinc-900 via-zinc-800 to-black" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
          {/* Floating badges */}
          <div className="absolute top-3 right-3 flex flex-col gap-2 items-end">
            <Badge variant="outline" className={`text-[10px] font-black tracking-widest uppercase bg-black/80 backdrop-blur-sm ${rankColor(candidate.rank)}`}>
              {candidate.rank}
            </Badge>
            <Badge className="text-[10px] font-black tracking-widest uppercase bg-primary text-primary-foreground border-0">
              ⚡ {candidate.powerScore}
            </Badge>
          </div>
          {/* Swipe indicators */}
          <motion.div
            style={{ opacity: likeOpacity }}
            className="absolute top-6 left-6 px-4 py-2 border-4 border-primary text-primary font-black text-2xl tracking-widest rotate-[-15deg] uppercase"
          >
            Connect
          </motion.div>
          <motion.div
            style={{ opacity: passOpacity }}
            className="absolute top-6 right-6 px-4 py-2 border-4 border-destructive text-destructive font-black text-2xl tracking-widest rotate-[15deg] uppercase"
          >
            Pass
          </motion.div>
        </div>

        {/* Avatar overlap */}
        <div className="px-5 -mt-10 relative z-10">
          <Avatar className="size-20 border-4 border-zinc-950 shadow-xl">
            <AvatarImage src={candidate.avatarUrl ?? undefined} draggable={false} />
            <AvatarFallback className="bg-primary text-primary-foreground font-black text-2xl">
              {candidate.displayName?.[0]?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Content */}
        <div className="px-5 pt-3 pb-5 space-y-3 overflow-y-auto max-h-[calc(100%-12rem)]">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-foreground leading-none">{candidate.displayName}</h2>
            <p className="text-xs text-muted-foreground tracking-wider uppercase mt-1">@{candidate.username}</p>
          </div>

          {candidate.location && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              <span>{candidate.location}</span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black tracking-widest uppercase text-muted-foreground">Compatibility</span>
            </div>
            <CompatBar score={candidate.compatibilityScore} />
          </div>

          {candidate.bio && (
            <p className="text-sm text-foreground/90 leading-relaxed line-clamp-3">{candidate.bio}</p>
          )}

          {candidate.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {candidate.skills.slice(0, 6).map(skill => (
                <span key={skill} className="text-[10px] px-2 py-0.5 bg-zinc-900 border border-border/60 text-foreground/80 uppercase tracking-wider font-bold">
                  {skill}
                </span>
              ))}
            </div>
          )}

          {candidate.reasons.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-border/40">
              <div className="flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase text-primary">
                <Sparkles className="size-3" />
                <span>Why You Match</span>
              </div>
              <ul className="space-y-0.5">
                {candidate.reasons.slice(0, 3).map((r, i) => (
                  <li key={i} className="text-xs text-foreground/70 pl-3 relative">
                    <span className="absolute left-0 top-1.5 size-1 bg-primary rounded-full" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

export default function ConnectPage() {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchedDialog, setMatchedDialog] = useState<MatchedUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await fetchCandidates();
      setCandidates(c);
    } catch {
      toast({ title: "Failed to load candidates", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const handleSwipe = useCallback(async (direction: "like" | "pass" | "superlike") => {
    const top = candidates[0];
    if (!top) return;
    setCandidates(prev => prev.slice(1));
    try {
      const result = await postSwipe(top.id, direction);
      if (result.matched && result.target) {
        setMatchedDialog(result.target);
      } else if (direction === "superlike") {
        toast({ title: "Super Like sent", description: `${top.displayName} will see you stood out.` });
      }
    } catch {
      toast({ title: "Swipe failed", description: "Please try again", variant: "destructive" });
      setCandidates(prev => [top, ...prev]);
    }
  }, [candidates, toast]);

  const top = candidates[0];
  const next = candidates[1];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
      <div className="mb-6 sm:mb-8 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="size-2 bg-primary animate-pulse" />
            <span className="text-[10px] font-black tracking-widest uppercase text-primary">The Connection Algorithm</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-foreground">Find Your People</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            AI-ranked candidates based on skills, reputation, and compatibility. Swipe right to connect, left to pass.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 hidden sm:flex">
          <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="relative mx-auto w-full max-w-md aspect-[3/4] sm:aspect-[4/5]">
        {loading && candidates.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="size-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Scanning the network…</p>
            </div>
          </div>
        )}

        {!loading && candidates.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Card className="p-8 text-center bg-zinc-950 border-border/60 max-w-sm">
              <Users className="size-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-black tracking-tight text-foreground mb-2">You've Seen Everyone</h3>
              <p className="text-sm text-muted-foreground mb-4">
                We'll surface new candidates as they join the network. Check back soon — or refresh to see if anyone new appeared.
              </p>
              <Button onClick={load} className="gap-1.5">
                <RefreshCw className="size-3" /> Reload
              </Button>
            </Card>
          </div>
        )}

        <AnimatePresence>
          {next && <SwipeCard key={next.id} candidate={next} onSwipe={handleSwipe} isTop={false} />}
          {top && <SwipeCard key={top.id} candidate={top} onSwipe={handleSwipe} isTop={true} />}
        </AnimatePresence>
      </div>

      {top && (
        <div className="flex items-center justify-center gap-4 sm:gap-6 mt-6 sm:mt-8">
          <Button
            size="lg"
            variant="outline"
            onClick={() => handleSwipe("pass")}
            className="size-14 sm:size-16 rounded-full p-0 border-2 border-destructive/60 hover:bg-destructive/10 hover:border-destructive transition-colors"
            aria-label="Pass"
          >
            <X className="size-6 text-destructive" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => handleSwipe("superlike")}
            className="size-12 sm:size-14 rounded-full p-0 border-2 border-amber-400/60 hover:bg-amber-400/10 hover:border-amber-400 transition-colors"
            aria-label="Super Like"
          >
            <Star className="size-5 text-amber-400 fill-amber-400" />
          </Button>
          <Button
            size="lg"
            onClick={() => handleSwipe("like")}
            className="size-14 sm:size-16 rounded-full p-0 bg-primary hover:bg-primary/90 transition-colors"
            aria-label="Connect"
          >
            <Heart className="size-6 text-primary-foreground fill-primary-foreground" />
          </Button>
        </div>
      )}

      {/* Match dialog */}
      <AnimatePresence>
        {matchedDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setMatchedDialog(null)}
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-950 border-2 border-primary p-8 sm:p-12 max-w-md w-full text-center"
            >
              <motion.div
                initial={{ rotate: -10, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ delay: 0.1, type: "spring" }}
              >
                <h2 className="text-5xl sm:text-6xl font-black tracking-tight text-primary mb-2">IT'S A MATCH</h2>
              </motion.div>
              <p className="text-sm text-muted-foreground tracking-wider uppercase font-bold mb-6">
                You and {matchedDialog.displayName} both want to connect
              </p>
              <div className="flex justify-center mb-6">
                <Avatar className="size-24 border-4 border-primary shadow-2xl">
                  <AvatarImage src={matchedDialog.avatarUrl ?? undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground font-black text-3xl">
                    {matchedDialog.displayName?.[0]?.toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button asChild variant="outline" className="flex-1">
                  <a href={`${basePath}/profile/${matchedDialog.id}`}>View Profile</a>
                </Button>
                <Button onClick={() => setMatchedDialog(null)} className="flex-1">
                  Keep Swiping
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
