import { useCallback, useState } from "react";

const basePath = () => import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export interface AgentScanResult {
  connections: Array<{ userId: string; displayName: string; username: string; reason: string }>;
  opportunities: Array<{ id: number; kind: string; title: string; summary: string; cta: string | null; ctaUrl: string | null }>;
  suggestedPosts: Array<{ topic: string; draft: string }>;
}

export function useAgentScan() {
  const [data, setData] = useState<AgentScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${basePath()}/api/ai/soul-twin/agent/scan`, { method: "POST" });
      if (!res.ok) throw new Error(`scan failed (${res.status})`);
      const body = (await res.json()) as AgentScanResult;
      setData(body);
      return body;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const draftDm = useCallback(async (targetUserId: string, context?: string): Promise<string> => {
    const res = await fetch(`${basePath()}/api/ai/soul-twin/agent/draft-dm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId, context }),
    });
    if (!res.ok) throw new Error(`draft failed (${res.status})`);
    const body = (await res.json()) as { draft: string };
    return body.draft;
  }, []);

  const retryAction = useCallback(async (actionId: number) => {
    const res = await fetch(`${basePath()}/api/ai/soul-twin/agent/queue/${actionId}/retry`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(typeof body?.error === "string" ? body.error : `retry failed (${res.status})`);
    }
    return res.json();
  }, []);

  const setAgentMode = useCallback(async (enabled: boolean, opts?: { autonomy?: boolean; consent?: boolean }) => {
    const res = await fetch(`${basePath()}/api/users/me/agent-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, autonomy: opts?.autonomy === true, consent: opts?.consent === true }),
    });
    if (!res.ok) throw new Error(`agent-mode failed (${res.status})`);
    return res.json();
  }, []);

  return { data, loading, error, run, draftDm, retryAction, setAgentMode };
}

export interface AgentMeStatus {
  agentModeEnabled: boolean;
  agentAutonomyEnabled: boolean;
  agentConsentedAt: string | null;
}

export async function fetchAgentStatus(): Promise<AgentMeStatus | null> {
  try {
    const res = await fetch(`${basePath()}/api/users/me`);
    if (!res.ok) return null;
    const body = await res.json();
    return {
      agentModeEnabled: body.agentModeEnabled === true,
      agentAutonomyEnabled: body.agentAutonomyEnabled === true,
      agentConsentedAt: body.agentConsentedAt ?? null,
    };
  } catch {
    return null;
  }
}
