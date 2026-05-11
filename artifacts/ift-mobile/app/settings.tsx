import { Ionicons, Feather } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import { useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { deregisterPushTokenForSignOut } from "@/hooks/use-push-registration";
import { WEB_DOMAIN, WEB_BASE_URL } from "../lib/api-base";

function Section({ title }: { title: string }) {
  return (
    <Text style={styles.sectionTitle}>{title}</Text>
  );
}

function Row({
  icon,
  label,
  sublabel,
  onPress,
  danger,
  rightIcon = "chevron-forward",
  showChevron = true,
  testID,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  danger?: boolean;
  rightIcon?: string;
  showChevron?: boolean;
  testID?: string;
}) {
  const color = danger ? "#DC143C" : "#C9A84C";
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.row}
      activeOpacity={0.65}
      testID={testID}
    >
      <View style={[styles.rowIcon, { backgroundColor: `${color}14`, borderColor: `${color}30` }]}>
        <Ionicons name={icon as any} size={16} color={`${color}cc`} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, danger && { color: "#DC143C" }]}>{label}</Text>
        {sublabel && <Text style={styles.rowSublabel}>{sublabel}</Text>}
      </View>
      {showChevron && (
        <Ionicons name={rightIcon as any} size={16} color="rgba(255,255,255,0.2)" />
      )}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut, getToken } = useAuth();
  const qc = useQueryClient();
  const { data: me } = useGetMe();

  const handleResetSession = () => {
    const runReset = async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            try {
              // Best-effort push token deregister with a 3s cap so a hung
              // session can never block the rescue flow.
              try {
                await Promise.race([
                  deregisterPushTokenForSignOut(async () => {
                    try {
                      return (await getToken()) ?? null;
                    } catch {
                      return null;
                    }
                  }),
                  new Promise((resolve) => setTimeout(resolve, 3000)),
                ]);
              } catch {
                /* ignore */
              }
              // Clear Clerk session — swallow errors, local wipe below is the real reset.
              try {
                await signOut();
              } catch {
                /* ignore */
              }
              // Nuke every AsyncStorage key (push token cache, privacy prefs, etc.)
              try {
                await AsyncStorage.clear();
              } catch {
                /* ignore */
              }
              // Drop every cached query/mutation
              try {
                qc.clear();
              } catch {
                /* ignore */
              }
            } finally {
              // Always land on sign-in, regardless of prior auth state or
              // whether any of the cleanup steps above threw. AuthGuard is a
              // backstop, but the explicit replace prevents a flash of the
              // settings screen.
              router.replace("/(auth)/sign-in");
            }
    };
    // react-native-web's Alert is a no-op, so the rescue button would silently
    // do nothing on the web build. Fall back to the browser's native confirm
    // there so the flow still works (and is testable end-to-end).
    if (Platform.OS === "web") {
      const ok =
        typeof window !== "undefined" && typeof window.confirm === "function"
          ? window.confirm(
              "Reset Session?\n\nThis will forcibly clear your sign-in, all locally cached data, and app preferences, then return you to the sign-in screen. Use this if the app is stuck.",
            )
          : true;
      if (ok) void runReset();
      return;
    }
    Alert.alert(
      "Reset Session?",
      "This will forcibly clear your sign-in, all locally cached data, and app preferences, then return you to the sign-in screen. Use this if the app is stuck.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: () => void runReset() },
      ],
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            // Best-effort push token deregister with a hard 3-second timeout
            // so a hung/invalid session never blocks the sign-out flow.
            try {
              await Promise.race([
                deregisterPushTokenForSignOut(async () => {
                  try {
                    return (await getToken()) ?? null;
                  } catch {
                    return null;
                  }
                }),
                new Promise((resolve) => setTimeout(resolve, 3000)),
              ]);
            } catch {
              // ignore — sign out proceeds regardless
            }
            try {
              await signOut();
            } catch {
              // ignore — clearing local state below is the real recovery
            }
            qc.clear();
          },
        },
      ],
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
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.superLabel}>ORBN</Text>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 32, 40), paddingTop: 24 }}
      >
        <Section title="Account" />
        <View style={styles.card}>
          <Row
            icon="person-outline"
            label="Edit Profile"
            sublabel={me ? `@${me.username}` : "Update your info"}
            onPress={() => router.push("/edit-profile")}
          />
          <View style={styles.divider} />
          <Row
            icon="shield-checkmark-outline"
            label="Privacy & Security"
            sublabel="Ghost mode, blocked, data"
            onPress={() => router.push("/privacy" as any)}
          />
          <View style={styles.divider} />
          <Row
            icon="notifications-outline"
            label="Notifications"
            sublabel="Push, email preferences"
            onPress={() => router.push("/privacy" as any)}
          />
          <View style={styles.divider} />
          <Row
            icon="diamond-outline"
            label="Subscription"
            sublabel="Plans, billing, manage"
            onPress={() => router.push("/pricing" as any)}
          />
        </View>

        <Section title="AI Tools" />
        <View style={styles.card}>
          <Row
            icon="hardware-chip-outline"
            label="Soul Twin"
            sublabel="Your AI career coach"
            onPress={() => router.push("/soul-twin")}
          />
          <View style={styles.divider} />
          <Row
            icon="search-circle-outline"
            label="Career Oracle"
            sublabel="AI-powered career insights"
            onPress={() => {}}
          />
        </View>

        <Section title="Network" />
        <View style={styles.card}>
          <Row
            icon="flame-outline"
            label="Challenges"
            sublabel="Weekly arena & rewards"
            onPress={() => router.push("/challenges")}
          />
          <View style={styles.divider} />
          <Row
            icon="trophy-outline"
            label="Dark Horses Leaderboard"
            sublabel="See who's rising fast"
            onPress={() => router.push("/leaderboard")}
          />
          <View style={styles.divider} />
          <Row
            icon="rocket-outline"
            label="Bounty Board"
            sublabel="Post & solve challenges"
            onPress={() => router.push("/bounties")}
          />
          <View style={styles.divider} />
          <Row
            icon="briefcase-outline"
            label="Jobs Board"
            sublabel="Opportunities & AI matches"
            onPress={() => router.push("/jobs")}
          />
        </View>

        <Section title="Creator" />
        <View style={styles.card}>
          <Row
            icon="stats-chart-outline"
            label="Insights"
            sublabel="Best post, growth, peak hours"
            onPress={() => router.push("/insights")}
          />
          <View style={styles.divider} />
          <Row
            icon="calendar-outline"
            label="Scheduled Posts"
            sublabel="Manage your post queue"
            onPress={() => router.push("/scheduled")}
          />
          <View style={styles.divider} />
          <Row
            icon="cash-outline"
            label="Monetize"
            sublabel="Tips, badges, premium tier"
            onPress={() => router.push("/monetize")}
          />
        </View>

        <Section title="Rewards & Trust" />
        <View style={styles.card}>
          <Row
            icon="gift-outline"
            label="Invite & Earn"
            sublabel="3 invites = 1 month Premium"
            onPress={() => router.push("/invite")}
          />
          <View style={styles.divider} />
          <Row
            icon="shield-checkmark-outline"
            label="AI Activity"
            sublabel="Why the AI suggested things"
            onPress={() => router.push("/ai-activity")}
          />
        </View>

        <Section title="Support" />
        <View style={styles.card}>
          <Row
            icon="globe-outline"
            label="Visit Website"
            sublabel={WEB_DOMAIN}
            onPress={() => Linking.openURL(WEB_BASE_URL)}
          />
          <View style={styles.divider} />
          <Row
            icon="document-text-outline"
            label="Terms & Privacy"
            onPress={() => Linking.openURL(`${WEB_BASE_URL}/docs`)}
          />
        </View>

        <Section title="Session" />
        <View style={styles.card}>
          <Row
            icon="log-out-outline"
            label="Sign Out"
            danger
            showChevron={false}
            onPress={handleSignOut}
          />
          <View style={styles.divider} />
          <Row
            icon="refresh-circle-outline"
            label="Reset Session"
            sublabel="Force clear sign-in & local data"
            danger
            showChevron={false}
            onPress={handleResetSession}
            testID="settings-reset-session"
          />
        </View>

        <Text style={styles.version}>ORBN · v1.0 · AI-Powered Professional Network</Text>
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
  superLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(201,168,76,0.5)",
    letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.3,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "rgba(201,168,76,0.5)",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginLeft: 20,
    marginTop: 24,
    marginBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.12)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: { flex: 1 },
  rowLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.85)",
  },
  rowSublabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.32)",
    marginTop: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(201,168,76,0.08)",
    marginLeft: 64,
  },
  version: {
    textAlign: "center",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.15)",
    marginTop: 32,
    letterSpacing: 0.5,
  },
});
