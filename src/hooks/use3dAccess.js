// The 3D Garden View (orbit camera, walk-through) is free for everyone.
// Kept as a thin wrapper for existing callers.
export const use3dAccess = () => ({ unlocked: true, loading: false, refresh: async () => null });
