import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import { useCreatePost, useEnhancePost, useGetMe } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AISuggestModal from "@/components/AISuggestModal";
import { useColors } from "@/hooks/useColors";
import { pickAndUploadImage, isUploadAbortError, PermissionPermanentlyDeniedError } from "@/lib/image-upload";
import { API_BASE } from "../../lib/api-base";

type Mood = "motivational" | "professional" | "collaborative" | "creative";

const MOODS: { value: Mood; label: string; color: string }[] = [
  { value: "professional", label: "Professional", color: "#3B82F6" },
  { value: "motivational", label: "Motivational", color: "#E8754A" },
  { value: "collaborative", label: "Collaborative", color: "#10B981" },
  { value: "creative", label: "Creative", color: "#8B5CF6" },
];

const SCHEDULE_PRESETS = [
  { key: "1h", label: "In 1 hour", offsetMs: 60 * 60 * 1000 },
  { key: "3h", label: "In 3 hours", offsetMs: 3 * 60 * 60 * 1000 },
  { key: "tonight", label: "Tonight 8pm", offsetMs: 0, isTonight: true },
  { key: "tomorrow-9", label: "Tomorrow 9am", offsetMs: 0, isTomorrow9: true },
  { key: "tomorrow-noon", label: "Tomorrow noon", offsetMs: 0, isTomorrowNoon: true },
  { key: "next-week", label: "Next Monday 9am", offsetMs: 0, isNextMonday: true },
];

