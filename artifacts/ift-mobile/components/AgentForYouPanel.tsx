import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAgent } from "@/hooks/useAgent";

interface Props {
  refreshKey?: number;
}

export default function AgentForYouPanel({ refreshKey }: Props) {
  const router = useRouter();
  const { scan, busy, runScan } = useAgent();

  useEffect(() => {
    if (!scan) {
      runScan().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      runScan().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="sparkles-outline" size={12} color="#34D399" />
          <Text style={styles.headerLabel}>FOR YOU · AGENT PICKS</Text>
        </View>
        <TouchableOpacity onPress={() => runScan().catch(() => {})} disabled={busy} style={styles.rescanBtn}>
          {busy ? <ActivityIndicator size="small" color="#34D399" /> : <Ionicons name="refresh" size={11} color="rgba(52,211,153,0.85)" />}
          <Text style={styles.rescanText}>Rescan</Text>
        </TouchableOpacity>
      </View>

      {!scan && busy ? (
        <Text style={styles.empty}>Scanning your network…</Text>
      ) : null}

      {scan && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {scan.connections.map((c) => (
            <TouchableOpacity
              key={c.userId}
              onPress={() => router.push(`/profile/${c.userId}` as any)}
              style={styles.card}
            >
              <View style={styles.cardLabel}>
                <Ionicons name="people-outline" size={10} color="rgba(255,255,255,0.5)" />
                <Text style={styles.cardLabelText}>CONNECT</Text>
              </View>
              <Text style={styles.cardTitle} numberOfLines={1}>{c.displayName}</Text>
              <Text style={styles.cardBody} numberOfLines={3}>{c.reason}</Text>
            </TouchableOpacity>
          ))}
          {scan.opportunities.map((o) => (
            <View key={o.id} style={styles.card}>
              <View style={styles.cardLabel}>
                <Ionicons name="flag-outline" size={10} color="rgba(255,255,255,0.5)" />
                <Text style={styles.cardLabelText}>{o.kind.toUpperCase()}</Text>
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>{o.title}</Text>
              <Text style={styles.cardBody} numberOfLines={3}>{o.summary}</Text>
            </View>
          ))}
          {scan.suggestedPosts.map((p, i) => (
            <View key={i} style={styles.card}>
              <View style={styles.cardLabel}>
                <Ionicons name="document-text-outline" size={10} color="rgba(255,255,255,0.5)" />
                <Text style={styles.cardLabelText}>DRAFT</Text>
              </View>
              <Text style={styles.cardTitle} numberOfLines={1}>{p.topic}</Text>
              <Text style={styles.cardBody} numberOfLines={4}>{p.draft}</Text>
            </View>
          ))}
          {scan.connections.length === 0 && scan.opportunities.length === 0 && scan.suggestedPosts.length === 0 && (
            <Text style={styles.empty}>No new picks right now. Pull to refresh later.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(52,211,153,0.25)",
    backgroundColor: "rgba(52,211,153,0.04)",
    paddingVertical: 12,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#34D399", letterSpacing: 1.5 },
  rescanBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(52,211,153,0.30)" },
  rescanText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(52,211,153,0.85)", letterSpacing: 0.8 },
  empty: { paddingHorizontal: 16, fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "Inter_400Regular", fontStyle: "italic" },
  row: { paddingHorizontal: 16, gap: 8 },
  card: {
    width: 200,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.30)",
    padding: 10,
    gap: 4,
  },
  cardLabel: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardLabelText: { fontSize: 8, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.5)", letterSpacing: 1 },
  cardTitle: { fontSize: 12, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.85)" },
  cardBody: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)", lineHeight: 14 },
});
