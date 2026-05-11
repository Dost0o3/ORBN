import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const GLASS_BG = "rgba(15,25,60,0.38)";
const GLASS_BORDER = "rgba(100,180,220,0.22)";

type Decision = {
  id: string;
  type: "suggestion" | "match" | "enhancement" | "ranking";
  title: string;
  reason: string;
  confidence: number;
  signals: string[];
  timestamp: string;
  icon: string;
  accent: string;
};

const RECENT_DECISIONS: Decision[] = [
  {
    id: "1",
    type: "suggestion",
    title: "Suggested post topic: \"Async standups\"",
    reason: "Based on your last 12 posts about distributed teams and remote work patterns, this aligns with topics where your audience engages 2.4x more than average.",
    confidence: 87,
    signals: ["Past topic frequency", "Audience engagement", "Trending in network"],
    timestamp: "2h ago",
    icon: "sparkles",
    accent: "#E8754A",
  },
  {
    id: "2",
    type: "match",
    title: "Connection match: @priyadesigns",
    reason: "She works in product design at a similar career stage and posts about systems thinking — a topic you've engaged with 8 times in the last month.",
    confidence: 92,
    signals: ["Career stage", "Topic overlap", "Engagement history", "Mutual connections (3)"],
    timestamp: "5h ago",
    icon: "people",
    accent: "#3B82F6",
  },
  {
    id: "3",
    type: "enhancement",
    title: "Tone adjustment on draft post",
    reason: "Your draft used 4 hedging phrases (\"maybe\", \"sort of\"). Posts you've published with confident phrasing earn 1.8x more engagement.",
    confidence: 78,
    signals: ["Linguistic analysis", "Your historical engagement"],
    timestamp: "1d ago",
    icon: "wand",
    accent: "#10B981",
  },
  {
    id: "4",
    type: "ranking",
    title: "Feed ranked: Marcus Williams up 4 spots",
    reason: "He posted on a topic (formal verification) that overlaps with 6 of your recent searches and your declared technical interests.",
    confidence: 81,
    signals: ["Topic match", "Recency", "Your search history"],
    timestamp: "1d ago",
    icon: "list",
    accent: "#8B5CF6",
  },
  {
    id: "5",
    type: "suggestion",
    title: "Best time to post: Tuesday 9am",
    reason: "Your last 30 posts published Tuesdays 8–10am average 3.2x more comments than other times.",
    confidence: 74,
    signals: ["Time-of-day analysis", "30-post sample"],
    timestamp: "2d ago",
    icon: "time",
    accent: "#F59E0B",
  },
];

export default function AIActivityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === "web" ? 20 : insets.top + 12,
            backgroundColor: "rgba(8,15,45,0.82)",
            borderBottomColor: GLASS_BORDER,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={[styles.superLabel, { color: colors.primary + "88" }]}>TRANSPARENCY</Text>
          <Text style={styles.headerTitle}>AI Activity</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom + 32, 40),
          paddingTop: 12,
        }}
      >
        <View style={styles.intro}>
          <Text style={styles.introText}>
            Every recommendation our AI makes is logged here with its reasoning
            and the signals it used. You're in control.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>RECENT AI DECISIONS</Text>

        {RECENT_DECISIONS.map((d) => (
          <View key={d.id} style={[styles.decisionCard, { borderColor: GLASS_BORDER }]}>
            <View style={styles.decisionTop}>
              <View
                style={[
                  styles.decisionIcon,
                  { backgroundColor: d.accent + "1A", borderColor: d.accent + "44" },
                ]}
              >
                <Ionicons name={d.icon as any} size={16} color={d.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.decisionTitle}>{d.title}</Text>
                <View style={styles.metaRow}>
                  <Text style={[styles.metaType, { color: d.accent }]}>
                    {d.type.toUpperCase()}
                  </Text>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={styles.metaTime}>{d.timestamp}</Text>
                </View>
              </View>
              <View style={styles.confidenceBadge}>
                <Text style={[styles.confidenceText, { color: d.accent }]}>
                  {d.confidence}%
                </Text>
                <Text style={styles.confidenceLabel}>confidence</Text>
              </View>
            </View>

            <View style={[styles.reasonBox, { borderLeftColor: d.accent }]}>
              <Text style={styles.reasonLabel}>WHY:</Text>
              <Text style={styles.reasonText}>{d.reason}</Text>
            </View>

            <View style={styles.signalsRow}>
              {d.signals.map((s) => (
                <View
                  key={s}
                  style={[styles.signalChip, { borderColor: GLASS_BORDER }]}
                >
                  <Text style={styles.signalText}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.footerNote}>
          <Ionicons name="lock-closed-outline" size={12} color="rgba(255,255,255,0.4)" />
          <Text style={styles.footerText}>
            Decisions are stored privately. We never share AI reasoning with third parties.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  superLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  intro: { paddingHorizontal: 20, paddingVertical: 12 },
  introText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.55)",
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(232,117,74,0.55)",
    letterSpacing: 2,
    marginLeft: 20,
    marginTop: 8,
    marginBottom: 12,
  },
  decisionCard: {
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: GLASS_BG,
  },
  decisionTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  decisionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  decisionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  metaType: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  metaDot: { color: "rgba(255,255,255,0.3)" },
  metaTime: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.4)",
  },
  confidenceBadge: { alignItems: "flex-end" },
  confidenceText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  confidenceLabel: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.35)",
  },
  reasonBox: {
    marginTop: 12,
    paddingLeft: 10,
    borderLeftWidth: 2,
  },
  reasonLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 1,
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
    lineHeight: 18,
  },
  signalsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
  },
  signalChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  signalText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.65)",
  },
  footerNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  footerText: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.4)",
    flex: 1,
  },
});
