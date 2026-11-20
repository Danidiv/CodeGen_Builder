"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowDownRight, ArrowLeft, ArrowUpRight, BarChart3, Bot, Calendar, Clock3, Database, Download, FileText, Globe, Hammer, KeyRound,
  Layers, LayoutDashboard, Link2, MessageSquare, RefreshCw, ScrollText, Search, Shapes, Sparkles, Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  adminCall, fmtDate, nf, pct,
  type DayRow, type Features, type FeedbackRow, type HeatRow, type LogRow, type Overview, type ReportRow, type SiteRow, type TypeRow, type UserRow,
} from "@/lib/admin";
import { GroupedBars, HeatGrid, HeatScale, RankList, RingStack } from "@/components/admin/charts";
import "./admin.css";

type TabId = "overview" | "users" | "feedback" | "sites" | "log";
const TABS: { id: TabId; label: string; title: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Dashboard", title: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { id: "users", label: "Users", title: "Users", icon: <Users size={18} /> },
  { id: "feedback", label: "Feedback", title: "Feedback", icon: <MessageSquare size={18} /> },
  { id: "sites", label: "Sites and reports", title: "Sites and reports", icon: <Globe size={18} /> },
  { id: "log", label: "Admin log", title: "Admin log", icon: <ScrollText size={18} /> },
];

type Sb = NonNullable<typeof supabase>;

