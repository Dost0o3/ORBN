import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  useGetMe,
  useListUserReports,
  useUpdateUserReportStatus,
  useListAdminUsers,
  useSetUserAdmin,
} from "@workspace/api-client-react";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

const PRIMARY = "#E8754A";
const BORDER = "rgba(232,117,74,0.18)";
const CARD_BG = "rgba(15,25,60,0.42)";
const DANGER = "#DC143C";

const STATUS_TABS = [
  { key: "pending", label: "Pending" },
  { key: "reviewed", label: "Reviewed" },
  { key: "actioned", label: "Actioned" },
  { key: "dismissed", label: "Dismissed" },
] as const;

type StatusKey = (typeof STATUS_TABS)[number]["key"];

export default function AdminReportsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: me } = useGetMe();
  const [tab, setTab] = useState<"reports" | "admins">("reports");
  const [statusFilter, setStatusFilter] = useState<StatusKey>("pending");

  const reports = useListUserReports(
    { status: statusFilter },
    { query: { enabled: tab === "reports" && (me as any)?.isAdmin === true, queryKey: ["adminReports", statusFilter] } },
  );
  const admins = useListAdminUsers(
    { limit: 100 },
    { query: { enabled: tab === "admins" && (me as any)?.isAdmin === true, queryKey: ["adminUsers"] } },
  );

  const updateReport = useUpdateUserReportStatus();
  const updateAdmin = useSetUserAdmin();

  if (me && (me as any).isAdmin !== true) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 30 }]}>
        <Text style={styles.deniedTitle}>Restricted</Text>
        <Text style={styles.deniedSub}>This screen is for ORBN administrators only.</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.cta, { marginTop: 16 }]}>
          <Text style={styles.ctaText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleAction = (reportId: number, status: StatusKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateReport.mutateAsync({ reportId, data: { status } as any })
      .then(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        reports.refetch();
      })
      .catch(() => Alert.alert("Couldn't update", "Try again in a moment."));
  };

  const toggleAdmin = (userId: string, makeAdmin: boolean) => {
    Alert.alert(
      makeAdmin ? "Promote to admin?" : "Revoke admin?",
      makeAdmin
        ? "This grants moderation powers across ORBN."
        : "This user will lose admin privileges.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: makeAdmin ? "Promote" : "Revoke",
          style: makeAdmin ? "default" : "destructive",
          onPress: () => {
            updateAdmin.mutateAsync({ userId, data: { isAdmin: makeAdmin } })
              .then(() => admins.refetch())
              .catch(() => Alert.alert("Couldn't update", "Try again in a moment."));
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 20 : insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.superLabel}>ORBN · ADMIN</Text>
          <Text style={styles.headerTitle}>MODERATION</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {(["reports", "admins"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "reports" ? "Reports" : "Admin Roster"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "reports" ? (
        <>
          <View style={styles.statusRow}>
            {STATUS_TABS.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.statusChip, statusFilter === s.key && styles.statusChipActive]}
                onPress={() => setStatusFilter(s.key)}
              >
                <Text style={[styles.statusChipText, statusFilter === s.key && { color: "#fff" }]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {reports.isLoading ? (
            <View style={styles.loader}><ActivityIndicator color={PRIMARY} /></View>
          ) : (
            <FlatList
              data={(reports.data?.reports ?? []) as any[]}
              keyExtractor={(r: any) => String(r.id)}
              contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: insets.bottom + 30 }}
              renderItem={({ item }) => (
                <View style={styles.reportCard}>
                  <View style={styles.reportHeader}>
                    <Text style={styles.reportReason}>[{(item.reason ?? "other").toUpperCase()}]</Text>
                    <Text style={styles.reportTime}>{new Date(item.createdAt).toLocaleString()}</Text>
                  </View>
                  <Text style={styles.reportLine}>
                    <Text style={styles.reportLabel}>Reporter: </Text>
                    {item.reporter?.username ? `@${item.reporter.username}` : item.reporterId}
                  </Text>
                  <Text style={styles.reportLine}>
                    <Text style={styles.reportLabel}>Target: </Text>
                    {item.target?.username ? `@${item.target.username}` : item.targetUserId}
                  </Text>
                  {item.details ? (
                    <Text style={styles.reportDetails}>"{item.details}"</Text>
                  ) : null}
                  <View style={styles.actionRow}>
                    {(["reviewed", "actioned", "dismissed"] as StatusKey[]).map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.actionBtn, s === "actioned" && { borderColor: DANGER + "55" }]}
                        onPress={() => handleAction(Number(item.id), s)}
                        disabled={updateReport.isPending}
                      >
                        <Text style={[styles.actionBtnText, s === "actioned" && { color: DANGER }]}>{s.toUpperCase()}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>No reports in this status.</Text>
              }
            />
          )}
        </>
      ) : (
        admins.isLoading ? (
          <View style={styles.loader}><ActivityIndicator color={PRIMARY} /></View>
        ) : (
          <FlatList
            data={(admins.data?.users ?? []) as any[]}
            keyExtractor={(u: any) => u.id}
            contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: insets.bottom + 30 }}
            renderItem={({ item }) => (
              <View style={styles.userRow}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarText}>{(item.displayName ?? item.username ?? "?")[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.userName}>{item.displayName ?? item.username}</Text>
                  <Text style={styles.userHandle}>@{item.username ?? "—"}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => toggleAdmin(item.id, !item.isAdmin)}
                  style={[styles.adminBtn, item.isAdmin ? { borderColor: DANGER + "55" } : null]}
                  disabled={updateAdmin.isPending || item.id === me?.id}
                >
                  <Text style={[styles.adminBtnText, item.isAdmin ? { color: DANGER } : { color: PRIMARY }]}>
                    {item.id === me?.id ? "YOU" : item.isAdmin ? "REVOKE" : "PROMOTE"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>No admins yet — promote someone to get started.</Text>
            }
          />
        )
      )}
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
  deniedTitle: {
    fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center", marginTop: 80,
  },
  deniedSub: {
    fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", textAlign: "center", marginTop: 8,
  },
  cta: {
    alignSelf: "center",
    backgroundColor: PRIMARY, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 6,
  },
  ctaText: { fontFamily: "Inter_700Bold", fontSize: 12, color: "#000", letterSpacing: 1 },
  tabs: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 12, gap: 6 },
  tab: {
    flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 6,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(0,0,0,0.25)",
  },
  tabActive: { borderColor: PRIMARY + "55", backgroundColor: PRIMARY + "12" },
  tabText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.5)", letterSpacing: 0.5 },
  tabTextActive: { color: PRIMARY, fontFamily: "Inter_700Bold" },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 16, paddingTop: 10 },
  statusChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(0,0,0,0.25)",
  },
  statusChipActive: { borderColor: PRIMARY, backgroundColor: PRIMARY + "22" },
  statusChipText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.5)", letterSpacing: 0.5 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  reportCard: {
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 12, gap: 4,
  },
  reportHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reportReason: { fontSize: 10, fontFamily: "Inter_700Bold", color: PRIMARY, letterSpacing: 1 },
  reportTime: { fontSize: 9, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.35)" },
  reportLine: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
  reportLabel: { color: "rgba(255,255,255,0.4)", fontFamily: "Inter_500Medium" },
  reportDetails: {
    fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)",
    fontStyle: "italic", paddingVertical: 6, paddingHorizontal: 8,
    backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 4, marginTop: 4,
  },
  actionRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  actionBtn: {
    flex: 1, paddingVertical: 7, borderRadius: 4,
    borderWidth: 1, borderColor: "rgba(232,117,74,0.3)", alignItems: "center",
  },
  actionBtnText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.7)", letterSpacing: 0.7 },
  empty: { textAlign: "center", paddingTop: 40, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)" },
  userRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 12,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    backgroundColor: "rgba(232,117,74,0.15)", borderWidth: 1, borderColor: "rgba(232,117,74,0.4)",
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontFamily: "Inter_700Bold", color: PRIMARY },
  userName: { fontSize: 13, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.9)" },
  userHandle: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)" },
  adminBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4,
    borderWidth: 1, borderColor: PRIMARY + "55",
  },
  adminBtnText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.7 },
});
