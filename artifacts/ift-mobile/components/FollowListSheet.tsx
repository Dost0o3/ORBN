import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  useGetUserFollowers,
  useGetUserFollowing,
  type UserProfile,
} from "@workspace/api-client-react";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type FollowListMode = "followers" | "following";

export default function FollowListSheet({
  visible,
  mode,
  userId,
  onClose,
}: {
  visible: boolean;
  mode: FollowListMode;
  userId: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const followers = useGetUserFollowers(userId, {
    query: { enabled: visible && mode === "followers" && !!userId, queryKey: ["userFollowers", userId] },
  });
  const following = useGetUserFollowing(userId, {
    query: { enabled: visible && mode === "following" && !!userId, queryKey: ["userFollowing", userId] },
  });

  const active = mode === "followers" ? followers : following;
  const users = (active.data?.users ?? []) as UserProfile[];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{mode === "followers" ? "Followers" : "Following"}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color="rgba(255,255,255,0.65)" />
            </TouchableOpacity>
          </View>

          {active.isLoading ? (
            <View style={styles.loader}>
              <ActivityIndicator color="#E8754A" />
            </View>
          ) : (
            <FlatList
              data={users}
              keyExtractor={(u) => u.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    onClose();
                    router.push({ pathname: "/profile/[userId]", params: { userId: item.id } });
                  }}
                >
                  {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarText}>
                        {(item.displayName ?? item.username ?? "?")[0]?.toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.displayName ?? item.username ?? "Operator"}
                    </Text>
                    <Text style={styles.handleText} numberOfLines={1}>
                      @{item.username ?? "—"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  {mode === "followers" ? "No followers yet" : "Not following anyone"}
                </Text>
              }
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "rgba(11,24,40,0.98)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: "rgba(232,117,74,0.25)",
    maxHeight: "80%",
    minHeight: 320,
    paddingTop: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(232,117,74,0.18)",
  },
  headerTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.3 },
  loader: { padding: 32, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: {
    backgroundColor: "rgba(232,117,74,0.15)",
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#E8754A" },
  name: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.92)" },
  handleText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)", marginTop: 1 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.06)", marginLeft: 54 },
  emptyText: {
    textAlign: "center",
    paddingTop: 40,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.4)",
  },
});
