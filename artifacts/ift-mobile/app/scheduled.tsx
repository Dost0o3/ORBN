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
import { useColors } from "@/hooks/useColors";

const GLASS_BG = "rgba(15,25,60,0.38)";
const GLASS_BORDER = "rgba(100,180,220,0.22)";

export default function ScheduledScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const scheduledPosts: Array<{
    id: string;
    content: string;
    scheduledFor: string;
    mood: string;
  }> = [];

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
          <Text style={[styles.superLabel, { color: colors.primary + "88" }]}>QUEUE</Text>
          <Text style={styles.headerTitle}>Scheduled Posts</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/create")}
          hitSlop={10}
          style={[styles.headerBtn, { backgroundColor: colors.primary + "20" }]}
        >
          <Ionicons name="add" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom + 32, 40),
          paddingTop: 16,
        }}
      >
        {scheduledPosts.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { borderColor: GLASS_BORDER }]}>
              <Ionicons name="calendar-outline" size={36} color="rgba(255,255,255,0.25)" />
            </View>
            <Text style={styles.emptyTitle}>No scheduled posts</Text>
            <Text style={styles.emptySub}>
              Schedule a post and it will publish automatically at the time you choose.
            </Text>
            <TouchableOpacity
              style={[styles.emptyCta, { backgroundColor: colors.primary }]}
              onPress={() => router.push("/(tabs)/create")}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.emptyCtaText}>Create scheduled post</Text>
            </TouchableOpacity>
          </View>
        ) : (
          scheduledPosts.map((p) => (
            <View key={p.id} style={[styles.postCard, { borderColor: GLASS_BORDER }]}>
              <View style={styles.postHeader}>
                <Ionicons name="time-outline" size={12} color={colors.primary} />
                <Text style={[styles.scheduledText, { color: colors.primary }]}>
                  {p.scheduledFor}
                </Text>
              </View>
              <Text style={styles.postContent}>{p.content}</Text>
              <View style={styles.postActions}>
                <TouchableOpacity style={styles.postActionBtn}>
                  <Ionicons name="pencil-outline" size={14} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.postActionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.postActionBtn}>
                  <Ionicons name="trash-outline" size={14} color="#DC143C" />
                  <Text style={[styles.postActionText, { color: "#DC143C" }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
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
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { padding: 32, alignItems: "center" },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    backgroundColor: GLASS_BG,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "rgba(255,255,255,0.85)",
  },
  emptySub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.45)",
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    marginTop: 22,
  },
  emptyCtaText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  postCard: {
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: GLASS_BG,
  },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  scheduledText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  postContent: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#fff",
    lineHeight: 19,
  },
  postActions: { flexDirection: "row", gap: 14, marginTop: 12 },
  postActionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  postActionText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.5)",
  },
});
