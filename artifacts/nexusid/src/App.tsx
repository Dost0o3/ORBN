import { useEffect, useRef, lazy, Suspense } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, AuthenticateWithRedirectCallback } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setGhostModeGetter, setAuthTokenGetter } from "@workspace/api-client-react";
import AppLayout from "@/components/app-layout";
import { ThemeProvider } from "@/components/theme-provider";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { OnboardingTour } from "@/components/onboarding-tour";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { ScrollRestoration } from "@/components/scroll-restoration";
import { usePresenceHeartbeat } from "@/hooks/use-presence-heartbeat";

// Eager: landing + 404 (used for first paint and unmatched routes)
import LandingPage from "@/pages/landing";
import NotFound from "@/pages/not-found";

// Lazy: all authenticated pages — split into separate chunks
const FeedPage = lazy(() => import("@/pages/feed"));
const ExplorePage = lazy(() => import("@/pages/explore"));
const ProfilePage = lazy(() => import("@/pages/profile"));
const JobsPage = lazy(() => import("@/pages/jobs"));
const CommunitiesPage = lazy(() => import("@/pages/communities"));
const NotificationsPage = lazy(() => import("@/pages/notifications"));
const SoulTwinPage = lazy(() => import("@/pages/soul-twin"));
const CareerOraclePage = lazy(() => import("@/pages/career-oracle"));
const CreatePostPage = lazy(() => import("@/pages/create-post"));
const BountiesPage = lazy(() => import("@/pages/bounties"));
const CirclesPage = lazy(() => import("@/pages/circles"));
const LeaderboardPage = lazy(() => import("@/pages/leaderboard"));
const ConnectPage = lazy(() => import("@/pages/connect"));
const PricingPage = lazy(() => import("@/pages/pricing"));
const BillingSuccessPage = lazy(() => import("@/pages/billing-success"));
const DocsPage = lazy(() => import("@/pages/docs"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const MessagesPage = lazy(() => import("@/pages/messages"));
const AdminReportsPage = lazy(() => import("@/pages/admin-reports"));

setGhostModeGetter(() => {
  try { return localStorage.getItem("nexusid-ghost-mode") === "true"; } catch { return false; }
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/ift-logo.png`,
  },
  variables: {
    colorPrimary: "#1a6fff",
    colorForeground: "#f7f7f7",
    colorMutedForeground: "#858585",
    colorDanger: "#e03131",
    colorBackground: "#121212",
    colorInput: "#1e1e1e",
    colorInputForeground: "#f7f7f7",
    colorNeutral: "#242424",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "4px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#121212] border border-[#242424] rounded-sm w-[440px] max-w-full overflow-hidden shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-white font-bold tracking-tight",
    headerSubtitle: "text-[#858585]",
    socialButtonsBlockButtonText: "text-white",
    formFieldLabel: "text-[#b0b0b0] text-xs font-medium uppercase tracking-wider",
    footerActionLink: "text-[#1a6fff] hover:text-[#4488ff] font-medium",
    footerActionText: "text-[#858585]",
    dividerText: "text-[#444444]",
    identityPreviewEditButton: "text-[#1a6fff]",
    formFieldSuccessText: "text-green-400",
    alertText: "text-red-400",
    logoBox: "flex justify-center mb-2",
    logoImage: "w-10 h-10",
    socialButtonsBlockButton: "border border-[#2a2a2a] bg-[#181818] hover:bg-[#222222] text-white transition-colors",
    formButtonPrimary: "bg-[#1a6fff] hover:bg-[#0055dd] text-white font-semibold rounded-sm transition-colors",
    formFieldInput: "bg-[#1e1e1e] border border-[#2e2e2e] text-white rounded-sm focus:border-[#1a6fff] transition-colors",
    footerAction: "border-t border-[#1e1e1e]",
    dividerLine: "bg-[#2a2a2a]",
    alert: "bg-[#2a1010] border border-red-900",
    otpCodeFieldInput: "bg-[#1e1e1e] border border-[#2e2e2e] text-white",
    formFieldRow: "gap-3",
    main: "gap-4",
  },
};

function ClerkAuthTokenSetup() {
  const { session } = useClerk();
  useEffect(() => {
    setAuthTokenGetter(async () => {
      if (!session) return null;
      try {
        return await session.getToken();
      } catch {
        return null;
      }
    });
    return () => setAuthTokenGetter(null);
  }, [session]);
  return null;
}

function PresenceHeartbeat() {
  usePresenceHeartbeat(true);
  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function PageFallback() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 rounded-full border-2 border-current border-t-transparent animate-spin" />
        <span className="text-xs uppercase tracking-[0.2em]">Loading</span>
      </div>
    </div>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        appearance={clerkAppearance}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        appearance={clerkAppearance}
      />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/feed" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <AppLayout>
          <Component />
        </AppLayout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageFallback />}>
      <ScrollRestoration />
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/v1/oauth_callback" component={() => <AuthenticateWithRedirectCallback />} />
        <Route path="/pricing" component={PricingPage} />
        <Route path="/docs" component={DocsPage} />
        <Route path="/billing/success" component={() => <ProtectedRoute component={BillingSuccessPage} />} />
        <Route path="/feed" component={() => <ProtectedRoute component={FeedPage} />} />
        <Route path="/explore" component={() => <ProtectedRoute component={ExplorePage} />} />
        <Route path="/profile/me" component={() => <ProtectedRoute component={() => <ProfilePage mine />} />} />
        <Route path="/profile/:userId" component={() => <ProtectedRoute component={ProfilePage} />} />
        <Route path="/u/:username" component={() => (
          <AppLayout>
            <ProfilePage />
          </AppLayout>
        )} />
        <Route path="/jobs" component={() => <ProtectedRoute component={JobsPage} />} />
        <Route path="/communities" component={() => <ProtectedRoute component={CommunitiesPage} />} />
        <Route path="/notifications" component={() => <ProtectedRoute component={NotificationsPage} />} />
        <Route path="/ai/soul-twin" component={() => <ProtectedRoute component={SoulTwinPage} />} />
        <Route path="/ai/career-oracle" component={() => <ProtectedRoute component={CareerOraclePage} />} />
        <Route path="/create-post" component={() => <ProtectedRoute component={CreatePostPage} />} />
        <Route path="/bounties" component={() => <ProtectedRoute component={BountiesPage} />} />
        <Route path="/circles" component={() => <ProtectedRoute component={CirclesPage} />} />
        <Route path="/leaderboard" component={() => <ProtectedRoute component={LeaderboardPage} />} />
        <Route path="/connect" component={() => <ProtectedRoute component={ConnectPage} />} />
        <Route path="/settings" component={() => <ProtectedRoute component={SettingsPage} />} />
        <Route path="/messages" component={() => <ProtectedRoute component={MessagesPage} />} />
        <Route path="/admin/reports" component={() => <ProtectedRoute component={AdminReportsPage} />} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ClerkAuthTokenSetup />
            <ClerkQueryClientCacheInvalidator />
            <Show when="signed-in">
              <PresenceHeartbeat />
            </Show>
            <AnalyticsProvider>
              <AppErrorBoundary>
                <Router />
              </AppErrorBoundary>
              <OnboardingTour />
              <Toaster />
            </AnalyticsProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
