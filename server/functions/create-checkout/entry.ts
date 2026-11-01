// Base44 Payments checkout starter — base44/functions/create-checkout/entry.ts
//
// Provided by the platform. Do NOT rewrite the plumbing (session construct + persisting the
// join key + return-URL resolution). Edit only the region marked `// ===== APP-SPECIFIC =====`
// to resolve — SERVER-SIDE — what the buyer is purchasing and its price.
//
// PUBLIC by default: a buyer does NOT need to be logged in to check out. Backend function routes
// are callable anonymously, and storefront buyers often have no account — requiring login here is
// what blocks real purchases. If a buyer IS signed in we record their app-user id as the
// fulfillment target; otherwise the purchase is retained for a verified email claim. Never 401 here.
//
// CRITICAL: Wix's checkout has NO custom-metadata field, so the returned `checkoutSession.id` is
// the ONLY thing that ties this payment back to this purchase. We persist it on a pending
// Base44Purchase BEFORE redirecting; the webhook resolves the purchase by that same id
// (order.checkoutId === checkoutSession.id). Skipping this write makes fulfillment impossible.

import { createClientFromRequest } from '../../sdk.js';

type CheckoutProduct = {
  name: string; price: string; currency: string; maxQuantity: number;
  subscriptionInfo?: {
    subscriptionSettings: {
      frequency: string; interval?: number; autoRenewal?: boolean; billingCycles?: number;
      freeTrialPeriod?: { frequency: string; interval: number };
    };
    title?: string; description?: string;
  };
};

const CONSTRUCT_URL = "https://www.wixapis.com/payments/platform/v1/checkout-sessions/construct";