function Section({ title, note, right, children }: { title: string; note?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {note && <p className="text-xs text-white/40">{note}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
function RankBars({ rows, empty }: { rows: { label: string; n: number; extra?: string }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (rows.length === 0) return <p className="card p-4 text-sm text-white/40">{empty}</p>;
  return (
    <div className="card space-y-2 p-4">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-white/80">{r.label}</span>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${(r.n / max) * 100}%`, background: "linear-gradient(90deg,#5b63f0,#8b5cf6)" }} />
          </div>
          <span className="tabular-nums text-white/60">
            {nf(r.n)}
            {r.extra ? <span className="ml-2 text-white/40">{r.extra}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function UserEditor({ sb, u, onDone }: { sb: NonNullable<typeof supabase>; u: UserRow; onDone: (changed: boolean) => void }) {
  const [plan, setPlan] = useState<"free" | "pro">(u.plan);
  const [limit, setLimit] = useState(u.daily_limit === null ? "" : String(u.daily_limit));
  const [banned, setBanned] = useState(u.banned);
  const [note, setNote] = useState(u.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [delText, setDelText] = useState("");

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await adminCall(sb, "admin_delete_user", { p_user: u.id });
      onDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
      setBusy(false);
    }
  }

  async function save() {
    const n = limit.trim() === "" ? null : Number(limit);
    if (n !== null && (!Number.isInteger(n) || n < 0)) {
      setError("The limit must be a whole number (0 = no limit), or empty to use the plan default.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminCall(sb, "admin_set_user", { p_user: u.id, p_plan: plan, p_limit: n, p_banned: banned, p_note: note.trim() || null });
      onDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 border-t border-line bg-raised p-4 md:grid-cols-4">
      <label className="space-y-1 text-xs text-white/50">
        Plan
        <select id={`plan-${u.id}`} className="input w-full" value={plan} onChange={(e) => setPlan(e.target.value as "free" | "pro")}>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
      </label>
      <label className="space-y-1 text-xs text-white/50">
        Own daily limit
        <input id={`limit-${u.id}`} className="input w-full" inputMode="numeric" placeholder="plan default" value={limit} onChange={(e) => setLimit(e.target.value)} />
      </label>
      <label className="space-y-1 text-xs text-white/50 md:col-span-2">
        Private note
        <input id={`note-${u.id}`} className="input w-full" maxLength={500} placeholder="for example: friend, tester, abuse on 26 Oct" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-sm text-white/80">
        <input id={`ban-${u.id}`} type="checkbox" checked={banned} disabled={u.is_admin} onChange={(e) => setBanned(e.target.checked)} />
        Ban (stops all AI requests)
      </label>
      {!u.is_admin && (
        <div className="space-y-2 border-t border-line pt-3 md:col-span-4">
          {!delOpen ? (
            <button className="btn btn-ghost text-red-300 hover:text-red-200" disabled={busy} onClick={() => setDelOpen(true)}>
              Delete this account...
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="w-full text-xs text-white/60">
                This deletes the account for good, with all its projects, published sites and saved data. It cannot be undone. Type the email to confirm.
              </p>
              <input id={`del-${u.id}`} className="input w-64" placeholder={u.email ?? "email"} value={delText} onChange={(e) => setDelText(e.target.value)} />
              <button className="btn btn-danger" disabled={busy || delText.trim().toLowerCase() !== (u.email ?? "").toLowerCase() || !u.email} onClick={remove}>
                Delete forever
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => { setDelOpen(false); setDelText(""); }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 md:col-span-3 md:justify-end">
        {error && <span className="text-xs text-red-300">{error}</span>}
        <button className="btn btn-ghost" onClick={() => onDone(false)} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function UsersTab({ sb, initial = "" }: { sb: NonNullable<typeof supabase>; initial?: string }) {
  const PAGE = 50;
  const [rows, setRows] = useState<UserRow[]>([]);
  const [search, setSearch] = useState(initial);
  const [q, setQ] = useState(initial);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      setError(null);
      try {
        const data = await adminCall<UserRow[]>(sb, "admin_users_list", { p_search: q, p_limit: PAGE, p_offset: offset });
        setRows((prev) => (offset === 0 ? data : [...prev, ...data]));
        setMore(data.length === PAGE);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load.");
      } finally {
        setLoading(false);
      }
    },
    [sb, q]
  );

  useEffect(() => {
    void load(0);
  }, [load, tick]);

  return (
    <div className="space-y-4">
      <input id="user-search" className="input w-full md:w-80" placeholder="Search by email" value={search} onChange={(e) => setSearch(e.target.value)} />
      {error && <p className="card p-4 text-sm text-red-300">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="text-xs text-white/40">
            <tr>
              {["Email", "Joined", "Last active", "Today", "All time", "Projects", "Sites", "Plan", "Limit", ""].map((h) => (
                <th key={h} className="px-3 py-2 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <UserRowView key={u.id} u={u} open={open === u.id} onToggle={() => setOpen(open === u.id ? null : u.id)} sb={sb} onSaved={() => { setOpen(null); setTick((t) => t + 1); }} />
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-white/40">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <p className="text-sm text-white/50">Loading...</p>}
      {more && !loading && (
        <button className="btn" onClick={() => void load(rows.length)}>
          Load more
        </button>
      )}
    </div>
  );
}

function UserRowView({ u, open, onToggle, sb, onSaved }: { u: UserRow; open: boolean; onToggle: () => void; sb: NonNullable<typeof supabase>; onSaved: () => void }) {
  return (
    <>
      <tr className="border-t border-line align-top tabular-nums hover:bg-white/[0.02]">
        <td className="max-w-[240px] px-3 py-2">
          <p className="truncate text-white" title={u.email ?? ""}>
            {u.email ?? "(no email)"}
          </p>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {u.is_admin && <span className="rounded bg-accent/30 px-1.5 text-[11px] text-white">admin</span>}
            {u.banned && <span className="rounded bg-red-500/30 px-1.5 text-[11px] text-red-200">banned</span>}
          </div>
          {u.note && <p className="mt-0.5 truncate text-xs text-white/40" title={u.note}>{u.note}</p>}
        </td>
        <td className="px-3 py-2 text-white/70">{fmtDate(u.created_at)}</td>
        <td className="px-3 py-2 text-white/70">{fmtDate(u.last_active)}</td>
        <td className="px-3 py-2 text-white/70">{nf(u.requests_today)}</td>
        <td className="px-3 py-2 text-white/70">{nf(u.requests_total)}</td>
        <td className="px-3 py-2 text-white/70">{nf(u.projects)}</td>
        <td className="px-3 py-2 text-white/70">{nf(u.sites)}</td>
        <td className="px-3 py-2">
          <span className={u.plan === "pro" ? "text-emerald-300" : "text-white/60"}>{u.plan}</span>
        </td>
        <td className="px-3 py-2 text-white/70">{u.daily_limit === null ? "default" : u.daily_limit === 0 ? "none" : nf(u.daily_limit)}</td>
        <td className="px-3 py-2 text-right">
          <button className="btn btn-ghost" onClick={onToggle}>
            {open ? "Close" : "Manage"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={10} className="p-0">
            <UserEditor sb={sb} u={u} onDone={(changed) => (changed ? onSaved() : onToggle())} />
          </td>
        </tr>
      )}
    </>
  );
}

function SitesTab({ sb }: { sb: NonNullable<typeof supabase> }) {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let off = false;
    Promise.all([adminCall<SiteRow[]>(sb, "admin_sites", { p_limit: 100 }), adminCall<ReportRow[]>(sb, "admin_reports", { p_limit: 50 })])
      .then(([s, r]) => {
        if (off) return;
        setSites(s);
        setReports(r);
      })
      .catch((e) => !off && setError(e instanceof Error ? e.message : "Could not load."));
    return () => {
      off = true;
    };
  }, [sb, tick]);

  async function act(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await adminCall(sb, fn, args);
      setConfirm(null);
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  const siteName = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);

  return (
    <div className="space-y-8">
      {error && <p className="card p-4 text-sm text-red-300">{error}</p>}
      <Section title="Published sites" note="Sites with the most reports come first. Taking a site offline deletes its forms, visitor accounts and saved data, like the owner's Unpublish.">
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-white/40">
              <tr>
                {["Site", "Owner", "Published", "Reports", ""].map((h) => (
                  <th key={h} className="px-3 py-2 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.id} className="border-t border-line align-top">
                  <td className="px-3 py-2">
                    <a className="text-white hover:underline" href={`/s/${s.slug ?? s.id}`} target="_blank" rel="noreferrer">
                      {s.name}
                    </a>
                    <p className="text-xs text-white/40">/s/{s.slug ?? s.id}</p>
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-white/70">{s.email ?? "-"}</td>
                  <td className="px-3 py-2 text-white/70">{fmtDate(s.published_at)}</td>
                  <td className={`px-3 py-2 tabular-nums ${s.reports > 0 ? "text-amber-300" : "text-white/70"}`}>{s.reports}</td>
                  <td className="px-3 py-2 text-right">
                    {confirm === s.id ? (
                      <span className="inline-flex flex-wrap justify-end gap-2">
                        <button className="btn btn-danger" disabled={busy} onClick={() => act("admin_unpublish", { p_site: s.id, p_block: false })}>
                          Take offline
                        </button>
                        <button className="btn btn-danger" disabled={busy} onClick={() => act("admin_unpublish", { p_site: s.id, p_block: true })}>
                          Offline and block project
                        </button>
                        <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirm(null)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-2">
                        {s.reports > 0 && (
                          <button className="btn btn-ghost" disabled={busy} onClick={() => act("admin_clear_reports", { p_site: s.id })}>
                            Dismiss reports
                          </button>
                        )}
                        <button className="btn btn-ghost" onClick={() => setConfirm(s.id)}>
                          Remove...
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {sites.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-white/40">
                    No published sites.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Latest reports">
        <div className="card divide-y divide-line">
          {reports.map((r) => (
            <div key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2 text-sm">
              <span className="text-white/80">
                {r.reason} <span className="text-white/40">on {siteName.get(r.site_id) ?? r.site_id}</span>
              </span>
              <span className="text-xs text-white/40">{fmtDate(r.created_at)}</span>
            </div>
          ))}
          {reports.length === 0 && <p className="p-4 text-sm text-white/40">No reports.</p>}
        </div>
      </Section>
    </div>
  );
}

function FeedbackTab({ sb }: { sb: NonNullable<typeof supabase> }) {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [summary, setSummary] = useState<{ choice: string; n: number }[]>([]);
  const [filter, setFilter] = useState<"all" | "idea" | "problem" | "other">("all");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let off = false;
    Promise.all([
      adminCall<FeedbackRow[]>(sb, "admin_feedback_list", { p_kind: null, p_limit: 200 }),
      adminCall<{ choice: string; n: number }[]>(sb, "admin_upgrade_summary"),
    ])
      .then(([r, s]) => {
        if (off) return;
        setRows(r);
        setSummary(s);
      })
      .catch((e) => !off && setError(e instanceof Error ? e.message : "Could not load."));
    return () => {
      off = true;
    };
  }, [sb, tick]);

  async function mark(id: number, done: boolean) {
    try {
      await adminCall(sb, "admin_feedback_done", { p_id: id, p_done: done });
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    }
  }

  if (error) return <p className="card p-4 text-sm text-red-300">{error}</p>;
  if (!rows) return <p className="text-sm text-white/50">Loading...</p>;

  const messages = rows.filter((r) => r.kind !== "upgrade" && (filter === "all" || r.kind === filter));
  const answers = rows.filter((r) => r.kind === "upgrade");
  const total = summary.reduce((a, b) => a + b.n, 0);

  return (
    <div className="space-y-8">
      <Section title="Would you pay for more?" note="Asked once a day when someone uses up the free requests. One answer per person per day.">
        <RankBars rows={summary.map((s) => ({ label: s.choice, n: s.n, extra: pct(s.n, total) }))} empty="No answers yet. They appear when a user reaches the daily limit." />
        {answers.length > 0 && <p className="text-xs text-white/40">{nf(answers.length)} answers in total.</p>}
      </Section>

      <Section
        title="Messages"
        right={
          <select id="fb-filter" className="input" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Type">
            <option value="all">All types</option>
            <option value="idea">Ideas</option>
            <option value="problem">Problems</option>
            <option value="other">Other</option>
          </select>
        }
      >
        <div className="card divide-y divide-line">
          {messages.map((r) => (
            <div key={r.id} className={`space-y-1 px-4 py-3 text-sm ${r.done ? "opacity-50" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className={`rounded px-1.5 text-[11px] ${r.kind === "problem" ? "bg-red-500/30 text-red-200" : r.kind === "idea" ? "bg-accent/30 text-white" : "bg-white/10 text-white/70"}`}>{r.kind}</span>
                  <span className="text-xs text-white/50">{r.email ?? "deleted user"}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-white/40">{fmtDate(r.created_at)}</span>
                  <button className="btn btn-ghost" onClick={() => mark(r.id, !r.done)}>
                    {r.done ? "Reopen" : "Mark done"}
                  </button>
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-white/90">{r.message}</p>
            </div>
          ))}
          {messages.length === 0 && <p className="p-4 text-sm text-white/40">No messages yet. Users send them from the avatar menu, Send feedback.</p>}
        </div>
      </Section>
    </div>
  );
}

function LogTab({ sb }: { sb: NonNullable<typeof supabase> }) {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    adminCall<LogRow[]>(sb, "admin_log_list", { p_limit: 100 }).then(setRows, (e) => setError(e instanceof Error ? e.message : "Could not load."));
  }, [sb]);
  if (error) return <p className="card p-4 text-sm text-red-300">{error}</p>;
  if (!rows) return <p className="text-sm text-white/50">Loading...</p>;
  return (
    <div className="card divide-y divide-line">
      {rows.map((r) => (
        <div key={r.id} className="px-4 py-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-white/80">{r.action}</span>
            <span className="text-xs text-white/40">{fmtDate(r.created_at)}</span>
          </div>
          <p className="break-all text-xs text-white/40">
            {r.admin_email ?? "?"} - {r.target ?? ""} {r.detail ?? ""}
          </p>
        </div>
      ))}
      {rows.length === 0 && <p className="p-4 text-sm text-white/40">Nothing yet. Every change you make here is written down.</p>}
    </div>
  );
}

const PAIRS = [
  { id: "users", a: "New users", b: "Active users", ka: "new_users", kb: "active_users" },
  { id: "work", a: "Builds", b: "Publishes", ka: "builds", kb: "publishes" },
  { id: "req", a: "AI requests", b: "Builds", ka: "requests", kb: "builds" },
] as const;

const SLOTS = ["12am", "4am", "8am", "12pm", "4pm", "8pm"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const sum = (rows: DayRow[], k: "requests" | "builds") => rows.reduce((s, r) => s + Number(r[k]), 0);
const shortDay = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Green pill with the change against the period before. */
function Delta({ now, before }: { now: number; before: number }) {
  if (before <= 0) return <span className="ad-delta flat">{now > 0 ? "new" : "0%"}</span>;
  const p = ((now - before) / before) * 100;
  const up = p >= 0;
  return (
    <span className={`ad-delta ${up ? "" : "down"}`} title="Compared with the 7 days before">
      {up ? "+" : ""}
      {p.toFixed(1)}%{up ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />}
    </span>
  );
}

function Card({ icon, title, sub, right, children }: { icon: React.ReactNode; title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="ad-card">
      <div className="ad-card-head">
        <span className="ad-ico" aria-hidden>
          {icon}
        </span>
        <div className="grow">
          <h2>{title}</h2>
          {sub && <small>{sub}</small>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function OverviewTab({ sb, ov, tick, onRefresh, onGoto }: { sb: Sb; ov: Overview | null; tick: number; onRefresh: () => void; onGoto: (t: TabId) => void }) {
  const [range, setRange] = useState(30);
  const [pairId, setPairId] = useState<(typeof PAIRS)[number]["id"]>("users");
  const [daily, setDaily] = useState<DayRow[]>([]);
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [feat, setFeat] = useState<Features | null>(null);
  const [heat, setHeat] = useState<HeatRow[] | null>(null);
  const [heatError, setHeatError] = useState<string | null>(null);
  const [cost, setCost] = useState("0.03");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const c = localStorage.getItem("nexa-admin-cost");
      if (c) setCost(c);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let off = false;
    setError(null);
    Promise.all([
      adminCall<DayRow[]>(sb, "admin_daily", { p_days: Math.min(90, Math.max(range, 14)) }),
      adminCall<TypeRow[]>(sb, "admin_types", { p_days: range }),
      adminCall<Features>(sb, "admin_features", { p_days: range }),
    ])
      .then(([d, t, f]) => {
        if (off) return;
        setDaily(d);
        setTypes(t);
        setFeat(f);
      })
      .catch((e) => !off && setError(e instanceof Error ? e.message : "Could not load."));
    // The heat map is newer than the rest: if the database is not updated yet, only this card says so.
    adminCall<HeatRow[]>(sb, "admin_heatmap", { p_days: range }).then(
      (h) => {
        if (off) return;
        setHeat(h);
        setHeatError(null);
      },
      (e) => !off && setHeatError(e instanceof Error ? e.message : "Could not load.")
    );
    return () => {
      off = true;
    };
  }, [sb, range, tick]);

  const pair = PAIRS.find((p) => p.id === pairId) ?? PAIRS[0];
  const shown = useMemo(() => daily.slice(-range), [daily, range]);
  const points = useMemo(() => shown.map((r) => ({ label: shortDay(r.day), a: Number(r[pair.ka]), b: Number(r[pair.kb]) })), [shown, pair]);
  const last7 = daily.slice(-7);
  const prev7 = daily.slice(-14, -7);

  const cells = useMemo(() => {
    const grid = SLOTS.map(() => DAYS.map(() => 0));
    for (const h of heat ?? []) if (grid[h.slot] && h.dow >= 0 && h.dow < 7) grid[h.slot][h.dow] = Number(h.n);
    return grid;
  }, [heat]);

  const perReq = Number(cost) > 0 ? Number(cost) : 0;
  const money = (n: number) => "$" + (n * perReq).toFixed(n * perReq >= 100 ? 0 : 2);

  function downloadCsv() {
    const head = "day,new_users,active_users,requests,builds,publishes";
    const body = shown.map((r) => [r.day, r.new_users, r.active_users, r.requests, r.builds, r.publishes].join(","));
    const url = URL.createObjectURL(new Blob([head + "\n" + body.join("\n") + "\n"], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexa-ai-last-${range}-days.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (error) return <p className="ad-error">{error}</p>;
  if (!ov || !feat) return <p className="ad-note">Loading...</p>;

  const ringPct = (n: number) => (feat.builds > 0 ? Math.round((n / feat.builds) * 100) : 0);
  const typeRows = types.slice(0, 5).map((t) => ({ name: t.type, n: t.n, icon: <span style={{ fontSize: 12, fontWeight: 700 }}>{(t.type[0] ?? "?").toUpperCase()}</span> }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="ad-sub" style={{ margin: "0 0 2px" }}>
        <p>
          {ov.reports_total > 0 ? (
            <>
              You have{" "}
              <button className="ad-nav-item" style={{ display: "inline", width: "auto", padding: 0, fontSize: "inherit", color: "#8f9bff" }} onClick={() => onGoto("sites")}>
                {ov.reports_total} new {ov.reports_total === 1 ? "report" : "reports"}
              </button>
            </>
          ) : (
            "No reports to review"
          )}
        </p>
        <div className="ad-tools">
          <label className="ad-pill">
            <Calendar size={15} aria-hidden />
            <select id="range" value={range} onChange={(e) => setRange(Number(e.target.value))} aria-label="Time range">
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </label>
          <button className="ad-pill" onClick={onRefresh}>
            <RefreshCw size={15} aria-hidden /> Refresh
          </button>
          <button className="ad-pill" onClick={downloadCsv} disabled={shown.length === 0}>
            Download <Download size={15} aria-hidden />
          </button>
        </div>
      </div>

      <div className="ad-grid ad-kpis">
        <Card icon={<Users size={22} />} title="All users">
          <div className="ad-kpi-value">
            <strong>{nf(ov.users_total)}</strong>
            <Delta now={ov.users_total} before={ov.users_total - ov.users_7d} />
          </div>
          <p className="ad-hint">
            {nf(ov.users_today)} joined today, {nf(ov.users_7d)} in 7 days
          </p>
        </Card>
        <Card icon={<Bot size={22} />} title="AI requests">
          <div className="ad-kpi-value">
            <strong>{nf(sum(last7, "requests"))}</strong>
            <Delta now={sum(last7, "requests")} before={sum(prev7, "requests")} />
          </div>
          <p className="ad-hint">Last 7 days. {nf(ov.requests_today)} today, {nf(ov.requests_total)} all time</p>
        </Card>
        <Card icon={<Hammer size={22} />} title="Builds">
          <div className="ad-kpi-value">
            <strong>{nf(sum(last7, "builds"))}</strong>
            <Delta now={sum(last7, "builds")} before={sum(prev7, "builds")} />
          </div>
          <p className="ad-hint">Last 7 days. {nf(ov.build_fails_7d)} failed</p>
        </Card>
      </div>

      <div className="ad-grid ad-row-2">
        <Card
          icon={<BarChart3 size={22} />}
          title="Activity overview"
          sub={`Last ${range} days`}
          right={
            <select id="pair" className="ad-select" value={pairId} onChange={(e) => setPairId(e.target.value as typeof pairId)} aria-label="Compare">
              {PAIRS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.a} / {p.b}
                </option>
              ))}
            </select>
          }
        >
          <GroupedBars points={points} aLabel={pair.a} bLabel={pair.b} />
        </Card>

        <Card icon={<Layers size={22} />} title="Features in use" sub="Share of builds">
          <RingStack
            callout={{ big: nf(feat.builds), small: `builds, last ${range} days` }}
            rings={[
              { label: "Forms", pct: ringPct(feat.forms), color: "#b45cf0", icon: <FileText size={18} /> },
              { label: "Saved data", pct: ringPct(feat.data), color: "#6b8cff", icon: <Database size={18} /> },
              { label: "Login", pct: ringPct(feat.login), color: "#4a56d8", icon: <KeyRound size={18} /> },
              { label: "Reference", pct: ringPct(feat.reference), color: "#8f6cf0", icon: <Link2 size={18} /> },
            ]}
          />
        </Card>
      </div>

      <div className="ad-grid ad-row-3">
        <Card icon={<Shapes size={22} />} title="Kinds of site" sub="From the first build of each project">
          <RankList rows={typeRows} empty="No builds yet in this period." />
        </Card>
        <Card icon={<Clock3 size={22} />} title="Builds by time" sub="Pakistan time, 4-hour slots" right={<HeatScale />}>
          {heatError ? <p className="ad-note">{heatError}</p> : <HeatGrid cells={cells} rowLabels={SLOTS} colLabels={DAYS} />}
          {!heatError && (heat ?? []).length === 0 && <p className="ad-note">No builds yet in this period.</p>}
        </Card>
      </div>

      <div className="ad-grid ad-small">
        {[
          ["Active today", nf(ov.active_today), `${nf(ov.active_7d)} in 7 days`],
          ["Came back", nf(ov.returning), "used the AI on 2+ days"],
          ["Tried the AI", nf(ov.activated), `${pct(ov.activated, ov.users_total)} of all users`],
          ["Limit reached", nf(ov.limit_hits_7d), "in 7 days, wanted more"],
          ["Live sites", nf(ov.sites_total), `${nf(feat.publishes)} published in ${range} days`],
          ["Reports", nf(ov.reports_total), "see Sites and reports"],
          ["Pro users", nf(ov.pro_users), ""],
          ["Banned users", nf(ov.banned_users), ""],
        ].map(([label, value, hint]) => (
          <div key={label} className="ad-stat">
            <p>{label}</p>
            <strong>{value}</strong>
            {hint && <small>{hint}</small>}
          </div>
        ))}
      </div>

      <Card icon={<Sparkles size={22} />} title="AI cost estimate" sub="Only an estimate: it uses the number you type. Check your AI provider bill for the real average.">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
          <label className="ad-note" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            Cost per request (USD)
            <input
              id="cost-per-request"
              className="input"
              style={{ width: 90 }}
              inputMode="decimal"
              value={cost}
              onChange={(e) => {
                setCost(e.target.value);
                try {
                  localStorage.setItem("nexa-admin-cost", e.target.value);
                } catch {
                  /* ignore */
                }
              }}
            />
          </label>
          {perReq > 0 && (
            <>
              <span>Today: <b>{money(ov.requests_today)}</b></span>
              <span>7 days: <b>{money(ov.requests_7d)}</b></span>
              <span>All time: <b>{money(ov.requests_total)}</b></span>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [problem, setProblem] = useState<string | null>(null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [tick, setTick] = useState(0);
  const [query, setQuery] = useState("");
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    const sb = supabase;
    if (!sb) {
      setChecked(true);
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !session) {
      setAdmin(null);
      return;
    }
    Promise.resolve(sb.rpc("is_admin")).then(({ data, error }) => {
      if (error) {
        setProblem(/could not find the function|schema cache/i.test(error.message) ? "The admin part of the database is not installed. Run supabase/admin.sql in the Supabase SQL Editor." : error.message);
        setAdmin(false);
      } else setAdmin(data === true);
    });
  }, [session]);

  // Numbers for the badges and the dashboard cards.
  useEffect(() => {
    const sb = supabase;
    if (!sb || !admin) return;
    let off = false;
    adminCall<Overview>(sb, "admin_overview").then(
      (o) => !off && setOv(o),
      () => {}
    );
    return () => {
      off = true;
    };
  }, [admin, tick]);

  const email = session?.user.email ?? "";
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  if (!checked || (session && admin === null)) {
    return (
      <main className="ad">
        <p className="ad-note" style={{ padding: 24 }}>Loading...</p>
      </main>
    );
  }
  if (!supabase || !session || !admin) {
    return (
      <main className="ad" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div className="ad-card" style={{ maxWidth: 420 }}>
          <p style={{ margin: 0, fontSize: 18 }}>This page is only for admins.</p>
          {problem && <p className="ad-note" style={{ color: "#f6c177" }}>{problem}</p>}
          {!session && supabase && <p className="ad-note">Sign in on the main page first, then open this page again.</p>}
          <a href="/" className="ad-pill" style={{ marginTop: 16, textDecoration: "none" }}>
            <ArrowLeft size={15} aria-hidden /> Back to the app
          </a>
        </div>
      </main>
    );
  }

  const nav = (t: (typeof TABS)[number]) => (
    <button key={t.id} className="ad-nav-item" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
      {t.icon}
      {t.label}
      {t.id === "sites" && ov && ov.reports_total > 0 && <span className="ad-badge">{ov.reports_total}</span>}
    </button>
  );

  return (
    <main className="ad">
      <div className="ad-frame">
        <aside className="ad-side" aria-label="Admin menu">
          <div className="ad-logo">
            <span className="ad-mark" aria-hidden>
              <Sparkles size={16} />
            </span>
            <b>NEXA</b>
            <span>Admin</span>
          </div>
          <div>
            <p className="ad-label" style={{ margin: "0 0 10px" }}>Main menu</p>
            <nav className="ad-nav">{TABS.map(nav)}</nav>
          </div>
          <div className="ad-promo">
            <p>
              Back to your
              <br />
              <b>NEXA AI</b> builder
            </p>
            <a href="/">
              <ArrowLeft size={16} aria-hidden /> Open the app
            </a>
          </div>
        </aside>

        <div className="ad-main">
          <nav className="ad-mobile-nav" aria-label="Admin sections">
            {TABS.map(nav)}
          </nav>
          <div className="ad-top">
            <h1 className="ad-title">{current.title}</h1>
            <form
              className="ad-search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                setUserSearch(query.trim());
                setTab("users");
              }}
            >
              <Search size={16} aria-hidden />
              <input id="admin-search" type="search" placeholder="Find a user by email" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a user by email" />
            </form>
            <div className="ad-user">
              <div className="who">
                <strong>Admin</strong>
                <small>{email}</small>
              </div>
              <span className="ad-avatar" aria-hidden>
                {(email[0] ?? "A").toUpperCase()}
              </span>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            {tab === "overview" && <OverviewTab sb={supabase} ov={ov} tick={tick} onRefresh={refresh} onGoto={setTab} />}
            {tab === "users" && <UsersTab key={userSearch} sb={supabase} initial={userSearch} />}
            {tab === "feedback" && <FeedbackTab sb={supabase} />}
            {tab === "sites" && <SitesTab sb={supabase} />}
            {tab === "log" && <LogTab sb={supabase} />}
          </div>
        </div>
      </div>
    </main>
  );
}
