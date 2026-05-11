import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { API_BASE } from "../../lib/api-base";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CARD_W = Math.min(SCREEN_W - 32, 380);
const CARD_H = Math.min(SCREEN_H - 320, 520);
const SWIPE_THRESHOLD = CARD_W * 0.28;
const GLASS_BORDER = "rgba(100,180,220,0.22)";

type Candidate = {
  id: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  occupation?: string | null;
  location?: string | null;
  powerScore?: number | null;
  powerRank?: string | null;
  skills?: string[] | null;
};

type SwipeDirection = "like" | "pass" | "superlike";

export default function ConnectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [stack, setStack] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [matched, setMatched] = useState<Candidate | null>(null);
  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);

  const pos = useRef(new Animated.ValueXY()).current;
  const rotate = pos.x.interpolate({
    inputRange: [-CARD_W, 0, CARD_W],
    outputRange: ["-12deg", "0deg", "12deg"],
  });
  const likeOpacity = pos.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: "clamp" });
  const passOpacity = pos.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: "clamp" });
  const superOpacity = pos.y.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: "clamp" });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadCandidates = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/match/candidates?limit=15`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!mountedRef.current) return;
      if (!res.ok) {
        setStack([]);
        return;
      }
      const data = await res.json().catch(() => ({}));
      const list = (data?.candidates ?? data?.users ?? data ?? []) as Candidate[];
      if (mountedRef.current) setStack((prev) => [...prev, ...list.filter((c) => !prev.some((p) => p.id === c.id))]);
    } catch {
      // Silent
    } finally {
      fetchingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    if (!loading && stack.length <= 3 && !fetchingRef.current) {
      loadCandidates();
    }
  }, [stack.length, loading, loadCandidates]);

  const submitSwipe = useCallback(
    async (target: Candidate, direction: SwipeDirection) => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/api/match/swipe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ targetUserId: target.id, direction }),
        });
        if (!mountedRef.current) return;
        if (res.ok) {
          const body = await res.json().catch(() => ({}));
          if (body?.matched) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setMatched(target);
          }
        }
      } catch {
        // Silent — UI already advanced
      }
    },
    [getToken],
  );

  const advance = useCallback(
    (direction: SwipeDirection) => {
      const target = stack[0];
      if (!target) return;
      Haptics.impactAsync(
        direction === "superlike"
          ? Haptics.ImpactFeedbackStyle.Heavy
          : Haptics.ImpactFeedbackStyle.Light,
      );
      const dx = direction === "pass" ? -SCREEN_W * 1.4 : direction === "like" ? SCREEN_W * 1.4 : 0;
      const dy = direction === "superlike" ? -SCREEN_H * 1.2 : 0;
      Animated.timing(pos, { toValue: { x: dx, y: dy }, duration: 240, useNativeDriver: false }).start(() => {
        if (!mountedRef.current) return;
        pos.setValue({ x: 0, y: 0 });
        setStack((prev) => prev.slice(1));
        submitSwipe(target, direction);
      });
    },
    [stack, pos, submitSwipe],
  );

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (g.dy < -SWIPE_THRESHOLD * 1.4) {
          advance("superlike");
        } else if (g.dx > SWIPE_THRESHOLD) {
          advance("like");
        } else if (g.dx < -SWIPE_THRESHOLD) {
          advance("pass");
        } else {
          Animated.spring(pos, { toValue: { x: 0, y: 0 }, friction: 6, useNativeDriver: false }).start();
        }
      },
    }),
  ).current;

  const top = stack[0];
  const next = stack[1];

  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      <BlurView
        intensity={Platform.OS === "ios" ? 65 : 80}
        tint="dark"
        style={[styles.header, { paddingTop: topPad + 10, borderBottomColor: GLASS_BORDER }]}
      >
        <View style={styles.headerShine} />
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>Connect</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Swipe to match · Super-like to stand out</Text>
        </View>
      </BlurView>

      <View style={styles.deckArea}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : !top ? (
          <View style={styles.emptyDeck}>
            <Ionicons name="people-outline" size={42} color="rgba(255,255,255,0.18)" />
            <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>No more operators</Text>
            <Text style={styles.emptySub}>Check back soon — we're always finding new connections.</Text>
            <TouchableOpacity
              onPress={() => {
                setLoading(true);
                loadCandidates();
              }}
              style={[styles.refreshBtn, { borderColor: colors.primary + "55" }]}
            >
              <Text style={[styles.refreshBtnText, { color: colors.primary }]}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {next ? <CandidateCard c={next} colors={colors} stacked /> : null}
            <Animated.View
              {...panResponder.panHandlers}
              style={[
                styles.cardWrap,
                { transform: [{ translateX: pos.x }, { translateY: pos.y }, { rotate }] },
              ]}
            >
              <CandidateCard c={top} colors={colors} />
              <Animated.View style={[styles.stamp, styles.likeStamp, { opacity: likeOpacity }]}>
                <Text style={styles.stampLikeText}>CONNECT</Text>
              </Animated.View>
              <Animated.View style={[styles.stamp, styles.passStamp, { opacity: passOpacity }]}>
                <Text style={styles.stampPassText}>PASS</Text>
              </Animated.View>
              <Animated.View style={[styles.stamp, styles.superStamp, { opacity: superOpacity }]}>
                <Text style={styles.stampSuperText}>SUPER</Text>
              </Animated.View>
            </Animated.View>
          </>
        )}
      </View>

      {top ? (
        <View style={[styles.actionRow, { paddingBottom: Math.max(insets.bottom + 12, 96) }]}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.passBtn]}
            onPress={() => advance("pass")}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={26} color="#DC143C" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.superBtn]}
            onPress={() => advance("superlike")}
            activeOpacity={0.8}
          >
            <Ionicons name="star" size={22} color="#5B8CFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.likeBtn]}
            onPress={() => advance("like")}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark" size={28} color="#34D399" />
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal visible={!!matched} transparent animationType="fade" onRequestClose={() => setMatched(null)}>
        <Pressable style={styles.modalScrim} onPress={() => setMatched(null)}>
          <View style={styles.matchCard}>
            <Text style={styles.matchHeadline}>IT'S A MATCH</Text>
            {matched?.avatarUrl ? (
              <Image source={{ uri: matched.avatarUrl }} style={styles.matchAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.matchAvatar, styles.matchAvatarFallback]}>
                <Text style={styles.matchInitial}>
                  {(matched?.displayName ?? matched?.username ?? "?")[0]?.toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.matchName} numberOfLines={1}>
              {matched?.displayName ?? matched?.username ?? "Operator"}
            </Text>
            {matched?.occupation ? <Text style={styles.matchSub}>{matched.occupation}</Text> : null}
            <View style={styles.matchActions}>
              <TouchableOpacity
                style={[styles.matchBtn, styles.matchBtnGhost]}
                onPress={() => setMatched(null)}
              >
                <Text style={styles.matchBtnGhostText}>Keep swiping</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.matchBtn, styles.matchBtnPrimary]}
                onPress={() => {
                  const id = matched?.id;
                  setMatched(null);
                  if (id) router.push({ pathname: "/profile/[userId]", params: { userId: id } });
                }}
              >
                <Text style={styles.matchBtnPrimaryText}>View profile</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function CandidateCard({
  c,
  colors,
  stacked,
}: {
  c: Candidate;
  colors: ReturnType<typeof useColors>;
  stacked?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        stacked && { transform: [{ scale: 0.95 }, { translateY: 12 }], opacity: 0.55 },
      ]}
    >
      {c.avatarUrl ? (
        <Image source={{ uri: c.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.cardFallback]}>
          <Text style={styles.cardFallbackInitial}>
            {(c.displayName ?? c.username ?? "?")[0]?.toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.cardScrim} />
      <View style={styles.cardInfo}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.cardName} numberOfLines={1}>
            {c.displayName ?? c.username ?? "Operator"}
          </Text>
          {c.powerRank ? (
            <View style={[styles.cardRank, { borderColor: colors.primary + "66" }]}>
              <Text style={[styles.cardRankText, { color: colors.primary }]}>{c.powerRank}</Text>
            </View>
          ) : null}
        </View>
        {c.occupation ? <Text style={styles.cardOccupation}>{c.occupation}</Text> : null}
        {c.bio ? (
          <Text style={styles.cardBio} numberOfLines={3}>
            {c.bio}
          </Text>
        ) : null}
        <View style={styles.cardMeta}>
          {c.location ? (
            <View style={styles.cardMetaItem}>
              <Ionicons name="location-outline" size={11} color="rgba(255,255,255,0.55)" />
              <Text style={styles.cardMetaText}>{c.location}</Text>
            </View>
          ) : null}
          {c.powerScore != null ? (
            <View style={styles.cardMetaItem}>
              <Ionicons name="flash" size={11} color={colors.primary} />
              <Text style={[styles.cardMetaText, { color: colors.primary }]}>{c.powerScore}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  headerShine: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  deckArea: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 12 },
  cardWrap: {
    position: "absolute",
    width: CARD_W,
    height: CARD_H,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "rgba(15,25,60,0.6)",
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 22,
    elevation: 14,
  },
  cardFallback: {
    backgroundColor: "rgba(20,30,80,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardFallbackInitial: {
    fontSize: 96,
    fontFamily: "Inter_700Bold",
    color: "rgba(232,117,74,0.7)",
  },
  cardScrim: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    height: "55%",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  cardInfo: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    padding: 18,
    gap: 6,
  },
  cardName: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", flex: 1 },
  cardRank: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  cardRankText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  cardOccupation: { fontSize: 13, fontFamily: "Inter_500Medium", color: "rgba(232,117,74,0.85)" },
  cardBio: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.85)", lineHeight: 17 },
  cardMeta: { flexDirection: "row", gap: 14, marginTop: 4 },
  cardMetaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardMetaText: { fontSize: 11, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.55)" },

  stamp: {
    position: "absolute",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 4,
    borderRadius: 12,
  },
  likeStamp: {
    top: 32,
    left: 24,
    borderColor: "#34D399",
    transform: [{ rotate: "-18deg" }],
  },
  passStamp: {
    top: 32,
    right: 24,
    borderColor: "#DC143C",
    transform: [{ rotate: "18deg" }],
  },
  superStamp: {
    top: 80,
    alignSelf: "center",
    borderColor: "#5B8CFF",
    transform: [{ rotate: "-6deg" }],
  },
  stampLikeText: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#34D399", letterSpacing: 2 },
  stampPassText: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#DC143C", letterSpacing: 2 },
  stampSuperText: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#5B8CFF", letterSpacing: 2 },

  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 18,
    paddingTop: 14,
  },
  actionBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    backgroundColor: "rgba(0,0,0,0.4)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  passBtn: { borderColor: "rgba(220,20,60,0.55)" },
  superBtn: { borderColor: "rgba(91,140,255,0.55)", width: 50, height: 50, borderRadius: 25 },
  likeBtn: { borderColor: "rgba(52,211,153,0.55)" },

  emptyDeck: { alignItems: "center", gap: 10, padding: 32 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  emptySub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)", textAlign: "center" },
  refreshBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  refreshBtnText: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 1 },

  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  matchCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 20,
    backgroundColor: "rgba(15,25,60,0.96)",
    borderWidth: 1.5,
    borderColor: "#E8754A",
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  matchHeadline: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#E8754A",
    letterSpacing: 4,
  },
  matchAvatar: { width: 88, height: 88, borderRadius: 44, marginTop: 6 },
  matchAvatarFallback: {
    backgroundColor: "rgba(232,117,74,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  matchInitial: { fontSize: 36, fontFamily: "Inter_700Bold", color: "#E8754A" },
  matchName: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  matchSub: { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.6)" },
  matchActions: { flexDirection: "row", gap: 8, marginTop: 16, width: "100%" },
  matchBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
  },
  matchBtnGhost: { borderColor: "rgba(255,255,255,0.18)" },
  matchBtnGhostText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.7)" },
  matchBtnPrimary: { backgroundColor: "#E8754A", borderColor: "#E8754A" },
  matchBtnPrimaryText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#000" },
});
