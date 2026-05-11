import { Ionicons } from "@expo/vector-icons";
import {
  useGetDirectConversationMessages,
  useReportChatScreenshot,
  useSendDirectMessage,
  useGetMe,
  type DirectMessage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import * as ScreenCapture from "expo-screen-capture";
import React, { useState, useRef, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import ProfileActionsMenu from "@/components/ProfileActionsMenu";
import { API_BASE } from "../../lib/api-base";

const PRIMARY = "#E8754A";
const BORDER = "rgba(232,117,74,0.18)";

const TTL_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Off", value: null },
  { label: "1 min", value: 60 },
  { label: "1 hour", value: 3600 },
  { label: "24 hr", value: 86400 },
];

function ttlLabel(seconds: number | null): string {
  const o = TTL_OPTIONS.find((x) => x.value === seconds);
  return o?.label ?? "Off";
}

export default function ConversationDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { getToken } = useAuth();
  const params = useLocalSearchParams<{
    conversationId: string;
    peerName?: string;
    peerId?: string;
    peerAvatar?: string;
  }>();

  const isNewThread = params.conversationId === "new" || Number.isNaN(Number(params.conversationId));
  const conversationId = isNewThread ? -1 : Number(params.conversationId);
  const peerName = params.peerName ?? "Conversation";
  const peerAvatar = params.peerAvatar;
  const peerId = params.peerId ?? "";

  const [text, setText] = useState("");
  const [ttl, setTtl] = useState<number | null>(null);
  const [ttlSheetOpen, setTtlSheetOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [screenshotToast, setScreenshotToast] = useState(false);
  const listRef = useRef<FlatList<DirectMessage>>(null);

  const { data, isLoading, refetch } = useGetDirectConversationMessages(
    conversationId,
    undefined,
    {
      query: { enabled: !isNewThread && conversationId > 0, queryKey: ["dmMessages", conversationId] },
    },
  );
  const { data: me } = useGetMe();
  const messages = (data?.messages ?? []) as DirectMessage[];
  const myUserId = me?.id ?? "";
  const peerIdResolved = data?.peer?.id ?? peerId;

  const sendMutation = useSendDirectMessage();

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [messages.length]);

  // Notify the peer + bump our public counter when we screenshot a thread.
  // expo-screen-capture only fires on iOS / Android; on web this is a no-op.
  // Uses the generated TanStack Query mutation hook so the call goes through
  // the same auth/customFetch pipeline as every other API call.
  const reportScreenshot = useReportChatScreenshot();
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (isNewThread || conversationId <= 0) return;
    const sub = ScreenCapture.addScreenshotListener(() => {
      reportScreenshot.mutate(
        {
          data: {
            conversationId,
            platform: Platform.OS === "ios" ? "ios" : "android",
          },
        },
        {
          onSuccess: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            if (Platform.OS === "android") {
              ToastAndroid.show(
                `Screenshot reported — ${peerName} was notified`,
                ToastAndroid.LONG,
              );
            } else {
              setScreenshotToast(true);
              setTimeout(() => setScreenshotToast(false), 3500);
            }
          },
          // onError: silent — the user already has the screenshot,
          // we just couldn't tattle.
        },
      );
    });
    return () => sub.remove();
  }, [conversationId, isNewThread, peerName, reportScreenshot]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !peerIdResolved || sendMutation.isPending) return;
    setText("");
    try {
      const result = (await sendMutation.mutateAsync({
        data: {
          recipientId: peerIdResolved,
          content: trimmed,
          ...(ttl !== null ? { ttlSeconds: ttl } : {}),
        } as any,
      })) as DirectMessage | undefined;
      qc.invalidateQueries({ queryKey: ["listDirectConversations"] });
      if (isNewThread && result?.conversationId && result.conversationId > 0) {
        router.replace({
          pathname: "/messages/[conversationId]",
          params: {
            conversationId: String(result.conversationId),
            peerName,
            peerId: peerIdResolved,
            ...(peerAvatar ? { peerAvatar } : {}),
          },
        });
      } else if (!isNewThread) {
        refetch();
      }
    } catch (err) {
      setText(trimmed); // Restore on failure
      // Surface the actual reason so the user can act on it instead of
      // staring at a generic "try again" forever. The mutation throws
      // ApiError (with .status) on non-2xx; everything else (network
      // drop, JSON parse, etc.) falls through to the generic message.
      const status = (err as { status?: number } | undefined)?.status;
      let title = "Couldn't send";
      let body = "Try again in a moment.";
      if (status === 401) {
        title = "Session expired";
        body = "You've been signed out. Please sign in again to keep chatting.";
      } else if (status === 403) {
        title = "Message blocked";
        body = "You can't send messages to this person right now.";
      } else if (status === 404) {
        title = "User not found";
        body = "This account no longer exists.";
      } else if (status === 429) {
        title = "Slow down";
        body = "You're sending messages too quickly. Try again in a minute.";
      } else if (status && status >= 500) {
        title = "Server hiccup";
        body = "Our servers had a glitch. Please try again shortly.";
      } else if (status === undefined) {
        title = "No connection";
        body = "Check your internet and try again.";
      }
      Alert.alert(title, body);
    }
  };

  const handleThreadAction = (kind: "block" | "report" | "clear") => {
    setHeaderMenuOpen(false);
    if (kind === "clear") {
      if (isNewThread) {
        Alert.alert("Nothing to clear", "Send a message first to start this conversation.");
        return;
      }
      Alert.alert("Clear conversation?", "All messages on your side will be hidden.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await getToken();
              await fetch(`${API_BASE}/api/messages/${conversationId}`, {
                method: "DELETE",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
              qc.invalidateQueries({ queryKey: ["listDirectConversations"] });
              router.back();
            } catch {
              Alert.alert("Couldn't clear", "Try again in a moment.");
            }
          },
        },
      ]);
      return;
    }
    setTimeout(() => setActionsOpen(true), 220);
  };

  const renderMessage = ({ item }: { item: DirectMessage }) => {
    const isMine = myUserId ? item.senderId === myUserId : item.senderId !== peerIdResolved;
    const expired = item.expired;
    return (
      <View style={[styles.messageRow, isMine ? styles.myRow : styles.peerRow]}>
        <View
          style={[
            styles.bubble,
            isMine ? styles.myBubble : styles.peerBubble,
            expired && styles.expiredBubble,
          ]}
        >
          <Text style={[styles.bubbleText, isMine && styles.myBubbleText, expired && styles.expiredText]}>
            {expired ? "[ message self-destructed ]" : item.content}
          </Text>
          {!expired && (item as any).expiresAt ? (
            <Text style={[styles.metaTimer, isMine && { color: "rgba(0,0,0,0.45)" }]}>
              <Ionicons name="time-outline" size={9} color={isMine ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.4)"} />{" "}
              expires {new Date((item as any).expiresAt).toLocaleString()}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {screenshotToast && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: insets.top + 60,
            left: 16,
            right: 16,
            zIndex: 50,
            backgroundColor: "rgba(220,20,60,0.95)",
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 }}>
            Screenshot reported — {peerName} was notified
          </Text>
        </View>
      )}
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "web" ? 20 : insets.top + 12 },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        {peerAvatar ? (
          <Image source={{ uri: peerAvatar }} style={styles.headerAvatar} contentFit="cover" />
        ) : (
          <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
            <Text style={styles.headerAvatarText}>{peerName[0]?.toUpperCase() ?? "?"}</Text>
          </View>
        )}
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => peerIdResolved && router.push({ pathname: "/profile/[userId]", params: { userId: peerIdResolved } })}
        >
          <Text style={styles.headerTitle} numberOfLines={1}>{peerName}</Text>
          <Text style={styles.headerSub}>End-to-end · {ttlLabel(ttl)} TTL</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setHeaderMenuOpen(true)} hitSlop={10} style={styles.threadMenuBtn}>
          <Ionicons name="ellipsis-horizontal" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>

      {isLoading && !isNewThread ? (
        <View style={styles.loader}>
          <ActivityIndicator color={PRIMARY} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          renderItem={renderMessage}
          contentContainerStyle={{ padding: 16, gap: 6 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{isNewThread ? "Start the conversation" : "No messages yet"}</Text>
              <Text style={styles.emptySubtext}>Send the first message below</Text>
            </View>
          }
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setTtlSheetOpen(true);
          }}
          style={[styles.ttlChip, ttl !== null && styles.ttlChipActive]}
          hitSlop={8}
        >
          <Ionicons name="time-outline" size={13} color={ttl !== null ? PRIMARY : "rgba(255,255,255,0.45)"} />
          <Text style={[styles.ttlChipText, ttl !== null && { color: PRIMARY }]}>{ttlLabel(ttl)}</Text>
        </TouchableOpacity>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.input}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!text.trim() || sendMutation.isPending}
          style={[styles.sendBtn, (!text.trim() || sendMutation.isPending) && styles.sendBtnDisabled]}
        >
          <Ionicons name="arrow-up" size={18} color="#000" />
        </TouchableOpacity>
      </View>

      {/* TTL picker sheet */}
      <Modal visible={ttlSheetOpen} transparent animationType="fade" onRequestClose={() => setTtlSheetOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setTtlSheetOpen(false)}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.handleBar} />
            <Text style={styles.sheetTitle}>Self-destruct timer</Text>
            <Text style={styles.sheetSub}>Messages auto-delete after this duration.</Text>
            {TTL_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={styles.ttlRow}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setTtl(opt.value);
                  setTtlSheetOpen(false);
                }}
              >
                <Ionicons
                  name={ttl === opt.value ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={ttl === opt.value ? PRIMARY : "rgba(255,255,255,0.4)"}
                />
                <Text style={[styles.ttlRowText, ttl === opt.value && { color: "#fff" }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Header overflow menu */}
      <Modal visible={headerMenuOpen} transparent animationType="fade" onRequestClose={() => setHeaderMenuOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setHeaderMenuOpen(false)}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.handleBar} />
            <TouchableOpacity style={styles.actionRow} onPress={() => handleThreadAction("report")}>
              <Ionicons name="flag-outline" size={18} color="rgba(255,255,255,0.85)" />
              <Text style={styles.actionRowText}>Report user</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.actionRow} onPress={() => handleThreadAction("block")}>
              <Ionicons name="ban-outline" size={18} color="#DC143C" />
              <Text style={[styles.actionRowText, { color: "#DC143C" }]}>Block user</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.actionRow} onPress={() => handleThreadAction("clear")}>
              <Ionicons name="trash-outline" size={18} color="#DC143C" />
              <Text style={[styles.actionRowText, { color: "#DC143C" }]}>Clear conversation</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={[styles.actionRow, { justifyContent: "center" }]} onPress={() => setHeaderMenuOpen(false)}>
              <Text style={[styles.actionRowText, { color: "rgba(255,255,255,0.55)" }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {peerIdResolved ? (
        <ProfileActionsMenu
          visible={actionsOpen}
          onClose={() => setActionsOpen(false)}
          userId={peerIdResolved}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  headerAvatar: { width: 36, height: 36, borderRadius: 18 },
  headerAvatarFallback: {
    backgroundColor: "rgba(232,117,74,0.12)",
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarText: { fontSize: 14, fontFamily: "Inter_700Bold", color: PRIMARY },
  headerTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.3 },
  headerSub: { fontSize: 9, fontFamily: "Inter_500Medium", color: "rgba(232,117,74,0.55)", letterSpacing: 1, marginTop: 1 },
  threadMenuBtn: { padding: 4 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  messageRow: { flexDirection: "row", marginVertical: 2 },
  myRow: { justifyContent: "flex-end" },
  peerRow: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  myBubble: { backgroundColor: PRIMARY, borderBottomRightRadius: 4 },
  peerBubble: {
    backgroundColor: "rgba(15,25,60,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderBottomLeftRadius: 4,
  },
  expiredBubble: { backgroundColor: "rgba(0,0,0,0.4)", borderColor: "rgba(255,255,255,0.05)" },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.92)", lineHeight: 19 },
  myBubbleText: { color: "#000", fontFamily: "Inter_500Medium" },
  expiredText: { color: "rgba(255,255,255,0.3)", fontStyle: "italic", fontSize: 12 },
  metaTimer: { fontSize: 9, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)", marginTop: 3 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    backgroundColor: "rgba(11,24,40,0.85)",
  },
  ttlChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.3)",
    marginBottom: 1,
  },
  ttlChipActive: { borderColor: PRIMARY + "55", backgroundColor: PRIMARY + "12" },
  ttlChipText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.55)", letterSpacing: 0.5 },
  input: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.18)",
    color: "#fff",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 18,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  empty: { paddingTop: 60, alignItems: "center", gap: 4 },
  emptyText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.4)" },
  emptySubtext: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.3)" },

  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "rgba(11,24,40,0.98)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: "rgba(232,117,74,0.25)",
    paddingTop: 8,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  sheetSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.45)",
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 12,
  },
  ttlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  ttlRowText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.7)" },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  actionRowText: { fontSize: 15, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.9)" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.08)" },
});
