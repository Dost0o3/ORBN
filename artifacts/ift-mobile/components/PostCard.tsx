import { Ionicons } from "@expo/vector-icons";
import {
  useLikePost,
  useUnlikePost,
  useRepostPost,
  useGetPostComments,
  useCreateComment,
  useDeletePost,
  useBlockUser,
  useReportUser,
  useGetMe,
  type Post,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const MOOD_COLORS: Record<string, string> = {
  motivational: "#E8754A",
  professional: "#5B8CFF",
  collaborative: "#34D399",
  creative: "#A78BFA",
};

const GLASS_BG = "rgba(15,25,60,0.38)";
const GLASS_BORDER = "rgba(100,180,220,0.22)";
const GLASS_SHINE = "rgba(160,220,255,0.07)";
const IOS_CARD_TINT = "dark";
const IOS_SHEET_TINT = "dark";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function Avatar({
  name,
  avatarUrl,
  size = 40,
  onPress,
  ringColor,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  onPress?: () => void;
  ringColor?: string;
}) {
  const colors = useColors();
  const initials = name
    .split(" ")
    .map((n) => n[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const inner = avatarUrl ? (
    <Image
      source={{ uri: avatarUrl }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "rgba(30,40,100,0.8)",
        borderWidth: 1,
        borderColor: (ringColor ?? colors.primary) + "55",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: ringColor ?? colors.primary, fontSize: size * 0.36, fontFamily: "Inter_700Bold" }}>
        {initials || "?"}
      </Text>
    </View>
  );

  const withRing = ringColor ? (
    <View
      style={{
        padding: 2,
        borderRadius: (size + 6) / 2,
        borderWidth: 2,
        borderColor: ringColor + "77",
        shadowColor: ringColor,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 6,
      }}
    >
      {inner}
    </View>
  ) : inner;

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
        {withRing}
      </TouchableOpacity>
    );
  }
  return withRing;
}

