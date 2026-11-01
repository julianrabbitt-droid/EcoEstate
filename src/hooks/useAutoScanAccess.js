import { usePremiumAccess } from './usePremiumAccess';
import { useAuth } from '@/lib/AuthContext';

// Full Auto Scan access. Scanning is free and unlimited for every signed-in
// user; anonymous users are asked to sign in. The server is the source of truth
// — these values are for display only.
export const useAutoScanAccess = () => {
  const { premium, member, loading: premLoading, refresh } = usePremiumAccess();
  const { isAuthenticated, authChecked } = useAuth();

  return {
    tier: isAuthenticated ? 'full' : null,
    premium,
    student: member && !premium,
    unlimited: !!isAuthenticated,
    remaining: Infinity,
    canScan: !!isAuthenticated,
    needsSignIn: !isAuthenticated,
    loading: premLoading || !authChecked,
    refresh,
  };
};
