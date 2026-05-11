import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
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

type Challenge = {
  id: string;
  title: string;
  description: string;
  reward: string;
  endsIn: string;
  participants: number;
  progress: number;
  goal: number;
  metric: string;
  icon: string;
  accent: string;
};

const ACTIVE_CHALLENGES: Challenge[] = [
  {
    id: "post-streak-week",
    title: "Daily Voice",
    description: "Post at least once every day for 7 days.",
    reward: "Operator Badge + 500 Power",
    endsIn: "3d 14h",
    participants: 1284,
    progress: 4,
    goal: 7,
    metric: "days",
    icon: "flame",
    accent: "#E8754A",
  },
  {
    id: "engagement-week",
    title: "Conversation Starter",
    description: "Get 50 comments across all your posts this week.",
    reward: "Catalyst Badge + 750 Power",
    endsIn: "5d 02h",
    participants: 892,
    progress: 23,
    goal: 50,
    metric: "comments",
    icon: "chatbubbles",
    accent: "#3B82F6",
  },
  {
    id: "network-builder",
    title: "Network Builder",
    description: "Make 10 new meaningful connections.",
    reward: "Connector Badge + 600 Power",
    endsIn: "6d 18h",
    participants: 2103,
    progress: 7,
    goal: 10,
    metric: "connections",
    icon: "people",
    accent: "#10B981",
  },
];

const TOP_CONTRIBUTORS = [
  { rank: 1, name: "Marcus Williams", handle: "@marcusbuild", points: 4820, badge: "Operator" },
  { rank: 2, name: "Priya Sharma", handle: "@priyadesigns", points: 4205, badge: "Creative" },
  { rank: 3, name: "Sarah Mitchell", handle: "@sarahnwp", points: 3890, badge: "Professional" },
  { rank: 4, name: "Alex Chen", handle: "@alexbuilds", points: 3340, badge: "Builder" },
  { rank: 5, name: "Maya Patel", handle: "@mayadev", points: 2987, badge: "Innovator" },
];

export default function ChallengesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 20 : insets.top + 12;

  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad,
            backgroundColor: "rgba(8,15,45,0.82)",
            borderBottomColor: GLASS_BORDER,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={[styles.superLabel, { color: colors.primary + "88" }]}>ARENA</Text>
          <Text style={styles.headerTitle}>Challenges</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom + 32, 40),
          paddingTop: 16,
        }}
      >
        <Text style={styles.sectionLabel}>ACTIVE CHALLENGES · WEEKLY</Text>

        {ACTIVE_CHALLENGES.map((c) => {
          const pct = Math.min(100, Math.round((c.progress / c.goal) * 100));
          return (
            <View
              key={c.id}
              style={[styles.challengeCard, { borderColor: c.accent + "33" }]}
            >
              <View style={styles.challengeRow}>
                <View
                  style={[
                    styles.challengeIcon,
                    { backgroundColor: c.accent + "1A", borderColor: c.accent + "44" },
                  ]}
                >
                  <Ionicons name={c.icon as any} size={20} color={c.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.challengeTitle}>{c.title}</Text>
                  <Text style={styles.challengeDesc}>{c.description}</Text>
                </View>
                <View style={[styles.endsBadge, { borderColor: c.accent + "33" }]}>
                  <Ionicons name="time-outline" size={10} color={c.accent} />
                  <Text style={[styles.endsText, { color: c.accent }]}>{c.endsIn}</Text>
                </View>
              </View>

              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>
                  {c.progress} / {c.goal} {c.metric}
                </Text>
                <Text style={[styles.progressPct, { color: c.accent }]}>{pct}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { backgroundColor: c.accent, width: `${pct}%` }]}
                />
              </View>

              <View style={styles.rewardRow}>
                <View style={styles.rewardLeft}>
                  <Ionicons name="trophy" size={12} color={c.accent} />
                  <Text style={styles.rewardText}>{c.reward}</Text>
                </View>
                <Text style={styles.participantsText}>
                  {c.participants.toLocaleString()} competing
                </Text>
              </View>
            </View>
          );
        })}

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>TOP CONTRIBUTORS · THIS WEEK</Text>

        <View style={styles.leaderCard}>
          {TOP_CONTRIBUTORS.map((u, i) => (
            <View
              key={u.rank}
              style={[styles.leaderRow, i !== 0 && styles.leaderDivider]}
            >
              <Text
                style={[
                  styles.rankNum,
                  { color: u.rank <= 3 ? colors.primary : "rgba(255,255,255,0.35)" },
                ]}
              >
                #{u.rank}
              </Text>
              <View style={[styles.leaderAvatar, { borderColor: GLASS_BORDER }]}>
                <Text style={styles.leaderInitial}>{u.name[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.leaderName}>{u.name}</Text>
                <Text style={styles.leaderHandle}>{u.handle}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.leaderPoints, { color: colors.primary }]}>
                  {u.points.toLocaleString()}
                </Text>
                <Text style={styles.leaderBadge}>{u.badge}</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.viewAllBtn, { borderColor: colors.primary + "55" }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/leaderboard");
          }}
        >
          <Text style={[styles.viewAllText, { color: colors.primary }]}>
            View Full Leaderboard
          </Text>
          <Ionicons name="arrow-forward" size={14} color={colors.primary} />
        </TouchableOpacity>
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
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.3,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(232,117,74,0.55)",
    letterSpacing: 2,
    marginLeft: 20,
    marginTop: 12,
    marginBottom: 12,
  },
  challengeCard: {
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: GLASS_BG,
  },
  challengeRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  challengeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  challengeTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginBottom: 2,
  },
  challengeDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.55)",
    lineHeight: 16,
  },
  endsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  endsText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.7)",
  },
  progressPct: { fontSize: 11, fontFamily: "Inter_700Bold" },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },
  rewardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  rewardLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  rewardText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.85)",
  },
  participantsText: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.4)",
  },
  leaderCard: {
    marginHorizontal: 14,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 16,
    backgroundColor: GLASS_BG,
    overflow: "hidden",
  },
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  leaderDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GLASS_BORDER,
  },
  rankNum: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    width: 28,
  },
  leaderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "rgba(20,30,80,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  leaderInitial: {
    color: "#E8754A",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  leaderName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  leaderHandle: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.35)",
    marginTop: 1,
  },
  leaderPoints: { fontSize: 14, fontFamily: "Inter_700Bold" },
  leaderBadge: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 0.5,
    marginTop: 1,
  },
  viewAllBtn: {
    marginHorizontal: 14,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  viewAllText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
