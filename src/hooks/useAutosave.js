import { useCallback, useEffect, useRef } from 'react';

// Saves user edits shortly after they change and again on leaving the page,
// so StepNav/header navigation doesn't drop them. Call markDirty() on each
// user edit (not on the initial load); cancel() when saving another way.
export function useAutosave(value, save, delay = 800) {
  const dirty = useRef(false);
  const latest = useRef({ value, save });
  latest.current = { value, save };

  const flush = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    Promise.resolve()
      .then(() => latest.current.save(latest.current.value))
      .catch((e) => console.error('Autosave failed:', e?.message || e));
  }, []);

  useEffect(() => {
    if (!dirty.current) return undefined;
    const t = setTimeout(flush, delay);
    return () => clearTimeout(t);
  }, [value, delay, flush]);

  useEffect(() => flush, [flush]);

  const markDirty = useCallback(() => {
    dirty.current = true;
  }, []);
  const cancel = useCallback(() => {
    dirty.current = false;
  }, []);
  return { markDirty, cancel };
}
