import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import { useGetDarkHorses } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { API_BASE } from "../lib/api-base";

function Avatar({ name, size = 44 }: { name?: string; size?: number }) {
  const letter = (name ?? "?")[0]?.toUpperCase() ?? "?";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "rgba(100,180,220,0.18)",
        borderWidth: 1.5,
        borderColor: "rgba(100,180,220,0.35)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#E8754A", fontSize: size * 0.38, fontFamily: "Inter_700Bold" }}>
        {letter}
      </Text>
    </View>
  );
}

const rankColors = [
  { border: "#E8754A", bg: "rgba(100,180,220,0.08)", num: "#E8754A" },
  { border: "rgba(255,255,255,0.3)", bg: "rgba(255,255,255,0.03)", num: "rgba(255,255,255,0.55)" },
  { border: "rgba(205,127,50,0.5)", bg: "rgba(205,127,50,0.05)", num: "#CD7F32" },
];

function HorseCard({ item }: { item: any }) {
  const rank = item.rank as number;
  const rankIdx = rank <= 3 ? rank - 1 : 3;
  const rc = rankColors[Math.min(rankIdx, 2)] ?? {
    border: "rgba(100,180,220,0.15)",
    bg: "transparent",
    num: "rgba(255,255,255,0.3)",
  };

  return (
    <View
      style={[
        styles.card,
        { borderColor: rc.border, backgroundColor: rc.bg },
      ]}
    >
      <View style={styles.rankCol}>
        {rank <= 3 ? (
          <Ionicons
            name="trophy"
            size={16}
            color={rc.num}
          />
        ) : (
          <Ionicons name="arrow-up" size={14} color="rgba(232,117,74,0.50)" />
        )}
        <Text style={[styles.rankNum, { color: rc.num }]}>#{rank}</Text>
      </View>

      <Avatar name={item.user?.displayName} size={46} />

      <View style={styles.info}>
        <View style={styles.infoTop}>
          <Text style={styles.name} numberOfLines={1}>
            {item.user?.displayName ?? "—"}
          </Text>
          {item.growthPercent > 0 && (
            <View style={styles.growthBadge}>
              <Text style={styles.growthText}>+{item.growthPercent}%</Text>
            </View>
          )}
        </View>
        <Text style={styles.username} numberOfLines={1}>@{item.user?.username}</Text>
        {item.insight ? (
          <Text style={styles.insight} numberOfLines={2}>{item.insight}</Text>
        ) : null}
      </View>

      <View style={styles.scoreCol}>
        <Text style={styles.scoreLabel}>PWR</Text>
        <Text style={styles.score}>{item.powerScore}</Text>
      </View>
    </View>
  );
}

interface OperatorWeek {
  user: { id: string; displayName: string; username: string; avatarUrl: string | null };
  powerScore: number;
  deltaScore: number;
}

export default function LeaderboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();

  const { data, isLoading, refetch, isRefetching } = useGetDarkHorses();
  const horses = (data?.horses ?? []) as any[];
  const [operator, setOperator] = useState<OperatorWeek | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const r = await fetch(`${API_BASE}/api/leaderboard/operator-of-the-week`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!r.ok || cancelled) return;
        const j = await r.json();
        if (!cancelled && j?.operator) setOperator(j.operator);
      } catch {
        // network/auth error -> leave operator card hidden, no UI break
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const operatorCard = operator ? (
    <TouchableOpacity
      onPress={() => router.push(`/profile/${operator.user.id}` as any)}
      style={styles.operatorCard}
      activeOpacity={0.85}
    >
      <View style={styles.operatorHeader}>
        <Ionicons name="trophy" size={12} color="#E8754A" />
        <Text style={styles.operatorLabel}>OPERATOR OF THE WEEK</Text>
      </View>
      <View style={styles.operatorRow}>
        <Avatar name={operator.user.displayName} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.operatorName} numberOfLines={1}>{operator.user.displayName}</Text>
          <Text style={styles.operatorHandle} numberOfLines={1}>@{operator.user.username}</Text>
          {operator.deltaScore > 0 && (
            <Text style={styles.operatorDelta}>+{operator.deltaScore} this week</Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.scoreLabel}>PWR</Text>
          <Text style={styles.score}>{operator.powerScore}</Text>
        </View>
      </View>
    </TouchableOpacity>
  ) : null;

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
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.superLabel}>AI-CURATED · WEEKLY</Text>
          <Text style={styles.headerTitle}>
            <Text style={{ color: "#DC143C" }}>DARK</Text> HORSES
          </Text>
        </View>
      </View>

      <Text style={styles.subtitle}>
        The professionals nobody saw coming — until now
      </Text>

      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator color="#E8754A" />
          <Text style={styles.loaderText}>Analyzing the network...</Text>
        </View>
      ) : (
        <FlatList
          data={horses}
          keyExtractor={(h) => String(h.rank)}
          renderItem={({ item }) => <HorseCard item={item} />}
          ListHeaderComponent={operatorCard}
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: Math.max(insets.bottom + 20, 40) }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#E8754A" />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>The algorithm is still watching. Check back soon.</Text>
            </View>
          }
        />
      )}
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
  superLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(232,117,74,0.50)",
    letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.5,
    fontStyle: "italic",
  },
  subtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.28)",
    textAlign: "center",
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingVertical: 12,
    textTransform: "uppercase",
  },
  loader: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loaderText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.3)" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
  },
  rankCol: { alignItems: "center", width: 36, gap: 2 },
  rankNum: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  info: { flex: 1, gap: 2 },
  infoTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "rgba(255,255,255,0.9)",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    flex: 1,
  },
  growthBadge: {
    backgroundColor: "rgba(100,180,220,0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  growthText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#E8754A",
  },
  username: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.3)" },
  insight: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.45)",
    fontStyle: "italic",
    lineHeight: 14,
    marginTop: 2,
  },
  scoreCol: { alignItems: "flex-end", gap: 2 },
  scoreLabel: { fontSize: 8, fontFamily: "Inter_700Bold", color: "rgba(100,180,220,0.45)", letterSpacing: 1 },
  score: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#E8754A" },
  empty: { paddingTop: 60, alignItems: "center" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.22)", textAlign: "center" },
  operatorCard: {
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.45)",
    backgroundColor: "rgba(232,117,74,0.06)",
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  operatorHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  operatorLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#E8754A", letterSpacing: 1.5 },
  operatorRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  operatorName: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.3 },
  operatorHandle: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)" },
  operatorDelta: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#34D399", marginTop: 2 },
});
