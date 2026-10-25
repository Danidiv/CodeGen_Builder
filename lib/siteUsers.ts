import type { SupabaseClient } from "@supabase/supabase-js";

export type SiteUser = { id: string; email: string; created_at: string };

function fail(action: string, error: { message: string }): never {
  if (/owner_site_users|owner_delete_site_user|schema cache|does not exist/i.test(error.message)) {
    throw new Error(
      "Visitor accounts are not set up yet. Run supabase/visitor_login.sql in the Supabase SQL Editor, then run: notify pgrst, 'reload schema';"
    );
  }
  throw new Error(`Could not ${action}: ${error.message}`);
}

/** Accounts of the visitors of a published site (only the site owner gets an answer; password hashes are never sent). */
export async function listSiteUsers(sb: SupabaseClient, siteId: string): Promise<SiteUser[]> {
  const { data, error } = await sb.rpc("owner_site_users", { p_site: siteId });
  if (error) fail("load the users", error);
  return Array.isArray(data) ? (data as SiteUser[]) : [];
}

/** Removes an account and the saved data that belongs to it. */
export async function deleteSiteUser(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.rpc("owner_delete_site_user", { p_user: id });
  if (error) fail("delete the user", error);
}
