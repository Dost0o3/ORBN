import { useEffect, useState } from "react";

const basePath = () => import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

export interface AchievementInfo {
  key: string;
  title: string;
  description: string;
  icon: string;
  earnedAt: string;
}

export function useStreak(userId: string | undefined): StreakInfo | null {
  const [data, setData] = useState<StreakInfo | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetch(`${basePath()}/api/users/${userId}/streak`).then(async (r) => {
      if (!r.ok || cancelled) return;
      const j = await r.json();
      if (!cancelled) setData(j);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);
  return data;
}

export function useAchievements(userId: string | undefined): AchievementInfo[] {
  const [data, setData] = useState<AchievementInfo[]>([]);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetch(`${basePath()}/api/users/${userId}/achievements`).then(async (r) => {
      if (!r.ok || cancelled) return;
      const j = await r.json();
      if (!cancelled) setData(j.achievements ?? []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);
  return data;
}
