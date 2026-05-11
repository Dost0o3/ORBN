import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAgent } from "@/hooks/useAgent";

interface Props {
  onScanComplete?: () => void;
}

export default function AgentModeToggle({ onScanComplete }: Props) {
  const { status, busy, setMode, runScan } = useAgent();
  const [showConsent, setShowConsent] = useState(false);
  const enabled = status?.agentModeEnabled ?? false;
  const autonomy = status?.agentAutonomyEnabled ?? false;
  const consented = !!status?.agentConsentedAt;

  const toggle = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!enabled && !consented) {
      setShowConsent(true);
      return;
    }
    try {
      const next = !enabled;
      await setMode(next, { autonomy: next ? autonomy : false, consent: consented });
      if (next) {
        try {
          await runScan();
          onScanComplete?.();
        } catch {}
      }
    } catch {}
  };

  const accept = async () => {
    try {
      await setMode(true, { autonomy: false, consent: true });
      setShowConsent(false);
      try {
        await runScan();
        onScanComplete?.();
      } catch {}
    } catch {}
  };

  const toggleAutonomy = async () => {
    if (!enabled || !consented) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await setMode(true, { autonomy: !autonomy, consent: true });
    } catch {}
  };

  return (
    <>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={toggle}
          disabled={busy}
          accessibilityRole="switch"
          accessibilityLabel="Agent Mode"
          accessibilityState={{ checked: enabled }}
          style={[styles.btn, enabled ? styles.btnOn : styles.btnOff]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={enabled ? "#34D399" : "rgba(232,117,74,0.7)"} />
          ) : (
            <Ionicons name="hardware-chip-outline" size={11} color={enabled ? "#34D399" : "rgba(232,117,74,0.7)"} />
          )}
          <Text style={[styles.btnText, { color: enabled ? "#34D399" : "rgba(232,117,74,0.7)" }]}>
            AGENT {enabled ? "ON" : "OFF"}
          </Text>
        </TouchableOpacity>
        {enabled && (
          <TouchableOpacity
            onPress={toggleAutonomy}
            disabled={busy}
            accessibilityRole="switch"
            accessibilityLabel="Set and forget autonomy"
            accessibilityState={{ checked: autonomy }}
            style={[styles.btn, autonomy ? styles.autoOn : styles.autoOff]}
          >
            <Ionicons name="flash-outline" size={11} color={autonomy ? "#FFD24A" : "rgba(255,255,255,0.45)"} />
            <Text style={[styles.btnText, { color: autonomy ? "#FFD24A" : "rgba(255,255,255,0.45)" }]}>
              AUTO {autonomy ? "ON" : "OFF"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showConsent} animationType="fade" transparent onRequestClose={() => setShowConsent(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="hardware-chip-outline" size={20} color="#E8754A" />
              <Text style={styles.modalTitle}>Activate Agent Mode</Text>
            </View>
            <Text style={styles.modalBody}>
              Your Soul Twin will scan opportunities, draft messages, and surface high-value connections in your voice.
              Nothing gets sent without your approval. Turning on AUTO lets Soul Twin auto-follow new connections it finds; DMs, posts, and comments still wait for your review in the queue.
            </Text>
            <View style={styles.bullets}>
              <Text style={styles.bullet}>· Reads recent posts to learn your style</Text>
              <Text style={styles.bullet}>· Suggests connections, bounties, and post ideas daily</Text>
              <Text style={styles.bullet}>· Drafts DMs you can review before sending</Text>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowConsent(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={accept} disabled={busy} style={styles.acceptBtn}>
                {busy ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.acceptText}>Activate</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  btnOn: { borderColor: "rgba(52,211,153,0.55)", backgroundColor: "rgba(52,211,153,0.10)" },
  btnOff: { borderColor: "rgba(232,117,74,0.30)" },
  autoOn: { borderColor: "rgba(255,210,74,0.55)", backgroundColor: "rgba(255,210,74,0.10)" },
  autoOff: { borderColor: "rgba(255,255,255,0.18)" },
  btnText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.35)",
    padding: 20,
    gap: 14,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalTitle: { color: "#E8754A", fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 1, textTransform: "uppercase" },
  modalBody: { color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  bullets: { gap: 4 },
  bullet: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontFamily: "Inter_400Regular" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 6 },
  cancelBtn: { borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", paddingHorizontal: 12, paddingVertical: 8 },
  cancelText: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, textTransform: "uppercase" },
  acceptBtn: { backgroundColor: "#E8754A", paddingHorizontal: 14, paddingVertical: 8 },
  acceptText: { color: "#000", fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, textTransform: "uppercase" },
});
