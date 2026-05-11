import { useAuth } from "@clerk/clerk-expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Linking, Platform } from "react-native";
import { API_DOMAIN, API_BASE } from "../lib/api-base";

const STORAGE_KEY = "iftid:expoPushToken";

/**
 * Notification payloads from the server (`outbound-notify.ts`) embed an
 * absolute URL pointing at the public web host. Expo Router's `router.push`
 * expects in-app hrefs, so we strip the host prefix when it matches our
 * known API/web domain. External absolute URLs fall back to `Linking`.
 */
function normalizeNotificationLink(raw: string): { kind: "internal"; href: string } | { kind: "external"; url: string } {
  if (!/^https?:\/\//i.test(raw)) {
    return { kind: "internal", href: raw.startsWith("/") ? raw : `/${raw}` };
  }
  try {
    const u = new URL(raw);
    // Treat the configured API/web host as in-app routes. We don't have a
    // canonical list of "all our hosts" on the client, so we accept any
    // host that matches the API domain — which is also the web origin in
    // this monorepo's deployment.
    if (u.host === API_DOMAIN) {
      return { kind: "internal", href: `${u.pathname}${u.search}${u.hash}` || "/" };
    }
  } catch {
    // fall through to external
  }
  return { kind: "external", url: raw };
}

function followNotificationLink(raw: unknown, router: ReturnType<typeof useRouter>): void {
  if (typeof raw !== "string" || raw.length === 0) return;
  const link = normalizeNotificationLink(raw);
  if (link.kind === "internal") {
    router.push(link.href as never);
  } else {
    Linking.openURL(link.url).catch(() => undefined);
  }
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function postToken(token: string, platform: string, getAuthToken: () => Promise<string | null>): Promise<boolean> {
  try {
    const auth = await getAuthToken();
    if (!auth) return false;
    const resp = await fetch(`${API_BASE}/api/users/me/push-tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token, platform }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Explicitly deregister this device's cached push token. Call this from
 * the sign-out flow BEFORE invoking Clerk's `signOut()` — once the session
 * is torn down, `getToken()` returns null and the DELETE would be skipped.
 *
 * Safe to call when there is no cached token (no-op).
 */
export async function deregisterPushTokenForSignOut(
  getAuthToken: () => Promise<string | null>,
): Promise<void> {
  const cached = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
  if (!cached) return;
  await deleteToken(cached, getAuthToken);
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
}

async function deleteToken(token: string, getAuthToken: () => Promise<string | null>): Promise<void> {
  try {
    const auth = await getAuthToken();
    if (!auth) return;
    await fetch(`${API_BASE}/api/users/me/push-tokens`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token }),
    });
  } catch {
    // best-effort: server-side cleanup will eventually drop stale tokens
  }
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    // channel setup is best-effort
  }
}

async function fetchExpoPushToken(): Promise<string | null> {
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ||
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId ||
    undefined;
  try {
    const result = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    return result.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Registers the device for Soul Twin push notifications.
 *
 * - On sign-in: requests permission (if not already granted), fetches the
 *   Expo push token, and POSTs it to the API. The token is cached in
 *   AsyncStorage so we know what to deregister on sign-out.
 * - On sign-out: DELETEs the cached token from the API and clears it.
 * - Tapping a notification with `data.link` deep-links into the app.
 */
export function usePushRegistration(): void {
  const { isSignedIn, isLoaded, getToken, userId } = useAuth();
  const router = useRouter();

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  // Register on sign-in / re-launch when signed in. Includes `userId` so
  // an in-place account switch (Clerk session swap without an intermediate
  // signed-out state) re-runs registration with the new identity. The
  // server's POST handler reassigns token ownership atomically on conflict,
  // so the previous account is detached as soon as the new one registers.
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    (async () => {
      const prevUserId = prevUserIdRef.current;
      const identityChanged = prevUserId !== undefined && prevUserId !== userId;

      // If the previously-signed-in user is gone (sign-out OR account
      // switch), proactively try to deregister the cached token. This is
      // best-effort: Clerk's `getToken()` may already have been cleared on
      // sign-out, in which case the server-side stale-token sweep is the
      // backstop. On account switch the new user's POST below will
      // reassign ownership atomically, so a missed DELETE here is safe.
      if (identityChanged && prevUserId) {
        const cached = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
        if (cached) {
          await deleteToken(cached, async () => (await getTokenRef.current()) ?? null);
          await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
        }
      }

      prevUserIdRef.current = userId ?? null;

      if (!isSignedIn) return;

      // Push notifications are not deliverable in Expo Go on SDK 53+ — bail
      // out cleanly so dev sessions don't error.
      if (Constants.appOwnership === "expo") return;

      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;
      if (status !== "granted") {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested.status;
      }
      if (status !== "granted") return;
      if (cancelled) return;

      await ensureAndroidChannel();

      const token = await fetchExpoPushToken();
      if (!token || cancelled) return;

      const ok = await postToken(token, Platform.OS, async () => (await getTokenRef.current()) ?? null);
      if (ok) {
        await AsyncStorage.setItem(STORAGE_KEY, token).catch(() => undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, isLoaded, userId]);

  // Deep-link on notification tap. Also handle the case where the app was
  // launched cold by tapping a notification (getLastNotificationResponseAsync).
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const last = await Notifications.getLastNotificationResponseAsync();
        if (!mounted || !last) return;
        const link = (last.notification.request.content.data as { link?: unknown } | null)?.link;
        followNotificationLink(link, router);
      } catch {
        // ignore
      }
    })();

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const link = (response.notification.request.content.data as { link?: unknown } | null)?.link;
      followNotificationLink(link, router);
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, [router]);
}
