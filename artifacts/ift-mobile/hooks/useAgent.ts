import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";

import { API_BASE } from "../lib/api-base";

export interface AgentScanResult {
  connections: Array<{ userId: string; displayName: string; username: string; reason: string }>;
  opportunities: Array<{ id: number; kind: string; title: string; summary: string; cta: string | null; ctaUrl: string | null }>;
  suggestedPosts: Array<{ topic: string; draft: string }>;
}

export interface AgentStatus {
  agentModeEnabled: boolean;
  agentAutonomyEnabled: boolean;
  agentConsentedAt: string | null;
}

export function useAgent() {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [scan, setScan] = useState<AgentScanResult | null>(null);
  const [busy, setBusy] = useState(false);

  const headers = useCallback(async () => {
    const token = await getToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [getToken]);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users/me`, { headers: await headers() });
      if (!res.ok) return;
      const body = await res.json();
      setStatus({
        agentModeEnabled: body.agentModeEnabled === true,
        agentAutonomyEnabled: body.agentAutonomyEnabled === true,
        agentConsentedAt: body.agentConsentedAt ?? null,
      });
    } catch {
      // ignore
    }
  }, [headers]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const setMode = useCallback(async (enabled: boolean, opts?: { autonomy?: boolean; consent?: boolean }) => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/users/me/agent-mode`, {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ enabled, autonomy: opts?.autonomy === true, consent: opts?.consent === true }),
      });
      if (!res.ok) throw new Error("agent-mode failed");
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  }, [headers, refreshStatus]);

  const runScan = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/ai/soul-twin/agent/scan`, {
        method: "POST",
        headers: await headers(),
      });
      if (!res.ok) throw new Error("scan failed");
      const body = (await res.json()) as AgentScanResult;
      setScan(body);
      return body;
    } finally {
      setBusy(false);
    }
  }, [headers]);

  return { status, scan, busy, setMode, runScan, refreshStatus };
}
