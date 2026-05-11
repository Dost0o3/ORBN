import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { API_BASE } from "../lib/api-base";

interface QueueItem {
  id: number;
  kind: string;
  status: string;
  payload?: Record<string, unknown> | null;
  executedAt?: string | null;
  resolvedAt?: string | null;
}

interface Props {
  refreshKey?: number;
}

const FAILED_GRACE_MS = 30_000;

function isNeedsRetry(q: QueueItem): boolean {
  if (q.status !== "approved") return false;
  if (q.executedAt) return false;
  const resolvedMs = q.resolvedAt ? new Date(q.resolvedAt).getTime() : 0;
  if (resolvedMs && Date.now() - resolvedMs < FAILED_GRACE_MS) return false;
  return true;
}

function actionLabel(q: QueueItem): string {
  const target =
    (q.payload && typeof q.payload === "object" && (q.payload as any).targetName) ||
    (q.payload && typeof q.payload === "object" && (q.payload as any).topic) ||
    "";
  if (q.kind === "follow") return target ? `Follow ${target}` : "Follow suggestion";
  if (q.kind === "dm") return target ? `DM ${target}` : "Send DM";
  if (q.kind === "post") return target ? `Post: ${target}` : "Publish post";
  if (q.kind === "comment") return "Post comment";
  return q.kind;
}

export default function AgentQueueRetryStrip({ refreshKey }: Props) {
  const { getToken } = useAuth();
  const [items, setItems] = useState<QueueItem[]>([]);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/ai/soul-twin/agent/queue`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) return;
      const j = await res.json();
      const list: QueueItem[] = Array.isArray(j.actions)
        ? j.actions
        : Array.isArray(j.queue)
          ? j.queue
          : [];
      setItems(list.filter(isNeedsRetry));
    } catch {
      // ignore
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Ionicons name="alert-circle-outline" size={12} color="#DC143C" />
        <Text style={styles.headerLabel}>NEEDS RETRY · AGENT QUEUE</Text>
      </View>
      <Text style={styles.helper}>
        Agent tried this but it didn't go through — open to retry.
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((q) => (
          <View key={q.id} style={styles.chip}>
            <Text style={styles.chipBadge}>NEEDS RETRY</Text>
            <Text style={styles.chipTitle} numberOfLines={2}>
              {actionLabel(q)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(220,20,60,0.40)",
    backgroundColor: "rgba(220,20,60,0.06)",
    paddingVertical: 10,
    gap: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
  },
  headerLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#DC143C",
    letterSpacing: 1.5,
  },
  helper: {
    paddingHorizontal: 16,
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.55)",
    lineHeight: 14,
  },
  row: { paddingHorizontal: 16, gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.45)",
    backgroundColor: "rgba(220,20,60,0.10)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 3,
    maxWidth: 220,
  },
  chipBadge: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    color: "#DC143C",
    letterSpacing: 1.2,
  },
  chipTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "rgba(255,255,255,0.85)",
  },
});
