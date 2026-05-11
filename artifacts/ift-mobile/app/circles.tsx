import { Ionicons } from "@expo/vector-icons";
import {
  useListCircles,
  useRequestCircleAccess,
  useGetMe,
  useGetPowerScore,
  type Circle,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
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

const PRIMARY = "#E8754A";
const DANGER = "#DC143C";
const BORDER = "rgba(232,117,74,0.18)";
const CARD_BG = "rgba(15,25,60,0.42)";

function CircleCard({
  circle,
  myPowerScore,
  onRequest,
  requesting,
}: {
  circle: Circle;
  myPowerScore: number;
  onRequest: (id: number) => void;
  requesting: boolean;
}) {
  const meetsScore = myPowerScore >= circle.minPowerScore;

  let action: React.ReactNode;
  if (circle.isMember) {
    action = (
      <View style={[styles.actionBtn, styles.memberBtn]}>
        <Ionicons name="checkmark-circle" size={12} color={PRIMARY} />
        <Text style={styles.memberText}>MEMBER</Text>
      </View>
    );
  } else if (circle.isPending) {
    action = (
      <View style={[styles.actionBtn, styles.pendingBtn]}>
        <Ionicons name="time-outline" size={12} color="rgba(232,117,74,0.5)" />
        <Text style={styles.pendingText}>PENDING</Text>
      </View>
    );
  } else if (!meetsScore) {
    action = (
      <View style={[styles.actionBtn, styles.lockedBtn]}>
        <Ionicons name="lock-closed" size={11} color={DANGER} />
        <Text style={styles.lockedText}>SCORE LOW</Text>
      </View>
    );
  } else {
    action = (
      <TouchableOpacity
        style={[styles.actionBtn, styles.requestBtn]}
        onPress={() => onRequest(circle.id)}
        disabled={requesting}
        activeOpacity={0.8}
      >
        <Text style={styles.requestText}>
          {requesting ? "..." : circle.isInviteOnly ? "REQUEST" : "JOIN"}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.icon}>
          <Ionicons name="lock-closed" size={14} color={PRIMARY} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{circle.name}</Text>
          {circle.tagline ? (
            <Text style={styles.tagline} numberOfLines={1}>{circle.tagline}</Text>
          ) : null}
        </View>
        {action}
      </View>
      {circle.description ? (
        <Text style={styles.description} numberOfLines={2}>{circle.description}</Text>
      ) : null}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Ionicons name="people" size={11} color="rgba(255,255,255,0.4)" />
          <Text style={styles.statText}>{circle.membersCount}/50</Text>
        </View>
        {circle.minPowerScore > 0 && (
          <View style={styles.stat}>
            <Ionicons name="flash" size={11} color={meetsScore ? PRIMARY : DANGER} />
            <Text style={[styles.statText, { color: meetsScore ? PRIMARY : DANGER }]}>
              {circle.minPowerScore}+ PWR
            </Text>
          </View>
        )}
        {circle.isInviteOnly && (
          <View style={styles.stat}>
            <Ionicons name="key" size={11} color="rgba(232,117,74,0.6)" />
            <Text style={[styles.statText, { color: "rgba(232,117,74,0.6)" }]}>INVITE ONLY</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function CirclesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, isLoading, refetch, isRefetching } = useListCircles();
  const { data: me } = useGetMe();
  const { data: psData } = useGetPowerScore(me?.id ?? "");
  const myPowerScore = psData?.score ?? 0;

  const requestAccess = useRequestCircleAccess();
  const circles = (data?.circles ?? []) as Circle[];

  const handleRequest = async (circleId: number) => {
    try {
      await requestAccess.mutateAsync({ circleId });
      refetch();
    } catch {
      // Silently fail
    }
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "web" ? 20 : insets.top + 12 },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.superLabel}>INVITE-ONLY · POWER ROOMS</Text>
          <Text style={styles.headerTitle}>INNER CIRCLES</Text>
        </View>
        <View style={styles.scoreBadge}>
          <Ionicons name="flash" size={11} color={PRIMARY} />
          <Text style={styles.scoreText}>{myPowerScore}</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={PRIMARY} />
        </View>
      ) : (
        <FlatList
          data={circles}
          keyExtractor={(c) => String(c.id)}
          renderItem={({ item }) => (
            <CircleCard
              circle={item}
              myPowerScore={myPowerScore}
              onRequest={handleRequest}
              requesting={requestAccess.isPending}
            />
          )}
          contentContainerStyle={{
            padding: 16,
            gap: 10,
            paddingBottom: Math.max(insets.bottom + 20, 40),
          }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={PRIMARY} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="lock-closed-outline" size={36} color="rgba(255,255,255,0.18)" />
              <Text style={styles.emptyText}>No circles yet — be the first founder</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  superLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(232,117,74,0.55)", letterSpacing: 2 },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.5 },
  scoreBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
  },
  scoreText: { fontSize: 11, fontFamily: "Inter_700Bold", color: PRIMARY },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 14,
    gap: 8,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.3)",
    backgroundColor: "rgba(232,117,74,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.92)", letterSpacing: 0.3 },
  tagline: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)", marginTop: 1 },
  description: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", lineHeight: 17 },
  statsRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.5)", letterSpacing: 0.5 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
  },
  memberBtn: { borderColor: "rgba(232,117,74,0.45)", backgroundColor: "rgba(232,117,74,0.08)" },
  memberText: { fontSize: 9, fontFamily: "Inter_700Bold", color: PRIMARY, letterSpacing: 0.5 },
  pendingBtn: { borderColor: "rgba(232,117,74,0.2)" },
  pendingText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(232,117,74,0.5)", letterSpacing: 0.5 },
  lockedBtn: { borderColor: "rgba(220,20,60,0.25)" },
  lockedText: { fontSize: 9, fontFamily: "Inter_700Bold", color: DANGER, letterSpacing: 0.5 },
  requestBtn: { borderColor: PRIMARY, backgroundColor: PRIMARY },
  requestText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: 0.5 },
  empty: { paddingTop: 80, alignItems: "center", gap: 12 },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.35)", textAlign: "center" },
});
