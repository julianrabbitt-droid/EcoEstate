import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

// Generic one-time entitlement hook. The entitlement is a paid (or
// student-unlocked) Base44Purchase record with `status: "paid"` for this user
// and productId. Its writes are admin-only, so this server-verified record —
// not a client flag — is the unlock.
export function useProductAccess(productId) {
  const { user, isAuthenticated, authChecked } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const PENDING_FLAG = `ecoestate_${productId}_pending`;

  const check = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setUnlocked(false);
      setLoading(false);
      return false;
    }
    try {
      const { items } = await base44.entities.Base44Purchase.filter(
        { productId, status: 'paid', appUserId: user.id },
        { limit: 1 },
      );
      const ok = Array.isArray(items) && items.length > 0;
      setUnlocked(ok);
      if (ok) sessionStorage.removeItem(PENDING_FLAG);
      return ok;
    } catch {
      setUnlocked(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id, productId, PENDING_FLAG]);

  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    let timer;
    (async () => {
      const ok = await check();
      const pending = sessionStorage.getItem(PENDING_FLAG) === '1';
      if (!ok && pending && isAuthenticated && !cancelled) {
        let attempts = 0;
        timer = setInterval(async () => {
          if (cancelled) return;
          attempts++;
          const ok2 = await check();
          if (ok2 || attempts >= 24) {
            clearInterval(timer);
            if (!ok2) sessionStorage.removeItem(PENDING_FLAG);
          }
        }, 5000);
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [check, isAuthenticated, authChecked, PENDING_FLAG]);

  return { unlocked, loading, refresh: check };
}