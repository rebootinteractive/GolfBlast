// Per-prototype namespace. Each cloned prototype sets this once.
export const PROTOTYPE = 'golfblast';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

// True only when both env vars are present. When false, the app runs
// with builtin levels and the editor saves to an in-memory backend (not shared, lost on reload).
export const HAS_BACKEND = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
