import type { SupabaseClient } from "@supabase/supabase-js";
import type { UiMessage } from "@/components/Chat";
import type { Version } from "@/lib/versions";
import { computeThumb, type Thumb } from "@/lib/thumb";

export type ProjectMeta = { id: string; name: string; updated_at: string; thumb?: Thumb | null };

/** Everything stored in the `data` column of a project row. */
export type ProjectData = {
  files: Record<string, string>;
  messages: UiMessage[];
  versions: Version[];
  active: number;
};

export const DEFAULT_PROJECT_NAME = "Untitled project";

const META_COLUMNS = "id, name, updated_at";

function fail(action: string, error: { message: string }): never {
  throw new Error(`Could not ${action}: ${error.message}`);
}

/** All projects of the signed-in user, newest first (without the heavy data). */
export async function listProjects(sb: SupabaseClient): Promise<ProjectMeta[]> {
  // Also ask for the small picture (data->thumb); if that query is not accepted, load without it.
  const withThumb = await sb
    .from("projects")
    .select(`${META_COLUMNS}, thumb:data->thumb`)
    .order("updated_at", { ascending: false });
  if (!withThumb.error) return (withThumb.data ?? []) as unknown as ProjectMeta[];

  const { data, error } = await sb
    .from("projects")
    .select(META_COLUMNS)
    .order("updated_at", { ascending: false });
  if (error) fail("load your projects", error);
  return (data ?? []) as ProjectMeta[];
}

/** One project including its data, or null if it does not exist. */
export async function loadProject(
  sb: SupabaseClient,
  id: string
): Promise<{ meta: ProjectMeta; data: Partial<ProjectData> } | null> {
  const { data, error } = await sb
    .from("projects")
    .select(`${META_COLUMNS}, data`)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("open the project", error);
  if (!data) return null;
  const { data: projectData, ...meta } = data as ProjectMeta & { data: Partial<ProjectData> };
  return { meta, data: projectData ?? {} };
}

export async function createProject(
  sb: SupabaseClient,
  name: string,
  data: ProjectData
): Promise<ProjectMeta> {
  const { data: row, error } = await sb
    .from("projects")
    .insert({ name, data: { ...data, thumb: computeThumb(data.files) } })
    .select(META_COLUMNS)
    .single();
  if (error) fail("create the project", error);
  return row as ProjectMeta;
}

export async function saveProject(
  sb: SupabaseClient,
  id: string,
  name: string,
  data: ProjectData
): Promise<void> {
  const { error } = await sb.from("projects").update({ name, data: { ...data, thumb: computeThumb(data.files) } }).eq("id", id);
  if (error) fail("save the project", error);
}

/** Changes only the name of a project. */
export async function renameProject(sb: SupabaseClient, id: string, name: string): Promise<void> {
  const { error } = await sb.from("projects").update({ name }).eq("id", id);
  if (error) fail("rename the project", error);
}

export async function deleteProject(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("projects").delete().eq("id", id);
  if (error) fail("delete the project", error);
}

/** Stable string used to detect "nothing changed since the last save". */
export function serializeData(data: ProjectData): string {
  return JSON.stringify(data);
}

/** Project name from the first thing the user asked for. */
export function deriveName(current: string, messages: UiMessage[]): string {
  if (current !== DEFAULT_PROJECT_NAME && current !== "Imported project") return current;
  const first = messages.find((m) => m.role === "user");
  if (!first) return current;
  const text = first.content.replace(/\s+/g, " ").trim();
  if (!text) return current;
  return text.length > 40 ? text.slice(0, 40) + "..." : text;
}