// The app's public base URL for the buyer's return links. Use the platform-injected
// `X-Base44-App-Url` header (server-set from app state — correct behind custom domains), then the
// server-owned `WIX_CHECKOUT_APP_URL` secret. We do NOT fall back to the request `Origin`: it's
// caller-controlled, so a spoofed Origin would make Wix send the paid buyer to an attacker page
// (open redirect). Both sources above are always present for a connected payments app.
function resolveAppUrl(req: Request): string {
  return (
    req.headers.get("x-base44-app-url") ||
    Deno.env.get("WIX_CHECKOUT_APP_URL") ||
    ""
  );
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }
    // Read per request, never at module scope: disconnecting payments blanks these, and a warm
    // isolate that captured them at startup would keep charging with the old credentials.
    const WIX_API_KEY = Deno.env.get("WIX_CHECKOUT_API_KEY");
    const WIX_SITE_ID = Deno.env.get("WIX_CHECKOUT_SITE_ID");
    if (!WIX_API_KEY || !WIX_SITE_ID) {
      console.error("create-checkout: Wix payment config not set");
      return new Response(JSON.stringify({ error: "Payments not configured" }), { status: 500 });
    }

    const appUrl = resolveAppUrl(req);
    if (!appUrl) {
      // Fail closed: with no server-owned app URL (both the X-Base44-App-Url header AND the
      // WIX_CHECKOUT_APP_URL secret are absent — e.g. a slug-less or partially-wired app) we'd build
      // relative return links like `/ThankYou` and strand the paid buyer. Never fall back to the
      // caller-controlled Origin (open redirect). Reconnecting payments repopulates the secret.
      console.error("create-checkout: no app URL (X-Base44-App-Url header and WIX_CHECKOUT_APP_URL both empty)");
      return new Response(JSON.stringify({ error: "Payments not configured" }), { status: 500 });
    }
    const base44 = createClientFromRequest(req);

    // Capture the buyer's app-user id IF signed in — but never REQUIRE it. This is the
    // fulfillment target the webhook grants to; when absent (anonymous buyer) the webhook grants
    // by the email the buyer enters on Wix's checkout page.
    let appUser = null;
    try {
      appUser = await base44.auth.me();
    } catch (_) {
      appUser = null;
    }

    const body = await req.json().catch(() => ({}));

    // ===== APP-SPECIFIC =====
    // Fill this server-owned catalog with the merchant's products. An entity-based catalog
    // is also valid ONLY with admin-only create/update/delete RLS, including prices and currency.
    // Never copy price, currency, plan or entitlement values from the checkout request.
    const catalog: Record<string, CheckoutProduct> = {
      // EcoEstate Premium — a single monthly subscription that unlocks every paid
      // feature: 3D Garden View, project exports, and unlimited Full Auto Scans.
      // The Full Auto Scan is otherwise free (30 per month). Prices are in the
      // merchant-account currency (USD); this server-owned catalog is the source
      // of truth — buyers never supply them.
      "premium": {
        name: "EcoEstate Premium",
        price: "5",
        currency: "USD",
        maxQuantity: 1,
        subscriptionInfo: {
          subscriptionSettings: {
            frequency: "MONTH",
          },
          title: "EcoEstate Premium",
          description:
            "3D Garden View, project exports, and unlimited Full Auto Scans.",
        },
      },
    };
    const productId = typeof body.productId === "string" ? body.productId : "";
    const product = Object.hasOwn(catalog, productId) ? catalog[productId] : null;
    if (!product) {
      return new Response(JSON.stringify({ error: "Unknown product" }), { status: 400 });
    }
    const quantity = body.quantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > product.maxQuantity) {
      return new Response(JSON.stringify({ error: "Invalid quantity" }), { status: 400 });
    }
    // Wix takes decimal prices in major units: JPY "5000", USD "19.90", KWD "4.999".
    const price = product.price;
    if (typeof price !== "string" || !/^\d+(?:\.\d+)?$/.test(price)) {
      return new Response(JSON.stringify({ error: "Invalid product price" }), { status: 400 });
    }
    const [whole, fraction = ""] = price.split(".");
    const scale = 10n ** BigInt(fraction.length);
    const totalUnits = BigInt(whole + fraction) * BigInt(quantity);
    if (totalUnits * 2n < scale) {
      return new Response(JSON.stringify({ error: "Amount must be at least 0.50" }), { status: 400 });
    }
    const total = fraction.length
      ? `${totalUnits / scale}.${(totalUnits % scale).toString().padStart(fraction.length, "0")}`
      : totalUnits.toString();
    const productName = product.name;
    // Wix charges in the merchant account currency; configure the catalog to match that currency.
    const currency = product.currency;
    // Configure subscriptions (including freeTrialPeriod) in the server-owned catalog.
    const subscriptionInfo = product.subscriptionInfo ?? null;
    const freeTrial = (subscriptionInfo?.subscriptionSettings.freeTrialPeriod?.interval ?? 0) > 0;
    // Where Wix returns the buyer. Both MUST be real, PUBLICLY reachable routes in this app: the
    // returning buyer is often anonymous, so a missing or login-gated route strands a paid customer.
    // Match your router exactly — `/ThankYou`, not `/thank-you`.
    const thankYouPath = "/ThankYou";
    const postFlowPath = "/";
    // ===== END APP-SPECIFIC =====

    const constructBody = {
      cart: {
        items: [{ name: productName, quantity, price, ...(subscriptionInfo ? { subscriptionInfo } : {}) }],
        // Prefill the signed-in buyer's email if we have one; anonymous buyers enter it on Wix.
        ...(appUser?.email ? { customerInfo: { email: appUser.email } } : {}),
      },
      callbackUrls: {
        thankYouPageUrl: `${appUrl}${thankYouPath}`,
        postFlowUrl: `${appUrl}${postFlowPath}`,
      },
    };

    const wixRes = await fetch(CONSTRUCT_URL, {
      method: "POST",
      headers: {
        "Authorization": WIX_API_KEY,
        "wix-site-id": WIX_SITE_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(constructBody),
    });

    if (!wixRes.ok) {
      const errText = await wixRes.text();
      console.error("create-checkout: Wix construct failed", { status: wixRes.status, errText });
      return new Response(JSON.stringify({ error: "Could not start checkout" }), { status: 502 });
    }

    const { checkoutSession } = await wixRes.json();
    const checkoutSessionId: string = checkoutSession?.id;
    const redirectUrl: string = checkoutSession?.redirectUrl;

    if (!checkoutSessionId || !redirectUrl) {
      console.error("create-checkout: missing checkoutSession id/redirectUrl", checkoutSession);
      return new Response(JSON.stringify({ error: "Could not start checkout" }), { status: 502 });
    }

    // PERSIST THE JOIN KEY (the whole point). Pending until the webhook flips it to "paid".
    // asServiceRole so the row is trustworthy — Base44Purchase RLS blocks client writes, so a buyer
    // can't forge a paid purchase. appUserId is the fulfillment target when known; null for an
    // anonymous buyer (claim only after server-side email verification).
    await base44.asServiceRole.entities.Base44Purchase.create({
      checkoutSessionId,
      status: "pending",
      appUserId: appUser?.id ?? null,
      buyerEmail: appUser?.email ?? null,
      // The server-resolved product key — the webhook grant reads this to decide what to unlock.
      productId,
      productName,
      // Persist the validated quantity so the webhook's grant can award the RIGHT count
      // (seats/credits/items) for a multi-unit purchase — the grant runs later from this row and has
      // no other authoritative count. (Fixed-entitlement plans keep quantity 1.)
      quantity,
      // The initial trial order is zero; cart price remains the recurring price.
      amount: freeTrial ? "0" : total,
      ...(subscriptionInfo ? { recurringAmount: total, freeTrial } : {}),
      currency,
    });

    return new Response(JSON.stringify({ redirectUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-checkout: unhandled error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
  }
});