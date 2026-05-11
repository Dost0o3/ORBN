import { Ionicons } from "@expo/vector-icons";
import { useGetMe, useGetUserStats } from "@workspace/api-client-react";
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

const HOURLY_ENGAGEMENT = [
  { hr: "12a", v: 4 },
  { hr: "3a", v: 2 },
  { hr: "6a", v: 8 },
  { hr: "9a", v: 28 },
  { hr: "12p", v: 22 },
  { hr: "3p", v: 18 },
  { hr: "6p", v: 14 },
  { hr: "9p", v: 9 },
];

const DAILY_GROWTH = [
  { d: "Mon", v: 12 },
  { d: "Tue", v: 18 },
  { d: "Wed", v: 9 },
  { d: "Thu", v: 24 },
  { d: "Fri", v: 16 },
  { d: "Sat", v: 7 },
  { d: "Sun", v: 11 },
];

function MetricCard({
  label,
  value,
  delta,
  icon,
  accent,
}: {
  label: string;
  value: string;
  delta?: string;
  icon: string;
  accent: string;
}) {
  const positive = delta?.startsWith("+");
  return (
    <View style={[styles.metricCard, { borderColor: GLASS_BORDER }]}>
      <View style={[styles.metricIcon, { backgroundColor: accent + "1A" }]}>
        <Ionicons name={icon as any} size={14} color={accent} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {delta && (
        <Text
          style={[
            styles.metricDelta,
            { color: positive ? "#10B981" : "rgba(255,255,255,0.4)" },
          ]}
        >
          {delta}
        </Text>
      )}
    </View>
  );
}

