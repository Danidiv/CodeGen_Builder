import type { SupabaseClient } from "@supabase/supabase-js";

export type Submission = { id: number; form: string; data: Record<string, string>; created_at: string };

function fail(action: string, error: { message: string }): never {
  if (/site_submissions|site_records|submit_form|schema cache|does not exist/i.test(error.message)) {
    throw new Error(
      "Form inbox is not set up yet. Run supabase/schema.sql again in the Supabase SQL Editor, then run: notify pgrst, 'reload schema';"
    );
  }
  throw new Error(`Could not ${action}: ${error.message}`);
}

/** Newest 200 submissions of a site (only the owner can read them; enforced by the database). */
export async function listSubmissions(sb: SupabaseClient, siteId: string): Promise<Submission[]> {
  const { data, error } = await sb
    .from("site_submissions")
    .select("id, form, data, created_at")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) fail("load the submissions", error);
  return ((data ?? []) as Submission[]).map((r) => ({ ...r, data: r.data && typeof r.data === "object" ? r.data : {} }));
}

export async function deleteSubmission(sb: SupabaseClient, id: number): Promise<void> {
  const { error } = await sb.from("site_submissions").delete().eq("id", id);
  if (error) fail("delete the submission", error);
}

function cell(v: string): string {
  // Spreadsheet formulas: a cell that starts with = + - @ gets a leading apostrophe.
  const safe = /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  return '"' + safe.replace(/"/g, '""') + '"';
}

/** CSV text of the submissions (one column per field name). */
export function toCsv(rows: Submission[]): string {
  const fields: string[] = [];
  for (const r of rows) for (const k of Object.keys(r.data)) if (!fields.includes(k)) fields.push(k);
  const head = ["time", "form", ...fields].map(cell).join(",");
  const lines = rows.map((r) =>
    [new Date(r.created_at).toISOString(), r.form, ...fields.map((f) => String(r.data[f] ?? ""))].map(cell).join(",")
  );
  return [head, ...lines].join("\r\n");
}

/** One saved item of a published site (see db() in lib/backend.ts). */
export type DataRecord = { id: string; collection: string; data: Record<string, unknown>; created_at: string };

/** Newest 300 saved items of a site (only the owner can read them; enforced by the database). */
export async function listRecords(sb: SupabaseClient, siteId: string): Promise<DataRecord[]> {
  const { data, error } = await sb
    .from("site_records")
    .select("id, collection, data, created_at")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) fail("load the saved data", error);
  return ((data ?? []) as DataRecord[]).map((r) => ({ ...r, data: r.data && typeof r.data === "object" ? r.data : {} }));
}

export async function deleteRecord(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("site_records").delete().eq("id", id);
  if (error) fail("delete the item", error);
}
