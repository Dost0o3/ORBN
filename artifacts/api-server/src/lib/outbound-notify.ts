import { db, usersTable, devicePushTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Out-of-band heads-up channel for autonomy executions ("Soul Twin acted
 * on your behalf"). Mirrors the in-app notification metadata so the email
 * / push body and the inbox row tell the same story.
 *
 * Both channels are fire-and-forget side effects: the in-app notification
 * is the source of truth, and a delivery failure here must not roll back
 * the autonomy side effect or block further execution. We log + swallow.
 */
export interface OutboundEntry {
  kind: string;
  label: string;
  /** Optional deep link back into the app for the recipient/post/etc. */
  link: string | null;
}

/**
 * Resolve the absolute URL to embed in the email/push so the link works
 * even when the user opens it in a different client. Falls back to the
 * Replit dev domain in development and to a relative link if neither is
 * available — the inbox row is still authoritative.
 */
function publicLink(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const domains = (process.env.REPLIT_DOMAINS ?? "").split(",").map((d) => d.trim()).filter(Boolean);
  const host = domains[0] ?? process.env.REPLIT_DEV_DOMAIN;
  if (!host) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `https://${host}${normalized}`;
}

function summaryLine(entries: OutboundEntry[]): string {
  if (entries.length === 1) {
    const first = entries[0].label;
    return `Soul Twin ${first.charAt(0).toLowerCase()}${first.slice(1)} on your behalf.`;
  }
  return `Soul Twin took ${entries.length} actions on your behalf.`;
}

function emailBody(displayName: string | null, entries: OutboundEntry[]): { subject: string; text: string; html: string } {
  const subject = entries.length === 1
    ? `Soul Twin: ${entries[0].label}`
    : `Soul Twin took ${entries.length} actions on your behalf`;
  const greeting = displayName ? `Hi ${displayName},` : "Hi,";
  const lines = entries.map((e) => {
    const link = publicLink(e.link);
    return link ? `• ${e.label} — ${link}` : `• ${e.label}`;
  });
  const text = [
    greeting,
    "",
    summaryLine(entries),
    "",
    ...lines,
    "",
    "If anything looks off, you can revert it from your inbox within 10 minutes.",
    "",
    "— ORBN",
    "",
    "(You're getting this because Soul Twin's Set & Forget mode is on. You can opt out from Settings → Notifications.)",
  ].join("\n");
  const htmlLines = entries.map((e) => {
    const link = publicLink(e.link);
    return link
      ? `<li>${escapeHtml(e.label)} — <a href="${link}">${link}</a></li>`
      : `<li>${escapeHtml(e.label)}</li>`;
  }).join("");
  const html = `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(summaryLine(entries))}</p><ul>${htmlLines}</ul><p>If anything looks off, you can revert it from your inbox within 10 minutes.</p><p>— ORBN</p><p style="color:#888;font-size:12px">You're getting this because Soul Twin's Set &amp; Forget mode is on. You can opt out from Settings → Notifications.</p>`;
  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

/**
 * Resend credentials resolver.
 *
 * Two delivery paths are supported, in order:
 *   1. The Replit "Resend" connector — fetched from the connector proxy at
 *      `$REPLIT_CONNECTORS_HOSTNAME` using the per-deployment identity
 *      token. This is the production path; the operator enables it by
 *      connecting the Resend integration in Replit. Tokens can rotate so
 *      we re-fetch on every call (per the connector skill: never cache).
 *   2. A plain `RESEND_API_KEY` env var — kept for tests and for
 *      environments where the connector proxy isn't available.
 *
 * Returns `null` when neither is available; callers log a "would have
 * sent" line and continue, so the autonomy path is never blocked.
 */
async function resolveResendCredentials(): Promise<{ apiKey: string; fromEmail: string | null } | null> {
  // Connector-proxy path
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
      ? `depl ${process.env.WEB_REPL_RENEWAL}`
      : null;
  if (hostname && xReplitToken) {
    try {
      const resp = await fetch(
        `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
        { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } },
      );
      if (resp.ok) {
        const data = (await resp.json()) as { items?: Array<{ settings?: { api_key?: string; from_email?: string } }> };
        const settings = data.items?.[0]?.settings;
        if (settings?.api_key) {
          return { apiKey: settings.api_key, fromEmail: settings.from_email ?? null };
        }
      }
    } catch (err) {
      logger.warn({ err }, "outbound-notify: resend connector lookup failed, falling back to env");
    }
  }
  // Env-var fallback
  if (process.env.RESEND_API_KEY) {
    return { apiKey: process.env.RESEND_API_KEY, fromEmail: null };
  }
  return null;
}

/**
 * Email transport. We ship a Resend integration because it's the
 * simplest API-key-only mailer (no per-domain OAuth) and the integration
 * is already discoverable via Replit's connector catalogue. If neither
 * the connector nor `RESEND_API_KEY` is configured we deliberately log a
 * "would have sent" line instead of throwing — this keeps the autonomy
 * path working in dev/test.
 *
 * `from` precedence: explicit `AUTONOMY_EMAIL_FROM` env override beats
 * the connector's `from_email`, which beats the dev-only Resend sandbox
 * sender. The sandbox sender only delivers to the Resend account owner's
 * verified address, so production deployments must configure one of the
 * other two.
 */
async function sendEmailViaResend(toEmail: string, subject: string, text: string, html: string): Promise<boolean> {
  const creds = await resolveResendCredentials();
  if (!creds) {
    logger.info({ to: toEmail, subject }, "outbound-notify: Resend not configured (no connector, no RESEND_API_KEY) — skipping email send (would have sent)");
    return false;
  }
  const from =
    process.env.AUTONOMY_EMAIL_FROM ??
    creds.fromEmail ??
    "Soul Twin <onboarding@resend.dev>";
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${creds.apiKey}` },
      body: JSON.stringify({ from, to: toEmail, subject, text, html }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      logger.warn({ status: resp.status, body, to: toEmail }, "outbound-notify: resend rejected email");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err, to: toEmail }, "outbound-notify: resend request failed");
    return false;
  }
}

/**
 * Native push transport. Expo's push API is open (no API key required
 * unless the project enables the security setting) so we POST directly.
 * Mirrors the email contract: returns a boolean, never throws.
 */
async function sendExpoPush(tokens: string[], title: string, body: string, link: string | null): Promise<boolean> {
  if (tokens.length === 0) return false;
  const messages = tokens.map((to) => ({
    to,
    sound: "default",
    title,
    body,
    data: link ? { link } : {},
  }));
  try {
    const resp = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      logger.warn({ status: resp.status, body, count: tokens.length }, "outbound-notify: expo push rejected");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err, count: tokens.length }, "outbound-notify: expo push request failed");
    return false;
  }
}

export interface DeliveryResult {
  emailSent: boolean;
  pushSent: boolean;
  reason?: string;
}

/**
 * Deliver an out-of-band heads-up that the autonomy path just acted on
 * the user's behalf. Caller is the in-app notification helper, which
 * already handles the 5-minute bundling window — we run only when a
 * brand-new notification row is created so this transport inherits the
 * same bundling cadence for free.
 */
export async function deliverAutonomyHeadsUp(userId: string, entries: OutboundEntry[]): Promise<DeliveryResult> {
  if (entries.length === 0) return { emailSent: false, pushSent: false, reason: "no entries" };
  try {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
      columns: {
        id: true,
        displayName: true,
        email: true,
        autonomyEmailEnabled: true,
        autonomyPushEnabled: true,
      },
    });
    if (!user) return { emailSent: false, pushSent: false, reason: "user not found" };

    const { subject, text, html } = emailBody(user.displayName, entries);

    let emailSent = false;
    if (user.autonomyEmailEnabled && user.email) {
      emailSent = await sendEmailViaResend(user.email, subject, text, html);
    }

    let pushSent = false;
    if (user.autonomyPushEnabled) {
      const tokens = await db
        .select({ token: devicePushTokensTable.token })
        .from(devicePushTokensTable)
        .where(eq(devicePushTokensTable.userId, userId));
      const expoTokens = tokens
        .map((t) => t.token)
        .filter((t) => t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken["));
      if (expoTokens.length > 0) {
        pushSent = await sendExpoPush(
          expoTokens,
          "Soul Twin",
          summaryLine(entries),
          publicLink(entries[0].link),
        );
      }
    }

    return { emailSent, pushSent };
  } catch (err) {
    logger.warn({ err, userId }, "outbound-notify: deliverAutonomyHeadsUp failed");
    return { emailSent: false, pushSent: false, reason: "exception" };
  }
}

// Test-only seam: lets the autonomy notification test capture deliveries
// without a real Resend / Expo backend. Production code never overrides
// this — the default is the live `deliverAutonomyHeadsUp` above.
let deliverImpl: typeof deliverAutonomyHeadsUp = deliverAutonomyHeadsUp;
export function __setDeliverAutonomyHeadsUpForTest(fn: typeof deliverAutonomyHeadsUp | null): void {
  deliverImpl = fn ?? deliverAutonomyHeadsUp;
}
export function deliverAutonomyHeadsUpDispatch(userId: string, entries: OutboundEntry[]): Promise<DeliveryResult> {
  return deliverImpl(userId, entries);
}
