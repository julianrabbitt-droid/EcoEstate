// Shared by the auth pages (Login, Register, and any page that resumes a flow
// after sign-in, e.g. the MCP OAuth consent page). Keep the redirect
// validation in one place — it is security-sensitive and easy to drift.

// Resolve ?returnTo= to a safe same-origin path, else "/".
//
// The same-origin check alone is not enough: a value like /.//evil.com or
// /\evil.com parses same-origin but normalizes to a protocol-relative
// //evil.com when assigned to location.href — an open redirect. So require the
// resolved path to be exactly one leading slash (no "//" prefix, no backslash).
export function safeReturnTo() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("redirect_url") || params.get("returnTo");
  if (!raw) return "/";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    // None of these are URL-read by the app any more, but the whole bootstrap set
    // stays stripped: one going back to a URL read must not silently
    // become injectable again. Normal app-flow params (e.g. the OAuth consent ctx) are kept.
    for (const p of ["access_token", "clear_access_token", "app_id", "app_base_url", "functions_version", "from_url"]) {
      url.searchParams.delete(p);
    }
    const path = url.pathname + url.search;
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
    return path;
  } catch {
    return "/";
  }
}

// Sign-in link that brings the user back to `location` (a react-router
// location or window.location) afterwards; read back by safeReturnTo().
export function loginPath(location = window.location) {
  const here = `${location.pathname || '/'}${location.search || ''}`;
  if (here === '/' || /^\/(login|register)(\/|$)/.test(here)) return '/login';
  return `/login?redirect_url=${encodeURIComponent(here)}`;
}