function CommentSheet({
  post,
  visible,
  onClose,
  onCommentAdded,
}: {
  post: Post;
  visible: boolean;
  onClose: () => void;
  onCommentAdded: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [anonComment, setAnonComment] = useState(false);
  const { data, refetch, isLoading } = useGetPostComments(post.id, undefined, {
    query: { enabled: visible, queryKey: ["comments", post.id] },
  });
  const createComment = useCreateComment();
  const comments = (data?.comments ?? []) as any[];

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || createComment.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await createComment.mutateAsync({
        postId: post.id,
        data: { content: trimmed, isAnonymous: anonComment },
      });
      setText("");
      setAnonComment(false);
      refetch();
      onCommentAdded();
    } catch {}
  };

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ paddingBottom: insets.bottom }}
      >
        <BlurView
          intensity={Platform.OS === "ios" ? 70 : 85}
          tint={IOS_SHEET_TINT as any}
          style={styles.sheetContainer}
        >
          <View style={styles.glassShine} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Comments</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.commentsList} keyboardShouldPersistTaps="handled">
            {isLoading && (
              <View style={styles.commentLoading}>
                <ActivityIndicator color={colors.primary} size="small" />
              </View>
            )}
            {!isLoading && comments.length === 0 && (
              <Text style={[styles.noComments, { color: colors.mutedForeground }]}>
                No comments yet. Be first.
              </Text>
            )}
            {comments.map((c: any) => {
              const isAnon = c.isAnonymous === true;
              const authorName = isAnon ? "Anonymous" : (c.author?.displayName ?? "Member");
              const initials = authorName
                .split(" ")
                .map((n: string) => n[0] ?? "")
                .slice(0, 2)
                .join("")
                .toUpperCase();
              return (
                <View
                  key={c.id}
                  style={[styles.commentRow, { borderBottomColor: GLASS_BORDER }]}
                >
                  {!isAnon && c.author?.avatarUrl ? (
                    <Image
                      source={{ uri: c.author.avatarUrl }}
                      style={{ width: 32, height: 32, borderRadius: 16 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.commentAvatarFallback}>
                      <Text style={[styles.commentAvatarText, { color: isAnon ? colors.mutedForeground : colors.primary }]}>
                        {isAnon ? "?" : initials}
                      </Text>
                    </View>
                  )}
                  <View style={styles.commentBubble}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[styles.commentAuthor, { color: colors.foreground }]}>{authorName}</Text>
                      {isAnon && (
                        <Ionicons name="eye-off" size={11} color={colors.mutedForeground} />
                      )}
                    </View>
                    <Text style={[styles.commentContent, { color: colors.secondaryForeground }]}>{c.content}</Text>
                    <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>
                      {timeAgo(c.createdAt ?? new Date().toISOString())}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={[styles.anonToggle, { borderColor: anonComment ? colors.primary + "88" : GLASS_BORDER }]}
            onPress={() => {
              Haptics.selectionAsync();
              setAnonComment((v) => !v);
            }}
          >
            <Ionicons
              name={anonComment ? "eye-off" : "eye-off-outline"}
              size={14}
              color={anonComment ? colors.primary : colors.mutedForeground}
            />
            <Text
              style={[
                styles.anonToggleText,
                { color: anonComment ? colors.primary : colors.mutedForeground },
              ]}
            >
              {anonComment ? "Posting anonymously" : "Comment anonymously"}
            </Text>
          </TouchableOpacity>

          <View style={[styles.commentInputRow, { borderTopColor: GLASS_BORDER }]}>
            <TextInput
              style={[styles.commentInput, { color: colors.foreground }]}
              placeholder={anonComment ? "Write anonymously…" : "Write a comment…"}
              placeholderTextColor={colors.mutedForeground}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              onPress={submit}
              disabled={!text.trim() || createComment.isPending}
              style={[styles.commentSend, { opacity: text.trim() ? 1 : 0.35 }]}
            >
              {createComment.isPending ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Ionicons name="send" size={18} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>
        </BlurView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PostMenuSheet({
  visible,
  onClose,
  isOwnPost,
  authorName,
  onDelete,
  onBlock,
  onReport,
}: {
  visible: boolean;
  onClose: () => void;
  isOwnPost: boolean;
  authorName: string;
  onDelete: () => void;
  onBlock: () => void;
  onReport: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.menuSheetWrap, { paddingBottom: insets.bottom + 12 }]}>
        <BlurView
          intensity={Platform.OS === "ios" ? 80 : 95}
          tint={IOS_SHEET_TINT as any}
          style={styles.menuSheet}
        >
          <View style={styles.sheetHandle} />
          {isOwnPost ? (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                onClose();
                onDelete();
              }}
            >
              <Ionicons name="trash-outline" size={20} color={colors.destructive} />
              <Text style={[styles.menuItemText, { color: colors.destructive }]}>Delete post</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  onClose();
                  onReport();
                }}
              >
                <Ionicons name="flag-outline" size={20} color={colors.foreground} />
                <Text style={[styles.menuItemText, { color: colors.foreground }]}>Report post</Text>
              </TouchableOpacity>
              <View style={[styles.menuDivider, { backgroundColor: GLASS_BORDER }]} />
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  onClose();
                  onBlock();
                }}
              >
                <Ionicons name="ban-outline" size={20} color={colors.destructive} />
                <Text style={[styles.menuItemText, { color: colors.destructive }]}>
                  Block {authorName}
                </Text>
              </TouchableOpacity>
            </>
          )}
          <View style={[styles.menuDivider, { backgroundColor: GLASS_BORDER }]} />
          <TouchableOpacity style={styles.menuItem} onPress={onClose}>
            <Ionicons name="close-circle-outline" size={20} color={colors.mutedForeground} />
            <Text style={[styles.menuItemText, { color: colors.mutedForeground }]}>Cancel</Text>
          </TouchableOpacity>
        </BlurView>
      </View>
    </Modal>
  );
}

interface Props {
  post: Post;
}