export default function InsightsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: me } = useGetMe();
  const { data: stats } = useGetUserStats();

  const peakHr = HOURLY_ENGAGEMENT.reduce((a, b) => (a.v > b.v ? a : b));
  const peakDay = DAILY_GROWTH.reduce((a, b) => (a.v > b.v ? a : b));
  const maxHr = Math.max(...HOURLY_ENGAGEMENT.map((d) => d.v));
  const maxDay = Math.max(...DAILY_GROWTH.map((d) => d.v));

  const followers = stats?.followersCount ?? 0;
  const posts = stats?.postsCount ?? 0;

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
          <Text style={[styles.superLabel, { color: colors.primary + "88" }]}>ANALYTICS</Text>
          <Text style={styles.headerTitle}>Your Insights</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom + 32, 40),
          paddingTop: 14,
        }}
      >
        <Text style={styles.sectionLabel}>THIS WEEK</Text>

        <View style={styles.metricsRow}>
          <MetricCard
            label="Posts"
            value={posts.toLocaleString()}
            delta="+2 this wk"
            icon="document-text"
            accent="#E8754A"
          />
          <MetricCard
            label="Followers"
            value={followers.toLocaleString()}
            delta="+8.4%"
            icon="people"
            accent="#3B82F6"
          />
          <MetricCard
            label="Reach"
            value="2.1k"
            delta="+12%"
            icon="eye"
            accent="#10B981"
          />
        </View>

        <Text style={styles.sectionLabel}>BEST PERFORMING POST</Text>
        <View style={[styles.bestPostCard, { borderColor: colors.primary + "44" }]}>
          <View style={styles.bestPostBadge}>
            <Ionicons name="trending-up" size={11} color={colors.primary} />
            <Text style={[styles.bestPostBadgeText, { color: colors.primary }]}>
              TOP PERFORMER
            </Text>
          </View>
          <Text style={styles.bestPostText}>
            {posts > 0
              ? "\"Async standups beat live ones for distributed teams. Here's the format that worked for us...\""
              : "Post something to start building your insights."}
          </Text>
          <View style={styles.bestPostStatsRow}>
            <View style={styles.bestStat}>
              <Ionicons name="heart" size={12} color={colors.primary} />
              <Text style={styles.bestStatText}>{posts > 0 ? "82" : "—"}</Text>
            </View>
            <View style={styles.bestStat}>
              <Ionicons name="chatbubble-outline" size={12} color="rgba(255,255,255,0.5)" />
              <Text style={styles.bestStatText}>{posts > 0 ? "14" : "—"}</Text>
            </View>
            <View style={styles.bestStat}>
              <Ionicons name="repeat" size={12} color="rgba(255,255,255,0.5)" />
              <Text style={styles.bestStatText}>{posts > 0 ? "21" : "—"}</Text>
            </View>
            <View style={styles.bestStat}>
              <Ionicons name="eye-outline" size={12} color="rgba(255,255,255,0.5)" />
              <Text style={styles.bestStatText}>{posts > 0 ? "1.4k reach" : "—"}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>BEST TIME TO POST</Text>
        <View style={[styles.chartCard, { borderColor: GLASS_BORDER }]}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Avg engagement by hour</Text>
            <Text style={[styles.peakBadge, { color: colors.primary }]}>
              Peak: {peakHr.hr}
            </Text>
          </View>
          <View style={styles.chartBars}>
            {HOURLY_ENGAGEMENT.map((b) => {
              const h = (b.v / maxHr) * 90;
              const isPeak = b.hr === peakHr.hr;
              return (
                <View key={b.hr} style={styles.barCol}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: h,
                        backgroundColor: isPeak ? colors.primary : "rgba(100,180,220,0.3)",
                      },
                    ]}
                  />
                  <Text style={styles.barLabel}>{b.hr}</Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.chartHint}>
            Posts you publish at {peakHr.hr} earn {Math.round(peakHr.v / 4)}x more
            engagement than your average.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>WEEKLY GROWTH</Text>
        <View style={[styles.chartCard, { borderColor: GLASS_BORDER }]}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>New connections per day</Text>
            <Text style={[styles.peakBadge, { color: colors.primary }]}>
              Best: {peakDay.d}
            </Text>
          </View>
          <View style={styles.chartBars}>
            {DAILY_GROWTH.map((b) => {
              const h = (b.v / maxDay) * 90;
              const isPeak = b.d === peakDay.d;
              return (
                <View key={b.d} style={styles.barCol}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: h,
                        backgroundColor: isPeak ? "#3B82F6" : "rgba(100,180,220,0.3)",
                      },
                    ]}
                  />
                  <Text style={styles.barLabel}>{b.d}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <Text style={styles.sectionLabel}>RECOMMENDATIONS</Text>
        <View style={[styles.recoCard, { borderColor: GLASS_BORDER }]}>
          <View style={styles.recoRow}>
            <Ionicons name="bulb-outline" size={16} color={colors.primary} />
            <Text style={styles.recoText}>
              Try posting more on {peakDay.d}s — your audience is most active.
            </Text>
          </View>
          <View style={styles.recoRow}>
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <Text style={styles.recoText}>
              Schedule posts for {peakHr.hr} for maximum reach.
            </Text>
          </View>
          <View style={styles.recoRow}>
            <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
            <Text style={styles.recoText}>
              Posts about distributed teams perform 2.4x your average.
            </Text>
          </View>
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
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(232,117,74,0.55)",
    letterSpacing: 2,
    marginLeft: 20,
    marginTop: 22,
    marginBottom: 10,
  },
  metricsRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    gap: 8,
  },
  metricCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: GLASS_BG,
  },
  metricIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginTop: 2,
  },
  metricDelta: { fontSize: 10, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  bestPostCard: {
    marginHorizontal: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: GLASS_BG,
  },
  bestPostBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(232,117,74,0.12)",
    marginBottom: 8,
  },
  bestPostBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  bestPostText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#fff",
    lineHeight: 19,
  },
  bestPostStatsRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 10,
    flexWrap: "wrap",
  },
  bestStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  bestStatText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.7)",
  },
  chartCard: {
    marginHorizontal: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: GLASS_BG,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  chartTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.85)",
  },
  peakBadge: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  chartBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 110,
    paddingHorizontal: 4,
  },
  barCol: { alignItems: "center", flex: 1 },
  bar: { width: 14, borderRadius: 4 },
  barLabel: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.4)",
    marginTop: 6,
  },
  chartHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
    marginTop: 12,
    lineHeight: 16,
  },
  recoCard: {
    marginHorizontal: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: GLASS_BG,
  },
  recoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 6,
  },
  recoText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
    flex: 1,
    lineHeight: 17,
  },
});
