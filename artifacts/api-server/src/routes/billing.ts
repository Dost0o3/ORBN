import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { subscriptionsTable, usersTable, contactSalesLeadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import { z } from "zod/v4";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_OPERATOR_PRICE_ID = process.env.STRIPE_OPERATOR_PRICE_ID;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const APP_URL =
  process.env.APP_PUBLIC_URL ??
  (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "");

let stripe: Stripe | null = null;
if (STRIPE_SECRET) {
  stripe = new Stripe(STRIPE_SECRET);
} else {
  logger.warn("Stripe billing disabled — STRIPE_SECRET_KEY not set");
}

function billingEnabled(): boolean {
  return Boolean(stripe && STRIPE_OPERATOR_PRICE_ID);
}

async function getOrCreateSubscriptionRow(userId: string) {
  const existing = await db.query.subscriptionsTable.findFirst({
    where: eq(subscriptionsTable.userId, userId),
  });
  if (existing) return existing;
  const id = randomUUID();
  const [row] = await db
    .insert(subscriptionsTable)
    .values({ id, userId, tier: "free", status: "active" })
    .returning();
  return row;
}

router.get("/billing/me", async (req, res): Promise<void> => {
  const { userId: clerkId } = getAuth(req);
  const inactive = {
    tier: "free",
    status: "inactive",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    hasActiveSubscription: false,
    billingEnabled: billingEnabled(),
  };
  if (!clerkId) {
    res.json(inactive);
    return;
  }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) });
  if (!user) {
    res.json(inactive);
    return;
  }
  const sub = await getOrCreateSubscriptionRow(user.id);
  res.json({
    tier: sub.tier,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd === 1,
    hasActiveSubscription:
      (sub.tier === "operator" || sub.tier === "enterprise") && sub.status === "active",
    billingEnabled: billingEnabled(),
  });
});

const CheckoutBody = z.object({
  tier: z.enum(["operator"]).default("operator"),
});

