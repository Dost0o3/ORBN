import { Ionicons } from "@expo/vector-icons";
import {
  useGetUserById,
  useGetUserPosts,
  useGetUserStatsByUserId,
  useFollowUser,
  useUnfollowUser,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import React, { useState, useCallback, useEffect, useRef } from "react";
import FollowListSheet, { type FollowListMode } from "@/components/FollowListSheet";
import ProfileActionsMenu from "@/components/ProfileActionsMenu";
import { API_BASE } from "../../lib/api-base";
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
import { usePowerScoreStream } from "@/hooks/usePowerScoreStream";
import { StreakChip, AchievementIcons } from "@/components/StreakAchievements";
import { useColors } from "@/hooks/useColors";
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

function PostThumb({ post, colors }: { post: any; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.thumb, { width: THUMB_SIZE, height: THUMB_SIZE }]}>
      {post.imageUrl ? (
        <Image source={{ uri: post.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <BlurView
          intensity={BLUR_INTENSITY}
          tint={BLUR_TINT as any}
          style={[StyleSheet.absoluteFill, { justifyContent: "center", padding: 6 }]}
        >
          <Text style={[styles.thumbText, { color: colors.mutedForeground }]} numberOfLines={5}>
            {post.content}
          </Text>
        </BlurView>
      )}
      {(post.likesCount > 0 || post.commentsCount > 0) && (
        <View style={styles.thumbOverlay}>
          {post.likesCount > 0 && (
            <View style={styles.thumbStat}>
              <Ionicons name="heart" size={9} color="#fff" />
              <Text style={styles.thumbStatText}>{post.likesCount}</Text>
            </View>
          )}
          {post.commentsCount > 0 && (
            <View style={styles.thumbStat}>
              <Ionicons name="chatbubble" size={9} color="#fff" />
              <Text style={styles.thumbStatText}>{post.commentsCount}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 60 : insets.top;

  const [following, setFollowing] = useState<boolean | null>(null);
  const [followSheet, setFollowSheet] = useState<FollowListMode | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blocked, setBlocked] = useState<boolean>(false);
  const { getToken } = useAuth();
  const ghostMarkedRef = useRef(false);

  const { data: user, refetch: refetchUser, isRefetching: refetchingUser } = useGetUserById(userId ?? "");

  useEffect(() => {
    if (!userId || ghostMarkedRef.current) return;
    ghostMarkedRef.current = true;
    (async () => {
      try {
        const token = await getToken();
        await fetch(`${API_BASE}/api/users/${userId}/ghost-view`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch {
        // Silent — non-critical
      }
    })();
  }, [userId, getToken]);

  useEffect(() => {
    if (typeof (user as any)?.isBlocked === "boolean") setBlocked((user as any).isBlocked);
  }, [user]);
  const { data: stats, refetch: refetchStats } = useGetUserStatsByUserId(userId ?? "", {
    query: { enabled: !!userId, queryKey: ["userStats", userId ?? ""] },
  });
  const { data: postsData, refetch: refetchPosts, isRefetching: refetchingPosts } = useGetUserPosts(
    userId ?? "",
    undefined,
    { query: { enabled: !!userId, queryKey: ["getUserPosts", userId ?? ""] } },
  );

  const followUser = useFollowUser();
  const unfollowUser = useUnfollowUser();

  const isFollowing = following !== null ? following : (user?.isFollowing ?? false);
  const { live: livePower } = usePowerScoreStream(userId);
  const powerRank = livePower?.rank ?? user?.powerRank ?? "";
  const rankInfo = RANK_COLORS[powerRank] ?? RANK_COLORS.RECRUIT;
  const powerScore = livePower?.score ?? user?.powerScore ?? null;
  const posts = (postsData?.posts ?? []) as any[];

  const initials = (user?.displayName ?? "?")
    .split(" ")
    .map((n: string) => n[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const onRefresh = useCallback(() => {
    refetchUser();
    refetchStats();
    refetchPosts();
  }, [refetchUser, refetchStats, refetchPosts]);

  const toggleFollow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isFollowing) {
      setFollowing(false);
      unfollowUser.mutateAsync({ userId: userId ?? "" });
    } else {
      setFollowing(true);
      followUser.mutateAsync({ userId: userId ?? "" });
    }
  };

  const ListHeader = (
    <View>
      {/* Glass Header bar */}
      <BlurView
        intensity={Platform.OS === "ios" ? 65 : 80}
        tint="dark"
        style={[styles.headerBar, { paddingTop: topPad + 8 }]}
      >
        <View style={styles.headerGlassShine} />
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerSuperLabel, { color: colors.primary + "77" }]}>PROFILE</Text>
          <Text style={[styles.headerUsername, { color: colors.foreground }]} numberOfLines={1}>
            @{user?.username ?? "—"}
          </Text>
        </View>
        {user?.username ? (
          <ProfileQR
            username={user.username}
            displayName={user.displayName ?? user.username}
            rank={powerRank || null}
            rankColor={rankInfo.color}
            size="icon"
          />
        ) : null}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setMenuOpen(true);
          }}
          hitSlop={12}
          style={{ marginLeft: 6, padding: 4 }}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </BlurView>

      {/* Avatar + Stats */}
      <View style={styles.statsSection}>
        <View style={[styles.avatarRing, { borderColor: rankInfo.color, shadowColor: rankInfo.color }]}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
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
                {(stats?.postsCount ?? user?.postsCount ?? 0).toLocaleString()}
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
                {(stats?.followersCount ?? user?.followersCount ?? 0).toLocaleString()}
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
                {(stats?.followingCount ?? user?.followingCount ?? 0).toLocaleString()}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Following</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={toggleFollow}
            style={[
              styles.followBtn,
              {
                backgroundColor: isFollowing ? "rgba(255,255,255,0.05)" : colors.primary,
                borderColor: isFollowing ? GLASS_BORDER : colors.primary,
                shadowColor: isFollowing ? "transparent" : colors.primary,
                shadowOpacity: isFollowing ? 0 : 0.5,
                shadowRadius: 8,
              },
            ]}
          >
            <Text
              style={[
                styles.followBtnText,
                { color: isFollowing ? colors.mutedForeground : colors.primaryForeground },
              ]}
            >
              {isFollowing ? "Following" : "+ Follow"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({
                pathname: "/messages/[conversationId]",
                params: {
                  conversationId: "new",
                  peerId: userId ?? "",
                  peerName: user?.displayName ?? user?.username ?? "Operator",
                  peerAvatar: user?.avatarUrl ?? "",
                },
              });
            }}
            style={[
              styles.followBtn,
              {
                backgroundColor: "rgba(255,255,255,0.05)",
                borderColor: GLASS_BORDER,
                paddingHorizontal: 14,
              },
            ]}
          >
            <Ionicons name="chatbubble-outline" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Engagement glass card */}
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
                {(stats?.bountiesWon ?? user?.bountiesWon ?? 0).toLocaleString()}
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

      {/* Bio */}
      <View style={styles.bioSection}>
        {user?.displayName ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={[styles.displayName, { color: colors.foreground }]}>{user.displayName}</Text>
            <VerificationBadge tier={(user as any)?.verifiedTier ?? null} size={14} />
            {((user as any)?.chatScreenshotsTaken ?? 0) > 0 ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="What does this badge mean?"
                onPress={() =>
                  Alert.alert(
                    "Screenshot counter",
                    `${user.displayName ?? "This user"} has been detected screenshotting private DM threads ${(user as any).chatScreenshotsTaken} ${(user as any).chatScreenshotsTaken === 1 ? "time" : "times"}. Every time someone screenshots a thread, the other person is notified instantly — and this public count goes up.`,
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
                  {(user as any).chatScreenshotsTaken} {(user as any).chatScreenshotsTaken === 1 ? "screenshot" : "screenshots"} taken
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {powerRank ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <View style={[styles.rankBadge, { borderColor: rankInfo.color + "44", backgroundColor: rankInfo.color + "14" }]}>
              <Ionicons name="shield-checkmark" size={10} color={rankInfo.color} />
              <Text style={[styles.rankText, { color: rankInfo.color }]}>{powerRank}{powerScore != null ? ` · ${powerScore} pts` : ""}</Text>
            </View>
            <StreakChip userId={userId} />
            <AchievementIcons userId={userId} />
          </View>
        ) : null}

        {user?.occupation ? (
          <Text style={[styles.occupation, { color: colors.primary + "BB" }]}>{user.occupation}</Text>
        ) : null}

        {user?.bio ? (
          <Text style={[styles.bio, { color: colors.secondaryForeground }]}>{user.bio}</Text>
        ) : null}

        <View style={styles.metaRow}>
          {user?.location ? (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{user.location}</Text>
            </View>
          ) : null}
          {user?.website ? (
            <View style={styles.metaItem}>
              <Ionicons name="globe-outline" size={12} color={colors.primary + "99"} />
              <Text style={[styles.metaText, { color: colors.primary }]} numberOfLines={1}>
                {user.website}
              </Text>
            </View>
          ) : null}
        </View>

        {user?.skills && (user.skills as string[]).length > 0 ? (
          <View style={styles.skillsRow}>
            {(user.skills as string[]).slice(0, 5).map((s) => (
              <View
                key={s}
                style={[styles.skillChip, { borderColor: colors.primary + "33", backgroundColor: colors.primary + "12" }]}
              >
                <Text style={[styles.skillText, { color: colors.primary + "CC" }]}>{s}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {/* Grid header */}
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
            refreshing={refetchingUser || refetchingPosts}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyGrid}>
            <Ionicons name="camera-outline" size={36} color={GLASS_BORDER} />
            <Text style={[styles.emptyGridText, { color: colors.mutedForeground }]}>No posts yet</Text>
          </View>
        }
      />
      {userId ? (
        <>
          <FollowListSheet
            visible={followSheet !== null}
            mode={followSheet ?? "followers"}
            userId={userId}
            onClose={() => setFollowSheet(null)}
          />
          <ProfileActionsMenu
            visible={menuOpen}
            onClose={() => setMenuOpen(false)}
            userId={userId}
            isBlocked={blocked}
            onBlockedChange={setBlocked}
          />
        </>
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
    gap: 12,
    overflow: "hidden",
    position: "relative",
  },
  headerGlassShine: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  backBtn: { padding: 4 },
  headerSuperLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  headerUsername: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },

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
    shadowRadius: 14,
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
  followBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 0 },
  },
  followBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },

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
});
