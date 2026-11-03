import { flushSync } from 'react-dom';

// Moving between pages, the old page dissolves into the new one (the browser's
// View Transitions, where it has them; a plain navigation where it doesn't, or
// when the person prefers less motion).
export function smoothNavigate(navigate, to, options) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (typeof document === 'undefined' || !document.startViewTransition || reduce) {
    navigate(to, options);
    return;
  }
  document.startViewTransition(() => flushSync(() => navigate(to, options)));
}

// A link click that should dissolve: plain left clicks only (new tabs and
// windows keep the browser's own behaviour).
export function smoothLinkClick(navigate, to) {
  return (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    smoothNavigate(navigate, to);
  };
}