export default function PostCard({ post }: Props) {
  const colors = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useGetMe();
  const [liked, setLiked] = useState(post.isLiked ?? false);
  const [likeCount, setLikeCount] = useState(post.likesCount ?? 0);
  const [repostCount, setRepostCount] = useState(post.repostsCount ?? 0);
  const [commentCount, setCommentCount] = useState(post.commentsCount ?? 0);
  const [commentOpen, setCommentOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  const likePost = useLikePost();
  const unlikePost = useUnlikePost();
  const repostPost = useRepostPost();
  const deletePost = useDeletePost();
  const blockUser = useBlockUser();
  const reportUser = useReportUser();

  const moodColor = MOOD_COLORS[post.mood ?? "professional"] ?? colors.primary;
  const isAnonymous = post.isAnonymous === true;
  const authorName = isAnonymous ? "Anonymous" : (post.author?.displayName ?? "IFT Member");
  const authorHandle = isAnonymous ? null : (post.author?.username ? `@${post.author.username}` : null);
  const authorId = isAnonymous ? null : post.author?.id;
  const isOwnPost = !!me?.id && !!post.author?.id && me.id === post.author.id;

  const goToProfile = () => {
    if (!authorId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/profile/${authorId}` as any);
  };

  const toggleLike = async () => {
    const prevLiked = liked;
    const prevCount = likeCount;
    try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (liked) {
      setLiked(false);
      setLikeCount((c) => Math.max(0, c - 1));
      await unlikePost.mutateAsync({ postId: post.id });
    } else {
      setLiked(true);
      setLikeCount((c) => c + 1);
      await likePost.mutateAsync({ postId: post.id });
    }
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
    }
  };

  const handleRepost = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRepostCount((c) => c + 1);
    repostPost.mutateAsync({ postId: post.id });
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete post?",
      "This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setHidden(true);
              await deletePost.mutateAsync({ postId: post.id });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              qc.invalidateQueries({ queryKey: ["getFeed"] });
              qc.invalidateQueries({ queryKey: ["getUserPosts"] });
            } catch {
              setHidden(false);
              Alert.alert("Couldn't delete", "Try again in a moment.");
            }
          },
        },
      ],
    );
  };

  const confirmBlock = () => {
    if (!authorId) return;
    Alert.alert(
      `Block ${authorName}?`,
      "You won't see their posts and they won't see yours.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              setHidden(true);
              await blockUser.mutateAsync({ userId: authorId });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              qc.invalidateQueries({ queryKey: ["getFeed"] });
            } catch {
              setHidden(false);
              Alert.alert("Couldn't block", "Try again in a moment.");
            }
          },
        },
      ],
    );
  };

  const promptReport = () => {
    if (!authorId) return;
    Alert.alert(
      "Report this post?",
      "Our team will review it. Thanks for keeping the network clean.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Report spam",
          onPress: () => sendReport("spam"),
        },
        {
          text: "Report abuse",
          style: "destructive",
          onPress: () => sendReport("abuse"),
        },
      ],
    );
  };

  const sendReport = async (reason: "spam" | "abuse") => {
    if (!authorId) return;
    try {
      await reportUser.mutateAsync({
        userId: authorId,
        data: { reason, postId: post.id } as any,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Reported", "Thanks — we'll take a look.");
    } catch {
      Alert.alert("Couldn't report", "Try again in a moment.");
    }
  };

  if (hidden) return null;

  return (
    <>
      <View style={styles.cardShadow}>
        <BlurView
          intensity={Platform.OS === "ios" ? 40 : 55}
          tint={IOS_CARD_TINT as any}
          style={styles.card}
        >
          <View style={styles.glassShine} />
          <View style={[styles.moodAccentTop, { backgroundColor: moodColor }]} />

          <View style={styles.cardHeader}>
            <Avatar
              name={authorName}
              avatarUrl={post.author?.avatarUrl}
              onPress={goToProfile}
              ringColor={moodColor}
            />
            <TouchableOpacity style={styles.authorInfo} onPress={goToProfile} activeOpacity={0.75}>
              <Text style={[styles.authorName, { color: colors.foreground }]}>{authorName}</Text>
              <View style={styles.metaRow}>
                {authorHandle ? (
                  <Text style={[styles.handle, { color: colors.mutedForeground }]}>{authorHandle}</Text>
                ) : null}
                {authorHandle ? (
                  <Text style={[styles.dot, { color: colors.mutedForeground }]}>·</Text>
                ) : null}
                <Text style={[styles.time, { color: colors.mutedForeground }]}>
                  {timeAgo(post.createdAt ?? new Date().toISOString())}
                </Text>
              </View>
            </TouchableOpacity>
            {post.mood ? (
              <View style={[styles.moodBadge, { borderColor: moodColor + "44", backgroundColor: moodColor + "18" }]}>
                <Text style={[styles.moodText, { color: moodColor }]}>{post.mood}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setMenuOpen(true);
              }}
              hitSlop={10}
              style={styles.moreBtn}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.content, { color: colors.foreground }]}>{post.content}</Text>

          {post.imageUrl ? (
            <Image source={{ uri: post.imageUrl }} style={styles.postImage} contentFit="cover" />
          ) : null}

          {(likeCount > 0 || commentCount > 0) && (
            <View style={[styles.socialProof, { borderTopColor: GLASS_BORDER }]}>
              <Text style={[styles.socialProofText, { color: colors.mutedForeground }]}>
                {likeCount > 0 && (
                  <Text>
                    <Text style={{ color: liked ? colors.destructive : colors.mutedForeground }}>❤</Text>
                    {` ${likeCount}`}
                  </Text>
                )}
                {likeCount > 0 && commentCount > 0 ? "  ·  " : ""}
                {commentCount > 0 ? `${commentCount} comment${commentCount !== 1 ? "s" : ""}` : ""}
                {repostCount > 0 ? `  ·  ${repostCount} repost${repostCount !== 1 ? "s" : ""}` : ""}
              </Text>
            </View>
          )}

          <View style={[styles.actionDivider, { backgroundColor: GLASS_BORDER }]} />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={toggleLike}>
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={20}
                color={liked ? colors.destructive : colors.mutedForeground}
              />
              {likeCount > 0 && (
                <Text style={[styles.actionCount, { color: liked ? colors.destructive : colors.mutedForeground }]}>
                  {likeCount}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCommentOpen(true);
              }}
            >
              <Ionicons name="chatbubble-outline" size={19} color={colors.mutedForeground} />
              {commentCount > 0 && (
                <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{commentCount}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={handleRepost}>
              <Ionicons name="repeat-outline" size={21} color={colors.mutedForeground} />
              {repostCount > 0 && (
                <Text style={[styles.actionCount, { color: colors.mutedForeground }]}>{repostCount}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn}>
              <Ionicons name="paper-plane-outline" size={19} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </BlurView>
      </View>

      <CommentSheet
        post={post}
        visible={commentOpen}
        onClose={() => setCommentOpen(false)}
        onCommentAdded={() => setCommentCount((c) => c + 1)}
      />
      <PostMenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        isOwnPost={isOwnPost}
        authorName={authorName}
        onDelete={confirmDelete}
        onBlock={confirmBlock}
        onReport={promptReport}
      />
    </>
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: "hidden",
    backgroundColor: GLASS_BG,
  },
  glassShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: GLASS_SHINE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  moodAccentTop: { height: 2, width: "100%", opacity: 0.75 },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    paddingBottom: 10,
  },
  authorInfo: { flex: 1 },
  authorName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  handle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  dot: { fontSize: 12 },
  time: { fontSize: 12, fontFamily: "Inter_400Regular" },
  moodBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  moodText: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  moreBtn: { padding: 4, marginLeft: 2 },
  content: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  postImage: { width: "100%", height: 210 },
  socialProof: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  socialProofText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  actionDivider: { height: StyleSheet.hairlineWidth },
  actions: { flexDirection: "row", paddingHorizontal: 6, paddingVertical: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
  },
  actionCount: { fontSize: 12, fontFamily: "Inter_500Medium" },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheetContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: "hidden",
    maxHeight: "78%",
    backgroundColor: GLASS_BG,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GLASS_BORDER,
    gap: 12,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    position: "absolute",
    top: 8,
    alignSelf: "center",
    left: "50%",
    marginLeft: -18,
  },
  sheetTitle: { flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "center" },
  commentsList: { maxHeight: 340, paddingHorizontal: 16 },
  commentLoading: { paddingVertical: 24, alignItems: "center" },
  noComments: {
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    paddingVertical: 32,
  },
  commentRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(30,40,100,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  commentAvatarText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  commentBubble: { flex: 1 },
  commentAuthor: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  commentContent: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  commentTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  anonToggle: {
    marginHorizontal: 16,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  anonToggleText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 20,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxHeight: 100,
  },
  commentSend: { padding: 8 },

  menuSheetWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
  },
  menuSheet: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: "hidden",
    paddingTop: 18,
    paddingBottom: 8,
    backgroundColor: GLASS_BG,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
  menuItemText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  menuDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 22 },
});
