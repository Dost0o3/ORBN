import { Ionicons } from "@expo/vector-icons";
import {
  useSearchUsers,
  useGetTrendingPosts,
  useGetTrendingHashtags,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PostCard from "@/components/PostCard";
import UserCard from "@/components/UserCard";
import TrendingNiche from "@/components/TrendingNiche";
import { useColors } from "@/hooks/useColors";

const DISCOVER_TILES = [
  { key: "challenges",  icon: "flame-outline",      label: "Challenges",   sub: "Weekly arena",      route: "/challenges",  accent: "#E8754A" },
  { key: "leaderboard", icon: "trophy-outline",    label: "Dark Horses",  sub: "AI Leaderboard",    route: "/leaderboard", accent: "#E8754A" },
  { key: "bounties",    icon: "rocket-outline",     label: "Bounty Board", sub: "Post challenges",   route: "/bounties",    accent: "#E8754A" },
  { key: "jobs",        icon: "briefcase-outline",  label: "The Board",    sub: "Jobs & AI match",   route: "/jobs",        accent: "#10b981" },
  { key: "soul-twin",   icon: "hardware-chip-outline", label: "Soul Twin", sub: "AI career coach",  route: "/soul-twin",   accent: "#8b5cf6" },
  { key: "connect",     icon: "people-outline",     label: "Operators",    sub: "Suggested network", route: "/(tabs)/connect", accent: "#3b82f6" },
] as const;

function TrendingSkeleton() {
  const colors = useColors();
  return (
    <View>
      {Array.from({ length: 5 }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.skeletonCard,
            { backgroundColor: colors.background, borderBottomColor: colors.border },
          ]}
        >
          <View style={[styles.skeletonAccent, { backgroundColor: colors.border }]} />
          <View style={styles.skeletonInner}>
            <View style={styles.skeletonHeader}>
              <View style={[styles.skeletonAvatar, { backgroundColor: colors.card }]} />
              <View style={styles.skeletonMeta}>
                <View style={[styles.skeletonLine, { width: "50%", backgroundColor: colors.card }]} />
                <View style={[styles.skeletonLine, { width: "30%", backgroundColor: colors.card, marginTop: 6 }]} />
              </View>
            </View>
            <View style={[styles.skeletonLine, { width: "95%", backgroundColor: colors.card, marginTop: 14 }]} />
            <View style={[styles.skeletonLine, { width: "80%", backgroundColor: colors.card, marginTop: 6 }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function ExploreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const { data: usersData } = useSearchUsers({ q: query || undefined, limit: 20 });
  const {
    data: trendingData,
    isLoading: trendingLoading,
    refetch: refetchTrending,
    isRefetching: trendingRefetching,
  } = useGetTrendingPosts({ limit: 30 });
  const { data: hashtagsData } = useGetTrendingHashtags();

  const users = usersData?.users ?? [];
  const allTrending = trendingData?.posts ?? [];
  const hashtags = hashtagsData?.hashtags ?? [];

  const trendingPosts = selectedTag
    ? allTrending.filter(
        (p) =>
          Array.isArray(p.hashtags) &&
          p.hashtags.some((h) => h.toLowerCase() === selectedTag),
      )
    : allTrending;

  const showUsers = query.length >= 2;

  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            backgroundColor: "rgba(8,15,45,0.82)",
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.input, borderColor: colors.border },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[
              styles.searchInput,
              { color: colors.foreground, fontFamily: "Inter_400Regular" },
            ]}
            placeholder="Search people..."
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              if (v.length < 2) setSelectedTag(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {showUsers ? (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => <UserCard user={item} />}
          style={{ backgroundColor: "transparent" }}
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 84 : 100 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No people found
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={trendingPosts}
          keyExtractor={(p) => String(p.id)}
          style={{ backgroundColor: "transparent" }}
          refreshControl={
            <RefreshControl
              refreshing={trendingRefetching}
              onRefresh={refetchTrending}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View>
              {!selectedTag && (
                <View style={styles.discoverSection}>
                  <Text style={[styles.discoverLabel, { color: colors.mutedForeground }]}>DISCOVER</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.discoverRow}>
                    {DISCOVER_TILES.map((tile) => (
                      <TouchableOpacity
                        key={tile.key}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push(tile.route as any);
                        }}
                        style={[styles.discoverTile, { borderColor: `${tile.accent}30`, backgroundColor: `${tile.accent}08` }]}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.discoverIcon, { backgroundColor: `${tile.accent}18`, borderColor: `${tile.accent}35` }]}>
                          <Ionicons name={tile.icon as any} size={20} color={tile.accent} />
                        </View>
                        <Text style={[styles.discoverTileLabel, { color: "rgba(255,255,255,0.85)" }]}>{tile.label}</Text>
                        <Text style={[styles.discoverTileSub, { color: "rgba(255,255,255,0.3)" }]}>{tile.sub}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
              {!selectedTag && <TrendingNiche />}
              {hashtags.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hashtagRow}
                >
                  <TouchableOpacity
                    onPress={() => setSelectedTag(null)}
                    style={[
                      styles.hashtagChip,
                      {
                        backgroundColor: !selectedTag ? colors.primary : "transparent",
                        borderColor: !selectedTag ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.hashtagText,
                        {
                          color: !selectedTag
                            ? colors.primaryForeground
                            : colors.mutedForeground,
                        },
                      ]}
                    >
                      All
                    </Text>
                  </TouchableOpacity>
                  {hashtags.slice(0, 8).map((h) => (
                    <TouchableOpacity
                      key={h.tag}
                      onPress={() =>
                        setSelectedTag(selectedTag === h.tag ? null : h.tag)
                      }
                      style={[
                        styles.hashtagChip,
                        {
                          backgroundColor:
                            selectedTag === h.tag ? colors.primary : "transparent",
                          borderColor:
                            selectedTag === h.tag ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.hashtagText,
                          {
                            color:
                              selectedTag === h.tag
                                ? colors.primaryForeground
                                : colors.mutedForeground,
                          },
                        ]}
                      >
                        #{h.tag}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <Text
                style={[styles.sectionLabel, { color: colors.mutedForeground }]}
              >
                {selectedTag ? `#${selectedTag}` : "Trending"}
              </Text>
            </View>
          }
          renderItem={({ item }) => <PostCard post={item} />}
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 84 : 100 }}
          ListEmptyComponent={
            trendingLoading ? (
              <TrendingSkeleton />
            ) : (
              <View style={styles.empty}>
                <Ionicons name="flame-outline" size={36} color={colors.border} />
                <Text
                  style={[
                    styles.emptyText,
                    { color: colors.mutedForeground, marginTop: 12 },
                  ]}
                >
                  Nothing trending yet
                </Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  discoverSection: { paddingTop: 14, paddingBottom: 6 },
  discoverLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  discoverRow: { paddingHorizontal: 12, gap: 10, paddingBottom: 4 },
  discoverTile: {
    width: 110,
    borderWidth: 1,
    padding: 12,
    gap: 6,
    alignItems: "flex-start",
  },
  discoverIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  discoverTileLabel: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    lineHeight: 16,
  },
  discoverTileSub: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    lineHeight: 13,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  hashtagRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    gap: 8,
    flexDirection: "row",
  },
  hashtagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  hashtagText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  sectionLabel: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  empty: { alignItems: "center", padding: 48 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 15 },
  skeletonCard: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  skeletonAccent: { width: 3 },
  skeletonInner: { flex: 1, padding: 14 },
  skeletonHeader: { flexDirection: "row", gap: 10, alignItems: "center" },
  skeletonAvatar: { width: 40, height: 40, borderRadius: 20 },
  skeletonMeta: { flex: 1 },
  skeletonLine: { height: 10, borderRadius: 5 },
});
