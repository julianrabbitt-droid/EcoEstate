import { usePremiumAccess } from './usePremiumAccess';

// 3D Garden View access: Premium subscribers OR a free student 3d_view unlock.
// Kept as a thin wrapper for existing callers.
export const use3dAccess = () => {
  const { threeD: unlocked, loading, refresh } = usePremiumAccess();
  return { unlocked, loading, refresh };
};