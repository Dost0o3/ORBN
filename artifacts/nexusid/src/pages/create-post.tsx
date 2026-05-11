import { useState } from "react";
import { useLocation } from "wouter";
import { Sparkles, Image as ImageIcon, Hash, Video, Smile, Ghost } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreatePost, useEnhancePost } from "@workspace/api-client-react";
import { ImageUploader } from "@/components/image-uploader";
import { useUser } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const MOODS = ["professional", "motivational", "collaborative", "creative"] as const;

const moodColors: Record<string, string> = {
  professional: "border-blue-500/40 text-blue-400 bg-blue-500/8",
  motivational: "border-[#E8754A]/40 text-[#E8754A] bg-[#E8754A]/8",
  collaborative: "border-emerald-500/40 text-emerald-400 bg-emerald-500/8",
  creative: "border-purple-500/40 text-purple-400 bg-purple-500/8",
};

type MediaTab = "none" | "image" | "video" | "gif";

export default function CreatePostPage() {
  const { user } = useUser();
  const { data: me } = useGetMe();
  const [, navigate] = useLocation();
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<string>("");
  const [mediaTab, setMediaTab] = useState<MediaTab>("none");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [gifUrl, setGifUrl] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashInput, setHashInput] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState<string>("");
  // Per-post anonymity override. `undefined` means "follow account-wide
  // Ghost Mode"; `true`/`false` mean the user explicitly chose for this
  // post. We seed from `me.ghostMode` so the toggle visibly reflects what
  // would happen if they posted right now, but every flip after that is a
  // per-post override the server respects regardless of Ghost Mode.
  const [anonOverride, setAnonOverride] = useState<boolean | undefined>(undefined);
  const ghostOn = me?.ghostMode === true;
  const willPostAnonymously = anonOverride ?? ghostOn;

  const createPost = useCreatePost();
  const enhancePost = useEnhancePost();
  const { toast } = useToast();

  const addHashtag = () => {
    const h = hashInput.replace(/^#/, "").trim();
    if (h && !hashtags.includes(h)) setHashtags(prev => [...prev, h]);
    setHashInput("");
  };

  const handleEnhance = async () => {
    if (!content.trim()) return;
    try {
      const result = await enhancePost.mutateAsync({ data: { content, tone: (mood || "professional") as "professional" | "casual" | "inspirational" } });
      setAiSuggestion(result.enhancedContent ?? "");
      if (result.hashtags) {
        setHashtags(prev => [...new Set([...prev, ...result.hashtags!])]);
      }
    } catch {
      toast({ title: "AI enhance failed", description: "Try again in a moment.", variant: "destructive" });
    }
  };

  const handleSubmit = async () => {
    if (!content.trim()) return;
    const finalImageUrl = mediaTab === "image" ? imageUrl : mediaTab === "gif" ? gifUrl : undefined;
    const finalVideoUrl = mediaTab === "video" ? videoUrl : undefined;
    try {
      await createPost.mutateAsync({
        data: {
          content: aiSuggestion || content,
          mood: (mood || undefined) as "professional" | "motivational" | "collaborative" | "creative" | undefined,
          imageUrl: finalImageUrl || undefined,
          videoUrl: finalVideoUrl || undefined,
          hashtags,
          // Only send the override when the user explicitly toggled it for
          // this post; otherwise let the server fall back to account-wide
          // Ghost Mode.
          isAnonymous: anonOverride,
        }
      });
      toast({ title: "Posted", description: "Your signal is live." });
      navigate("/feed");
    } catch {
      toast({ title: "Post failed", description: "Try again.", variant: "destructive" });
    }
  };

  const mediaTabs: { id: MediaTab; icon: React.ReactNode; label: string }[] = [
    { id: "image", icon: <ImageIcon className="w-3.5 h-3.5" />, label: "Photo" },
    { id: "video", icon: <Video className="w-3.5 h-3.5" />, label: "Video" },
    { id: "gif", icon: <Smile className="w-3.5 h-3.5" />, label: "GIF" },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="text-[10px] text-[#E8754A]/50 font-black uppercase tracking-[0.2em] mb-1">Broadcast</div>
      <h1 className="text-2xl font-black uppercase tracking-tight mb-6">Create Post</h1>

      {ghostOn && (
        <div
          data-testid="ghost-mode-banner"
          className="mb-4 flex items-start gap-3 border border-[#E8754A]/40 bg-[#E8754A]/8 px-4 py-3 text-[#E8754A]"
        >
          <Ghost className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 text-[11px] font-bold leading-relaxed">
            <div className="font-black uppercase tracking-[0.15em] text-[10px] mb-1">
              Ghost Mode is on
            </div>
            <div className="opacity-90">
              This post will appear as Anonymous to everyone but you. Toggle it
              off in the{" "}
              <a
                href="#ghost-mode-toggle"
                onClick={(e) => {
                  e.preventDefault();
                  const targets = document.querySelectorAll<HTMLElement>(
                    "[data-ghost-mode-toggle]"
                  );
                  // Prefer the visible instance (desktop sidebar vs mobile drawer).
                  const visible = Array.from(targets).find(
                    (el) => el.offsetParent !== null
                  );
                  (visible ?? targets[0])?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                }}
                className="underline underline-offset-2 hover:text-[#E8754A]/80"
              >
                sidebar Ghost Mode switch
              </a>
              {" "}to post under your name.
            </div>
          </div>
        </div>
      )}

      <div className="bg-black border border-[#E8754A]/15 p-5">
        {/* Author */}
        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-[#E8754A]/10">
          <Avatar className="w-9 h-9 border border-[#E8754A]/20">
            <AvatarImage src={me?.avatarUrl ?? user?.imageUrl} />
            <AvatarFallback className="text-xs bg-[#E8754A]/10 text-[#E8754A] font-bold">{(me?.displayName ?? user?.firstName ?? "U")[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-black text-sm text-white/90">{me?.displayName ?? user?.fullName ?? user?.username}</div>
            <div className="text-[11px] text-white/30 font-bold">@{me?.username ?? user?.username}</div>
          </div>
        </div>

        {/* Content */}
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Say something that matters..."
          rows={5}
          className="resize-none text-sm bg-transparent border-0 border-b border-[#E8754A]/15 px-0 focus-visible:ring-0 mb-5 text-white placeholder:text-white/20 font-medium"
        />

        {/* AI suggestion */}
        {aiSuggestion && (
          <div className="bg-[#E8754A]/5 border border-[#E8754A]/25 p-3 mb-5">
            <div className="flex items-center gap-1.5 text-[10px] text-[#E8754A] font-black mb-1.5 uppercase tracking-[0.12em]">
              <Sparkles className="w-3 h-3" /> AI Enhanced Version
            </div>
            <p className="text-sm text-white/75 font-medium leading-relaxed">{aiSuggestion}</p>
            <div className="flex gap-2 mt-2.5">
              <Button
                size="sm"
                className="text-[11px] h-7 bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider"
                onClick={() => { setContent(aiSuggestion); setAiSuggestion(""); }}
              >
                Use This
              </Button>
              <Button
                size="sm"
                className="text-[11px] h-7 bg-transparent border-transparent text-white/40 hover:text-white/70 font-bold uppercase tracking-wider"
                onClick={() => setAiSuggestion("")}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {/* Mood */}
        <div className="mb-5">
          <div className="text-[10px] text-white/35 font-black mb-2 uppercase tracking-[0.15em]">Tone</div>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map(m => (
              <button
                key={m}
                onClick={() => setMood(mood === m ? "" : m)}
                className={cn(
                  "px-2.5 py-1 text-[10px] font-black border uppercase tracking-wider transition-colors",
                  mood === m
                    ? moodColors[m] ?? "border-[#E8754A]/40 text-[#E8754A] bg-[#E8754A]/8"
                    : "border-white/10 text-white/30 hover:border-white/20 hover:text-white/55"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Hashtags */}
        <div className="mb-5">
          <div className="text-[10px] text-white/35 font-black mb-2 uppercase tracking-[0.15em]">Hashtags</div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25" />
              <Input
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addHashtag()}
                placeholder="Add tag"
                className="h-8 text-xs pl-7 bg-black border-[#E8754A]/15 focus:border-[#E8754A]/40 text-white placeholder:text-white/20"
              />
            </div>
            <Button
              size="sm"
              className="h-8 text-[11px] bg-transparent border border-[#E8754A]/20 text-[#E8754A]/60 hover:border-[#E8754A]/40 hover:text-[#E8754A] font-black uppercase tracking-wider"
              onClick={addHashtag}
            >
              Add
            </Button>
          </div>
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {hashtags.map(h => (
                <button
                  key={h}
                  className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 border border-[#E8754A]/20 text-[#E8754A]/60 bg-[#E8754A]/5 hover:border-[#DC143C]/30 hover:text-[#DC143C]/60 transition-colors"
                  onClick={() => setHashtags(prev => prev.filter(x => x !== h))}
                >
                  #{h} ×
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Media section */}
        <div className="mb-5">
          <div className="text-[10px] text-white/35 font-black mb-2 uppercase tracking-[0.15em]">Media</div>
          {/* Tab selector */}
          <div className="flex gap-1 mb-3">
            {mediaTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setMediaTab(mediaTab === tab.id ? "none" : tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black border uppercase tracking-wider transition-all",
                  mediaTab === tab.id
                    ? "border-[#E8754A]/50 text-[#E8754A] bg-[#E8754A]/10"
                    : "border-white/10 text-white/30 hover:border-white/25 hover:text-white/60"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {mediaTab === "image" && (
            <ImageUploader
              value={imageUrl}
              onChange={setImageUrl}
              accept="image/jpeg,image/png,image/webp,image/avif"
              label="Drop or click to add a photo"
              maxSizeMb={10}
            />
          )}

          {mediaTab === "video" && (
            <div>
              <ImageUploader
                value={videoUrl}
                onChange={setVideoUrl}
                accept="video/mp4,video/webm,video/quicktime,video/mov"
                label="Drop or click to add a video (MP4, WebM, MOV)"
                maxSizeMb={200}
              />
              {videoUrl && (
                <video
                  src={videoUrl}
                  controls
                  className="mt-2 w-full max-h-64 border border-[#E8754A]/15 object-cover"
                  preload="metadata"
                />
              )}
            </div>
          )}

          {mediaTab === "gif" && (
            <div>
              <ImageUploader
                value={gifUrl}
                onChange={setGifUrl}
                accept="image/gif"
                label="Drop or click to add a GIF"
                maxSizeMb={25}
              />
              {gifUrl && (
                <img src={gifUrl} alt="GIF preview" className="mt-2 max-h-48 border border-[#E8754A]/15" />
              )}
            </div>
          )}
        </div>

        {/* Per-post anonymity toggle */}
        <div className="mb-4">
          <button
            type="button"
            role="switch"
            aria-checked={willPostAnonymously}
            data-testid="toggle-post-anonymously"
            onClick={() => setAnonOverride(!willPostAnonymously)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 border transition-colors text-left",
              willPostAnonymously
                ? "border-[#E8754A]/40 bg-[#E8754A]/8 text-[#E8754A]"
                : "border-white/10 bg-transparent text-white/55 hover:border-white/20 hover:text-white/75"
            )}
          >
            <Ghost className="w-4 h-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.15em]">Post anonymously</div>
              <div className="text-[10px] font-medium opacity-70 mt-0.5">
                {willPostAnonymously
                  ? "This post will show as Anonymous to others."
                  : "This post will show your name."}
                {ghostOn && anonOverride === false && " (Ghost Mode is on, but overridden for this post.)"}
                {!ghostOn && anonOverride === true && " (Ghost Mode is off, but enabled for this post.)"}
              </div>
            </div>
            <span
              className={cn(
                "relative inline-block w-8 h-4 rounded-full transition-colors shrink-0",
                willPostAnonymously ? "bg-[#E8754A]" : "bg-white/15"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 w-3 h-3 rounded-full bg-black transition-transform",
                  willPostAnonymously ? "translate-x-4" : "translate-x-0.5"
                )}
              />
            </span>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-[#E8754A]/10">
          <div className="flex gap-1">
            <Button
              size="sm"
              className="h-8 text-[11px] bg-transparent border-transparent text-[#E8754A]/60 hover:text-[#E8754A] gap-1.5 font-black uppercase tracking-wider"
              onClick={handleEnhance}
              disabled={!content.trim() || enhancePost.isPending}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {enhancePost.isPending ? "Enhancing..." : "AI Enhance"}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="text-[11px] h-8 bg-transparent border border-white/10 text-white/35 hover:border-white/20 hover:text-white/55 font-bold uppercase tracking-wider"
              onClick={() => navigate("/feed")}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!content.trim() || createPost.isPending}
              className="text-[11px] h-8 bg-[#E8754A] text-black border-[#E8754A] font-black uppercase tracking-wider hover:bg-[#E8754A]/90"
            >
              {createPost.isPending ? "Posting..." : "Broadcast"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
