import { base44 } from '@/api/base44Client';

// The tester link's code, kept in the browser until it has been claimed for a
// signed-in account (see pages/Beta.jsx and claimBeta on the server).
export const BETA_CODE_KEY = 'ecoestate.betaCode';

/** Claim tester access with the saved code; true once the account has it. */
export async function claimBetaAccess() {
  let code = null;
  try {
    code = localStorage.getItem(BETA_CODE_KEY);
  } catch {
    return false;
  }
  if (!code) return false;
  const { data } = await base44.functions.invoke('claimBeta', { code });
  if (data?.unlocked) {
    try {
      localStorage.removeItem(BETA_CODE_KEY);
    } catch {
      /* claimed either way */
    }
    // The member features are read when pages load: start fresh with them on.
    if (data.new) window.location.reload();
    return true;
  }
  return false;
}
