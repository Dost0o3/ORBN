import { Router } from "express";
import { clerkClient, getAuth } from "@clerk/express";

const router = Router();

/**
 * GET /api/mobile-oauth-callback
 * Legacy bridge — kept for any older builds that still reference it.
 */
router.get("/mobile-oauth-callback", (req, res) => {
  const params = new URLSearchParams(
    req.query as Record<string, string>
  ).toString();
  const deepLink = `ift-mobile://oauth-callback${params ? `?${params}` : ""}`;
  res.redirect(302, deepLink);
});

/**
 * POST /api/mobile-auth/token
 *
 * Called by the web bridge page (/mobile-auth) after the user completes
 * OAuth on the web.  Creates a short-lived Clerk sign-in token so the
 * native iOS app can consume it via:
 *   signIn.create({ strategy: "ticket", ticket })
 *
 * Auth: Clerk Bearer token from the web session (Authorization header).
 * Expiry: 5 minutes — the native app must exchange it immediately.
 */
router.post("/mobile-auth/token", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const signInToken = await clerkClient.signInTokens.createSignInToken({
      userId,
      expiresInSeconds: 300,
    });
    res.json({ token: signInToken.token });
  } catch (err) {
    req.log.error(err, "Failed to create mobile sign-in token");
    res.status(500).json({ error: "Failed to create sign-in token" });
  }
});

export default router;
