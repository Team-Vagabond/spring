import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Service-role client — server only. Bypasses RLS.
export const admin = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Anon client for read-only browser-safe access (not currently used client-side,
// all reads are proxied through API routes for a single source of truth).
export const anon = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
