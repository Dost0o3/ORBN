import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { API_BASE } from "../lib/api-base";

const GLASS_BG = "rgba(15,25,60,0.45)";
const GLASS_BORDER = "rgba(100,180,220,0.22)";

type Tier = {
  id: "free" | "operator" | "enterprise";
  name: string;
  price: string;
  period: string;
  icon: string;
  description: string;
  features: string[];
  highlight?: boolean;
};

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Recruit",
    price: "$0",
    period: "forever",
    icon: "flash-outline",
    description: "Start playing. See if the network is for you.",
    features: [
      "Power Score reputation",
      "Public Feed & Explore",
      "50 Connect swipes/day",
      "1 Inner Circle membership",
      "Soul Twin AI — 5 queries/day",
      "Standard Bounty Board access",
    ],
  },
  {
    id: "operator",
    name: "Operator",
    price: "$19",
    period: "per month",
    icon: "ribbon-outline",
    description: "For operators who play to win.",
    highlight: true,
    features: [
      "Everything in Recruit",
      "Unlimited Connect swipes",
      "Unlimited Inner Circles",
      "Soul Twin AI — unlimited",
      "Career Oracle — premium runs",
      "Priority Bounty Board placement",
      "Ghost Mode (browse anonymously)",
      "Profile boost — 3x visibility",
      "Verified Operator badge",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "talk to us",
    icon: "business-outline",
    description: "For teams, talent ops, and recruiters at scale.",
    features: [
      "Everything in Operator",
      "Team seats with admin controls",
      "Bulk talent search & exports",
      "Private Inner Circles",
      "Custom AI fine-tuning",
      "Dedicated success manager",
      "SSO / SAML / SCIM",
      "Custom SLA & data residency",
    ],
  },
];

