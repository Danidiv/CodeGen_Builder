import type { SupabaseClient } from "@supabase/supabase-js";

export type Overview = {
  users_total: number; users_today: number; users_7d: number; activated: number;
  active_today: number; active_7d: number; returning: number;
  requests_today: number; requests_7d: number; requests_total: number;
  builds_7d: number; build_fails_7d: number; limit_hits_7d: number;
  sites_total: number; reports_total: number; pro_users: number; banned_users: number;
};
export type DayRow = { day: string; new_users: number; active_users: number; requests: number; builds: number; publishes: number };
export type TypeRow = { type: string; n: number };
export type Features = {
  builds: number; forms: number; data: number; login: number; reference: number; autofix: number;
  failed: number; publishes: number; downloads: number; limit_hits: number; feedback: number;
};
export type UserRow = {
  id: string; email: string | null; created_at: string; last_active: string | null;
  requests_total: number; requests_today: number; projects: number; sites: number;
  plan: "free" | "pro"; daily_limit: number | null; banned: boolean; note: string | null; is_admin: boolean;
};
export type SiteRow = { id: string; slug: string | null; name: string; project_id: string; email: string | null; published_at: string; reports: number; blocked: boolean };
export type ReportRow = { id: number; site_id: string; reason: string; created_at: string };
export type FeedbackRow = { id: number; kind: "idea" | "problem" | "other" | "upgrade"; message: string; choice: string | null; done: boolean; created_at: string; email: string | null };
export type LogRow = { id: number; action: string; target: string | null; detail: string | null; created_at: string; admin_email: string | null };

/** Calls one admin function. Every function checks on the database side that you are an admin. */
export async function adminCall<T>(sb: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    if (/could not find the function|does not exist|schema cache/i.test(error.message)) {
      throw new Error("The admin part of the database is not installed. Run supabase/admin.sql in the Supabase SQL Editor.");
    }
    if (/not allowed/i.test(error.message)) throw new Error("This account is not an admin.");
    throw new Error(error.message);
  }
  return data as T;
}

export const nf = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-US");
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) + "%" : "-");

/** "2026-10-26T19:46:21Z" -> "26 Oct 2026" (in Pakistan time, like the owner). */
export function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" });
}
