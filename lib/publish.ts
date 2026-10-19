import type { SupabaseClient } from "@supabase/supabase-js";
import { checkPublishable } from "./publishRules";

type Files = Record<string, string>;

/** A published site may not be bigger than this (JSON size of all files). */
export const MAX_PUBLISH_BYTES = 800_000;

export function filesSize(files: Files): number {
  return JSON.stringify(files).length;
}

/** Short fingerprint of the files, to notice "changed since publishing". */
export function filesFingerprint(files: Files): string {
  let h = 5381;
  for (const path of Object.keys(files).sort()) {
    const s = path + "\u0000" + files[path] + "\u0001";
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export function siteUrl(origin: string, id: string): string {
  return origin.replace(/\/$/, "") + "/s/" + id;
}

function fail(action: string, error: { message: string }): never {
  if (/blocked by moderation/i.test(error.message)) {
    throw new Error("This project was blocked by moderation and cannot be published.");
  }
  if (/published_sites|get_published_site|report_site|schema cache|does not exist/i.test(error.message)) {
    throw new Error(
      "Publishing is not set up yet. Run supabase/schema.sql again in the Supabase SQL Editor, then run: notify pgrst, 'reload schema';"
    );
  }
  throw new Error(`Could not ${action}: ${error.message}`);
}

/** The id of the published site of this project, or null. */
export async function getPublishedId(sb: SupabaseClient, projectId: string): Promise<string | null> {
  const { data, error } = await sb.from("published_sites").select("id").eq("project_id", projectId).maybeSingle();
  if (error) fail("check the published site", error);
  return data?.id ?? null;
}

/** Publishes (or updates) the site of a project. The link stays the same. */
export async function publishSite(sb: SupabaseClient, projectId: string, name: string, files: Files): Promise<string> {
  if (filesSize(files) > MAX_PUBLISH_BYTES) {
    throw new Error("This site is too big to publish (limit about 800 KB of code).");
  }
  const refused = checkPublishable(files);
  if (refused) throw new Error(refused);
  const { data, error } = await sb
    .from("published_sites")
    .upsert({ project_id: projectId, name, files, updated_at: new Date().toISOString() }, { onConflict: "project_id" })
    .select("id")
    .single();
  if (error) fail("publish the site", error);
  return data.id as string;
}

export async function unpublishSite(sb: SupabaseClient, projectId: string): Promise<void> {
  const { error } = await sb.from("published_sites").delete().eq("project_id", projectId);
  if (error) fail("unpublish the site", error);
}

/** Public read (works without login) of one site by its id. */
export async function fetchPublicSite(sb: SupabaseClient, id: string): Promise<{ name: string; files: Files } | null> {
  const { data, error } = await sb.rpc("get_published_site", { p_id: id });
  if (error) fail("load the site", error);
  const d = data as { name?: unknown; files?: unknown } | null;
  if (!d || typeof d.files !== "object" || d.files === null) return null;
  const files: Files = {};
  for (const [k, v] of Object.entries(d.files as Record<string, unknown>)) {
    if (typeof v === "string") files[k] = v;
  }
  if (!files["/App.tsx"]) return null;
  return { name: typeof d.name === "string" ? d.name : "Site", files };
}

/** A visitor reports a published site (works without login). */
export async function reportSite(sb: SupabaseClient, id: string, reason: string, details = ""): Promise<void> {
  const text = (details.trim() ? reason + ": " + details.trim() : reason).slice(0, 500);
  const { error } = await sb.rpc("report_site", { p_id: id, p_reason: text });
  if (error) fail("send the report", error);
}
