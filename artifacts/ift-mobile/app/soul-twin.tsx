import { Ionicons } from "@expo/vector-icons";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { API_BASE } from "../lib/api-base";
import { useAgent } from "@/hooks/useAgent";
import AgentModeToggle from "@/components/AgentModeToggle";
import AgentForYouPanel from "@/components/AgentForYouPanel";
import AgentQueueRetryStrip from "@/components/AgentQueueRetryStrip";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  searching?: boolean;
}

const SUGGESTIONS = [
  "How do I position myself for a senior role?",
  "What skills should I showcase to stand out?",
  "Draft a power post about my latest achievement",
  "Help me dominate a tech lead interview",
];

const CONV_KEY = "ift-soul-twin-conv-id";

export default function SoulTwinScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();

  const [convId, setConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [scanRefresh, setScanRefresh] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const { status: agentStatus } = useAgent();
  const agentEnabled = agentStatus?.agentModeEnabled === true;

  const authHeaders = async () => {
    const token = await getToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  useEffect(() => {
    (async () => {
      try {
        const headers = await authHeaders();
        const listRes = await fetch(`${API_BASE}/api/openai/conversations`, { headers });
        if (listRes.ok) {
          const data = await listRes.json();
          const recent = (data.conversations ?? [])[0];
          if (recent?.id) {
            setConvId(Number(recent.id));
            const msgRes = await fetch(`${API_BASE}/api/openai/conversations/${recent.id}/messages`, { headers });
            if (msgRes.ok) {
              const msgData = await msgRes.json();
              const hist: Message[] = (msgData.messages ?? [])
                .filter((m: any) => m.role === "user" || m.role === "assistant")
                .map((m: any) => ({ role: m.role, content: m.content }));
              setMessages(hist);
            }
            setReady(true);
            return;
          }
        }
        const createRes = await fetch(`${API_BASE}/api/openai/conversations`, {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ title: "Soul Twin" }),
        });
        if (createRes.ok) {
          const conv = await createRes.json();
          setConvId(Number(conv.id));
        }
        setReady(true);
      } catch {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const resetConversation = async () => {
    if (loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMessages([]);
    setConvId(null);
    try {
      const createRes = await fetch(`${API_BASE}/api/openai/conversations`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ title: "Soul Twin" }),
      });
      if (createRes.ok) {
        const conv = await createRes.json();
        setConvId(Number(conv.id));
      }
    } catch {}
  };

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading || !convId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content }]);
    setLoading(true);

    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE}/api/openai/conversations/${convId}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({ content }),
      });

      if (!res.ok) throw new Error("Failed");

      setMessages((prev) => [...prev, { role: "assistant", content: "", streaming: true, searching: true }]);

      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.status === "searching") {
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    return [...prev.slice(0, -1), { ...last, searching: true }];
                  });
                }
                if (data.content) {
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    return [...prev.slice(0, -1), { ...last, content: last.content + data.content, searching: false }];
                  });
                }
                if (data.done) {
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    return [...prev.slice(0, -1), { ...last, streaming: false, searching: false }];
                  });
                }
              } catch {}
            }
          }
        }
      } else {
        const text = await res.text();
        let fullContent = "";
        for (const line of text.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) fullContent += data.content;
            } catch {}
          }
        }
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return [...prev.slice(0, -1), { ...last, content: fullContent, streaming: false }];
        });
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "SIGNAL LOST. Please retry." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === "web" ? 20 : insets.top + 12,
            borderBottomColor: "rgba(100,180,220,0.18)",
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={[styles.brainIcon, { borderColor: "rgba(232,117,74,0.30)" }]}>
          <Ionicons name="hardware-chip-outline" size={18} color="#E8754A" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Soul Twin</Text>
          <Text style={styles.headerSub}>// trained on your profile · live web access</Text>
        </View>
        <AgentModeToggle onScanComplete={() => setScanRefresh((n) => n + 1)} />
        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>ONLINE</Text>
        </View>
        {messages.length > 0 && (
          <TouchableOpacity onPress={resetConversation} style={styles.newBtn}>
            <Text style={styles.newBtnText}>New</Text>
          </TouchableOpacity>
        )}
      </View>

      {agentEnabled && <AgentForYouPanel refreshKey={scanRefresh} />}
      {agentEnabled && <AgentQueueRetryStrip refreshKey={scanRefresh} />}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.messages,
            { paddingBottom: 16 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && ready && (
            <View style={styles.emptyState}>
              <View style={styles.terminalBox}>
                <Text style={styles.terminalLine}>
                  {"$ soul-twin --connect --user=\""}
                  <Text style={{ color: "#E8754A" }}>{user?.username ?? "operator"}</Text>
                  {'"'}
                </Text>
                <Text style={[styles.terminalLine, { marginTop: 8 }]}>
                  <Text style={{ color: "rgba(232,117,74,0.50)" }}>{">"} </Text>Identity loaded
                </Text>
                <Text style={styles.terminalLine}>
                  <Text style={{ color: "rgba(232,117,74,0.50)" }}>{">"} </Text>Context indexed
                </Text>
                <Text style={styles.terminalLine}>
                  <Text style={{ color: "rgba(232,117,74,0.50)" }}>{">"} </Text>Ready for deployment
                </Text>
              </View>
              <Text style={styles.suggestLabel}>SUGGESTED QUERIES</Text>
              {SUGGESTIONS.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => sendMessage(s)}
                  style={styles.suggestion}
                >
                  <Ionicons name="chevron-forward" size={12} color="rgba(232,117,74,0.50)" />
                  <Text style={styles.suggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {messages.map((msg, i) => (
            <View
              key={i}
              style={[
                styles.bubble,
                msg.role === "user" ? styles.userBubble : styles.aiBubble,
              ]}
            >
              {msg.role === "assistant" && (
                <Text style={styles.bubbleRole}>SOUL TWIN</Text>
              )}
              <Text style={[
                styles.bubbleText,
                msg.role === "user" ? styles.userText : styles.aiText,
              ]}>
                {msg.content}
                {msg.streaming && <Text style={{ color: "#E8754A" }}>▌</Text>}
              </Text>
            </View>
          ))}

          {loading && messages[messages.length - 1]?.content === "" && (
            <View style={[styles.aiBubble, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
              <ActivityIndicator size="small" color="#E8754A" />
              <Text style={[styles.aiText, { fontSize: 13, color: "rgba(255,255,255,0.7)" }]}>
                {messages[messages.length - 1]?.searching
                  ? "Searching the web…"
                  : "Thinking…"}
              </Text>
            </View>
          )}
        </ScrollView>

        <View
          style={[
            styles.inputRow,
            {
              borderTopColor: "rgba(100,180,220,0.18)",
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <TextInput
            style={[styles.textInput, { color: "#fff" }]}
            value={input}
            onChangeText={setInput}
            placeholder="Ask your Soul Twin..."
            placeholderTextColor="rgba(255,255,255,0.25)"
            multiline
            maxLength={1000}
            onSubmitEditing={() => sendMessage()}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading || !convId}
            style={[
              styles.sendBtn,
              (!input.trim() || loading) && styles.sendBtnDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Ionicons name="send" size={16} color="#000" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  brainIcon: {
    width: 36,
    height: 36,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(100,180,220,0.08)",
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  headerSub: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.3)",
    letterSpacing: 0.3,
    marginTop: 1,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10b981",
  },
  statusText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#10b981",
    letterSpacing: 1,
  },
  newBtn: {
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  newBtnText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "rgba(232,117,74,0.70)",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  messages: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  emptyState: { paddingTop: 16, gap: 10 },
  terminalBox: {
    borderWidth: 1,
    borderColor: "rgba(100,180,220,0.18)",
    backgroundColor: "rgba(100,180,220,0.05)",
    padding: 16,
    marginBottom: 8,
  },
  terminalLine: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "rgba(255,255,255,0.45)",
    lineHeight: 18,
  },
  suggestLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(255,255,255,0.25)",
    letterSpacing: 2,
    marginTop: 8,
    marginBottom: 2,
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(100,180,220,0.15)",
    padding: 12,
  },
  suggestionText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.4)",
    lineHeight: 17,
  },
  bubble: {
    maxWidth: "85%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#E8754A",
  },
  aiBubble: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(100,180,220,0.20)",
    backgroundColor: "rgba(100,180,220,0.06)",
  },
  bubbleRole: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    color: "rgba(232,117,74,0.70)",
    letterSpacing: 1.5,
  },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  userText: { color: "#000" },
  aiText: { color: "rgba(255,255,255,0.8)" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
    backgroundColor: "rgba(8,15,45,0.84)",
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderColor: "rgba(100,180,220,0.20)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  sendBtn: {
    width: 44,
    height: 44,
    backgroundColor: "#E8754A",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
});
