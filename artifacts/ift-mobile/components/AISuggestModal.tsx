import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { API_BASE } from "../lib/api-base";

const GLASS_BG = "rgba(15,25,60,0.95)";
const GLASS_BORDER = "rgba(100,180,220,0.22)";

type Suggestion = {
  id: string;
  topic: string;
  hook: string;
  reasoning: string;
  signals: string[];
  predictedEngagement: string;
};

function asString(v: unknown, max = 600): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function normalizeSuggestions(data: unknown): Suggestion[] {
  if (!data || typeof data !== "object") return [];
  const arr = (data as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(arr)) return [];
  const out: Suggestion[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;
    const topic = asString(obj.topic, 120);
    const hook = asString(obj.hook, 600);
    if (!topic || !hook) continue;
    const reasoning = asString(obj.reasoning, 600) ?? "";
    const predictedEngagement = asString(obj.predictedEngagement, 120) ?? "";
    const rawSignals = obj.signals;
    const signals: string[] = Array.isArray(rawSignals)
      ? rawSignals
          .map((s) => asString(s, 120))
          .filter((s): s is string => s !== null)
          .slice(0, 6)
      : [];
    const id = asString(obj.id, 40) ?? `s${out.length + 1}`;
    out.push({ id, topic, hook, reasoning, signals, predictedEngagement });
    if (out.length >= 3) break;
  }
  return out;
}

const FALLBACK_SUGGESTIONS: Suggestion[] = [
  {
    id: "f1",
    topic: "Share a recent win",
    hook: "What's something you shipped or learned this week that surprised you?",
    reasoning: "Personal wins drive 2x more engagement than generic advice posts.",
    signals: ["Personal stories perform well", "Question-style hooks invite replies"],
    predictedEngagement: "Medium · steady reply rate",
  },
];

export default function AISuggestModal({
  visible,
  onClose,
  onUseSuggestion,
}: {
  visible: boolean;
  onClose: () => void;
  onUseSuggestion: (text: string) => void;
}) {
  const colors = useColors();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeReasonId, setActiveReasonId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setActiveReasonId(null);
    (async () => {
      try {
        const token = await getToken();
        const r = await fetch(`${API_BASE}/api/ai/suggest-topics`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({}),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data: unknown = await r.json();
        if (cancelled) return;
        const items = normalizeSuggestions(data);
        if (items.length === 0) {
          setSuggestions(FALLBACK_SUGGESTIONS);
          setError("Couldn't generate fresh ideas. Try again in a moment.");
        } else {
          setSuggestions(items);
        }
      } catch (e) {
        if (cancelled) return;
        setSuggestions(FALLBACK_SUGGESTIONS);
        setError("Couldn't reach the AI service. Showing a starter idea.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, getToken]);

  const handlePick = (s: Suggestion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onUseSuggestion(s.hook);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { borderColor: GLASS_BORDER }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="sparkles" size={18} color={colors.primary} />
              <Text style={styles.headerTitle}>AI Suggestions</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            Tailored to your niche and recent activity
          </Text>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Analyzing your activity...</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
            >
              {error ? (
                <Text style={[styles.loadingText, { marginBottom: 12, textAlign: "center" }]}>
                  {error}
                </Text>
              ) : null}
              {suggestions.map((s) => {
                const expanded = activeReasonId === s.id;
                return (
                  <View
                    key={s.id}
                    style={[styles.card, { borderColor: GLASS_BORDER }]}
                  >
                    <Text style={[styles.topic, { color: colors.primary }]}>
                      {s.topic}
                    </Text>
                    <Text style={styles.hook}>{s.hook}</Text>
                    <View style={styles.engagementRow}>
                      <Ionicons name="trending-up" size={11} color="#10B981" />
                      <Text style={styles.engagementText}>{s.predictedEngagement}</Text>
                    </View>
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.whyBtn}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setActiveReasonId(expanded ? null : s.id);
                        }}
                      >
                        <Ionicons
                          name="information-circle-outline"
                          size={13}
                          color="rgba(255,255,255,0.55)"
                        />
                        <Text style={styles.whyText}>
                          {expanded ? "Hide reason" : "Why this?"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.useBtn, { backgroundColor: colors.primary }]}
                        onPress={() => handlePick(s)}
                      >
                        <Text style={styles.useBtnText}>Use this</Text>
                      </TouchableOpacity>
                    </View>
                    {expanded && (
                      <View
                        style={[
                          styles.reasonBox,
                          { borderLeftColor: colors.primary },
                        ]}
                      >
                        <Text style={styles.reasonText}>{s.reasoning}</Text>
                        <View style={styles.signalsRow}>
                          {(Array.isArray(s.signals) ? s.signals : []).map((sig) => (
                            <View
                              key={sig}
                              style={[styles.signalChip, { borderColor: GLASS_BORDER }]}
                            >
                              <Text style={styles.signalText}>{sig}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "85%",
    backgroundColor: GLASS_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center",
    marginVertical: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.45)",
    marginBottom: 16,
  },
  loadingBox: {
    paddingVertical: 50,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.55)",
  },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(8,18,48,0.5)",
    marginBottom: 10,
  },
  topic: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  hook: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#fff",
    lineHeight: 19,
  },
  engagementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
  },
  engagementText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.6)",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  whyBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  whyText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.55)",
  },
  useBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
  },
  useBtnText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  reasonBox: {
    marginTop: 12,
    paddingLeft: 10,
    borderLeftWidth: 2,
  },
  reasonText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    lineHeight: 17,
  },
  signalsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  signalChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  signalText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.6)",
  },
});
