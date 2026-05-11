import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Clipboard from "expo-clipboard";
import { WEB_DOMAIN } from "../lib/api-base";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

const GLASS_BORDER = "rgba(100,180,220,0.22)";

interface Props {
  username: string;
  displayName: string;
  rank?: string | null;
  rankColor?: string;
  size?: "chip" | "icon";
}

function buildPermanentUrl(username: string) {
  return `https://${WEB_DOMAIN}/u/${username}`;
}

export default function ProfileQR({
  username,
  displayName,
  rank,
  rankColor = "#E8754A",
  size = "icon",
}: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = buildPermanentUrl(username);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const onPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpen(true);
  };

  const copyUrl = async () => {
    await Clipboard.setStringAsync(url);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      {size === "chip" ? (
        <TouchableOpacity
          onPress={onPress}
          style={[styles.chipWrap, { borderColor: `${rankColor}55` }]}
        >
          <View style={styles.chipQrSlot}>
            <QRCode
              value={url}
              size={36}
              backgroundColor="transparent"
              color={rankColor}
            />
          </View>
          <Text style={[styles.chipLabel, { color: `${rankColor}cc` }]}>@{username}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={onPress}
          hitSlop={10}
          style={[styles.iconBtn, { borderColor: `${rankColor}44` }]}
        >
          <Ionicons name="qr-code-outline" size={18} color={rankColor} />
        </TouchableOpacity>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <BlurView
            intensity={Platform.OS === "ios" ? 80 : 100}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        </Pressable>

        <View style={styles.modalWrap} pointerEvents="box-none">
          <View
            style={[
              styles.card,
              { borderColor: `${rankColor}55`, shadowColor: rankColor },
            ]}
          >
            <TouchableOpacity
              onPress={() => setOpen(false)}
              hitSlop={12}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.55)" />
            </TouchableOpacity>

            <Text style={[styles.brand, { color: rankColor }]}>ORBN · IDENTITY</Text>
            <Text style={styles.displayName}>{displayName.toUpperCase()}</Text>
            <Text style={[styles.handle, { color: `${rankColor}cc` }]}>@{username}</Text>
            {rank ? (
              <Text style={[styles.rank, { color: rankColor }]}>{rank.toUpperCase()}</Text>
            ) : null}

            <View style={[styles.qrFrame, { borderColor: `${rankColor}40` }]}>
              <QRCode
                value={url}
                size={220}
                backgroundColor="#000000"
                color={rankColor}
              />
            </View>

            <Text style={styles.urlText}>{url}</Text>

            <TouchableOpacity
              onPress={copyUrl}
              style={[
                styles.copyBtn,
                { backgroundColor: copied ? rankColor : "transparent", borderColor: rankColor },
              ]}
            >
              <Ionicons
                name={copied ? "checkmark" : "link"}
                size={14}
                color={copied ? "#000" : rankColor}
              />
              <Text
                style={[
                  styles.copyText,
                  { color: copied ? "#000" : rankColor },
                ]}
              >
                {copied ? "COPIED" : "COPY LINK"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.hint}>Scan from any phone — opens profile instantly</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  chipWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  chipQrSlot: { width: 36, height: 36 },
  chipLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  modalWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#0a0a14",
    borderWidth: 1,
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 12,
  },
  closeBtn: { position: "absolute", top: 12, right: 12, padding: 4 },
  brand: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 2.5 },
  displayName: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    marginTop: 6,
    textAlign: "center",
  },
  handle: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  rank: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 2, marginTop: 6 },
  qrFrame: {
    marginTop: 18,
    padding: 12,
    borderWidth: 1,
    backgroundColor: "#000",
    borderRadius: 4,
  },
  urlText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    marginTop: 14,
    textAlign: "center",
  },
  copyBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  copyText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
  hint: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 14,
    textAlign: "center",
  },
});
