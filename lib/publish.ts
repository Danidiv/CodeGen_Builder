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

/** Custom link names: /s/my-coffee-shop (3-40 characters: a-z, 0-9 and single hyphens; not at the start or end). */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "-");
}

/** A message when the link name is not allowed, or null. */
export function checkSlug(slug: string): string | null {
  if (!SLUG_RE.test(slug) || slug.includes("--") || /^[0-9a-f]{10}$/.test(slug)) {
    return "Use 3 to 40 letters, numbers or single hyphens (no spaces; not at the start or end).";
  }
  return null;
}

/** The id and the custom link name of the published site of this project, or null. */
export async function getPublishedInfo(sb: SupabaseClient, projectId: string): Promise<{ id: string; slug: string | null } | null> {
  const { data, error } = await sb.from("published_sites").select("id, slug").eq("project_id", projectId).maybeSingle();
  if (error) {
    // Older database without the slug column: the site works, only custom names are unavailable.
    const plain = await sb.from("published_sites").select("id").eq("project_id", projectId).maybeSingle();
    if (plain.error) fail("check the published site", plain.error);
    return plain.data ? { id: plain.data.id as string, slug: null } : null;
  }
  return data ? { id: data.id as string, slug: (data.slug as string | null) ?? null } : null;
}

/** Sets (or removes, with an empty name) the custom link name. */
export async function setSiteSlug(sb: SupabaseClient, projectId: string, slug: string): Promise<string | null> {
  const value = normalizeSlug(slug);
  if (value) {
    const bad = checkSlug(value);
    if (bad) throw new Error(bad);
  }
  const { error } = await sb.from("published_sites").update({ slug: value || null }).eq("project_id", projectId);
  if (error) {
    if (/published_sites_slug_idx|duplicate key/i.test(error.message)) throw new Error("This link name is already taken. Try another one.");
    if (/slug_format/i.test(error.message)) throw new Error(checkSlug(value) ?? "This link name is not allowed.");
    if (/slug|schema cache/i.test(error.message)) {
      throw new Error("Custom link names are not set up yet. Run supabase/site_slug.sql in the Supabase SQL Editor, then run: notify pgrst, 'reload schema';");
    }
    fail("save the link name", error);
  }
  return value || null;
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
export async function fetchPublicSite(sb: SupabaseClient, id: string): Promise<{ id: string; name: string; files: Files } | null> {
  const { data, error } = await sb.rpc("get_published_site", { p_id: id });
  if (error) fail("load the site", error);
  const d = data as { id?: unknown; name?: unknown; files?: unknown } | null;
  if (!d || typeof d.files !== "object" || d.files === null) return null;
  const files: Files = {};
  for (const [k, v] of Object.entries(d.files as Record<string, unknown>)) {
    if (typeof v === "string") files[k] = v;
  }
  if (!files["/App.tsx"]) return null;
  return { id: typeof d.id === "string" ? d.id : id, name: typeof d.name === "string" ? d.name : "Site", files };
}

/** A visitor reports a published site (works without login). */
export async function reportSite(sb: SupabaseClient, id: string, reason: string, details = ""): Promise<void> {
  const text = (details.trim() ? reason + ": " + details.trim() : reason).slice(0, 500);
  const { error } = await sb.rpc("report_site", { p_id: id, p_reason: text });
  if (error) fail("send the report", error);
}
