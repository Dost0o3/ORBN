import { Ionicons } from "@expo/vector-icons";
import {
  useBlockUser,
  useUnblockUser,
  useReportUser,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DESTRUCTIVE = "#DC143C";
const PRIMARY = "#E8754A";

const REPORT_REASONS = [
  { key: "spam", label: "Spam or scam" },
  { key: "harassment", label: "Harassment or hate" },
  { key: "impersonation", label: "Impersonation" },
  { key: "inappropriate", label: "Inappropriate content" },
  { key: "other", label: "Other" },
] as const;

export default function ProfileActionsMenu({
  visible,
  onClose,
  userId,
  isBlocked,
  onBlockedChange,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  isBlocked?: boolean;
  onBlockedChange?: (blocked: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]["key"]>("spam");
  const [details, setDetails] = useState("");

  const blockMutation = useBlockUser();
  const unblockMutation = useUnblockUser();
  const reportMutation = useReportUser();

  const handleBlockToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isBlocked) {
      Alert.alert("Unblock this user?", "They'll be able to follow and message you again.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            try {
              await unblockMutation.mutateAsync({ userId });
              onBlockedChange?.(false);
              onClose();
            } catch {
              Alert.alert("Couldn't unblock", "Try again in a moment.");
            }
          },
        },
      ]);
    } else {
      Alert.alert("Block this user?", "They won't be able to follow you, message you, or see your posts.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              await blockMutation.mutateAsync({ userId });
              onBlockedChange?.(true);
              onClose();
            } catch {
              Alert.alert("Couldn't block", "Try again in a moment.");
            }
          },
        },
      ]);
    }
  };

  const submitReport = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await reportMutation.mutateAsync({
        userId,
        data: {
          reason: details.trim() ? `${reason}: ${details.trim()}` : reason,
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReportOpen(false);
      setDetails("");
      onClose();
      Alert.alert("Report submitted", "Our moderators will review this shortly.");
    } catch {
      Alert.alert("Couldn't submit report", "Try again in a moment.");
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.scrim} onPress={onClose}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.handle} />
            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                onClose();
                setTimeout(() => setReportOpen(true), 220);
              }}
            >
              <Ionicons name="flag-outline" size={20} color="rgba(255,255,255,0.85)" />
              <Text style={styles.rowText}>Report user</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.row} onPress={handleBlockToggle} disabled={blockMutation.isPending || unblockMutation.isPending}>
              <Ionicons name={isBlocked ? "lock-open-outline" : "ban-outline"} size={20} color={DESTRUCTIVE} />
              <Text style={[styles.rowText, { color: DESTRUCTIVE }]}>
                {blockMutation.isPending || unblockMutation.isPending
                  ? "Working..."
                  : isBlocked
                    ? "Unblock user"
                    : "Block user"}
              </Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={[styles.row, styles.cancelRow]} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={reportOpen} transparent animationType="slide" onRequestClose={() => setReportOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setReportOpen(false)}>
          <Pressable
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.handle} />
            <Text style={styles.reportTitle}>Report user</Text>
            <Text style={styles.reportSub}>Why are you reporting this account?</Text>
            <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 6 }}>
              {REPORT_REASONS.map((r) => (
                <TouchableOpacity
                  key={r.key}
                  style={[styles.reasonRow, reason === r.key && styles.reasonRowActive]}
                  onPress={() => setReason(r.key)}
                >
                  <Ionicons
                    name={reason === r.key ? "radio-button-on" : "radio-button-off"}
                    size={18}
                    color={reason === r.key ? PRIMARY : "rgba(255,255,255,0.4)"}
                  />
                  <Text style={[styles.reasonText, reason === r.key && { color: "#fff" }]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TextInput
                style={styles.detailsInput}
                placeholder="Add details (optional)"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={details}
                onChangeText={setDetails}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={[styles.submitBtn, reportMutation.isPending && { opacity: 0.5 }]}
                onPress={submitReport}
                disabled={reportMutation.isPending}
              >
                {reportMutation.isPending ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={styles.submitBtnText}>Submit report</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "rgba(11,24,40,0.98)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: "rgba(232,117,74,0.25)",
    paddingTop: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  rowText: { fontSize: 15, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.9)" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.08)" },
  cancelRow: { justifyContent: "center", paddingVertical: 16 },
  cancelText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.6)", letterSpacing: 0.3 },

  reportTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff", paddingHorizontal: 16, paddingTop: 4 },
  reportSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", paddingHorizontal: 16, paddingTop: 2, paddingBottom: 4 },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  reasonRowActive: { borderColor: PRIMARY + "44", backgroundColor: PRIMARY + "10" },
  reasonText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.7)" },
  detailsInput: {
    marginTop: 4,
    minHeight: 70,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.18)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlignVertical: "top",
  },
  submitBtn: {
    marginTop: 6,
    backgroundColor: PRIMARY,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
  },
  submitBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#000", letterSpacing: 0.5 },
});
