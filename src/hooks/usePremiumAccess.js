import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

const PENDING_FLAG = 'ecoestate_premium_pending';

// On the live site a test-mode Stripe purchase (made against the shared
// database during local development) doesn't count — matches the server.
const LIVE_SITE = (() => {
  const host = typeof window === 'undefined' ? '' : window.location.hostname;
  return host === 'ecoestate.org' || host.endsWith('.ecoestate.org');
})();
const purchaseCounts = (p) => p?.livemode !== false || !LIVE_SITE;

// Several parts of a page ask at once (the header, the 3D view, the page):
// one request per user every half minute serves them all.
const PURCHASES_TTL_MS = 30_000;
let purchases = { userId: null, at: 0, promise: null };
function paidPurchases(userId, fresh = false) {
  if (fresh || purchases.userId !== userId || Date.now() - purchases.at > PURCHASES_TTL_MS || !purchases.promise) {
    const promise = base44.entities.Base44Purchase.filter({ appUserId: userId, status: 'paid' }, { limit: 50 })
      .then(({ items }) => (Array.isArray(items) ? items : []));
    promise.catch(() => { if (purchases.promise === promise) purchases = { userId: null, at: 0, promise: null }; });
    purchases = { userId, at: Date.now(), promise };
  }
  return purchases.promise;
}

// Resolves the signed-in user's EcoEstate entitlements from their paid
// Base44Purchase records (admin-only writes — the server-verified record is the
// unlock, never a client flag):
//  - premium: an active paid 'premium' subscription (status 'paid').
//  - member: Pro, OR a paid/student '3d_view' unlock (free school email).
//    Members get the community (Social) and project tracking (My projects).
//    `threeD` is a legacy alias of `member` (the unlock's product id is
//    '3d_view'). Scanning and the 3D Garden View are free for everyone.
//  - unlimited: true when Pro. Project exports are Pro-only.
// Admins count as Pro, as on the server.
export function usePremiumAccess() {
  const { user, isAuthenticated, authChecked } = useAuth();
  const [state, setState] = useState({ premium: false, threeD: false, member: false, unlimited: false });
  const [loading, setLoading] = useState(true);

  const check = useCallback(async (fresh = false) => {
    if (!isAuthenticated || !user?.id) {
      setState({ premium: false, threeD: false, member: false, unlimited: false });
      setLoading(false);
      return null;
    }
    try {
      let premiumRec = null;
      let threeDRec = null;
      if (user.role !== 'admin') {
        const list = (await paidPurchases(user.id, fresh)).filter(purchaseCounts);
        premiumRec = list.find((p) => p.productId === 'premium');
        threeDRec = list.find((p) => p.productId === '3d_view');
      }
      const premium = user.role === 'admin' || !!premiumRec;
      const threeD = premium || !!threeDRec;
      const next = { premium, threeD, member: threeD, unlimited: premium };
      setState(next);
      if (premium) sessionStorage.removeItem(PENDING_FLAG);
      return next;
    } catch {
      setState({ premium: false, threeD: false, member: false, unlimited: false });
      return null;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id, user?.role]);

  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    let timer;
    (async () => {
      const s = await check();
      const pending = sessionStorage.getItem(PENDING_FLAG) === '1';
      if (!s?.premium && pending && isAuthenticated && !cancelled) {
        let attempts = 0;
        timer = setInterval(async () => {
          if (cancelled) return;
          attempts++;
          const s2 = await check(true); // waiting for a purchase: always ask afresh
          if (s2?.premium || attempts >= 24) {
            clearInterval(timer);
            if (!s2?.premium) sessionStorage.removeItem(PENDING_FLAG);
          }
        }, 5000);
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [check, isAuthenticated, authChecked]);

  return { ...state, loading, refresh: check };
}