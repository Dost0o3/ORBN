import React, { useState, useMemo, useCallback } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useListPosts,
  useGetMe,
  useGetUnreadDirectMessageCount,
  useGetTrendingPosts,
  useGetSuggestedUsers,
  useGetTrendingHashtags,
  useFollowUser,
} from "@workspace/api-client-react";
import { Image } from "expo-image";
import { useColors } from "@/hooks/useColors";
import PostCard from "@/components/PostCard";

const GLASS_BORDER = "rgba(100,180,220,0.22)";
const GLASS_BG = "rgba(15,25,60,0.38)";
const PRIMARY = "#E8754A";

function Composer({ colors }: { colors: ReturnType<typeof useColors> }) {
  const router = useRouter();
  const { data: me } = useGetMe();
  const initials = (me?.displayName ?? "IF")
    .split(" ")
    .map((n: string) => n[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => router.push("/(tabs)/create")}
      style={styles.composerWrapper}
    >
      <BlurView
        intensity={Platform.OS === "ios" ? 45 : 60}
        tint="dark"
        style={styles.composerBlur}
      >
        <View style={styles.composerGlassShine} />
        <View style={styles.composerInner}>
          {me?.avatarUrl ? (
            <Image source={{ uri: me.avatarUrl }} style={styles.composerAvatar} contentFit="cover" />
          ) : (
            <View style={styles.composerAvatarFallback}>
              <Text style={[styles.composerInitials, { color: colors.primary }]}>{initials}</Text>
            </View>
          )}
          <Text style={[styles.composerPlaceholder, { color: colors.mutedForeground }]}>
            Start a thread…
          </Text>
          <View style={[styles.composerPostBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.composerPostText, { color: colors.primaryForeground }]}>Post</Text>
          </View>
        </View>
      </BlurView>
    </TouchableOpacity>
  );
}