function getScheduleDate(preset: typeof SCHEDULE_PRESETS[number]): Date {
  const now = new Date();
  if (preset.isTonight) {
    const d = new Date(now);
    d.setHours(20, 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }
  if (preset.isTomorrow9) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  if (preset.isTomorrowNoon) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(12, 0, 0, 0);
    return d;
  }
  if (preset.isNextMonday) {
    const d = new Date(now);
    const daysUntilMon = (8 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMon);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  return new Date(now.getTime() + preset.offsetMs);
}

function formatScheduleLabel(d: Date): string {
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today ${time}`;
  if (isTomorrow) return `Tomorrow ${time}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + ` ${time}`;
}

export default function CreateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { getToken } = useAuth();
  const { data: me } = useGetMe();

  const [content, setContent] = useState("");
  const [mood, setMood] = useState<Mood>("professional");
  const [enhancing, setEnhancing] = useState(false);
  const [aiSuggestOpen, setAISuggestOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<Date | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [postAsAnonymous, setPostAsAnonymous] = useState(false);

  const createPost = useCreatePost();
  const enhancePost = useEnhancePost();

  const ghostModeOn = (me as any)?.ghostMode === true;
  const willPostAnon = ghostModeOn || postAsAnonymous;

  const handlePickImage = async (source: "library" | "camera") => {
    if (uploading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUploading(true);
    setUploadProgress(0);
    try {
      const url = await pickAndUploadImage(
        "wide",
        {
          apiBase: API_BASE,
          getToken,
          onProgress: setUploadProgress,
        },
        source,
      );
      if (url) {
        setImageUrl(url);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      if (isUploadAbortError(err)) return;
      if (err instanceof PermissionPermanentlyDeniedError) {
        Alert.alert("Permission needed", err.message);
      } else {
        Alert.alert("Upload failed", err instanceof Error ? err.message : "Try again.");
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleEnhance = async () => {
    if (!content.trim() || enhancing) return;
    try {
      setEnhancing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await enhancePost.mutateAsync({
        data: {
          content,
          tone: mood as "professional" | "casual" | "inspirational",
        },
      });
      if (result.enhancedContent) setContent(result.enhancedContent);
    } catch {
      // fail silently
    } finally {
      setEnhancing(false);
    }
  };

  const handlePost = async () => {
    if (!content.trim() || createPost.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await createPost.mutateAsync({
        data: {
          content,
          mood,
          ...(imageUrl ? { imageUrl } : {}),
          ...(willPostAnon ? { isAnonymous: true } : {}),
        } as any,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setContent("");
      setImageUrl(null);
      setPostAsAnonymous(false);
      setScheduledFor(null);
      if (scheduledFor) {
        router.replace("/scheduled");
      } else {
        router.replace("/(tabs)");
      }
    } catch {
      // error silently
    }
  };

  const canPost = content.trim().length > 0 && !createPost.isPending;
  const postBtnLabel = scheduledFor ? "Schedule" : "Post";

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
        <Text style={[styles.title, { color: colors.foreground }]}>New Post</Text>
        <TouchableOpacity
          onPress={handlePost}
          disabled={!canPost}
          style={[
            styles.postBtn,
            { backgroundColor: colors.primary, opacity: canPost ? 1 : 0.4 },
          ]}
        >
          {createPost.isPending ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text
              style={[styles.postBtnText, { color: colors.primaryForeground }]}
            >
              {postBtnLabel}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Platform.OS === "web" ? 84 : 100,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {scheduledFor && (
          <TouchableOpacity
            style={[styles.scheduleBanner, { borderColor: colors.primary + "55" }]}
            onPress={() => setScheduleOpen(true)}
          >
            <Ionicons name="time" size={14} color={colors.primary} />
            <Text style={[styles.scheduleBannerText, { color: colors.primary }]}>
              Will publish {formatScheduleLabel(scheduledFor)}
            </Text>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                setScheduledFor(null);
              }}
              hitSlop={10}
            >
              <Ionicons name="close-circle" size={16} color={colors.primary + "AA"} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        <View style={styles.moodRow}>
          {MOODS.map((m) => (
            <TouchableOpacity
              key={m.value}
              onPress={() => setMood(m.value)}
              style={[
                styles.moodChip,
                {
                  borderColor: mood === m.value ? m.color : colors.border,
                  backgroundColor:
                    mood === m.value ? m.color + "22" : "transparent",
                },
              ]}
            >
              <Text
                style={[
                  styles.moodChipText,
                  {
                    color:
                      mood === m.value ? m.color : colors.mutedForeground,
                  },
                ]}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={[
            styles.textInput,
            { color: colors.foreground, fontFamily: "Inter_400Regular" },
          ]}
          placeholder="What's on your mind?"
          placeholderTextColor={colors.mutedForeground}
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
          autoFocus
        />

        <Text
          style={[
            styles.charCount,
            {
              color:
                content.length > 900 ? colors.destructive : colors.mutedForeground,
            },
          ]}
        >
          {content.length}/1000
        </Text>

        {imageUrl && (
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: imageUrl }} style={styles.imagePreview} contentFit="cover" />
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                setImageUrl(null);
              }}
              style={styles.imageRemoveBtn}
              hitSlop={10}
            >
              <Ionicons name="close" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {uploading && (
          <View style={[styles.uploadProgress, { borderColor: colors.primary + "55" }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.uploadProgressText, { color: colors.primary }]}>
              Uploading… {uploadProgress}%
            </Text>
          </View>
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={() => handlePickImage("library")}
            disabled={uploading}
            style={[
              styles.actionPill,
              {
                borderColor: imageUrl ? colors.primary + "88" : colors.border,
                backgroundColor: imageUrl ? colors.primary + "11" : "transparent",
                opacity: uploading ? 0.5 : 1,
              },
            ]}
          >
            <Ionicons
              name={imageUrl ? "image" : "image-outline"}
              size={14}
              color={imageUrl ? colors.primary : colors.mutedForeground}
            />
            <Text
              style={[
                styles.actionPillText,
                { color: imageUrl ? colors.primary : colors.mutedForeground },
              ]}
            >
              {imageUrl ? "Photo added" : "Photo"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handlePickImage("camera")}
            disabled={uploading}
            style={[
              styles.actionPill,
              { borderColor: colors.border, opacity: uploading ? 0.5 : 1 },
            ]}
          >
            <Ionicons name="camera-outline" size={14} color={colors.mutedForeground} />
            <Text style={[styles.actionPillText, { color: colors.mutedForeground }]}>
              Camera
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              if (ghostModeOn) {
                Alert.alert(
                  "Ghost Mode is on",
                  "All your new posts are anonymous while Ghost Mode is enabled. Turn it off in Privacy settings to post normally.",
                );
                return;
              }
              setPostAsAnonymous((v) => !v);
            }}
            style={[
              styles.actionPill,
              {
                borderColor: willPostAnon ? colors.primary + "88" : colors.border,
                backgroundColor: willPostAnon ? colors.primary + "11" : "transparent",
              },
            ]}
          >
            <Ionicons
              name={willPostAnon ? "eye-off" : "eye-off-outline"}
              size={14}
              color={willPostAnon ? colors.primary : colors.mutedForeground}
            />
            <Text
              style={[
                styles.actionPillText,
                { color: willPostAnon ? colors.primary : colors.mutedForeground },
              ]}
            >
              {ghostModeOn ? "Ghost on" : willPostAnon ? "Anonymous" : "Anon"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.actionsRow, { marginBottom: 12 }]}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAISuggestOpen(true);
            }}
            style={[
              styles.actionPill,
              {
                borderColor: colors.primary + "55",
                backgroundColor: colors.primary + "11",
              },
            ]}
          >
            <Ionicons name="sparkles" size={14} color={colors.primary} />
            <Text style={[styles.actionPillText, { color: colors.primary }]}>
              AI Suggest
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setScheduleOpen(true);
            }}
            style={[
              styles.actionPill,
              {
                borderColor: scheduledFor ? colors.primary + "88" : colors.border,
                backgroundColor: scheduledFor
                  ? colors.primary + "11"
                  : "transparent",
              },
            ]}
          >
            <Ionicons
              name="time-outline"
              size={14}
              color={scheduledFor ? colors.primary : colors.mutedForeground}
            />
            <Text
              style={[
                styles.actionPillText,
                {
                  color: scheduledFor ? colors.primary : colors.mutedForeground,
                },
              ]}
            >
              {scheduledFor ? "Scheduled" : "Schedule"}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleEnhance}
          disabled={!content.trim() || enhancing}
          style={[
            styles.enhanceBtn,
            {
              borderColor: colors.primary + "55",
              backgroundColor: colors.primary + "11",
              opacity: !content.trim() ? 0.5 : 1,
            },
          ]}
        >
          {enhancing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
          )}
          <Text style={[styles.enhanceBtnText, { color: colors.primary }]}>
            {enhancing ? "Enhancing..." : "AI Enhance current text"}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <AISuggestModal
        visible={aiSuggestOpen}
        onClose={() => setAISuggestOpen(false)}
        onUseSuggestion={(text) => setContent(text)}
      />

      <Modal
        visible={scheduleOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setScheduleOpen(false)}
      >
        <View style={styles.scheduleBackdrop}>
          <View style={styles.scheduleSheet}>
            <View style={styles.scheduleHandle} />
            <View style={styles.scheduleHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="time" size={18} color={colors.primary} />
                <Text style={styles.scheduleTitle}>Schedule Post</Text>
              </View>
              <TouchableOpacity
                onPress={() => setScheduleOpen(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>
            <Text style={styles.scheduleSubtitle}>
              Choose when to publish. Posts queue and go live automatically.
            </Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {SCHEDULE_PRESETS.map((p) => {
                const d = getScheduleDate(p);
                const isSelected =
                  scheduledFor && Math.abs(scheduledFor.getTime() - d.getTime()) < 60000;
                return (
                  <TouchableOpacity
                    key={p.key}
                    style={[
                      styles.scheduleRow,
                      isSelected && {
                        borderColor: colors.primary,
                        backgroundColor: colors.primary + "11",
                      },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setScheduledFor(d);
                      setScheduleOpen(false);
                    }}
                  >
                    <View>
                      <Text style={styles.scheduleRowLabel}>{p.label}</Text>
                      <Text style={styles.scheduleRowSub}>
                        {formatScheduleLabel(d)}
                      </Text>
                    </View>
                    {isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={colors.primary}
                      />
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color="rgba(255,255,255,0.3)"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
              {scheduledFor && (
                <TouchableOpacity
                  style={[styles.clearScheduleBtn]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setScheduledFor(null);
                    setScheduleOpen(false);
                  }}
                >
                  <Ionicons name="close-circle-outline" size={14} color="#DC143C" />
                  <Text style={styles.clearScheduleText}>Clear schedule</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  postBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 4,
    minWidth: 70,
    alignItems: "center",
  },
  postBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  scheduleBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  scheduleBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  moodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  moodChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  moodChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  textInput: {
    fontSize: 16,
    lineHeight: 26,
    minHeight: 180,
  },
  charCount: {
    textAlign: "right",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  imagePreviewWrap: {
    position: "relative",
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(100,180,220,0.22)",
  },
  imagePreview: { width: "100%", height: 180 },
  imageRemoveBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadProgress: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  uploadProgressText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
  actionPillText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  enhanceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
  },
  enhanceBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  scheduleBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  scheduleSheet: {
    backgroundColor: "rgba(15,25,60,0.97)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: "rgba(100,180,220,0.22)",
    paddingHorizontal: 16,
    paddingBottom: 36,
  },
  scheduleHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center",
    marginVertical: 10,
  },
  scheduleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scheduleTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  scheduleSubtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    marginBottom: 16,
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(100,180,220,0.18)",
    backgroundColor: "rgba(8,18,48,0.5)",
    marginBottom: 8,
  },
  scheduleRowLabel: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  scheduleRowSub: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  clearScheduleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
  },
  clearScheduleText: {
    color: "#DC143C",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
