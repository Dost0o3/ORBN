import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetMe, useGetUnreadDirectMessageCount } from "@workspace/api-client-react";
import { Image } from "expo-image";

const PRIMARY = "#E8754A";
const BORDER = "rgba(232,117,74,0.18)";
const CARD_BG = "rgba(15,25,60,0.42)";

type MenuItem = {
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  badge?: number;
};

type MenuSection = {
  title: string;
  items: MenuItem[];
};

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: me } = useGetMe();
  const { data: unread } = useGetUnreadDirectMessageCount();

  const sections: MenuSection[] = [
    {
      title: "COMMUNITY",
      items: [
        { label: "Messages", sub: "Direct conversations", icon: "chatbubbles", route: "/messages", badge: unread?.count },
        { label: "Communities", sub: "Open public rooms", icon: "people", route: "/communities" },
        { label: "Inner Circles", sub: "Invite-only power rooms", icon: "lock-closed", route: "/circles" },
      ],
    },
    {
      title: "INTELLIGENCE",
      items: [
        { label: "Soul Twin", sub: "Your AI mirror", icon: "person-circle", route: "/soul-twin" },
        { label: "Career Oracle", sub: "AI path analysis", icon: "sparkles", route: "/career-oracle" },
        { label: "AI Activity", sub: "Agent action log", icon: "terminal", route: "/ai-activity" },
        { label: "Insights", sub: "Your analytics", icon: "analytics", route: "/insights" },
      ],
    },
    {
      title: "MARKET",
      items: [
        { label: "Jobs", sub: "Operator opportunities", icon: "briefcase", route: "/jobs" },
        { label: "Bounties", sub: "Paid micro-tasks", icon: "cash", route: "/bounties" },
        { label: "Leaderboard", sub: "Dark horses", icon: "trophy", route: "/leaderboard" },
        { label: "Challenges", sub: "Power-up streaks", icon: "flame", route: "/challenges" },
      ],
    },
    {
      title: "STUDIO",
      items: [
        { label: "Scheduled", sub: "Queued posts", icon: "time", route: "/scheduled" },
        { label: "Monetize", sub: "Revenue tools", icon: "trending-up", route: "/monetize" },
        { label: "Invite", sub: "Bring operators", icon: "share-social", route: "/invite" },
      ],
    },
    {
      title: "ACCOUNT",
      items: [
        { label: "Edit Profile", sub: "Update your bio", icon: "create", route: "/edit-profile" },
        { label: "Subscription", sub: "Plans & billing", icon: "diamond", route: "/pricing" },
        { label: "Privacy", sub: "Ghost, blocks, push", icon: "shield-checkmark", route: "/privacy" },
        { label: "Settings", sub: "Preferences", icon: "settings", route: "/settings" },
      ],
    },
  ];

  if ((me as any)?.isAdmin === true) {
    sections.push({
      title: "ADMIN",
      items: [
        { label: "Reports & Roster", sub: "Triage user reports, manage admins", icon: "shield", route: "/admin-reports" },
      ],
    });
  }

  const handlePress = (route: string) => {
    // Replace the modal with the destination — avoids the back+push race
    router.replace(route as any);
  };

  const initial = (me?.displayName ?? me?.username ?? "?")[0]?.toUpperCase();

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "web" ? 20 : insets.top + 12 },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.superLabel}>NAVIGATION</Text>
          <Text style={styles.headerTitle}>MENU</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom + 20, 40) }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        {me && (
          <TouchableOpacity
            style={styles.profileCard}
            onPress={() => handlePress("/(tabs)/profile")}
            activeOpacity={0.8}
          >
            {me.avatarUrl ? (
              <Image source={{ uri: me.avatarUrl }} style={styles.profileAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.profileAvatar, styles.profileAvatarFallback]}>
                <Text style={styles.profileAvatarText}>{initial}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName} numberOfLines={1}>
                {me.displayName ?? "Operator"}
              </Text>
              <Text style={styles.profileHandle} numberOfLines={1}>
                @{me.username ?? "operator"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        )}

        {/* Sections */}
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionItems}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.route}
                  style={[
                    styles.menuItem,
                    idx === section.items.length - 1 && styles.menuItemLast,
                  ]}
                  onPress={() => handlePress(item.route)}
                  activeOpacity={0.7}
                >
                  <View style={styles.menuIcon}>
                    <Ionicons name={item.icon} size={16} color={PRIMARY} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    <Text style={styles.menuSub} numberOfLines={1}>{item.sub}</Text>
                  </View>
                  {item.badge && item.badge > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.badge}</Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.footer}>ORBN · v1.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  superLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(232,117,74,0.55)", letterSpacing: 2 },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.5 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: PRIMARY,
    borderRadius: 8,
    padding: 14,
    marginBottom: 18,
  },
  profileAvatar: { width: 48, height: 48, borderRadius: 24 },
  profileAvatarFallback: {
    backgroundColor: "rgba(232,117,74,0.15)",
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarText: { fontSize: 18, fontFamily: "Inter_700Bold", color: PRIMARY },
  profileName: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.3 },
  profileHandle: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", marginTop: 2 },
  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "rgba(232,117,74,0.55)",
    letterSpacing: 1.8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionItems: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  menuItemLast: { borderBottomWidth: 0 },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "rgba(232,117,74,0.08)",
    borderWidth: 1,
    borderColor: "rgba(232,117,74,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { fontSize: 14, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.92)", letterSpacing: 0.3 },
  menuSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)", marginTop: 2 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#000" },
  footer: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.25)",
    textAlign: "center",
    letterSpacing: 1.5,
    marginTop: 16,
  },
});