function TrendingHashtagsRow() {
  const router = useRouter();
  const { data } = useGetTrendingHashtags();
  const tags = data?.hashtags ?? [];
  if (tags.length === 0) return null;
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionLabel}>TRENDING</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}
      >
        {tags.slice(0, 12).map((t) => (
          <TouchableOpacity
            key={t.tag}
            style={styles.hashChip}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: "/(tabs)/explore", params: { q: `#${t.tag}` } });
            }}
          >
            <Text style={styles.hashText}>#{t.tag}</Text>
            <Text style={styles.hashCount}>{t.count}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function SuggestedUsersRow() {
  const router = useRouter();
  const { data } = useGetSuggestedUsers({ limit: 10 });
  const followMutation = useFollowUser();
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const users = data?.users ?? [];
  if (users.length === 0) return null;
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionLabel}>SUGGESTED OPERATORS</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}
      >
        {users.map((u: any) => {
          const isFollowed = followed[u.id];
          return (
            <View key={u.id} style={styles.suggestCard}>
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/profile/[userId]", params: { userId: u.id } })}
                style={{ alignItems: "center" }}
              >
                {u.avatarUrl ? (
                  <Image source={{ uri: u.avatarUrl }} style={styles.suggestAvatar} contentFit="cover" />
                ) : (
                  <View style={[styles.suggestAvatar, styles.suggestFallback]}>
                    <Text style={styles.suggestInitial}>{(u.displayName ?? u.username ?? "?")[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.suggestName} numberOfLines={1}>{u.displayName ?? u.username}</Text>
                <Text style={styles.suggestMeta} numberOfLines={1}>{u.followersCount ?? 0} followers</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.suggestBtn, isFollowed && styles.suggestBtnActive]}
                disabled={isFollowed}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFollowed((prev) => ({ ...prev, [u.id]: true }));
                  followMutation.mutateAsync({ userId: u.id }).catch(() => {
                    setFollowed((prev) => ({ ...prev, [u.id]: false }));
                  });
                }}
              >
                <Text style={[styles.suggestBtnText, isFollowed && { color: "rgba(255,255,255,0.5)" }]}>
                  {isFollowed ? "FOLLOWING" : "+ FOLLOW"}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [tab, setTab] = useState<"for-you" | "trending">("for-you");

  const forYou = useListPosts({ limit: 30 });
  const trending = useGetTrendingPosts(
    {},
    { query: { enabled: tab === "trending", queryKey: ["feedTrending"] } },
  );
  const { data: unread } = useGetUnreadDirectMessageCount();

  const posts = useMemo(() => {
    if (tab === "trending") return trending.data?.posts ?? [];
    return forYou.data?.posts ?? [];
  }, [tab, forYou.data, trending.data]);

  const isLoading = tab === "for-you" ? forYou.isLoading : trending.isLoading;
  const isError = tab === "for-you" ? forYou.isError : trending.isError;
  const isRefetching = tab === "for-you" ? forYou.isRefetching : trending.isRefetching;

  const onRefresh = useCallback(() => {
    if (tab === "for-you") forYou.refetch();
    else trending.refetch();
  }, [tab, forYou, trending]);

  const ListHeader = (
    <>
      <Composer colors={colors} />
      <View style={styles.tabRow}>
        {(["for-you", "trending"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setTab(t);
            }}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "for-you" ? "For You" : "Trending"}
            </Text>
            {tab === t ? <View style={styles.tabUnderline} /> : null}
          </TouchableOpacity>
        ))}
      </View>
      <TrendingHashtagsRow />
      {tab === "for-you" ? <SuggestedUsersRow /> : null}
    </>
  );

  return (
    <View style={styles.container}>
      <BlurView
        intensity={Platform.OS === "ios" ? 65 : 80}
        tint="dark"
        style={[styles.header, { paddingTop: topPad + 10, borderBottomColor: GLASS_BORDER }]}
      >
        <View style={styles.headerGlassShine} />
        <TouchableOpacity onPress={() => router.push("/menu")} hitSlop={12} style={styles.headerIconBtn}>
          <Ionicons name="menu" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.logo, { color: colors.primary }]}>ORBN</Text>
        <TouchableOpacity onPress={() => router.push("/messages")} hitSlop={12} style={styles.headerIconBtn}>
          <Ionicons name="chatbubble-ellipses" size={20} color={colors.primary} />
          {unread?.count && unread.count > 0 ? (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unread.count > 9 ? "9+" : unread.count}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </BlurView>

      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <PostCard post={item} />}
        ListHeaderComponent={ListHeader}
        style={{ backgroundColor: "transparent" }}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 84 : 110, paddingTop: 4 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.skeletons}>
              {Array.from({ length: 5 }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.skeleton,
                    { backgroundColor: GLASS_BG, borderColor: GLASS_BORDER },
                  ]}
                />
              ))}
            </View>
          ) : isError ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.destructive }]}>Couldn't load posts.</Text>
              <Text style={[styles.retryText, { color: colors.primary }]} onPress={onRefresh}>Tap to retry</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {tab === "trending" ? "No trending posts right now." : "No posts yet — be the first."}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: "relative",
    overflow: "hidden",
  },
  headerGlassShine: {
    position: "absolute", top: 0, left: 0, right: 0, height: 40,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  logo: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  headerIconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", position: "relative" },
  headerBadge: {
    position: "absolute", top: 4, right: 2, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: "#DC143C", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 4, borderWidth: 1.5, borderColor: "rgba(11,24,40,0.95)",
  },
  headerBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" },

  /* Composer */
  composerWrapper: {
    marginHorizontal: 12, marginTop: 12, marginBottom: 4, borderRadius: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  composerBlur: { borderRadius: 20, borderWidth: 1, borderColor: GLASS_BORDER, overflow: "hidden" },
  composerGlassShine: {
    position: "absolute", top: 0, left: 0, right: 0, height: 30,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  composerInner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  composerAvatar: { width: 36, height: 36, borderRadius: 18 },
  composerAvatarFallback: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(212,160,23,0.25)", alignItems: "center", justifyContent: "center",
  },
  composerInitials: { fontSize: 14, fontFamily: "Inter_700Bold" },
  composerPlaceholder: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  composerPostBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  composerPostText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  /* Tabs */
  tabRow: {
    flexDirection: "row",
    marginTop: 12,
    paddingHorizontal: 16,
    gap: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GLASS_BORDER,
  },
  tab: { paddingVertical: 10, position: "relative" },
  tabActive: {},
  tabText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.4)", letterSpacing: 0.5 },
  tabTextActive: { color: "#fff" },
  tabUnderline: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: 2, backgroundColor: PRIMARY, borderRadius: 1,
  },

  /* Sections */
  sectionWrap: { marginTop: 12 },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: PRIMARY,
    letterSpacing: 1.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  hashChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: GLASS_BG,
  },
  hashText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.9)" },
  hashCount: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(232,117,74,0.7)" },

  suggestCard: {
    width: 130,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: GLASS_BG,
    alignItems: "center",
    gap: 6,
  },
  suggestAvatar: { width: 48, height: 48, borderRadius: 24 },
  suggestFallback: {
    backgroundColor: "rgba(232,117,74,0.15)",
    borderWidth: 1, borderColor: "rgba(232,117,74,0.4)",
    alignItems: "center", justifyContent: "center",
  },
  suggestInitial: { fontSize: 16, fontFamily: "Inter_700Bold", color: PRIMARY },
  suggestName: {
    fontSize: 12, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.9)", marginTop: 4, maxWidth: 110, textAlign: "center",
  },
  suggestMeta: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)" },
  suggestBtn: {
    marginTop: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4,
    borderWidth: 1, borderColor: PRIMARY + "55",
  },
  suggestBtnActive: { borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.04)" },
  suggestBtnText: { fontSize: 10, fontFamily: "Inter_700Bold", color: PRIMARY, letterSpacing: 0.7 },

  /* Skeletons */
  skeletons: { paddingTop: 4 },
  skeleton: {
    height: 130, marginHorizontal: 12, marginTop: 10, borderRadius: 20, borderWidth: 1,
  },

  /* Empty */
  empty: { alignItems: "center", padding: 48 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 15 },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 12 },
});
