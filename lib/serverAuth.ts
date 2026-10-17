import { createClient } from "@supabase/supabase-js";

/**
 * Protects the AI endpoint. When Supabase is configured, only signed-in users
 * (valid access token in the Authorization header) may use it, so strangers
 * cannot spend your AI budget.
 *
 * Returns a Response to send back when access is denied, or null when the
 * request may continue. Without Supabase config (local mode) it allows all.
 */
export function getBearer(req: Request): string {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

/** Supabase client that acts as the signed-in user (null in local mode). */
export function userClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function requireUser(req: Request): Promise<Response | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return new Response("Please sign in first.", { status: 401 });

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) {
    return new Response("Your session expired. Please sign in again.", { status: 401 });
  }
  return null;
}