router.post("/billing/checkout", async (req, res): Promise<void> => {
  if (!stripe || !STRIPE_OPERATOR_PRICE_ID) {
    res.status(503).json({
      error: "Billing is not configured. Add STRIPE_SECRET_KEY and STRIPE_OPERATOR_PRICE_ID.",
    });
    return;
  }
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }

  const parsed = CheckoutBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const sub = await getOrCreateSubscriptionRow(user.id);

  // Block duplicate subscription creation
  if (
    (sub.tier === "operator" || sub.tier === "enterprise") &&
    (sub.status === "active" || sub.status === "trialing")
  ) {
    res.status(409).json({
      error: "You already have an active subscription. Manage it from the billing portal.",
      code: "subscription_exists",
    });
    return;
  }

  let customerId = sub.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { userId: user.id, clerkId },
      name: user.displayName,
    });
    customerId = customer.id;
    await db
      .update(subscriptionsTable)
      .set({ stripeCustomerId: customerId })
      .where(eq(subscriptionsTable.id, sub.id));
  }

  const baseUrl = APP_URL || `${req.protocol}://${req.get("host")}`;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: STRIPE_OPERATOR_PRICE_ID, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/pricing`,
    client_reference_id: user.id,
    metadata: { userId: user.id, tier: parsed.data.tier },
    subscription_data: { metadata: { userId: user.id } },
  });

  res.json({ url: session.url });
});

router.post("/billing/portal", async (req, res): Promise<void> => {
  if (!stripe) {
    res.status(503).json({ error: "Billing is not configured." });
    return;
  }
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const sub = await getOrCreateSubscriptionRow(user.id);
  if (!sub.stripeCustomerId) {
    res.status(400).json({ error: "No active subscription to manage." });
    return;
  }
  const baseUrl = APP_URL || `${req.protocol}://${req.get("host")}`;
  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${baseUrl}/pricing`,
  });
  res.json({ url: portal.url });
});

const ContactBody = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  company: z.string().max(200).optional().or(z.literal("")),
  teamSize: z.string().max(50).optional().or(z.literal("")),
  message: z.string().max(4000).optional().or(z.literal("")),
});

router.post("/billing/contact-sales", async (req, res): Promise<void> => {
  const parsed = ContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid form" });
    return;
  }
  const { userId: clerkId } = getAuth(req);
  let userRowId: string | null = null;
  if (clerkId) {
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.clerkId, clerkId) });
    if (user) userRowId = user.id;
  }
  await db.insert(contactSalesLeadsTable).values({
    id: randomUUID(),
    userId: userRowId,
    name: parsed.data.name,
    email: parsed.data.email,
    company: parsed.data.company || null,
    teamSize: parsed.data.teamSize || null,
    message: parsed.data.message || null,
  });
  req.log.info({ email: parsed.data.email }, "contact_sales_submitted");
  res.json({ ok: true });
});

// Webhook — body parsing handled by raw middleware in app.ts at this exact path
router.post("/billing/webhook", async (req, res): Promise<void> => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    res.status(503).send("Webhook not configured");
    return;
  }
  const sig = req.headers["stripe-signature"];
  if (!sig || typeof sig !== "string") {
    res.status(400).send("Missing signature");
    return;
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    req.log.error({ err }, "stripe_webhook_signature_failed");
    res.status(400).send("Invalid signature");
    return;
  }

  let handlerError: unknown = null;
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id ?? session.metadata?.userId;
        if (userId && session.subscription) {
          const subId =
            typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const stripeSub = await stripe.subscriptions.retrieve(subId);
          await applySubscriptionState(userId, stripeSub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const stripeSub = event.data.object as Stripe.Subscription;
        const userId = stripeSub.metadata?.userId;
        if (userId) await applySubscriptionState(userId, stripeSub);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceWithSub = invoice as unknown as {
          subscription?: string | { id: string } | null;
        };
        const rawSub = invoiceWithSub.subscription;
        const subId = typeof rawSub === "string" ? rawSub : rawSub?.id;
        if (subId) {
          const stripeSub = await stripe.subscriptions.retrieve(subId);
          const userId = stripeSub.metadata?.userId;
          if (userId) await applySubscriptionState(userId, stripeSub);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    handlerError = err;
    req.log.error({ err, type: event.type, eventId: event.id }, "stripe_webhook_handler_failed");
  }

  if (handlerError) {
    // Return 5xx so Stripe retries with backoff instead of treating us as ack'd
    res.status(500).json({ error: "handler_failed" });
    return;
  }
  res.json({ received: true });
});

async function applySubscriptionState(userId: string, stripeSub: Stripe.Subscription) {
  const tier = stripeSub.status === "active" || stripeSub.status === "trialing" ? "operator" : "free";
  const status = stripeSub.status;
  const subAny = stripeSub as unknown as {
    current_period_end?: number;
    cancel_at_period_end?: boolean;
  };
  const periodEnd = subAny.current_period_end ? new Date(subAny.current_period_end * 1000) : null;
  const priceId = stripeSub.items.data[0]?.price.id ?? null;

  const existing = await db.query.subscriptionsTable.findFirst({
    where: eq(subscriptionsTable.userId, userId),
  });
  if (existing) {
    await db
      .update(subscriptionsTable)
      .set({
        tier,
        status,
        stripeSubscriptionId: stripeSub.id,
        stripePriceId: priceId,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: subAny.cancel_at_period_end ? 1 : 0,
        stripeCustomerId:
          typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id,
      })
      .where(eq(subscriptionsTable.userId, userId));
  } else {
    await db.insert(subscriptionsTable).values({
      id: randomUUID(),
      userId,
      tier,
      status,
      stripeSubscriptionId: stripeSub.id,
      stripePriceId: priceId,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subAny.cancel_at_period_end ? 1 : 0,
      stripeCustomerId:
        typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id,
    });
  }
}

export default router;
