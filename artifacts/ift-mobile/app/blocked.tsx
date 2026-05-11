import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import { useUnblockUser } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

const GLASS_BORDER = "rgba(100,180,220,0.18)";

interface BlockedUser {
  id: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export default function BlockedUsersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();
  const unblock = useUnblockUser();

  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/users/me/blocks`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        setBlocked([]);
        return;
      }
      const data = await res.json();
      setBlocked((data?.users ?? data?.blocked ?? data ?? []) as BlockedUser[]);
    } catch {
      setBlocked([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUnblock = (user: BlockedUser) => {
    Alert.alert(
      `Unblock ${user.displayName ?? user.username ?? "user"}?`,
      "They'll be able to see and message you again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            try {
              await unblock.mutateAsync({ userId: user.id });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setBlocked((prev) => prev.filter((u) => u.id !== user.id));
            } catch {
              Alert.alert("Couldn't unblock", "Try again in a moment.");
            }
          },
        },
      ],
    );
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
          <Text style={styles.superLabel}>ORBN</Text>
          <Text style={styles.headerTitle}>Blocked</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={blocked}
          keyExtractor={(u) => u.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          renderItem={({ item }) => (
            <View style={styles.userRow}>
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>
                    {(item.displayName ?? item.username ?? "?")[0]?.toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{item.displayName ?? item.username ?? "User"}</Text>
                {item.username && <Text style={styles.userHandle}>@{item.username}</Text>}
              </View>
              <TouchableOpacity
                style={[styles.unblockBtn, { borderColor: colors.primary }]}
                onPress={() => handleUnblock(item)}
                disabled={unblock.isPending}
              >
                <Text style={[styles.unblockText, { color: colors.primary }]}>Unblock</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={48} color="rgba(255,255,255,0.15)" />
              <Text style={styles.emptyText}>No blocked accounts</Text>
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
    borderBottomColor: "rgba(232,117,74,0.15)",
  },
  superLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(232,117,74,0.55)",
    letterSpacing: 2,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GLASS_BORDER,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(30,40,100,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: "#E8754A", fontSize: 18, fontFamily: "Inter_700Bold" },
  userName: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  userHandle: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_400Regular" },
  unblockBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  unblockText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { color: "rgba(255,255,255,0.35)", fontSize: 14, fontFamily: "Inter_500Medium" },
});
