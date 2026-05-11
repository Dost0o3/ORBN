import { Sun, Moon, Smartphone, Apple, Download, User, Shield, Bell, Bot, CheckCheck } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#E8754A]/60 mb-3 px-1">{children}</div>
  );
}

function SettingRow({ icon: Icon, label, description, children }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5 border-b border-white/5 last:border-0">
      <div className="w-8 h-8 rounded-full bg-[#E8754A]/8 border border-[#E8754A]/15 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-[#E8754A]/70" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white/85">{label}</div>
        {description && <div className="text-[11px] text-white/35 mt-0.5">{description}</div>}
      </div>
      {children}
    </div>
  );
}

interface NotificationSettings {
  autonomyEmailEnabled: boolean;
  autonomyPushEnabled: boolean;
  // Privacy toggle for DM read receipts (task #68). Lives on the same
  // settings payload because the Settings UI groups every per-user toggle
  // in one place — see GET /users/me/notification-settings.
  readReceiptsEnabled: boolean;
  hasEmail: boolean;
}

const apiBase = () => {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api`;
};

function NotifyToggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full border transition-colors",
        on ? "bg-[#E8754A]/40 border-[#E8754A]/60" : "bg-white/5 border-white/15",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
          on ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function AutonomyNotificationSettings() {
  const [state, setState] = useState<NotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase()}/users/me/notification-settings`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: NotificationSettings | null) => {
        if (!cancelled && data) setState(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function patch(updates: Partial<NotificationSettings>) {
    if (!state) return;
    setSaving(true);
    setError(null);
    const previous = state;
    setState({ ...state, ...updates });
    try {
      const r = await fetch(`${apiBase()}/users/me/notification-settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!r.ok) throw new Error(`save failed: ${r.status}`);
      const next = (await r.json()) as Partial<NotificationSettings>;
      setState({ ...previous, ...updates, ...next });
    } catch (err) {
      setState(previous);
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!state) {
    return (
      <div className="px-4 py-5 text-[11px] text-white/35">Loading notification preferences…</div>
    );
  }
  return (
    <div>
      <SettingRow
        icon={Bot}
        label="Email me when Soul Twin acts on my behalf"
        description={state.hasEmail
          ? "We'll send a heads-up email when autonomy mode runs an action — bundled within 5 minutes so a busy run won't flood your inbox."
          : "Add an email to your profile to receive these heads-ups."}
      >
        <NotifyToggle
          on={state.autonomyEmailEnabled}
          onToggle={() => patch({ autonomyEmailEnabled: !state.autonomyEmailEnabled })}
          disabled={saving || !state.hasEmail}
        />
      </SettingRow>
      <SettingRow
        icon={Smartphone}
        label="Push me when Soul Twin acts on my behalf"
        description="Native push notification on the mobile app when autonomy mode runs an action."
      >
        <NotifyToggle
          on={state.autonomyPushEnabled}
          onToggle={() => patch({ autonomyPushEnabled: !state.autonomyPushEnabled })}
          disabled={saving}
        />
      </SettingRow>
      <SettingRow
        icon={CheckCheck}
        label="Send read receipts"
        description="When off, opening a thread no longer tells the other person you saw their message. Symmetric — you also won't see read receipts on your own sent messages."
      >
        <NotifyToggle
          on={state.readReceiptsEnabled}
          onToggle={() => patch({ readReceiptsEnabled: !state.readReceiptsEnabled })}
          disabled={saving}
        />
      </SettingRow>
      {error && <div className="px-4 py-2 text-[11px] text-red-400/80">{error}</div>}
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex gap-1">
      <button
        onClick={() => setTheme("dark")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black border uppercase tracking-wider transition-all",
          theme === "dark"
            ? "border-[#E8754A]/50 text-[#E8754A] bg-[#E8754A]/10"
            : "border-white/10 text-white/35 hover:border-white/25 hover:text-white/60"
        )}
      >
        <Moon className="w-3 h-3" /> Dark
      </button>
      <button
        onClick={() => setTheme("light")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black border uppercase tracking-wider transition-all",
          theme === "light"
            ? "border-[#E8754A]/50 text-[#E8754A] bg-[#E8754A]/10"
            : "border-white/10 text-white/35 hover:border-white/25 hover:text-white/60"
        )}
      >
        <Sun className="w-3 h-3" /> Light
      </button>
    </div>
  );
}

function AppDownloadCard({ platform, store, href, icon: Icon, badge, tagline }: {
  platform: string;
  store: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  tagline: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-4 p-4 border border-[#E8754A]/15 bg-[#E8754A]/3 hover:border-[#E8754A]/35 hover:bg-[#E8754A]/8 transition-all group"
    >
      <div className="w-12 h-12 rounded-xl bg-black border border-[#E8754A]/20 flex items-center justify-center shrink-0 group-hover:border-[#E8754A]/40 transition-colors">
        <Icon className="w-6 h-6 text-[#E8754A]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-black text-sm text-white/90 flex items-center gap-2">
          {platform}
          {badge && (
            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 border border-[#E8754A]/30 text-[#E8754A]/70">
              {badge}
            </span>
          )}
        </div>
        <div className="text-[11px] text-white/40 mt-0.5">{store}</div>
        <div className="text-[10px] text-[#E8754A]/60 font-bold mt-1 uppercase tracking-wider">{tagline}</div>
      </div>
      <Download className="w-4 h-4 text-white/20 group-hover:text-[#E8754A]/60 transition-colors shrink-0" />
    </a>
  );
}

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="text-[10px] text-[#E8754A]/50 font-black uppercase tracking-[0.2em] mb-1">Preferences</div>
      <h1 className="text-2xl font-black uppercase tracking-tight mb-8">Settings</h1>

      {/* Appearance */}
      <div className="mb-8">
        <SectionHeader>Appearance</SectionHeader>
        <div className="border border-[#E8754A]/12 bg-black">
          <SettingRow icon={Sun} label="Theme" description="Switch between dark and light interface">
            <ThemeToggle />
          </SettingRow>
        </div>
      </div>

      {/* Account */}
      <div className="mb-8">
        <SectionHeader>Account</SectionHeader>
        <div className="border border-[#E8754A]/12 bg-black">
          <Link href="/profile/me">
            <SettingRow icon={User} label="Edit Profile" description="Update your display name, bio, avatar, and more" />
          </Link>
          <SettingRow icon={Bell} label="Notifications" description="Manage notification preferences" />
          <AutonomyNotificationSettings />
          <SettingRow icon={Shield} label="Privacy & Security" description="Ghost mode, data, and account controls" />
        </div>
      </div>

      {/* Download App */}
      <div className="mb-8">
        <SectionHeader>Download the App</SectionHeader>
        <p className="text-[11px] text-white/35 mb-4 px-1">
          Take ORBN everywhere. Install the native app for the full experience — faster, smoother, always-on notifications.
        </p>
        <div className="space-y-3">
          <AppDownloadCard
            platform="iPhone & iPad"
            store="Download on the App Store"
            href="https://apps.apple.com"
            icon={Apple}
            badge="iOS"
            tagline="Requires iOS 16 or later"
          />
          <AppDownloadCard
            platform="Android"
            store="Get it on Google Play"
            href="https://play.google.com"
            icon={Smartphone}
            badge="Android"
            tagline="Requires Android 9 or later"
          />
          <div className="border border-white/6 p-4">
            <div className="text-[10px] text-white/30 font-bold uppercase tracking-wider mb-1">Direct APK Download</div>
            <div className="text-[11px] text-white/45 mb-3">
              Install directly on Android without the Play Store. Enable "Unknown sources" in your device settings first.
            </div>
            <a
              href="#"
              className="inline-flex items-center gap-2 px-4 py-2 border border-[#E8754A]/25 text-[#E8754A]/70 text-[11px] font-black uppercase tracking-wider hover:border-[#E8754A]/50 hover:text-[#E8754A] transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download APK (Android)
            </a>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="mb-8">
        <SectionHeader>About</SectionHeader>
        <div className="border border-[#E8754A]/12 bg-black p-4 space-y-2">
          <div className="flex justify-between text-[11px]">
            <span className="text-white/40">Version</span>
            <span className="text-white/65 font-bold">1.0.0</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-white/40">Platform</span>
            <span className="text-white/65 font-bold">ORBN Web</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-white/40">Build</span>
            <span className="text-white/65 font-bold">Production</span>
          </div>
        </div>
      </div>
    </div>
  );
}
