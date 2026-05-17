import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase environment variables are missing! Check your .env.local or Vercel settings.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// supabaseAdmin provides full database access bypassing RLS.
// WARNING: Only use this in server environments (API routes, Server Actions, Node.js scripts).
// DO NOT use on the client-side — the service key is never bundled into client builds.
// Returns null when SERVICE_ROLE_KEY is absent so callers fail loudly, not silently.
export const supabaseAdmin: SupabaseClient | null = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

/**
 * Get supabaseAdmin or throw if unavailable (e.g. called from client bundle).
 * Use this in server-only code that MUST have elevated access.
 */
export function requireAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    throw new Error(
      '[supabase] supabaseAdmin is unavailable — SUPABASE_SERVICE_ROLE_KEY is not set. ' +
      'This function must only be called from server-side code (API routes, Server Actions, or Node.js scripts).'
    );
  }
  return supabaseAdmin;
}
