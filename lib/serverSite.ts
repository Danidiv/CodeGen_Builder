import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { fetchPublicSite } from "./publish";

/** Server-side read of a published site (the same public function the browser uses; no login, anon key only). */
export const loadPublicSite = cache(async (id: string) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !/^[a-z0-9-]{3,40}$/i.test(id)) return null;
  try {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return await fetchPublicSite(sb, id);
  } catch {
    return null; // the browser will try again and show the real error
  }
});
