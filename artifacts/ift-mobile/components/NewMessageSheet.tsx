import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import {
  useSearchUsers,
  useGetSuggestedUsers,
  type UserProfile,
} from "@workspace/api-client-react";
import React, { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function NewMessageSheet({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (user: UserProfile) => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  const search = useSearchUsers(
    { q: trimmed, limit: 20 },
    {
      query: { enabled: visible && trimmed.length >= 2, queryKey: ["searchUsersDM", trimmed] },
    },
  );
  const suggested = useGetSuggestedUsers(
    { limit: 12 },
    {
      query: { enabled: visible && trimmed.length < 2, queryKey: ["suggestedUsersDM"] },
    },
  );

  const users = (trimmed.length >= 2
    ? search.data?.users ?? []
    : suggested.data?.users ?? []) as UserProfile[];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>New message</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color="rgba(255,255,255,0.65)" />
            </TouchableOpacity>
          </View>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" />
            <TextInput
              autoFocus
              placeholder="Search by name or @handle"
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery("")} hitSlop={10}>
                <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            ) : null}
          </View>
          {trimmed.length < 2 ? (
            <Text style={styles.suggestLabel}>SUGGESTED</Text>
          ) : null}
          <FlatList
            data={users}
            keyExtractor={(u) => u.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => onSelect(item)}>
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
                  <Text style={styles.userHandle} numberOfLines={1}>
                    @{item.username ?? "—"}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={
              trimmed.length >= 2 && !search.isLoading ? (
                <Text style={styles.emptyText}>No users found</Text>
              ) : null
            }
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          />
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
    maxHeight: "82%",
    minHeight: 380,
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
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.18)",
    borderRadius: 12,
  },
  searchInput: { flex: 1, color: "#fff", fontFamily: "Inter_400Regular", fontSize: 14, padding: 0 },
  suggestLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(232,117,74,0.55)",
    letterSpacing: 1.8,
    marginLeft: 20,
    marginBottom: 6,
  },
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
  userHandle: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)", marginTop: 1 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.06)", marginLeft: 54 },
  emptyText: {
    textAlign: "center",
    paddingTop: 32,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.4)",
  },
});
