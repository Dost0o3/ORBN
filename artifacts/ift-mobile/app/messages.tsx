import { Ionicons } from "@expo/vector-icons";
import {
  useListDirectConversations,
  type DirectConversationSummary,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import NewMessageSheet from "@/components/NewMessageSheet";
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
import { Image } from "expo-image";

const PRIMARY = "#E8754A";
const BORDER = "rgba(232,117,74,0.18)";
const CARD_BG = "rgba(15,25,60,0.42)";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

function ConversationRow({ item, onPress }: { item: DirectConversationSummary; onPress: () => void }) {
  const peerName = item.peer.displayName ?? item.peer.username ?? "Unknown";
  const initial = peerName[0]?.toUpperCase() ?? "?";
  const lastText = item.lastMessage?.expired
    ? "[ message self-destructed ]"
    : item.lastMessage?.content ?? "No messages yet";

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      {item.peer.avatarUrl ? (
        <Image source={{ uri: item.peer.avatarUrl }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowTop}>
          <Text style={styles.peerName} numberOfLines={1}>{peerName}</Text>
          <Text style={styles.timeText}>{timeAgo(item.lastMessageAt)}</Text>
        </View>
        <View style={styles.rowBottom}>
          <Text
            style={[styles.preview, item.unreadCount > 0 && styles.previewUnread]}
            numberOfLines={1}
          >
            {lastText}
          </Text>
          {item.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useListDirectConversations();
  const [composeOpen, setComposeOpen] = useState(false);

  const conversations = (data?.conversations ?? []) as DirectConversationSummary[];

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
          <Text style={styles.superLabel}>DIRECT · ENCRYPTED</Text>
          <Text style={styles.headerTitle}>MESSAGES</Text>
        </View>
        <TouchableOpacity onPress={() => setComposeOpen(true)} hitSlop={12} style={styles.newBtn}>
          <Ionicons name="create-outline" size={16} color={PRIMARY} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={PRIMARY} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => String(c.id)}
          renderItem={({ item }) => (
            <ConversationRow
              item={item}
              onPress={() =>
                router.push({
                  pathname: "/messages/[conversationId]",
                  params: {
                    conversationId: String(item.id),
                    peerName: item.peer.displayName ?? item.peer.username ?? "Unknown",
                    peerId: item.peer.id,
                    peerAvatar: item.peer.avatarUrl ?? "",
                  },
                })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: Math.max(insets.bottom + 20, 40),
          }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={PRIMARY} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={36} color="rgba(255,255,255,0.18)" />
              <Text style={styles.emptyText}>No conversations yet</Text>
              <Text style={styles.emptySubtext}>Connect with operators to start a thread</Text>
            </View>
          }
        />
      )}
      <NewMessageSheet
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSelect={(u) => {
          setComposeOpen(false);
          router.push({
            pathname: "/messages/[conversationId]",
            params: {
              conversationId: "new",
              peerId: u.id,
              peerName: u.displayName ?? u.username ?? "Operator",
              peerAvatar: u.avatarUrl ?? "",
            },
          });
        }}
      />
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
  newBtn: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    alignItems: "center", justifyContent: "center",
  },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD_BG,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  separator: { height: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    backgroundColor: "rgba(232,117,74,0.12)",
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: PRIMARY },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  peerName: { fontSize: 14, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.92)", flex: 1, marginRight: 8 },
  timeText: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.4)" },
  rowBottom: { flexDirection: "row", alignItems: "center", marginTop: 3, gap: 8 },
  preview: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", flex: 1 },
  previewUnread: { color: "rgba(255,255,255,0.85)", fontFamily: "Inter_500Medium" },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#000" },
  empty: { paddingTop: 80, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.5)", letterSpacing: 0.5 },
  emptySubtext: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.3)" },
});
