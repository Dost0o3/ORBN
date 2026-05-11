import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import { useGetMe, useUpdateMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { API_BASE } from "../lib/api-base";
import {
  pickAndUploadImage,
  PermissionPermanentlyDeniedError,
  isUploadAbortError,
  type UploadAspect,
  type UploadSource,
} from "@/lib/image-upload";

interface Field {
  key: keyof FormState;
  label: string;
  placeholder: string;
  multiline?: boolean;
  hint?: string;
  autoCapitalize?: "none" | "sentences" | "words";
}

interface FormState {
  displayName: string;
  username: string;
  occupation: string;
  bio: string;
  location: string;
  website: string;
  gender: string;
  phone: string;
  email: string;
  avatarUrl: string;
  coverUrl: string;
}

const FIELDS: Field[] = [
  { key: "displayName", label: "Display Name", placeholder: "Your full name", autoCapitalize: "words" },
  { key: "username", label: "Username", placeholder: "username", hint: "3–30 chars · lowercase, numbers, _ only", autoCapitalize: "none" },
  { key: "occupation", label: "Occupation / Title", placeholder: "e.g. Product Designer at Acme", autoCapitalize: "words" },
  { key: "bio", label: "Bio", placeholder: "What's your angle?", multiline: true, autoCapitalize: "sentences" },
  { key: "location", label: "Location", placeholder: "City, Country", autoCapitalize: "words" },
  { key: "website", label: "Website", placeholder: "https://yoursite.com", autoCapitalize: "none" },
  { key: "gender", label: "Gender", placeholder: "Optional", autoCapitalize: "sentences" },
  { key: "phone", label: "Phone", placeholder: "Private · not shown publicly", autoCapitalize: "none" },
  { key: "email", label: "Email", placeholder: "Private · not shown publicly", autoCapitalize: "none", hint: "Stored privately — not shown on your public profile" },
];

export default function EditProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const { data: me } = useGetMe();
  const updateMe = useUpdateMe();

  const [form, setForm] = useState<FormState>({
    displayName: "",
    username: "",
    occupation: "",
    bio: "",
    location: "",
    website: "",
    gender: "",
    phone: "",
    email: "",
    avatarUrl: "",
    coverUrl: "",
  });

  const [uploading, setUploading] = useState<UploadAspect | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  // Held in a ref (not state) so the cancel handler can read the
  // current controller synchronously without re-renders.
  const uploadAbortRef = useRef<AbortController | null>(null);

  const cancelUpload = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    uploadAbortRef.current?.abort();
  };

  useEffect(() => {
    if (me) {
      setForm({
        displayName: me.displayName ?? "",
        username: me.username ?? "",
        occupation: me.occupation ?? "",
        bio: me.bio ?? "",
        location: me.location ?? "",
        website: me.website ?? "",
        gender: me.gender ?? "",
        phone: me.phone ?? "",
        email: (me as any).email ?? "",
        avatarUrl: me.avatarUrl ?? "",
        coverUrl: me.coverUrl ?? "",
      });
    }
  }, [me?.id]);

  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const payload = {
        ...form,
        avatarUrl: form.avatarUrl ? form.avatarUrl : null,
        coverUrl: form.coverUrl ? form.coverUrl : null,
      };
      await updateMe.mutateAsync({ data: payload as any });
      qc.invalidateQueries({ queryKey: ["getMe"] });
      qc.invalidateQueries();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Save Failed", "Could not update your profile. Please try again.");
    }
  };

  const runUpload = async (aspect: UploadAspect, source: UploadSource) => {
    if (uploading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUploading(aspect);
    setUploadProgress(null);
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    try {
      const url = await pickAndUploadImage(
        aspect,
        {
          apiBase: API_BASE,
          getToken: async () => (await getTokenRef.current()) ?? null,
          onProgress: (p) => setUploadProgress(p),
          signal: controller.signal,
        },
        source,
      );
      if (url) {
        setForm((f) => ({
          ...f,
          ...(aspect === "square" ? { avatarUrl: url } : { coverUrl: url }),
        }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      // User-initiated cancel: silently return the editor to its idle
      // state without changing the saved avatar/cover and without an
      // error alert. The form already holds the previous URL.
      if (isUploadAbortError(err)) {
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // When the OS will no longer re-prompt for camera/library access
      // (the user previously tapped "Don't allow"), the only way
      // forward is the system Settings app — give them a one-tap
      // shortcut instead of a dead-end "denied" alert.
      if (err instanceof PermissionPermanentlyDeniedError) {
        const title =
          err.permission === "camera"
            ? "Camera access needed"
            : "Photo access needed";
        Alert.alert(
          title,
          err.message,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Settings",
              onPress: () => {
                // Linking.openSettings rejects on platforms without
                // settings deep links — swallow so a stray rejection
                // can't surface as an unhandled-promise warning.
                Linking.openSettings().catch(() => {});
              },
            },
          ],
          { cancelable: true },
        );
      } else {
        Alert.alert(
          "Upload failed",
          err instanceof Error ? err.message : "Could not upload that image. Please try again.",
        );
      }
    } finally {
      setUploading(null);
      setUploadProgress(null);
      uploadAbortRef.current = null;
    }
  };

  const handlePick = (aspect: UploadAspect) => {
    if (uploading) return;
    const label = aspect === "square" ? "profile photo" : "cover image";
    Alert.alert(
      `Update ${label}`,
      "Where should the photo come from?",
      [
        {
          text: "Take photo",
          onPress: () => runUpload(aspect, "camera"),
        },
        {
          text: "Choose from library",
          onPress: () => runUpload(aspect, "library"),
        },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true },
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === "web" ? 20 : insets.top + 12,
            borderBottomColor: "rgba(201,168,76,0.15)",
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.superLabel}>PROFILE</Text>
          <Text style={styles.headerTitle}>Edit Profile</Text>
        </View>
        <TouchableOpacity
          onPress={handleSave}
          disabled={updateMe.isPending}
          style={[styles.saveBtn, updateMe.isPending && styles.saveBtnDisabled]}
        >
          {updateMe.isPending ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.saveBtnText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom + 24, 40) },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile Photo (square crop, 512×512) */}
          <View style={styles.fieldWrap}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Profile Photo</Text>
              {form.avatarUrl ? (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setForm((f) => ({ ...f, avatarUrl: "" }));
                  }}
                  disabled={uploading !== null}
                  hitSlop={8}
                  accessibilityLabel="Remove profile photo"
                  style={styles.removeBtn}
                >
                  <Ionicons name="close" size={11} color="rgba(255,255,255,0.55)" />
                  <Text style={styles.removeBtnText}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.avatarRow}>
              <View style={styles.avatarPreview}>
                {form.avatarUrl ? (
                  <Image
                    source={{ uri: form.avatarUrl }}
                    style={styles.avatarImg}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="person" size={28} color="rgba(255,255,255,0.25)" />
                  </View>
                )}
                {uploading === "square" && (
                  <View style={styles.previewOverlay}>
                    <ActivityIndicator size="small" color="#C9A84C" />
                    {uploadProgress !== null && (
                      <Text style={styles.progressText}>{uploadProgress}%</Text>
                    )}
                    <TouchableOpacity
                      onPress={cancelUpload}
                      hitSlop={8}
                      accessibilityLabel="Cancel upload"
                      style={styles.cancelUploadBtn}
                    >
                      <Text style={styles.cancelUploadBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <TouchableOpacity
                  onPress={() => handlePick("square")}
                  disabled={uploading !== null}
                  style={[styles.uploadBtn, uploading !== null && styles.uploadBtnDisabled]}
                >
                  <Ionicons name="image-outline" size={14} color="#C9A84C" />
                  <Text style={styles.uploadBtnText}>
                    {form.avatarUrl ? "Change photo" : "Choose & crop"}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.fieldHint}>Square crop · resized to 512×512 JPEG</Text>
              </View>
            </View>
          </View>

          {/* Cover Image (3:1 crop, 1500×500) */}
          <View style={styles.fieldWrap}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Cover Image</Text>
              {form.coverUrl ? (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setForm((f) => ({ ...f, coverUrl: "" }));
                  }}
                  disabled={uploading !== null}
                  hitSlop={8}
                  accessibilityLabel="Remove cover image"
                  style={styles.removeBtn}
                >
                  <Ionicons name="close" size={11} color="rgba(255,255,255,0.55)" />
                  <Text style={styles.removeBtnText}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.coverPreview}>
              {form.coverUrl ? (
                <Image
                  source={{ uri: form.coverUrl }}
                  style={styles.coverImg}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.coverPlaceholder}>
                  <Ionicons name="image-outline" size={22} color="rgba(255,255,255,0.25)" />
                  <Text style={styles.coverPlaceholderText}>No cover image</Text>
                </View>
              )}
              {uploading === "wide" && (
                <View style={styles.previewOverlay}>
                  <ActivityIndicator size="small" color="#C9A84C" />
                  {uploadProgress !== null && (
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          { width: `${uploadProgress}%` },
                        ]}
                      />
                    </View>
                  )}
                  {uploadProgress !== null && (
                    <Text style={styles.progressText}>{uploadProgress}%</Text>
                  )}
                  <TouchableOpacity
                    onPress={cancelUpload}
                    hitSlop={8}
                    accessibilityLabel="Cancel upload"
                    style={styles.cancelUploadBtn}
                  >
                    <Text style={styles.cancelUploadBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={() => handlePick("wide")}
              disabled={uploading !== null}
              style={[styles.uploadBtn, uploading !== null && styles.uploadBtnDisabled]}
            >
              <Ionicons name="image-outline" size={14} color="#C9A84C" />
              <Text style={styles.uploadBtnText}>
                {form.coverUrl ? "Change cover" : "Choose & crop"}
              </Text>
            </TouchableOpacity>
            <Text style={styles.fieldHint}>3:1 crop · resized to 1500×500 JPEG</Text>
          </View>

          {FIELDS.map((field) => (
            <View key={field.key} style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{field.label}</Text>
              <TextInput
                style={[
                  styles.input,
                  field.multiline && styles.inputMulti,
                  { color: "#fff", borderColor: "rgba(201,168,76,0.2)" },
                ]}
                value={form[field.key]}
                onChangeText={(v) =>
                  setForm((f) => ({
                    ...f,
                    [field.key]:
                      field.key === "username"
                        ? v.toLowerCase().replace(/[^a-z0-9_]/g, "")
                        : v,
                  }))
                }
                placeholder={field.placeholder}
                placeholderTextColor="rgba(255,255,255,0.2)"
                multiline={field.multiline}
                numberOfLines={field.multiline ? 4 : 1}
                autoCapitalize={field.autoCapitalize ?? "sentences"}
                autoCorrect={false}
              />
              {field.hint && (
                <Text style={styles.fieldHint}>{field.hint}</Text>
              )}
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backBtn: { padding: 4 },
  superLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(201,168,76,0.5)",
    letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.3,
  },
  saveBtn: {
    backgroundColor: "#C9A84C",
    paddingHorizontal: 18,
    paddingVertical: 8,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    color: "#000",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 20 },
  fieldWrap: { gap: 6 },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  removeBtnText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  fieldLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "rgba(201,168,76,0.7)",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  input: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  inputMulti: {
    minHeight: 90,
    textAlignVertical: "top",
    paddingTop: 11,
  },
  fieldHint: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.25)",
    lineHeight: 14,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 4,
  },
  avatarPreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.25)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  coverPreview: {
    width: "100%",
    aspectRatio: 3,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.25)",
    backgroundColor: "rgba(255,255,255,0.03)",
    overflow: "hidden",
    marginTop: 4,
  },
  coverImg: { width: "100%", height: "100%" },
  coverPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  coverPlaceholderText: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.3)",
    letterSpacing: 0.5,
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  progressText: {
    color: "#C9A84C",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  cancelUploadBtn: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.55)",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  cancelUploadBtnText: {
    color: "#C9A84C",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  progressBarTrack: {
    width: "60%",
    height: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#C9A84C",
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.3)",
    backgroundColor: "rgba(201,168,76,0.06)",
  },
  uploadBtnDisabled: { opacity: 0.5 },
  uploadBtnText: {
    color: "#C9A84C",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});
