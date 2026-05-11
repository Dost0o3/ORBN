import { useSignIn, useOAuth } from "@clerk/clerk-expo";
import { Link } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

WebBrowser.maybeCompleteAuthSession();

type SsoStrategy = "oauth_google" | "oauth_apple" | "oauth_github" | "oauth_x";
const SSO_PROVIDERS: { strategy: SsoStrategy; label: string; glyph: string; bg: string; fg: string }[] = [
  { strategy: "oauth_google", label: "Continue with Google", glyph: "G", bg: "#ffffff", fg: "#1a1a1a" },
  { strategy: "oauth_apple", label: "Continue with Apple", glyph: "", bg: "#000000", fg: "#ffffff" },
  { strategy: "oauth_github", label: "Continue with GitHub", glyph: "", bg: "#24292e", fg: "#ffffff" },
  { strategy: "oauth_x", label: "Continue with X", glyph: "", bg: "#0f0f0f", fg: "#ffffff" },
];

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn, setActive, isLoaded } = useSignIn();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState<SsoStrategy | null>(null);
  const [error, setError] = useState("");

  const { startOAuthFlow: startGoogleFlow } = useOAuth({ strategy: "oauth_google" });
  const { startOAuthFlow: startAppleFlow } = useOAuth({ strategy: "oauth_apple" });
  const { startOAuthFlow: startGithubFlow } = useOAuth({ strategy: "oauth_github" });
  const { startOAuthFlow: startXFlow } = useOAuth({ strategy: "oauth_x" });

  const flowForStrategy = (s: SsoStrategy) => {
    switch (s) {
      case "oauth_google": return startGoogleFlow;
      case "oauth_apple": return startAppleFlow;
      case "oauth_github": return startGithubFlow;
      case "oauth_x": return startXFlow;
    }
  };

  const handleSsoSignIn = async (strategy: SsoStrategy) => {
    if (ssoLoading || loading) return;
    try {
      setSsoLoading(strategy);
      setError("");

      const startFlow = flowForStrategy(strategy);
      const { createdSessionId, setActive: ssoSetActive } = await startFlow({
        redirectUrl: Linking.createURL("/oauth-native-callback", { scheme: "ift-mobile" }),
      });

      if (createdSessionId && ssoSetActive) {
        await ssoSetActive({ session: createdSessionId });
      }
    } catch (err: unknown) {
      const e = err as { errors?: { message?: string; longMessage?: string; code?: string }[]; message?: string };
      const clerkErr = e.errors?.[0];
      const msg =
        clerkErr?.longMessage ||
        clerkErr?.message ||
        (clerkErr?.code ? `[${clerkErr.code}]` : null) ||
        e.message ||
        "Sign in failed. Please try again.";
      setError(msg);
    } finally {
      setSsoLoading(null);
    }
  };

  const handleSignIn = async () => {
    if (!isLoaded || loading) return;
    try {
      setLoading(true);
      setError("");
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
      }
    } catch (err: unknown) {
      const e = err as { errors?: { message?: string }[] };
      setError(e.errors?.[0]?.message ?? "Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading && !ssoLoading;

  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ backgroundColor: "transparent" }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: topPad + 48,
            paddingBottom: bottomPad + 32,
            paddingHorizontal: 28,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandBlock}>
            <Text style={[styles.brand, { color: colors.primary }]}>ORBN</Text>
            <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
              Your professional identity
            </Text>
          </View>

          <Text style={[styles.heading, { color: colors.foreground }]}>Welcome back</Text>
          <Text style={[styles.subheading, { color: colors.mutedForeground }]}>
            Sign in to your network
          </Text>

          {error ? (
            <View
              style={[
                styles.errorBox,
                {
                  backgroundColor: colors.destructive + "22",
                  borderColor: colors.destructive + "55",
                },
              ]}
            >
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            </View>
          ) : null}

          {SSO_PROVIDERS.map((p) => {
            const isThisLoading = ssoLoading === p.strategy;
            const anyBusy = !!ssoLoading || loading;
            return (
              <TouchableOpacity
                key={p.strategy}
                onPress={() => handleSsoSignIn(p.strategy)}
                disabled={anyBusy}
                activeOpacity={0.82}
                style={[styles.ssoBtn, { backgroundColor: p.bg, opacity: anyBusy && !isThisLoading ? 0.4 : 1 }]}
              >
                {isThisLoading ? (
                  <ActivityIndicator color={p.fg} size="small" />
                ) : (
                  <>
                    {p.glyph ? <Text style={[styles.ssoGlyph, { color: p.strategy === "oauth_google" ? "#4285F4" : p.fg }]}>{p.glyph}</Text> : null}
                    <Text style={[styles.ssoBtnText, { color: p.fg }]}>{p.label}</Text>
                  </>
                )}
              </TouchableOpacity>
            );
          })}

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerLabel, { color: colors.mutedForeground }]}>or</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Email</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                  color: colors.foreground,
                  fontFamily: "Inter_400Regular",
                },
              ]}
              placeholder="you@example.com"
              placeholderTextColor={colors.mutedForeground}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Password</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.input,
                  borderColor: colors.border,
                  color: colors.foreground,
                  fontFamily: "Inter_400Regular",
                },
              ]}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
            />
          </View>

          <TouchableOpacity
            onPress={handleSignIn}
            disabled={!canSubmit}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: colors.primary,
                opacity: canSubmit ? 1 : 0.4,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                Sign In
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.linkRow}>
            <Text style={[styles.linkText, { color: colors.mutedForeground }]}>No account? </Text>
            <Link href="/(auth)/sign-up" asChild>
              <TouchableOpacity>
                <Text style={[styles.linkAction, { color: colors.primary }]}>Sign Up</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  brandBlock: { marginBottom: 40 },
  brand: { fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: 2.5 },
  tagline: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 5 },
  heading: { fontSize: 26, fontFamily: "Inter_700Bold" },
  subheading: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4, marginBottom: 28 },
  errorBox: { padding: 14, borderRadius: 4, borderWidth: 1, marginBottom: 16 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  ssoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 4,
    minHeight: 50,
    marginBottom: 10,
  },
  ssoGlyph: { fontSize: 16, fontFamily: "Inter_700Bold" },
  ssoBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 22, gap: 12 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  fieldGroup: { marginBottom: 16 },
  label: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginBottom: 7,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
  },
  primaryBtn: {
    paddingVertical: 15,
    borderRadius: 4,
    alignItems: "center",
    marginTop: 8,
    minHeight: 50,
    justifyContent: "center",
  },
  primaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
  },
  linkText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  linkAction: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
