import { Ionicons } from "@expo/vector-icons";
import { useGetMe } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { WEB_DOMAIN } from "../lib/api-base";

const GLASS_BG = "rgba(15,25,60,0.38)";
const GLASS_BORDER = "rgba(100,180,220,0.22)";

export default function InviteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: me } = useGetMe();
  const [copied, setCopied] = useState(false);

  const referralCode = (me?.username ?? "OPERATOR").toUpperCase().slice(0, 12);
  const referralLink = `https://${WEB_DOMAIN}/invite/${referralCode}`;
  const invitesAccepted = 0;
  const goal = 3;
  const pct = Math.min(100, Math.round((invitesAccepted / goal) * 100));

  const handleCopy = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Share.share({
        message: `Join me on ORBN — your AI-powered professional identity. Use my link: ${referralLink}`,
        url: referralLink,
      });
    } catch {
      // user cancelled
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === "web" ? 20 : insets.top + 12,
            backgroundColor: "rgba(8,15,45,0.82)",
            borderBottomColor: GLASS_BORDER,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={[styles.superLabel, { color: colors.primary + "88" }]}>REWARDS</Text>
          <Text style={styles.headerTitle}>Invite & Earn</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom + 32, 40),
          paddingTop: 16,
        }}
      >
        <View style={[styles.heroCard, { borderColor: colors.primary + "44" }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.primary + "1A" }]}>
            <Ionicons name="gift" size={28} color={colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Invite 3 friends, get 1 month free</Text>
          <Text style={styles.heroSubtitle}>
            Share ORBN with operators in your network. When 3 sign up using your
            link, you unlock a free month of Premium.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>YOUR REFERRAL CODE</Text>
        <View style={styles.codeCard}>
          <Text style={[styles.codeText, { color: colors.primary }]}>{referralCode}</Text>
          <Text style={styles.codeLink} numberOfLines={1}>
            {referralLink}
          </Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              { borderColor: GLASS_BORDER, backgroundColor: GLASS_BG },
            ]}
            onPress={handleCopy}
          >
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={16}
              color={copied ? "#10B981" : "#fff"}
            />
            <Text style={[styles.actionBtnText, copied && { color: "#10B981" }]}>
              {copied ? "Copied!" : "Copy Link"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.actionBtnPrimary,
              { backgroundColor: colors.primary },
            ]}
            onPress={handleShare}
          >
            <Ionicons name="share-outline" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Share Link</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>YOUR PROGRESS</Text>
        <View style={styles.progressCard}>
          <View style={styles.progressTop}>
            <Text style={styles.progressBig}>
              {invitesAccepted}
              <Text style={styles.progressBigMuted}> / {goal}</Text>
            </Text>
            <Text style={styles.progressLabel}>operators joined</Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: colors.primary, width: `${pct}%` },
              ]}
            />
          </View>
          <Text style={styles.progressHint}>
            {goal - invitesAccepted} more to unlock 1 month of Premium
          </Text>
        </View>

        <Text style={styles.sectionLabel}>INVITE HISTORY</Text>
        <View style={styles.emptyCard}>
          <Ionicons name="people-outline" size={28} color="rgba(255,255,255,0.18)" />
          <Text style={styles.emptyTitle}>No invites yet</Text>
          <Text style={styles.emptySub}>
            Share your link to start earning rewards.
          </Text>
        </View>

        <View style={[styles.tierCard, { borderColor: GLASS_BORDER }]}>
          <Text style={styles.tierLabel}>FUTURE REWARDS</Text>
          <View style={styles.tierRow}>
            <Ionicons name="ribbon-outline" size={16} color={colors.primary} />
            <Text style={styles.tierText}>10 invites · Operator Badge</Text>
          </View>
          <View style={styles.tierRow}>
            <Ionicons name="trophy-outline" size={16} color={colors.primary} />
            <Text style={styles.tierText}>25 invites · 6 months Premium</Text>
          </View>
          <View style={styles.tierRow}>
            <Ionicons name="diamond-outline" size={16} color={colors.primary} />
            <Text style={styles.tierText}>100 invites · Lifetime Premium</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  superLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  heroCard: {
    marginHorizontal: 14,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: GLASS_BG,
    alignItems: "center",
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    textAlign: "center",
  },
  heroSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(232,117,74,0.55)",
    letterSpacing: 2,
    marginLeft: 20,
    marginTop: 24,
    marginBottom: 8,
  },
  codeCard: {
    marginHorizontal: 14,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: GLASS_BG,
    alignItems: "center",
  },
  codeText: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: 4,
  },
  codeLink: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.4)",
    marginTop: 6,
  },
  actionRow: {
    flexDirection: "row",
    marginHorizontal: 14,
    marginTop: 12,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnPrimary: { borderWidth: 0 },
  actionBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  progressCard: {
    marginHorizontal: 14,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: GLASS_BG,
  },
  progressTop: { alignItems: "center", marginBottom: 12 },
  progressBig: { fontSize: 36, fontFamily: "Inter_700Bold", color: "#fff" },
  progressBigMuted: { color: "rgba(255,255,255,0.25)", fontSize: 24 },
  progressLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },
  progressHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    marginTop: 10,
  },
  emptyCard: {
    marginHorizontal: 14,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: GLASS_BG,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.7)",
    marginTop: 10,
  },
  emptySub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.35)",
    marginTop: 4,
    textAlign: "center",
  },
  tierCard: {
    marginHorizontal: 14,
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "rgba(15,25,60,0.25)",
  },
  tierLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 2,
    marginBottom: 10,
  },
  tierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  tierText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.7)",
  },
});
