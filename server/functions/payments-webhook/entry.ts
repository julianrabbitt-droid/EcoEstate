// Base44 Payments fulfillment webhook — base44/functions/payments-webhook/entry.ts
//
// Provided by the platform. Do NOT rewrite the plumbing (JWT verification, envelope parsing,
// purchase resolution, idempotency). Only edit the region marked
// `// ===== APP-SPECIFIC =====` to define what "grant access" means for this app.
//
// It receives Wix `ORDER_APPROVED` events (and optional subscription lifecycle events),
// verifies the RS256 JWT, resolves the buyer's pending Purchase by checkout id, and marks
// it paid exactly once. It pairs with `create-checkout`, which MUST persist
// `checkoutSession.id` on the Purchase — Wix has no custom-metadata field, so the checkout
// id is the ONLY correlation key back to this app's user.

import { createClientFromRequest } from '../../sdk.js';
import { importSPKI, jwtVerify } from 'jose';

// Wix event types (verbatim from Wix docs).
const ORDER_APPROVED = "wix.ecom.v1.order_approved";
const SUBSCRIPTION_CANCELED = "wix.ecom.subscription_contracts.v1.subscription_contract_canceled";
const SUBSCRIPTION_EXPIRED = "wix.ecom.subscription_contracts.v1.subscription_contract_expired";

// Unwrap Wix's triple-nested envelope: the request body is a JWT whose verified
// payload has a `data` JSON string; that parses to an envelope with `eventType` and
// another `data` JSON string; that parses to the event data, which for these events
// wraps the entity in a per-action wrapper (see extractOrder).
function parseWixEnvelope(payload: Record<string, unknown>): { eventType: string; eventData: any } {
  const outer = typeof payload.data === "string" ? JSON.parse(payload.data) : payload.data;
  // eventType lives on the parsed envelope; newer DomainEvent envelopes may also carry it as a
  // top-level JWT claim — fall back to that so the event isn't misrouted to the ignore branch.
  const eventType: string = outer?.eventType ?? (payload.eventType as string) ?? "";
  const eventData = typeof outer?.data === "string" ? JSON.parse(outer.data) : outer?.data;
  return { eventType, eventData };
}

// order_approved is an ACTION event: the order is at `actionEvent.body.order`
// (per the Wix docs' sample payload, where `order.checkoutId === checkoutSession.id`).
// The flat `order` / `entity` forms are fallbacks for the other envelope variants Wix emits.
function extractOrder(eventData: any): any | null {
  return eventData?.actionEvent?.body?.order ?? eventData?.order ?? eventData?.entity ?? null;
}

// The buyer's email, as entered on Wix's hosted checkout page. This is the ONLY identity for an
// anonymous buyer (one who wasn't signed in when create-checkout ran, so appUserId is null). Wix
// exposes it in a few places depending on the flow; check the common ones.
function extractBuyerEmail(order: any): string | null {
  return (
    order?.buyerInfo?.email ??
    order?.billingInfo?.contactDetails?.email ??
    order?.billingInfo?.email ??
    null
  );
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Read per request, never at module scope: the key is stored when the webhook is registered, so
    // a warm isolate that captured it at startup would stay keyless and 500 every ORDER_APPROVED.
    const WEBHOOK_PUBLIC_KEY = Deno.env.get("WIX_CHECKOUT_WEBHOOK_PUBLIC_KEY");
    if (!WEBHOOK_PUBLIC_KEY) {
      // Never process an unverifiable event. Missing key = misconfiguration, not a retry case.
      console.error("payments-webhook: WIX_CHECKOUT_WEBHOOK_PUBLIC_KEY is not set");
      return new Response("Webhook not configured", { status: 500 });
    }

    // The raw body IS the JWT (Wix signs the whole payload, RS256).
    const token = await req.text();

    let payload: Record<string, unknown>;
    try {
      const key = await importSPKI(WEBHOOK_PUBLIC_KEY, "RS256");
      const verified = await jwtVerify(token, key);
      payload = verified.payload as Record<string, unknown>;
    } catch (err) {
      // Signature invalid / malformed. Reject — do NOT grant anything.
      console.error("payments-webhook: JWT verification failed", err);
      return new Response("Invalid signature", { status: 401 });
    }

    const { eventType, eventData } = parseWixEnvelope(payload);
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole; // No end user is authenticated on a webhook call.

    if (eventType === ORDER_APPROVED) {
      return await handleOrderApproved(db, eventData);
    }

    if (eventType === SUBSCRIPTION_CANCELED || eventType === SUBSCRIPTION_EXPIRED) {
      return await handleSubscriptionEnded(db, eventData);
    }

    // Unknown/irrelevant event — acknowledge so Wix stops retrying.
    console.log(`payments-webhook: ignoring event ${eventType}`);
    return new Response("OK", { status: 200 });
  } catch (err) {
    // Unexpected failure: 500 tells Wix to retry later (the handler is idempotent, so a
    // retry after a partial failure is safe).
    console.error("payments-webhook: unhandled error", err);
    return new Response("Internal error", { status: 500 });
  }
});

