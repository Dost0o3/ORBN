import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

const GLASS_BG = "rgba(15,25,60,0.38)";
const GLASS_BORDER = "rgba(100,180,220,0.22)";

type TrendingItem = {
  id: string;
  topic: string;
  source: string;
  signal: string;
  growth: string;
  hot: boolean;
};

const TRENDING: TrendingItem[] = [
  {
    id: "1",
    topic: "AI agents replacing junior analysts",
    source: "Tech & Career",
    signal: "12.4k posts · 38% week-over-week",
    growth: "+38%",
    hot: true,
  },
  {
    id: "2",
    topic: "Async standups & remote rituals",
    source: "Distributed Work",
    signal: "5.2k posts · 21% week-over-week",
    growth: "+21%",
    hot: false,
  },
  {
    id: "3",
    topic: "Designer portfolios in the AI era",
    source: "Design",
    signal: "3.8k posts · 18% week-over-week",
    growth: "+18%",
    hot: false,
  },
  {
    id: "4",
    topic: "Founder mental health open-talk",
    source: "Founders",
    signal: "2.1k posts · 14% week-over-week",
    growth: "+14%",
    hot: false,
  },
];

export default function TrendingNiche({
  onSelectTopic,
}: {
  onSelectTopic?: (topic: string) => void;
}) {
  const colors = useColors();

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="flame" size={14} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.primary }]}>
            TRENDING IN YOUR NICHE
          </Text>
        </View>
        <Text style={styles.headerSub}>Public signals · this week</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}
      >
        {TRENDING.map((t) => (
          <TouchableOpacity
            key={t.id}
            onPress={() => {
              Haptics.selectionAsync();
              onSelectTopic?.(t.topic);
            }}
            style={[
              styles.card,
              { borderColor: t.hot ? colors.primary + "55" : GLASS_BORDER },
            ]}
            activeOpacity={0.7}
          >
            <View style={styles.cardTop}>
              <Text style={styles.cardSource}>{t.source}</Text>
              {t.hot && (
                <View style={[styles.hotBadge, { backgroundColor: colors.primary + "20" }]}>
                  <Ionicons name="trending-up" size={9} color={colors.primary} />
                  <Text style={[styles.hotText, { color: colors.primary }]}>HOT</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardTopic} numberOfLines={3}>
              {t.topic}
            </Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardSignal} numberOfLines={1}>
                {t.signal}
              </Text>
              <Text
                style={[
                  styles.cardGrowth,
                  { color: t.hot ? colors.primary : "#10B981" },
                ]}
              >
                {t.growth}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  headerSub: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.35)",
  },
  card: {
    width: 200,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: GLASS_BG,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardSource: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 1,
  },
  hotBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  hotText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  cardTopic: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    lineHeight: 17,
    minHeight: 50,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  cardSignal: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.4)",
    flex: 1,
  },
  cardGrowth: { fontSize: 11, fontFamily: "Inter_700Bold" },
});
