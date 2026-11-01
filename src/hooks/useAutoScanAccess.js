import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { usePremiumAccess } from './usePremiumAccess';
import { useAuth } from '@/lib/AuthContext';

const FREE_SCAN_LIMIT = 10;

function currentPeriod() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Full Auto Scan access. Premium subscribers and verified students get unlimited
// scans. Any other signed-in user gets 10 free Full Auto Scans per calendar month
// (tracked server-side in ScanUsage; enforced in autoScanProperty). Anonymous
// users must sign in to use their free scans. The server is the source of truth
// — these values are for display only.
export const useAutoScanAccess = () => {
  const { premium, threeD, loading: premLoading, refresh: premRefresh } = usePremiumAccess();
  const { user, isAuthenticated, authChecked } = useAuth();
  const [used, setUsed] = useState(0);
  const [usageLoading, setUsageLoading] = useState(true);

  const loadUsage = useCallback(async () => {
    if (!isAuthenticated || !user?.id || premium || threeD) {
      setUsageLoading(false);
      return;
    }
    try {
      const { items } = await base44.entities.ScanUsage.filter(
        { appUserId: user.id, period: currentPeriod() },
        { limit: 1 },
      );
      const rec = Array.isArray(items) && items.length ? items[0] : null;
      setUsed(rec?.count || 0);
    } catch {
      setUsed(0);
    } finally {
      setUsageLoading(false);
    }
  }, [isAuthenticated, user?.id, premium, threeD]);

  useEffect(() => {
    if (authChecked) loadUsage();
  }, [loadUsage, authChecked]);

  const loading = premLoading || usageLoading || !authChecked;
  const unlimited = premium || threeD;
  const remaining = unlimited ? Infinity : Math.max(0, FREE_SCAN_LIMIT - used);
  const exhausted = !unlimited && used >= FREE_SCAN_LIMIT;
  const canScan = !!isAuthenticated && (unlimited || !exhausted);
  const tier = unlimited ? 'full' : isAuthenticated ? 'free' : null;

  const refresh = async () => {
    await premRefresh();
    await loadUsage();
  };

  return {
    tier,
    premium,
    student: threeD && !premium,
    unlimited,
    remaining,
    canScan,
    needsSignIn: !isAuthenticated,
    freeLimit: FREE_SCAN_LIMIT,
    loading,
    refresh,
  };
};