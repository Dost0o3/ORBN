import { useState, useRef, useEffect } from "react";
import { useUser } from "@clerk/react";
import { Brain, Send, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import AgentModeToggle from "@/components/agent-mode-toggle";
import AgentForYouPanel from "@/components/agent-for-you-panel";
import { fetchAgentStatus, type AgentScanResult } from "@/hooks/use-agent-scan";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  searching?: boolean;
}

const CONV_ID_KEY = "nexusid-soul-twin-conv-id";

const SUGGESTIONS = [
  "How do I position myself for a senior engineering role?",
  "What projects should I showcase to stand out?",
  "Draft a power post about my latest achievement",
  "Help me dominate a tech lead interview",
];

const basePath = () => import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

async function createConversation(): Promise<number | null> {
  const bp = basePath();
  try {
    const createRes = await fetch(`${bp}/api/openai/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Soul Twin" }),
    });
    if (!createRes.ok) return null;
    const conv = await createRes.json();
    try { localStorage.setItem(CONV_ID_KEY, String(conv.id)); } catch {}
    return Number(conv.id);
  } catch {
    return null;
  }
}

async function fetchOrCreateConversation(): Promise<number | null> {
  const bp = basePath();
  try {
    const stored = localStorage.getItem(CONV_ID_KEY);
    if (stored) {
      const id = Number(stored);
      // Verify it still belongs to the user (will 404 if not).
      const check = await fetch(`${bp}/api/openai/conversations/${id}/messages`);
      if (check.ok) return id;
    }
  } catch {}
  // List existing conversations; reuse most recent or create new.
  try {
    const listRes = await fetch(`${bp}/api/openai/conversations`);
    if (listRes.ok) {
      const data = await listRes.json();
      const recent = (data.conversations ?? [])[0];
      if (recent?.id) {
        try { localStorage.setItem(CONV_ID_KEY, String(recent.id)); } catch {}
        return Number(recent.id);
      }
    }
  } catch {}
  return createConversation();
}

async function loadHistoryFromServer(convId: number): Promise<Message[]> {
  try {
    const res = await fetch(`${basePath()}/api/openai/conversations/${convId}/messages`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.messages ?? [])
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m: any) => ({ role: m.role, content: m.content } as Message));
  } catch {
    return [];
  }
}

export default function SoulTwinPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const [convId, setConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [scanResult, setScanResult] = useState<AgentScanResult | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAgentStatus().then((s) => { if (s) setAgentEnabled(s.agentModeEnabled); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await fetchOrCreateConversation();
      if (cancelled) return;
      setConvId(id);
      if (id) {
        const hist = await loadHistoryFromServer(id);
        if (!cancelled) setMessages(hist);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const resetConversation = async () => {
    if (loading) return;
    try { localStorage.removeItem(CONV_ID_KEY); } catch {}
    setMessages([]);
    setConvId(null);
    // Always create a brand-new conversation on explicit reset; never reuse the latest.
    const id = await createConversation();
    setConvId(id);
    toast({ title: "New conversation started" });
  };

  const sendMessage = async (text?: string) => {
    const content = text || input.trim();
    if (!content || loading) return;
    if (!convId) {
      toast({ title: "Connecting…", description: "Try again in a moment." });
      return;
    }

    setInput("");
    setMessages(prev => [...prev, { role: "user", content }]);
    setLoading(true);

    try {
      const response = await fetch(`${basePath()}/api/openai/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) throw new Error("Failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      setMessages(prev => [...prev, { role: "assistant", content: "", streaming: true, searching: true }]);

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.status === "searching") {
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  return [...prev.slice(0, -1), { ...last, searching: true }];
                });
              }
              if (data.content) {
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  return [...prev.slice(0, -1), { ...last, content: last.content + data.content, searching: false }];
                });
              }
              if (data.done) {
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  return [...prev.slice(0, -1), { ...last, streaming: false, searching: false }];
                });
              }
            } catch {}
          }
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "SIGNAL LOST. RETRY." }]);
      toast({ title: "Connection lost", description: "Could not reach Soul Twin.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)] lg:h-screen max-w-3xl mx-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#E8754A]/12 bg-black shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 border border-[#E8754A]/28 flex items-center justify-center bg-[#E8754A]/4">
            <Brain className="w-5 h-5 text-[#E8754A]" />
          </div>
          <div>
            <h1 className="font-black text-sm uppercase tracking-[0.12em] text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Soul Twin</h1>
            <p className="terminal text-[10px] text-white/28">// trained on your profile · live web access</p>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <AgentModeToggle onScanResult={(r) => { setScanResult(r); setAgentEnabled(true); }} />
            {messages.length > 0 && (
              <Button
                size="sm"
                onClick={resetConversation}
                disabled={loading}
                aria-label="Start a new conversation"
                className="h-7 bg-transparent border border-[#E8754A]/22 text-[#E8754A]/65 hover:border-[#E8754A]/45 hover:text-[#E8754A] font-black uppercase tracking-wider text-[10px] px-2"
              >
                <Plus className="w-3 h-3 mr-1" /> New
              </Button>
            )}
            <div className="flex items-center gap-1.5 terminal text-[10px] text-emerald-400">
              <span className="w-1.5 h-1.5 bg-emerald-400 animate-pulse" />
              ONLINE
            </div>
          </div>
        </div>
      </div>

      {/* Agent Mode "For You" panel — only when agent is enabled. Additive; sits above messages. */}
      {agentEnabled && (
        <div className="px-4 pt-3 bg-black shrink-0">
          <AgentForYouPanel initial={scanResult} />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-black">
        {messages.length === 0 && (
          <div className="py-10">
            <div className="max-w-md mx-auto">
              <div className="border border-[#E8754A]/15 bg-[#E8754A]/3 p-6 mb-6">
                <div className="terminal text-[#E8754A]/60 text-xs mb-4">
                  <span>$ soul-twin --connect --user="{user?.username ?? 'operator'}"</span>
                </div>
                <div className="terminal text-white/55 text-xs space-y-1">
                  <div><span className="text-[#E8754A]/50">{">"}</span> Identity loaded</div>
                  <div><span className="text-[#E8754A]/50">{">"}</span> Professional context indexed</div>
                  <div><span className="text-[#E8754A]/50">{">"}</span> Ready for deployment</div>
                </div>
              </div>
              <div className="text-[10px] text-white/28 font-black uppercase tracking-[0.15em] mb-3">Suggested Queries</div>
              <div className="space-y-2">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="w-full text-left terminal text-xs p-3 border border-[#E8754A]/10 hover:border-[#E8754A]/35 hover:bg-[#E8754A]/3 transition-colors text-white/38 hover:text-white/65 flex items-start gap-2"
                  >
                    <ChevronRight className="w-3 h-3 text-[#E8754A]/45 shrink-0 mt-0.5" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
            {msg.role === "assistant" ? (
              <div className="w-7 h-7 border border-[#E8754A]/25 flex items-center justify-center shrink-0 bg-[#E8754A]/5 self-start mt-0.5">
                <Brain className="w-3.5 h-3.5 text-[#E8754A]" />
              </div>
            ) : (
              <Avatar className="w-7 h-7 border border-[#E8754A]/18 shrink-0 self-start mt-0.5">
                <AvatarImage src={user?.imageUrl} />
                <AvatarFallback className="text-xs bg-[#E8754A]/10 text-[#E8754A] font-bold">{user?.firstName?.[0] ?? "U"}</AvatarFallback>
              </Avatar>
            )}
            <div className={cn(
              "max-w-[75%] px-4 py-3 terminal",
              msg.role === "user"
                ? "bg-[#E8754A] text-black text-sm"
                : "bg-[#0f0f0f] border border-[#E8754A]/12 text-white/75 text-xs leading-relaxed"
            )}>
              {msg.role === "assistant" && (
                <div className="text-[#E8754A]/45 text-[10px] mb-1.5">SOUL_TWIN &gt;</div>
              )}
              {msg.role === "assistant" && msg.searching && msg.content === "" && (
                <div className="flex items-center gap-2 text-[#E8754A]/70 text-xs">
                  <span className="w-1.5 h-1.5 bg-[#E8754A] animate-pulse rounded-full" />
                  Searching the web…
                </div>
              )}
              {msg.content}
              {msg.streaming && <span className="inline-block w-1.5 h-3.5 bg-[#E8754A] ml-0.5 animate-pulse align-middle" />}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-4 border-t border-[#E8754A]/12 bg-black shrink-0">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="$ deploy query..."
            rows={2}
            className="resize-none terminal text-sm bg-black border-[#E8754A]/18 focus:border-[#E8754A]/38 flex-1 text-white/80 placeholder:text-white/20"
            disabled={loading}
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading || !convId}
            aria-label="Send message"
            className="self-end shrink-0 bg-[#E8754A] text-black border-[#E8754A] font-black hover:bg-[#E8754A]/90"
            size="sm"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="terminal text-[10px] text-white/18 mt-1.5">Enter to send · Shift+Enter for newline · Conversation persists on the server</p>
      </div>
    </div>
  );
}
