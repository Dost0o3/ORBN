import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { ThemeProvider, DarkTheme } from "@react-navigation/native";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useLayoutEffect, useRef } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WALLPAPER_URI } from "@/constants/wallpaper-data";
import { usePushRegistration } from "@/hooks/use-push-registration";
import { API_BASE } from "../lib/api-base";

// Force proxy for ALL platforms so that Clerk.load() applies proxyUrl to the singleton,
// which sends Clerk-Secret-Key + Clerk-Proxy-Url headers required for custom Google OAuth.
const CLERK_PROXY_URL = `${API_BASE}/api/__clerk`;

SplashScreen.preventAutoHideAsync();

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
// Base64-embedded so it is guaranteed to load on every device with no network dependency
const wallpaper = { uri: WALLPAPER_URI };

setBaseUrl(API_BASE);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      retry: 2,
      retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 5000),
      refetchOnWindowFocus: false,
    },
  },
});

function AuthWirer() {
  const { getToken, isSignedIn, signOut } = useAuth();
  const qc = useQueryClient();

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useLayoutEffect(() => {
    setAuthTokenGetter(async () => {
      try {
        return (await getTokenRef.current()) ?? null;
      } catch {
        return null;
      }
    });
    return () => setAuthTokenGetter(null);
  }, [isSignedIn]);

  useEffect(() => {
    qc.invalidateQueries();
  }, [isSignedIn, qc]);

  // Self-heal: if Clerk reports the user as signed-in but the JWT cannot be
  // fetched (e.g. stale keychain session from a prior tenant build), sign out
  // so AuthGuard sends them back to the sign-in screen instead of trapping
  // them in a logged-in shell where every API request returns 401.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const tok = await getTokenRef.current();
        if (!cancelled && (tok == null || tok === "")) {
          await signOut();
          qc.clear();
        }
      } catch {
        if (!cancelled) {
          try {
            await signOut();
          } catch {
            /* ignore */
          }
          qc.clear();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, signOut, qc]);

  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!isSignedIn && !inAuthGroup) {
      router.replace("/(auth)/sign-in");
    } else if (isSignedIn && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [isSignedIn, isLoaded, segments, router]);

  // While Clerk reads the stored session, show a centered spinner.
  // Returning null here causes a blank wallpaper screen (black screen bug).
  if (!isLoaded) {
    return (
      <View style={loadingStyles.center}>
        <ActivityIndicator size="large" color="#E8754A" />
      </View>
    );
  }

  return <>{children}</>;
}

const TRANSPARENT = { backgroundColor: "transparent" } as const;

// React Navigation's default theme applies an opaque background to every screen
// container, which paints OVER our wallpaper. This transparent theme lets the
// wallpaper bleed through every navigator — Stack, Tabs, modal, all of them.
const NavTransparentTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "transparent",
    card: "transparent",
  },
};

function PushRegistrationWirer() {
  usePushRegistration();
  return null;
}

function RootLayoutNav() {
  return (
    <AuthGuard>
      <AuthWirer />
      <PushRegistrationWirer />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          contentStyle: TRANSPARENT,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animation: "none", contentStyle: TRANSPARENT }} />
        <Stack.Screen name="(auth)" options={{ animation: "none", contentStyle: TRANSPARENT }} />
        <Stack.Screen
          name="edit-profile"
          options={{ presentation: "modal", animation: "slide_from_bottom", contentStyle: TRANSPARENT }}
        />
        <Stack.Screen name="settings" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="soul-twin" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="leaderboard" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="bounties" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="jobs" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="challenges" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="invite" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="ai-activity" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="insights" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="scheduled" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="monetize" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="profile/[userId]" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="messages" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="messages/[conversationId]" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="communities" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="circles" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="career-oracle" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="pricing" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="privacy" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="blocked" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen name="admin-reports" options={{ contentStyle: TRANSPARENT }} />
        <Stack.Screen
          name="menu"
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
            contentStyle: TRANSPARENT,
          }}
        />
      </Stack>
    </AuthGuard>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      proxyUrl={CLERK_PROXY_URL}
      tokenCache={tokenCache}
    >
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            {/* Wallpaper is the TRUE root — wraps everything so it shows behind all screens.
                Using expo-image because it handles data URIs reliably on iOS/Android/Web. */}
            <View style={styles.wallpaper}>
              <ExpoImage
                source={wallpaper}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority="high"
              />
              {/* Deep navy scrim — ensures white text stays readable against the light wallpaper */}
              <View style={styles.scrim} pointerEvents="none" />
              <GestureHandlerRootView style={styles.root}>
                <KeyboardProvider>
                  <ThemeProvider value={NavTransparentTheme}>
                    <RootLayoutNav />
                  </ThemeProvider>
                </KeyboardProvider>
              </GestureHandlerRootView>
            </View>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  wallpaper: { flex: 1, backgroundColor: "#0B1828" },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,12,38,0.42)",
  },
  root: { flex: 1, backgroundColor: "transparent" },
});

const loadingStyles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
});
