import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

const PENDING_FLAG = 'ecoestate_premium_pending';

// Resolves the signed-in user's EcoEstate entitlements from their paid
// Base44Purchase records (admin-only writes — the server-verified record is the
// unlock, never a client flag):
//  - premium: an active paid 'premium' subscription (status 'paid').
//  - member: Pro, OR a paid/student '3d_view' unlock (free school email).
//    Members get the community (Social) and project tracking (My projects).
//    `threeD` is a legacy alias of `member` (the unlock's product id is
//    '3d_view'). Scanning and the 3D Garden View are free for everyone.
//  - unlimited: true when Pro. Project exports are Pro-only.
export function usePremiumAccess() {
  const { user, isAuthenticated, authChecked } = useAuth();
  const [state, setState] = useState({ premium: false, threeD: false, member: false, unlimited: false });
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setState({ premium: false, threeD: false, member: false, unlimited: false });
      setLoading(false);
      return null;
    }
    try {
      const { items } = await base44.entities.Base44Purchase.filter(
        { appUserId: user.id, status: 'paid' },
        { limit: 50 },
      );
      const list = Array.isArray(items) ? items : [];
      const premiumRec = list.find((p) => p.productId === 'premium');
      const threeDRec = list.find((p) => p.productId === '3d_view');
      const premium = !!premiumRec;
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
  }, [isAuthenticated, user?.id]);

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
          const s2 = await check();
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