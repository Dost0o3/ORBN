import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAchievements, useStreak } from "@/hooks/usePowerScoreStream";

// Map achievement icon names from the backend (lucide names) to Ionicons that
// exist in @expo/vector-icons. Falls back to a star for unknown names.
const ACHIEVEMENT_IONICON: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  Sparkles: "sparkles",
  Mic: "mic",
  Radio: "radio",
  UserPlus: "person-add",
  Users: "people",
  Network: "git-network",
  Heart: "heart",
  Trophy: "trophy",
  Award: "ribbon",
  Flame: "flame",
};

export function StreakChip({ userId }: { userId?: string }) {
  const streak = useStreak(userId);
  if (!streak || streak.currentStreak <= 0) return null;
  return (
    <View
      style={styles.chip}
      accessibilityLabel={`${streak.currentStreak} day streak, longest ${streak.longestStreak}`}
    >
      <Ionicons name="flame" size={10} color="#E8754A" />
      <Text style={styles.chipText}>{streak.currentStreak}d</Text>
    </View>
  );
}

export function AchievementIcons({ userId, max = 5 }: { userId?: string; max?: number }) {
  const items = useAchievements(userId);
  if (!items.length) return null;
  return (
    <View style={styles.row} accessibilityLabel={`${items.length} achievements`}>
      {items.slice(0, max).map((a) => {
        const ionName = (a.icon ? ACHIEVEMENT_IONICON[a.icon] : undefined) ?? "star";
        return (
          <View key={a.key} style={styles.badge}>
            <Ionicons name={ionName} size={10} color="#34D399" />
          </View>
        );
      })}
      {items.length > max && (
        <Text style={styles.more}>+{items.length - max}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 18,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.45)",
    backgroundColor: "rgba(232,117,74,0.10)",
  },
  chipText: { color: "#E8754A", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  badge: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.40)",
    backgroundColor: "rgba(52,211,153,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeIcon: { fontSize: 10, color: "#34D399" },
  more: { fontSize: 9, color: "rgba(255,255,255,0.45)", fontFamily: "Inter_700Bold" },
});