// Compare provider decimal strings exactly, allowing harmless differences such as 19.9/19.90.
function normalizeAmount(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return `${BigInt(whole)}.${fraction.replace(/0+$/, "")}`;
}

async function handleOrderApproved(db: any, eventData: any): Promise<Response> {
  let order = extractOrder(eventData);
  const checkoutId: string | undefined = order?.checkoutId;
  const orderId: string | undefined = order?.id;


  if (!checkoutId) {
    // Nothing to correlate on. Acknowledge to stop retries; log for investigation.
    console.error("payments-webhook: ORDER_APPROVED missing order.checkoutId", { orderId });
    return new Response("OK", { status: 200 });
  }

  // Resolve the pending purchase created by `create-checkout` (join key: checkoutSessionId).
  const matches = await db.entities.Base44Purchase.filter({ checkoutSessionId: checkoutId });
  const purchase = matches?.[0];

  if (!purchase) {
    // The pending Base44Purchase is written by create-checkout before the buyer pays, so a miss
    // here is a transient race (entity not yet visible) — return 500 so Wix retries, rather
    // than ACKing a paid order we can't fulfill. (Wix stops after its retry window.)
    console.warn("payments-webhook: no Base44Purchase for checkoutId yet, asking Wix to retry", { checkoutId, orderId });
    return new Response("Purchase not found yet", { status: 500 });
  }

  // IDEMPOTENCY + terminal states: Wix delivers ORDER_APPROVED more than once, and may deliver
  // a stale approval after a cancellation. Skip if already "paid" (prevents double-grant) or
  // "canceled" (a late approval must not resurrect a revoked subscription).
  if (purchase.status === "paid" || purchase.status === "canceled") {
    console.log("payments-webhook: purchase already terminal, skipping", { checkoutId, status: purchase.status });
    return new Response("OK", { status: 200 });
  }

  const freeTrial = purchase.freeTrial === true && normalizeAmount(purchase.amount) === "0.";
  // Retried events contain the original snapshot. Refresh it to observe later settlement.
  const trialMissingLink = freeTrial && !(order.lineItems ?? []).some((li: any) => li?.subscriptionInfo?.id);
  if (order.status !== "APPROVED" || (!freeTrial && order.paymentStatus !== "PAID") || trialMissingLink) {
    if (!orderId) return new Response("Payment not confirmed yet", { status: 503 });
    const current = await fetch(`https://www.wixapis.com/ecom/v1/orders/${encodeURIComponent(orderId)}`, {
      headers: {
        "Authorization": Deno.env.get("WIX_CHECKOUT_API_KEY") ?? "",
        "wix-site-id": Deno.env.get("WIX_CHECKOUT_SITE_ID") ?? "",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (current.ok) {
      const refreshed = (await current.json()).order;
      if (refreshed?.id !== orderId || refreshed?.checkoutId !== checkoutId) {
        return new Response("Order does not match purchase", { status: 400 });
      }
      order = refreshed;
    }
    if (!current.ok || order.status !== "APPROVED" || (!freeTrial && order.paymentStatus !== "PAID")) {
      return new Response("Payment not confirmed yet", { status: 503 });
    }
  }
  const paidAmount = normalizeAmount(order.priceSummary?.total?.amount);
  const expectedAmount = normalizeAmount(purchase.amount);
  if (!paidAmount || !expectedAmount || paidAmount !== expectedAmount || !purchase.currency || order.currency !== purchase.currency) {
    console.error("payments-webhook: payment does not match purchase", { checkoutId, orderId });
    return new Response("Payment does not match purchase", { status: 400 });
  }

  // Subscription id (if any) — persisted below so SUBSCRIPTION_CANCELED/EXPIRED can later
  // resolve this purchase by subscriptionId and revoke access.
  const subscriptionId: string | undefined = (order?.lineItems ?? [])
    .map((li: any) => li?.subscriptionInfo?.id)
    .find((id: any) => !!id);

  if (freeTrial) {
    if (!subscriptionId) return new Response("Trial subscription not confirmed yet", { status: 503 });
    const current = await fetch(`https://www.wixapis.com/payments/base44/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: {
        "Authorization": Deno.env.get("WIX_CHECKOUT_API_KEY") ?? "",
        "wix-site-id": Deno.env.get("WIX_CHECKOUT_SITE_ID") ?? "",
      },
      signal: AbortSignal.timeout(5000),
    });
    const subscription = current.ok ? (await current.json()).subscription : null;
    if (subscription?.id !== subscriptionId || subscription?.status !== "ACTIVE") {
      return new Response("Trial subscription not confirmed yet", { status: 503 });
    }
  }

  // The buyer's email: from create-checkout if they were signed in, otherwise from the Wix order
  // (the only identity an anonymous buyer has). Persisted below and used by the grant block.
  const buyerEmail: string | null = purchase.buyerEmail ?? extractBuyerEmail(order);

  // ===== APP-SPECIFIC =====
  // For the one-time "3d_view" and "auto_scan" products, the paid Base44Purchase
  // record itself is the entitlement: the frontend grants access when it finds a
  // purchase with the matching productId and status "paid" for this user
  // (appUserId). No separate entitlement entity is needed — the grant is the
  // status flip below.
  // Grant whatever the buyer paid for. This runs BEFORE we mark the purchase paid: if it
  // throws or times out, the status stays "pending", so Wix's retry re-runs the grant
  // rather than hitting the "already paid" short-circuit above and skipping it forever.
  //
  // It MUST therefore be idempotent — Wix can also deliver duplicates CONCURRENTLY, so the
  // "pending" check above is NOT a lock: two invocations can both reach this block. Make every
  // effect safe to run twice by keying it on a stable id (purchase.id / checkoutId), never
  // blind-create/blind-send:
  //   - Default: authorize paid access using Base44Purchase.status + appUserId + productId.
  //     Its writes MUST remain admin-only; browser return URLs never prove payment.
  //   - Custom passes/Entitlement rows: create/update/delete MUST be admin-only in their RLS.
  //     Grant only from this verified handler, keyed by purchase.id; never increment on retries.
  //   - Never authorize from custom User.plan / has_paid fields: users can edit their profile.
  //     Never use is_verified either: it is platform-protected and cannot be set here.
  //   - Award purchase.quantity, the validated count charged at checkout.
  //   - Use purchase.appUserId when set. Guest purchases remain bound to buyerEmail until a
  //     server-side claim verifies the signed-in user's email; a typed email is not identity.
  //     Do not create User records here or open entitlement reads to make guest checkout work.
  // ===== END APP-SPECIFIC =====

  // Mark paid LAST, after settlement or a verified free trial AND completion of the grant.
  // The idempotency check short-circuits on this status, so it must follow fulfillment.
  // subscriptionId is stored here so SUBSCRIPTION_CANCELED/EXPIRED can resolve this purchase.
  await db.entities.Base44Purchase.update(purchase.id, {
    status: "paid",
    orderId: orderId ?? purchase.orderId ?? null,
    subscriptionId: subscriptionId ?? purchase.subscriptionId ?? null,
    // Persist the buyer email (backfilled from the Wix order for anonymous buyers) so the record
    // always shows who paid, even when create-checkout had no signed-in user.
    buyerEmail: buyerEmail ?? purchase.buyerEmail ?? null,
    paidAt: new Date().toISOString(),
  });

  console.log("payments-webhook: fulfilled purchase", { purchaseId: purchase.id, checkoutId, orderId });
  return new Response("OK", { status: 200 });
}

async function handleSubscriptionEnded(db: any, eventData: any): Promise<Response> {
  // Canceled = ended early; Expired = ran all billing cycles. Both revoke access.
  // Mirrors the order path (actionEvent.body.<entity> first); keep the flat fallbacks since
  // the subscription contract webhook body isn't as tightly documented as order_approved.
  const contract =
    eventData?.actionEvent?.body?.subscriptionContract ??
    eventData?.subscriptionContract ??
    eventData?.entity ??
    null;
  const subscriptionId: string | undefined = contract?.id;

  if (!subscriptionId) {
    console.error("payments-webhook: subscription event missing contract id");
    return new Response("OK", { status: 200 });
  }

  const matches = await db.entities.Base44Purchase.filter({ subscriptionId });
  const purchase = matches?.[0];
  if (!purchase) {
    // The subscriptionId is written on the Purchase by the ORDER_APPROVED handler. If a
    // cancel/expire arrives before (or racing) that approval, no Purchase matches yet —
    // return 500 so Wix retries until the approval has linked it, instead of losing the
    // revoke by acking a not-yet-linkable event.
    console.warn("payments-webhook: no Purchase for subscription yet, asking Wix to retry", { subscriptionId });
    return new Response("Purchase not linkable yet", { status: 500 });
  }

  if (purchase.status === "canceled") {
    return new Response("OK", { status: 200 }); // Idempotent.
  }

  // ===== APP-SPECIFIC =====
  // Revoke whatever access the subscription granted (mirror of the grant). Runs BEFORE we
  // mark the purchase canceled: if it throws, the status stays as-is so Wix's retry re-runs
  // the revoke rather than hitting the "already canceled" short-circuit and leaving access on.
  // Must be idempotent.
  // ===== END APP-SPECIFIC =====

  // Mark canceled LAST, so "canceled" always implies access was actually revoked.
  await db.entities.Base44Purchase.update(purchase.id, {
    status: "canceled",
    canceledAt: new Date().toISOString(),
  });

  console.log("payments-webhook: revoked subscription", { purchaseId: purchase.id, subscriptionId });
  return new Response("OK", { status: 200 });
}