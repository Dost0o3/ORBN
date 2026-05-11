import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const GLASS_BG = "rgba(15,25,60,0.38)";
const GLASS_BORDER = "rgba(100,180,220,0.22)";

const BADGES = [
  { key: "supporter", label: "Supporter", price: "$5", color: "#10B981", icon: "heart" },
  { key: "champion", label: "Champion", price: "$25", color: "#3B82F6", icon: "ribbon" },
  { key: "legend", label: "Legend", price: "$100", color: "#E8754A", icon: "diamond" },
];

export default function MonetizeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [tipsOn, setTipsOn] = useState(false);
  const [premiumOn, setPremiumOn] = useState(false);
  const [badgesOn, setBadgesOn] = useState(false);

  const handleToggle = (setter: (v: boolean) => void, current: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setter(!current);
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
          <Text style={[styles.superLabel, { color: colors.primary + "88" }]}>CREATOR</Text>
          <Text style={styles.headerTitle}>Monetize</Text>
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
            <Ionicons name="cash-outline" size={26} color={colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Earn from your network</Text>
          <Text style={styles.heroSub}>
            Turn on the tools you want. Everything stays optional and respectful
            to your audience.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>TIPS</Text>
        <View style={[styles.toolCard, { borderColor: GLASS_BORDER }]}>
          <View style={styles.toolRow}>
            <View
              style={[
                styles.toolIcon,
                { backgroundColor: "#10B98120", borderColor: "#10B98144" },
              ]}
            >
              <Ionicons name="heart" size={18} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toolTitle}>Tip Button on Profile</Text>
              <Text style={styles.toolSub}>
                Let supporters send you one-tap tips. You keep 95%.
              </Text>
            </View>
            <Switch
              value={tipsOn}
              onValueChange={() => handleToggle(setTipsOn, tipsOn)}
              trackColor={{ false: "rgba(255,255,255,0.1)", true: colors.primary + "88" }}
              thumbColor={tipsOn ? colors.primary : "#888"}
            />
          </View>
          {tipsOn && (
            <View style={[styles.toolFooter, { borderTopColor: GLASS_BORDER }]}>
              <Text style={styles.footerText}>Suggested amounts:</Text>
              <View style={styles.amountsRow}>
                {["$3", "$5", "$10", "$25"].map((a) => (
                  <View
                    key={a}
                    style={[styles.amountChip, { borderColor: colors.primary + "55" }]}
                  >
                    <Text style={[styles.amountText, { color: colors.primary }]}>{a}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>DIGITAL BADGES</Text>
        <View style={[styles.toolCard, { borderColor: GLASS_BORDER }]}>
          <View style={styles.toolRow}>
            <View
              style={[
                styles.toolIcon,
                { backgroundColor: "#3B82F620", borderColor: "#3B82F644" },
              ]}
            >
              <Ionicons name="ribbon" size={18} color="#3B82F6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toolTitle}>Sell Digital Badges</Text>
              <Text style={styles.toolSub}>
                Supporters buy badges that show on their profile.
              </Text>
            </View>
            <Switch
              value={badgesOn}
              onValueChange={() => handleToggle(setBadgesOn, badgesOn)}
              trackColor={{ false: "rgba(255,255,255,0.1)", true: colors.primary + "88" }}
              thumbColor={badgesOn ? colors.primary : "#888"}
            />
          </View>
          {badgesOn && (
            <View style={[styles.toolFooter, { borderTopColor: GLASS_BORDER }]}>
              <Text style={styles.footerText}>Active badge tiers:</Text>
              <View style={styles.badgesGrid}>
                {BADGES.map((b) => (
                  <View
                    key={b.key}
                    style={[styles.badgeCard, { borderColor: b.color + "44" }]}
                  >
                    <Ionicons name={b.icon as any} size={20} color={b.color} />
                    <Text style={styles.badgeLabel}>{b.label}</Text>
                    <Text style={[styles.badgePrice, { color: b.color }]}>{b.price}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>PREMIUM SUBSCRIPTION</Text>
        <View style={[styles.toolCard, { borderColor: GLASS_BORDER }]}>
          <View style={styles.toolRow}>
            <View
              style={[
                styles.toolIcon,
                { backgroundColor: "#E8754A20", borderColor: "#E8754A44" },
              ]}
            >
              <Ionicons name="diamond" size={18} color="#E8754A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toolTitle}>Premium Subscriber Tier</Text>
              <Text style={styles.toolSub}>
                Offer exclusive posts and DMs to monthly subscribers.
              </Text>
            </View>
            <Switch
              value={premiumOn}
              onValueChange={() => handleToggle(setPremiumOn, premiumOn)}
              trackColor={{ false: "rgba(255,255,255,0.1)", true: colors.primary + "88" }}
              thumbColor={premiumOn ? colors.primary : "#888"}
            />
          </View>
          {premiumOn && (
            <View style={[styles.toolFooter, { borderTopColor: GLASS_BORDER }]}>
              <Text style={styles.footerText}>Suggested monthly price: $9/mo</Text>
              <Text style={styles.footerHint}>
                You'll earn ~$8.10 per subscriber after fees.
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>EARNINGS</Text>
        <View style={[styles.earningsCard, { borderColor: GLASS_BORDER }]}>
          <View style={styles.earningsRow}>
            <View>
              <Text style={styles.earningsLabel}>This Month</Text>
              <Text style={styles.earningsBig}>$0.00</Text>
            </View>
            <View>
              <Text style={styles.earningsLabel}>Lifetime</Text>
              <Text style={styles.earningsBig}>$0.00</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.payoutBtn, { borderColor: GLASS_BORDER }]}
          >
            <Ionicons name="card-outline" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.payoutText}>Set up payout method</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.disclaimer}>
          Payments are processed securely. Standard processing fees apply.
        </Text>
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
  heroTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  heroSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(232,117,74,0.55)",
    letterSpacing: 2,
    marginLeft: 20,
    marginTop: 22,
    marginBottom: 8,
  },
  toolCard: {
    marginHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: GLASS_BG,
    overflow: "hidden",
  },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  toolIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  toolTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  toolSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
  },
  toolFooter: {
    padding: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 1,
    marginBottom: 8,
  },
  footerHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
    marginTop: 4,
  },
  amountsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  amountChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  amountText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  badgesGrid: { flexDirection: "row", gap: 8 },
  badgeCard: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  badgeLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
  },
  badgePrice: { fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 2 },
  earningsCard: {
    marginHorizontal: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: GLASS_BG,
  },
  earningsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 12,
  },
  earningsLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 1,
    textAlign: "center",
  },
  earningsBig: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginTop: 2,
    textAlign: "center",
  },
  payoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  payoutText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.7)",
  },
  disclaimer: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.3)",
    textAlign: "center",
    marginHorizontal: 20,
    marginTop: 16,
  },
});
