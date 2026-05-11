import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import { API_BASE } from "../lib/api-base";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

const KIND_LABEL: Record<string, string> = {
  follow: "Follow",
  unfollow: "Unfollow",
  comment: "Comment",
  like: "Like",
  dm: "DM",
  reply: "Reply",
};

type AgentAction = {
  id: string;
  kind: string;
  status?: string;
  summary?: string | null;
  targetLabel?: string | null;
  executedAt?: string | null;
  revertedAt?: string | null;
  failureReason?: string | null;
  errorCode?: string | null;
  retryable?: boolean;
};

function timeAgo(s?: string | null) {
  if (!s) return "";
  const ms = Date.now() - new Date(s).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AgentQueuePanel() {
  const colors = useColors();
  const { getToken } = useAuth();
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [pending, setPending] = useState<AgentAction[]>([]);
  const [history, setHistory] = useState<AgentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const headers = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const load = useCallback(async () => {
    try {
      const h = await headers();
      const [p, x] = await Promise.all([
        fetch(`${API_BASE}/api/ai/soul-twin/agent/queue?status=pending&limit=20`, { headers: h }),
        fetch(`${API_BASE}/api/ai/soul-twin/agent/queue?status=executed&limit=20`, { headers: h }),
      ]);
      if (!mountedRef.current) return;
      const pData = p.ok ? await p.json().catch(() => ({})) : {};
      const xData = x.ok ? await x.json().catch(() => ({})) : {};
      const pList = (pData?.actions ?? pData?.queue ?? pData?.items ?? []) as AgentAction[];
      const xList = (xData?.actions ?? xData?.queue ?? xData?.items ?? []) as AgentAction[];
      if (!mountedRef.current) return;
      setPending(pList.filter((a) => a.status === "pending" || !a.status));
      setHistory(xList.filter((a) => !!a.executedAt || a.status === "executed" || a.status === "failed"));
    } catch {
      // Silent
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    load();
  }, [load]);

  const callAction = useCallback(
    async (id: string, path: string, optimistic: () => void) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setBusy(id);
      const previousPending = pending;
      const previousHistory = history;
      optimistic();
      try {
        const h = await headers();
        const res = await fetch(`${API_BASE}/api/ai/soul-twin/agent/${path}`, {
          method: "POST",
          headers: h,
        });
        if (!mountedRef.current) return;
        if (res.status === 429) {
          Alert.alert("Daily limit reached", "Try again tomorrow.");
          setPending(previousPending);
          setHistory(previousHistory);
          return;
        }
        if (!res.ok) throw new Error("request failed");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        load();
      } catch {
        if (!mountedRef.current) return;
        setPending(previousPending);
        setHistory(previousHistory);
        Alert.alert("Couldn't complete", "Try again in a moment.");
      } finally {
        if (mountedRef.current) setBusy(null);
      }
    },
    [headers, load, pending, history],
  );

  const approve = (a: AgentAction) =>
    callAction(a.id, `queue/${a.id}/approve`, () => setPending((prev) => prev.filter((p) => p.id !== a.id)));
  const reject = (a: AgentAction) =>
    callAction(a.id, `queue/${a.id}/reject`, () => setPending((prev) => prev.filter((p) => p.id !== a.id)));
  const retry = (a: AgentAction) =>
    callAction(a.id, `queue/${a.id}/retry`, () => {});
  const undo = (a: AgentAction) =>
    Alert.alert("Undo this action?", `This will reverse: ${KIND_LABEL[a.kind] ?? a.kind}${a.targetLabel ? " " + a.targetLabel : ""}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Undo",
        style: "destructive",
        onPress: () =>
          callAction(a.id, `executed/${a.id}/undo`, () =>
            setHistory((prev) => prev.map((h) => (h.id === a.id ? { ...h, revertedAt: new Date().toISOString() } : h))),
          ),
      },
    ]);

  const list = tab === "pending" ? pending : history;

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (pending.length === 0 && history.length === 0) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Ionicons name="terminal" size={12} color={colors.primary} />
        <Text style={[styles.title, { color: colors.primary }]}>SOUL TWIN AGENT</Text>
        <View style={styles.tabRow}>
          {(["pending", "history"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={[
                styles.tabBtn,
                tab === t && { borderColor: colors.primary, backgroundColor: colors.primary + "1A" },
              ]}
            >
              <Text style={[styles.tabText, tab === t && { color: colors.primary }]}>
                {t === "pending" ? `Pending ${pending.length ? "· " + pending.length : ""}` : "History"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {list.length === 0 ? (
        <Text style={styles.emptyText}>
          {tab === "pending" ? "No pending suggestions" : "No recent actions"}
        </Text>
      ) : (
        list.slice(0, 8).map((a) => {
          const isBusy = busy === a.id;
          const reverted = !!a.revertedAt;
          const failed = a.status === "failed";
          return (
            <View key={a.id} style={[styles.row, { borderColor: colors.primary + "1A" }]}>
              <View style={styles.iconBubble}>
                <Text style={{ fontSize: 13 }}>🤖</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowText} numberOfLines={2}>
                  {a.summary ?? `${KIND_LABEL[a.kind] ?? a.kind}${a.targetLabel ? " " + a.targetLabel : ""}`}
                </Text>
                <Text style={styles.rowMeta}>
                  {tab === "pending"
                    ? "Awaiting your approval"
                    : reverted
                      ? `Reverted · ${timeAgo(a.revertedAt)}`
                      : failed
                        ? `Failed${a.failureReason ? ` · ${a.failureReason}` : ""}`
                        : timeAgo(a.executedAt)}
                </Text>
              </View>
              <View style={styles.actions}>
                {isBusy ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : tab === "pending" ? (
                  <>
                    <TouchableOpacity
                      onPress={() => reject(a)}
                      style={[styles.btn, { borderColor: colors.destructive + "88" }]}
                    >
                      <Text style={[styles.btnText, { color: colors.destructive }]}>NO</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => approve(a)}
                      style={[styles.btn, { borderColor: "#34D399", backgroundColor: "rgba(52,211,153,0.12)" }]}
                    >
                      <Text style={[styles.btnText, { color: "#34D399" }]}>OK</Text>
                    </TouchableOpacity>
                  </>
                ) : failed && a.retryable !== false ? (
                  <TouchableOpacity
                    onPress={() => retry(a)}
                    style={[styles.btn, { borderColor: colors.primary }]}
                  >
                    <Text style={[styles.btnText, { color: colors.primary }]}>RETRY</Text>
                  </TouchableOpacity>
                ) : !reverted && !failed ? (
                  <TouchableOpacity
                    onPress={() => undo(a)}
                    style={[styles.btn, { borderColor: colors.destructive + "88" }]}
                  >
                    <Text style={[styles.btnText, { color: colors.destructive }]}>UNDO</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loaderWrap: { paddingVertical: 12, alignItems: "center" },
  panel: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(232,117,74,0.18)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    paddingBottom: 10,
  },
  title: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1.5, flex: 1 },
  tabRow: { flexDirection: "row", gap: 4 },
  tabBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 4,
    borderColor: "rgba(232,117,74,0.2)",
  },
  tabText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.5)", letterSpacing: 0.6 },
  emptyText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
    paddingVertical: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
    backgroundColor: "rgba(232,117,74,0.04)",
  },
  iconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(232,117,74,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.92)", lineHeight: 17 },
  rowMeta: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)", marginTop: 2 },
  actions: { flexDirection: "row", gap: 6 },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1.2,
    borderRadius: 6,
    minWidth: 50,
    alignItems: "center",
  },
  btnText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
});
