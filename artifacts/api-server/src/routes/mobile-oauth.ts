import { Router } from "express";

const router = Router();

/**
 * GET /api/mobile-oauth-callback
 *
 * Bridge for iOS/Android native OAuth flow.
 *
 * Problem: Clerk rejects custom-scheme redirect URLs (ift-mobile://) from
 * native clients, so startSSOFlow returns a null externalVerificationRedirectURL.
 *
 * Solution: The native app passes THIS https URL as the redirectUrl to
 * signIn.create(). Clerk accepts it (our domain), completes OAuth, then
 * redirects here. We forward all query params to the deep-link scheme so
 * the iOS app can pick up __clerk_created_session and activate the session.
 */
router.get("/mobile-oauth-callback", (req, res) => {
  const params = new URLSearchParams(
    req.query as Record<string, string>
  ).toString();
  const deepLink = `ift-mobile://oauth-callback${params ? `?${params}` : ""}`;
  res.redirect(302, deepLink);
});

export default router;
