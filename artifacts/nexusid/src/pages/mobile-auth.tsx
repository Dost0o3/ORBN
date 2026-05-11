import { useEffect, useRef, useState } from "react";
import { useAuth, useClerk, SignIn } from "@clerk/react";
import { useSearch } from "wouter";

type Status = "idle" | "creating-token" | "done" | "error";

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  github: "GitHub",
  x: "X",
};

export default function MobileAuthPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const provider = params.get("provider") ?? "google";

  const { isSignedIn, isLoaded } = useAuth();
  const { session } = useClerk();

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const didFetch = useRef(false);

  const label = PROVIDER_LABELS[provider] ?? provider;
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !session) return;
    if (didFetch.current) return;
    didFetch.current = true;

    setStatus("creating-token");

    session.getToken().then((bearerToken) => {
      return fetch(`${basePath}/api/mobile-auth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        },
        credentials: "include",
      });
    })
      .then((r) => r.json())
      .then((data: { token?: string; error?: string }) => {
        if (data.token) {
          setStatus("done");
          window.location.href = `ift-mobile://auth?token=${encodeURIComponent(data.token)}`;
        } else {
          setErrorMsg(data.error ?? "Failed to generate sign-in token");
          setStatus("error");
        }
      })
      .catch((err: Error) => {
        setErrorMsg(err.message ?? "Network error");
        setStatus("error");
      });
  }, [isLoaded, isSignedIn, session, basePath]);

  const spinnerStyle: React.CSSProperties = {
    width: 38,
    height: 38,
    borderRadius: "50%",
    border: "2.5px solid #E8754A",
    borderTopColor: "transparent",
    animation: "orbn-spin 0.8s linear infinite",
  };

  const containerStyle: React.CSSProperties = {
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#0B1828",
    color: "#EEF4FF",
    fontFamily: "system-ui, -apple-system, sans-serif",
    gap: 20,
    padding: 24,
  };

  if (status === "error") {
    return (
      <div style={containerStyle}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 2, color: "#E8754A" }}>ORBN</div>
        <div style={{ fontSize: 15, color: "#E8754A" }}>Sign-in failed</div>
        <div style={{ fontSize: 13, color: "#6A8EAE", textAlign: "center", maxWidth: 300, lineHeight: 1.5 }}>
          {errorMsg}
        </div>
        <div style={{ fontSize: 12, color: "#6A8EAE" }}>You can close this window and try again.</div>
      </div>
    );
  }

  if (isLoaded && !isSignedIn) {
    return (
      <div style={containerStyle}>
        <style>{`@keyframes orbn-spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 2, color: "#E8754A" }}>ORBN</div>
        <div style={{ fontSize: 13, color: "#6A8EAE", marginBottom: 8 }}>
          Sign in with {label} to continue
        </div>
        <SignIn
          routing="hash"
          signUpUrl={`${basePath}/sign-up`}
          forceRedirectUrl={`${basePath}/mobile-auth?provider=${provider}`}
        />
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <style>{`@keyframes orbn-spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 2, color: "#E8754A" }}>ORBN</div>
      <div style={spinnerStyle} />
      <div style={{ fontSize: 14, color: "#6A8EAE" }}>
        {status === "creating-token" ? "Completing sign-in…" : status === "done" ? "Redirecting to ORBN…" : `Connecting to ${label}…`}
      </div>
    </div>
  );
}
