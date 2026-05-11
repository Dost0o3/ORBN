import { Ionicons } from "@expo/vector-icons";
import { useListNotifications, useMarkAllNotificationsRead } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import {
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
import AgentQueuePanel from "@/components/AgentQueuePanel";

const TYPE_ICONS: Record<string, string> = {
  like: "❤️",
  comment: "💬",
  follow: "👥",
  repost: "🔁",
  mention: "📣",
  job: "💼",
  agent_action: "🤖",
  chat_screenshot: "📸",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Avatar({ name, size = 40 }: { name?: string; size?: number }) {
  const colors = useColors();
  const initials = (name ?? "N")[0]?.toUpperCase() ?? "N";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "rgba(212,160,23,0.20)",
        borderWidth: 1,
        borderColor: `${colors.primary}33`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.primary, fontSize: size * 0.38, fontFamily: "Inter_700Bold" }}>
        {initials}
      </Text>
    </View>
  );
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data, refetch, isRefetching, isLoading } = useListNotifications({}, {});
  const markAll = useMarkAllNotificationsRead();

  // Resolve a deep-link target for a given notification row, or null when
  // the row is informational and shouldn't navigate. Mirrors the web
  // notifications page so the two stay in lockstep.
  const deepLinkFor = (item: any): { pathname: string; params?: Record<string, string> } | null => {
    const meta = item?.metadata && typeof item.metadata === "object" ? item.metadata : null;
    if (item?.type === "chat_screenshot" && meta?.conversationId) {
      return { pathname: "/messages/[conversationId]", params: { conversationId: String(meta.conversationId) } };
    }
    if ((item?.type === "report_actioned" || item?.type === "report_dismissed") && meta?.conversationId) {
      return { pathname: "/messages/[conversationId]", params: { conversationId: String(meta.conversationId) } };
    }
    if (item?.actorId && (item?.type === "follow" || item?.type === "mention")) {
      return { pathname: "/profile/[userId]", params: { userId: String(item.actorId) } };
    }
    return null;
  };

  const notifications = (data?.notifications ?? []) as any[];
  const unreadCount = data?.unreadCount ?? 0;

  const handleMarkAll = async () => {
    await markAll.mutateAsync();
    refetch();
  };

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isLast = index === notifications.length - 1;
    const link = deepLinkFor(item);
    const Wrap: any = link ? TouchableOpacity : View;
    const wrapProps = link
      ? {
          activeOpacity: 0.7,
          onPress: () => router.push({ pathname: link.pathname as any, params: link.params }),
        }
      : {};
    return (
      <Wrap
        {...wrapProps}
        style={[
          styles.notifRow,
          {
            borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
            borderBottomColor: `${colors.primary}18`,
            borderLeftWidth: !item.read ? 2 : 0,
            borderLeftColor: "#DC143C",
            backgroundColor: !item.read ? "rgba(220,20,60,0.04)" : "transparent",
          },
        ]}
      >
        <View style={styles.avatarWrap}>
          <Avatar name={item.actorName} size={40} />
          {!item.read && <View style={styles.unreadDot} />}
        </View>
        <View style={styles.notifContent}>
          <View style={styles.notifTop}>
            <Text style={styles.typeEmoji}>{TYPE_ICONS[item.type] ?? "🔔"}</Text>
            <Text style={[styles.notifMessage, { color: "rgba(255,255,255,0.75)" }]}>
              {item.message}
            </Text>
          </View>
          <Text style={[styles.notifTime, { color: "rgba(255,255,255,0.28)" }]}>
            {item.createdAt ? timeAgo(item.createdAt) : ""}
          </Text>
        </View>
      </Wrap>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            borderBottomColor: `${colors.primary}18`,
          },
        ]}
      >
        <View>
          <Text style={[styles.superLabel, { color: `${colors.primary}55` }]}>INTEL</Text>
          <Text style={[styles.headerTitle, { color: "#fff" }]}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={styles.unreadLabel}>{unreadCount} UNREAD</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity
            onPress={handleMarkAll}
            disabled={markAll.isPending}
            style={styles.markAllBtn}
          >
            <Ionicons name="checkmark-done" size={13} color={colors.primary} />
            <Text style={[styles.markAllText, { color: colors.primary }]}>Mark All Read</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(n) => String(n.id)}
        renderItem={renderItem}
        ListHeaderComponent={<AgentQueuePanel />}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 84 : 100 }}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={40} color="rgba(255,255,255,0.12)" />
              <Text style={styles.emptyTitle}>All Clear</Text>
              <Text style={styles.emptySubtitle}>Stay sharp. Notifications will appear here.</Text>
            </View>
          )
        }
        style={[styles.list, { backgroundColor: "transparent" }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  superLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 2, marginBottom: 2 },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  unreadLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#DC143C",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.30)",
    marginBottom: 2,
  },
  markAllText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  list: { flex: 1 },
  notifRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  avatarWrap: { position: "relative" },
  unreadDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#DC143C",
  },
  notifContent: { flex: 1 },
  notifTop: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  typeEmoji: { fontSize: 13, lineHeight: 20 },
  notifMessage: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  notifTime: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 4,
  },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 40, gap: 10 },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "rgba(255,255,255,0.25)",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.18)",
    textAlign: "center",
    lineHeight: 18,
  },

});