export default function PricingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken, isSignedIn } = useAuth();

  const [currentTier, setCurrentTier] = useState<string>("free");
  const [billingEnabled, setBillingEnabled] = useState<boolean>(true);
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchSub = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/billing/me`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!mountedRef.current || !res.ok) return;
      const data = await res.json();
      if (!mountedRef.current) return;
      setCurrentTier(data.tier ?? "free");
      setBillingEnabled(data.billingEnabled !== false);
    } catch {}
  }, [getToken]);

  useEffect(() => {
    fetchSub();
  }, [fetchSub]);

  const startCheckout = async () => {
    if (!isSignedIn) {
      Alert.alert("Sign in required", "Please sign in to subscribe.");
      return;
    }
    if (!billingEnabled) {
      Alert.alert("Billing not configured", "Stripe billing is not enabled on this server yet.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoadingTier("operator");
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tier: "operator" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      if (!data.url) throw new Error("No checkout URL");
      await WebBrowser.openBrowserAsync(data.url);
      fetchSub();
    } catch (err) {
      Alert.alert(
        "Couldn't start checkout",
        err instanceof Error ? err.message : "Try again in a moment.",
      );
    } finally {
      setLoadingTier(null);
    }
  };

  const openPortal = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoadingTier("portal");
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/billing/portal`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Portal failed");
      await WebBrowser.openBrowserAsync(data.url);
      fetchSub();
    } catch (err) {
      Alert.alert(
        "Couldn't open billing portal",
        err instanceof Error ? err.message : "Try again.",
      );
    } finally {
      setLoadingTier(null);
    }
  };

  const contactSales = () => {
    Linking.openURL(`mailto:sales@orbn.app?subject=ORBN%20Enterprise`);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.superLabel}>ORBN</Text>
          <Text style={styles.headerTitle}>Pricing</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        <Text style={[styles.heroTitle, { color: colors.foreground }]}>Pricing for operators</Text>
        <Text style={[styles.heroSubtitle, { color: colors.mutedForeground }]}>
          Start free. Upgrade when you're ready to win bigger. Cancel anytime — no contracts.
        </Text>

        {TIERS.map((tier) => {
          const isCurrent = currentTier === tier.id;
          const isLoading = loadingTier === tier.id || (tier.id === "operator" && loadingTier === "portal");
          return (
            <View key={tier.id} style={styles.tierShadow}>
              <BlurView
                intensity={Platform.OS === "ios" ? 50 : 70}
                tint="dark"
                style={[
                  styles.tierCard,
                  tier.highlight && {
                    borderColor: colors.primary + "88",
                    shadowColor: colors.primary,
                  },
                ]}
              >
                {tier.highlight && (
                  <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.popularBadgeText, { color: colors.primaryForeground }]}>
                      MOST POPULAR
                    </Text>
                  </View>
                )}
                <View style={styles.tierHeader}>
                  <Ionicons
                    name={tier.icon as any}
                    size={22}
                    color={tier.highlight ? colors.primary : colors.foreground}
                  />
                  <Text style={[styles.tierName, { color: colors.foreground }]}>{tier.name}</Text>
                  {isCurrent && (
                    <View style={[styles.currentChip, { borderColor: colors.primary + "55" }]}>
                      <Text style={[styles.currentChipText, { color: colors.primary }]}>CURRENT</Text>
                    </View>
                  )}
                </View>
                <View style={styles.priceRow}>
                  <Text style={[styles.price, { color: colors.foreground }]}>{tier.price}</Text>
                  <Text style={[styles.period, { color: colors.mutedForeground }]}>{tier.period}</Text>
                </View>
                <Text style={[styles.tierDescription, { color: colors.mutedForeground }]}>
                  {tier.description}
                </Text>

                {tier.features.map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <Ionicons name="checkmark" size={16} color={colors.primary} />
                    <Text style={[styles.featureText, { color: colors.secondaryForeground }]}>{f}</Text>
                  </View>
                ))}

                <View style={{ height: 16 }} />

                {tier.id === "free" && (
                  <View style={[styles.cta, styles.ctaDisabled]}>
                    <Text style={[styles.ctaText, { color: colors.mutedForeground }]}>
                      {isCurrent ? "Current plan" : "Free forever"}
                    </Text>
                  </View>
                )}

                {tier.id === "operator" &&
                  (isCurrent ? (
                    <TouchableOpacity
                      style={[styles.cta, styles.ctaOutline, { borderColor: colors.primary }]}
                      onPress={openPortal}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <ActivityIndicator color={colors.primary} size="small" />
                      ) : (
                        <Text style={[styles.ctaText, { color: colors.primary }]}>
                          Manage subscription
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.cta, { backgroundColor: colors.primary }]}
                      onPress={startCheckout}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <ActivityIndicator color={colors.primaryForeground} size="small" />
                      ) : (
                        <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>
                          Become an Operator
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}

                {tier.id === "enterprise" && (
                  <TouchableOpacity
                    style={[styles.cta, styles.ctaOutline, { borderColor: GLASS_BORDER }]}
                    onPress={contactSales}
                  >
                    <Text style={[styles.ctaText, { color: colors.foreground }]}>Contact Sales</Text>
                  </TouchableOpacity>
                )}
              </BlurView>
            </View>
          );
        })}

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          All prices in USD. Taxes calculated at checkout. Cancel anytime.
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
    borderBottomColor: GLASS_BORDER,
  },
  superLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(232,117,74,0.55)",
    letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.3,
  },
  heroTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    textAlign: "center",
    marginTop: 12,
  },
  heroSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  tierShadow: {
    marginBottom: 14,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  tierCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: GLASS_BG,
    padding: 18,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  popularBadge: {
    position: "absolute",
    top: 0,
    right: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  popularBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
  tierHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  tierName: { fontSize: 18, fontFamily: "Inter_700Bold", flex: 1 },
  currentChip: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  currentChipText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 8 },
  price: { fontSize: 32, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  period: { fontSize: 12, fontFamily: "Inter_400Regular" },
  tierDescription: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    marginBottom: 14,
    lineHeight: 17,
  },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 4 },
  featureText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  cta: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  ctaOutline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
  },
  ctaDisabled: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  ctaText: { fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  footer: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 16,
  },
});
