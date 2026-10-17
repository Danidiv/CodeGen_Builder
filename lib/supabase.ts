import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Browser Supabase client, or null when Supabase is not configured.
 * When it is null the app runs in "local mode" (no login, project saved in
 * this browser only), exactly like before.
 *
 * Only the public anon/publishable key belongs here. Never put the
 * service_role / secret key in any NEXT_PUBLIC_ variable.
 */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
