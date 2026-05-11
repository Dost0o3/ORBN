import { Ionicons, Feather } from "@expo/vector-icons";
import { useGetMe, useGetUserStats, useGetUserPosts, useGetPowerScore } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import React, { useCallback, useState } from "react";
import FollowListSheet, { type FollowListMode } from "@/components/FollowListSheet";
import {
  Alert,
  Dimensions,
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
import { usePowerScoreStream } from "@/hooks/usePowerScoreStream";
import { StreakChip, AchievementIcons } from "@/components/StreakAchievements";
import ProfileQR from "@/components/ProfileQR";
import VerificationBadge from "@/components/VerificationBadge";

const { width: SCREEN_W } = Dimensions.get("window");
const GRID_GAP = 3;
const THUMB_SIZE = (SCREEN_W - GRID_GAP * 2 - 24) / 3;
const GLASS_BORDER = "rgba(100,180,220,0.22)";
const GLASS_BG = "rgba(15,25,60,0.38)";
const BLUR_INTENSITY = Platform.OS === "ios" ? 45 : 55;
const BLUR_TINT = "dark";

const RANK_COLORS: Record<string, { color: string; glow: string }> = {
  RECRUIT:    { color: "#737373", glow: "rgba(115,115,115,0.3)" },
  OPERATIVE:  { color: "#5B8CFF", glow: "rgba(91,140,255,0.35)" },
  SPECIALIST: { color: "#34D399", glow: "rgba(52,211,153,0.35)" },
  AGENT:      { color: "#E8754A", glow: "rgba(232,117,74,0.40)" },
  DIRECTOR:   { color: "#A78BFA", glow: "rgba(167,139,250,0.35)" },
  COMMANDER:  { color: "#EF4444", glow: "rgba(239,68,68,0.4)" },
};

const QUICK_LINKS = [
  { key: "insights",    icon: "stats-chart-outline",   label: "Insights",    route: "/insights"    },
  { key: "scheduled",   icon: "calendar-outline",      label: "Scheduled",   route: "/scheduled"   },
  { key: "challenges",  icon: "flame-outline",         label: "Challenges",  route: "/challenges"  },
  { key: "soul-twin",   icon: "hardware-chip-outline", label: "Soul Twin",   route: "/soul-twin"   },
] as const;

function PostThumb({ post, colors }: { post: any; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.thumb, { width: THUMB_SIZE, height: THUMB_SIZE }]}>
      {post.imageUrl ? (
        <Image source={{ uri: post.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <BlurView intensity={BLUR_INTENSITY} tint={BLUR_TINT as any} style={[StyleSheet.absoluteFill, { justifyContent: "center", padding: 6 }]}>
          {post.mood ? <Text style={styles.thumbMood}>{post.mood}</Text> : null}
          <Text style={[styles.thumbText, { color: colors.mutedForeground }]} numberOfLines={5}>
            {post.content}
          </Text>
        </BlurView>
      )}
      <View style={styles.thumbOverlay}>
        <View style={styles.thumbStat}>
          <Ionicons name="heart" size={10} color="#fff" />
          <Text style={styles.thumbStatText}>{post.likesCount ?? 0}</Text>
        </View>
        <View style={styles.thumbStat}>
          <Ionicons name="chatbubble" size={10} color="#fff" />
          <Text style={styles.thumbStatText}>{post.commentsCount ?? 0}</Text>
        </View>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: me, refetch: refetchMe, isRefetching: isRefetchingMe } = useGetMe();
  const { data: stats, refetch: refetchStats } = useGetUserStats();
  const { data: psData } = useGetPowerScore(me?.id ?? "", {
    query: { enabled: !!me?.id, queryKey: ["powerScore", me?.id ?? ""] },
  });
  const { data: postsData, refetch: refetchPosts, isRefetching: isRefetchingPosts } = useGetUserPosts(
    me?.id ?? "",
    undefined,
    { query: { enabled: !!me?.id, queryKey: ["getUserPosts", me?.id ?? ""] } },
  );

  const posts = (postsData?.posts ?? []) as any[];
  const { live: livePower } = usePowerScoreStream(me?.id);
  const effectiveRank = livePower?.rank ?? me?.powerRank ?? "";
  const rankInfo = RANK_COLORS[effectiveRank] ?? RANK_COLORS.RECRUIT;
  const powerScore = livePower?.score ?? psData?.score ?? me?.powerScore ?? null;

  const [followSheet, setFollowSheet] = useState<FollowListMode | null>(null);

  const onRefresh = useCallback(() => {
    refetchMe();
    refetchStats();
    refetchPosts();
  }, [refetchMe, refetchStats, refetchPosts]);

  const initials = (me?.displayName ?? "IF")
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const ListHeader = (
    <View>
      {/* ── HEADER BAR ── */}
      <BlurView
        intensity={Platform.OS === "ios" ? 65 : 80}
        tint="dark"
        style={[styles.headerBar, { paddingTop: topPad + 12 }]}
      >
        <View style={styles.headerGlassShine} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerSuperLabel, { color: colors.primary + "77" }]}>OPERATOR</Text>
          <Text style={[styles.headerUsername, { color: colors.foreground }]} numberOfLines={1}>
            @{me?.username ?? "—"}
          </Text>
        </View>
        {me?.username ? (
          <View style={{ marginRight: 8 }}>
            <ProfileQR
              username={me.username}
              displayName={me.displayName ?? me.username}
              rank={effectiveRank || null}
              rankColor={rankInfo.color}
              size="icon"
            />
          </View>
        ) : null}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/menu");
          }}
          hitSlop={10}
          style={styles.headerBtn}
        >
          <Ionicons name="menu" size={22} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/settings");
          }}
          hitSlop={10}
          style={styles.headerBtn}
        >
          <Ionicons name="settings-outline" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </BlurView>

      {/* ── AVATAR + STATS ROW ── */}
      <View style={styles.statsSection}>
        <View
          style={[
            styles.avatarRing,
            {
              borderColor: rankInfo.color,
              shadowColor: rankInfo.color,
            },
          ]}
        >
          {me?.avatarUrl ? (
            <Image source={{ uri: me.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: "rgba(20,30,80,0.9)" }]}>
              <Text style={[styles.avatarInitials, { color: rankInfo.color }]}>{initials}</Text>
            </View>
          )}
        </View>

        <View style={styles.statsRight}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {(stats?.postsCount ?? 0).toLocaleString()}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Posts</Text>
            </View>
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.6}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFollowSheet("followers");
              }}
            >
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {(stats?.followersCount ?? 0).toLocaleString()}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.6}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFollowSheet("following");
              }}
            >
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {(stats?.followingCount ?? 0).toLocaleString()}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Following</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/edit-profile");
            }}
            style={[styles.editBtn, { borderColor: GLASS_BORDER, backgroundColor: "rgba(255,255,255,0.05)" }]}
          >
            <Feather name="edit-3" size={12} color={colors.mutedForeground} />
            <Text style={[styles.editBtnText, { color: colors.secondaryForeground }]}>Edit Profile</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── ENGAGEMENT STATS ROW (Glass card) ── */}
      <View style={styles.engagementWrapper}>
        <BlurView intensity={BLUR_INTENSITY} tint={BLUR_TINT as any} style={styles.engagementBlur}>
          <View style={styles.engagementGlassShine} />
          <View style={styles.engagementRow}>
            <View style={styles.engagementItem}>
              <Ionicons name="heart" size={14} color={colors.destructive} />
              <Text style={[styles.engagementValue, { color: colors.foreground }]}>
                {(stats?.likesReceived ?? 0).toLocaleString()}
              </Text>
              <Text style={[styles.engagementLabel, { color: colors.mutedForeground }]}>Likes</Text>
            </View>
            <View style={[styles.engagementDivider, { backgroundColor: GLASS_BORDER }]} />
            <View style={styles.engagementItem}>
              <Ionicons name="chatbubble" size={13} color={colors.primary + "CC"} />
              <Text style={[styles.engagementValue, { color: colors.foreground }]}>
                {(stats?.commentsReceived ?? 0).toLocaleString()}
              </Text>
              <Text style={[styles.engagementLabel, { color: colors.mutedForeground }]}>Comments</Text>
            </View>
            <View style={[styles.engagementDivider, { backgroundColor: GLASS_BORDER }]} />
            <View style={styles.engagementItem}>
              <Ionicons name="rocket" size={13} color="#A78BFA" />
              <Text style={[styles.engagementValue, { color: colors.foreground }]}>
                {(stats?.bountiesWon ?? me?.bountiesWon ?? 0).toLocaleString()}
              </Text>
              <Text style={[styles.engagementLabel, { color: colors.mutedForeground }]}>Bounties</Text>
            </View>
            {powerScore != null ? (
              <>
                <View style={[styles.engagementDivider, { backgroundColor: GLASS_BORDER }]} />
                <View style={styles.engagementItem}>
                  <Ionicons name="flash" size={13} color={rankInfo.color} />
                  <Text style={[styles.engagementValue, { color: rankInfo.color }]}>{powerScore}</Text>
                  <Text style={[styles.engagementLabel, { color: colors.mutedForeground }]}>Power</Text>
                </View>
              </>
            ) : null}
          </View>
        </BlurView>
      </View>

      {/* ── BIO SECTION ── */}
      <View style={styles.bioSection}>
        {me?.displayName ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={[styles.displayName, { color: colors.foreground }]}>{me.displayName}</Text>
            <VerificationBadge tier={(me as any)?.verifiedTier ?? null} size={14} />
            {((me as any)?.chatScreenshotsTaken ?? 0) > 0 ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="What does this badge mean?"
                onPress={() =>
                  Alert.alert(
                    "Screenshot counter",
                    `This shows how many times you've been detected screenshotting a private DM thread. Every time you do, the other person is notified instantly.\n\nCurrent count: ${(me as any).chatScreenshotsTaken}.`,
                  )
                }
                style={{
                  flexDirection: "row", alignItems: "center", gap: 4,
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                  backgroundColor: "rgba(220,20,60,0.14)",
                  borderWidth: 1, borderColor: "rgba(220,20,60,0.45)",
                }}
              >
                <Ionicons name="camera-outline" size={11} color="#DC143C" />
                <Text style={{ color: "#DC143C", fontSize: 10, fontWeight: "700" }}>
                  {(me as any).chatScreenshotsTaken} {(me as any).chatScreenshotsTaken === 1 ? "screenshot" : "screenshots"} taken
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {me?.powerRank ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <View
              style={[
                styles.rankBadge,
                { borderColor: rankInfo.color + "44", backgroundColor: rankInfo.color + "14" },
              ]}
            >
              <Ionicons name="shield-checkmark" size={10} color={rankInfo.color} />
              <Text style={[styles.rankText, { color: rankInfo.color }]}>
                {effectiveRank}{powerScore != null ? ` · ${powerScore} pts` : ""}
              </Text>
            </View>
            <StreakChip userId={me?.id} />
            <AchievementIcons userId={me?.id} />
          </View>
        ) : null}

        {me?.occupation ? (
          <Text style={[styles.occupation, { color: colors.primary + "BB" }]}>{me.occupation}</Text>
        ) : null}

        {me?.bio ? (
          <Text style={[styles.bio, { color: colors.secondaryForeground }]}>{me.bio}</Text>
        ) : null}

        <View style={styles.metaRow}>
          {me?.location ? (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{me.location}</Text>
            </View>
          ) : null}
          {me?.website ? (
            <View style={styles.metaItem}>
              <Ionicons name="globe-outline" size={12} color={colors.primary + "99"} />
              <Text style={[styles.metaText, { color: colors.primary }]} numberOfLines={1}>
                {me.website}
              </Text>
            </View>
          ) : null}
        </View>

        {me?.skills && me.skills.length > 0 ? (
          <View style={styles.skillsRow}>
            {me.skills.slice(0, 5).map((s: string) => (
              <View
                key={s}
                style={[
                  styles.skillChip,
                  { borderColor: colors.primary + "33", backgroundColor: colors.primary + "12" },
                ]}
              >
                <Text style={[styles.skillText, { color: colors.primary + "CC" }]}>{s}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {/* ── QUICK LINKS (Glass card) ── */}
      <View style={styles.quickLinksWrapper}>
        <BlurView intensity={BLUR_INTENSITY} tint={BLUR_TINT as any} style={styles.quickLinksBlur}>
          <View style={styles.quickLinksGlassShine} />
          <View style={styles.quickLinks}>
            {QUICK_LINKS.map((link) => (
              <TouchableOpacity
                key={link.key}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(link.route as any);
                }}
                style={styles.quickLink}
                activeOpacity={0.7}
              >
                <View style={[styles.quickLinkIcon, { borderColor: colors.primary + "30", backgroundColor: colors.primary + "12" }]}>
                  <Ionicons name={link.icon as any} size={20} color={colors.primary} />
                </View>
                <Text style={[styles.quickLinkLabel, { color: colors.mutedForeground }]}>{link.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </BlurView>
      </View>

      {/* ── POSTS GRID HEADER ── */}
      <View style={[styles.gridHeader, { borderTopColor: GLASS_BORDER }]}>
        <View style={[styles.gridHeaderLine, { backgroundColor: GLASS_BORDER }]} />
        <View style={styles.gridHeaderIconWrap}>
          <Ionicons name="grid-outline" size={16} color={colors.mutedForeground} />
        </View>
        <View style={[styles.gridHeaderLine, { backgroundColor: GLASS_BORDER }]} />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={(p) => String(p.id)}
        numColumns={3}
        columnWrapperStyle={{ gap: GRID_GAP, paddingHorizontal: 12 }}
        ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
        renderItem={({ item }) => <PostThumb post={item} colors={colors} />}
        ListHeaderComponent={ListHeader}
        style={{ backgroundColor: "transparent" }}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 84 : 110 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingMe || isRefetchingPosts}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyGrid}>
            <Ionicons name="camera-outline" size={36} color={GLASS_BORDER} />
            <Text style={[styles.emptyGridText, { color: colors.mutedForeground }]}>No posts yet</Text>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/create")}
              style={[styles.firstPostBtn, { borderColor: colors.primary + "44" }]}
            >
              <Text style={[styles.firstPostBtnText, { color: colors.primary }]}>
                Create your first post
              </Text>
            </TouchableOpacity>
          </View>
        }
      />
      {me?.id ? (
        <FollowListSheet
          visible={followSheet !== null}
          mode={followSheet ?? "followers"}
          userId={me.id}
          onClose={() => setFollowSheet(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GLASS_BORDER,
    overflow: "hidden",
    position: "relative",
  },
  headerGlassShine: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  headerSuperLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  headerUsername: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  headerBtn: { padding: 4 },

  statsSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 16,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2.5,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 12,
    elevation: 10,
  },
  avatarImg: { width: "100%", height: "100%", borderRadius: 44 },
  avatarFallback: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  avatarInitials: { fontSize: 30, fontFamily: "Inter_700Bold" },
  statsRight: { flex: 1, gap: 10 },
  statsRow: { flexDirection: "row", justifyContent: "space-around" },
  statItem: { alignItems: "center", gap: 2 },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular", textTransform: "uppercase", letterSpacing: 0.5 },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
  },
  editBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },

  /* Engagement glass card */
  engagementWrapper: {
    marginHorizontal: 12,
    marginBottom: 14,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  engagementBlur: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: "hidden",
  },
  engagementGlassShine: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 24,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  engagementRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  engagementItem: { flex: 1, alignItems: "center", gap: 3 },
  engagementDivider: { width: StyleSheet.hairlineWidth, height: 28 },
  engagementValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  engagementLabel: { fontSize: 9, fontFamily: "Inter_400Regular", textTransform: "uppercase", letterSpacing: 0.5 },

  bioSection: { paddingHorizontal: 16, paddingBottom: 14, gap: 5 },
  displayName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  rankBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  rankText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8, textTransform: "uppercase" },
  occupation: { fontSize: 12, fontFamily: "Inter_500Medium" },
  bio: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 2 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  skillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  skillChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  skillText: { fontSize: 11, fontFamily: "Inter_500Medium" },

  /* Quick links glass card */
  quickLinksWrapper: {
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  quickLinksBlur: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: "hidden",
  },
  quickLinksGlassShine: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 24,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  quickLinks: { flexDirection: "row", paddingVertical: 14, paddingHorizontal: 8 },
  quickLink: { flex: 1, alignItems: "center", gap: 6 },
  quickLinkIcon: {
    width: 44, height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLinkLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },

  gridHeader: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingVertical: 10,
  },
  gridHeaderLine: { flex: 1, height: StyleSheet.hairlineWidth },
  gridHeaderIconWrap: { paddingHorizontal: 16 },

  thumb: { borderRadius: 8, overflow: "hidden", backgroundColor: GLASS_BG },
  thumbMood: { fontSize: 14 },
  thumbText: { fontSize: 9, fontFamily: "Inter_400Regular", lineHeight: 13 },
  thumbOverlay: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  thumbStat: { flexDirection: "row", alignItems: "center", gap: 2 },
  thumbStatText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" },

  emptyGrid: { alignItems: "center", paddingTop: 48, paddingBottom: 32, gap: 10 },
  emptyGridText: { fontSize: 14, fontFamily: "Inter_400Regular", textTransform: "uppercase", letterSpacing: 1.5 },
  firstPostBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 9, marginTop: 6 },
  firstPostBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
});
