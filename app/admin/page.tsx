"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  adminCall, fmtDate, nf, pct,
  type DayRow, type Features, type LogRow, type Overview, type ReportRow, type SiteRow, type TypeRow, type UserRow,
} from "@/lib/admin";

type TabId = "overview" | "users" | "sites" | "log";
const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "sites", label: "Sites and reports" },
  { id: "log", label: "Admin log" },
];

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-white/50">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
    </div>
  );
}

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

const METRICS = [
  { id: "new_users", label: "New users" },
  { id: "active_users", label: "Active users" },
  { id: "requests", label: "AI requests" },
  { id: "builds", label: "Builds" },
  { id: "publishes", label: "Publishes" },
] as const;

function DailyChart({ rows, metric }: { rows: DayRow[]; metric: (typeof METRICS)[number]["id"] }) {
  const top = Math.max(0, ...rows.map((r) => Number(r[metric])));
  const max = Math.max(1, top);
  return (
    <div className="card p-4">
      <div className="flex h-40 items-end gap-1" role="img" aria-label="Daily chart">
        {rows.map((r) => {
          const v = Number(r[metric]);
          return (
            <div key={r.day} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${fmtDate(r.day)}: ${nf(v)}`}>
              <div className="rounded-t bg-accent transition-colors group-hover:bg-accent-hover" style={{ height: `${Math.max(v > 0 ? 3 : 0, (v / max) * 100)}%` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs tabular-nums text-white/40">
        <span>{rows[0] ? fmtDate(rows[0].day) : ""}</span>
        <span>highest day: {nf(top)}</span>
        <span>{rows.length ? fmtDate(rows[rows.length - 1].day) : ""}</span>
      </div>
    </div>
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
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(r.n / max) * 100}%` }} />
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

function OverviewTab({ sb }: { sb: NonNullable<typeof supabase> }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [daily, setDaily] = useState<DayRow[]>([]);
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [feat, setFeat] = useState<Features | null>(null);
  const [days, setDays] = useState(14);
  const [period, setPeriod] = useState(30);
  const [metric, setMetric] = useState<(typeof METRICS)[number]["id"]>("new_users");
  const [cost, setCost] = useState("0.03");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

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
      adminCall<Overview>(sb, "admin_overview"),
      adminCall<DayRow[]>(sb, "admin_daily", { p_days: days }),
      adminCall<TypeRow[]>(sb, "admin_types", { p_days: period }),
      adminCall<Features>(sb, "admin_features", { p_days: period }),
    ])
      .then(([o, d, t, f]) => {
        if (off) return;
        setOv(o);
        setDaily(d);
        setTypes(t);
        setFeat(f);
      })
      .catch((e) => !off && setError(e instanceof Error ? e.message : "Could not load."));
    return () => {
      off = true;
    };
  }, [sb, days, period, tick]);

  const perReq = Number(cost) > 0 ? Number(cost) : 0;
  const money = (n: number) => "$" + (n * perReq).toFixed(n * perReq >= 100 ? 0 : 2);

  if (error) return <p className="card p-4 text-sm text-red-300">{error}</p>;
  if (!ov || !feat) return <p className="text-sm text-white/50">Loading...</p>;

  return (
    <div className="space-y-8">
      <Section
        title="Users"
        right={
          <button className="btn btn-ghost" onClick={() => setTick((t) => t + 1)}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Tile label="All users" value={nf(ov.users_total)} />
          <Tile label="New today" value={nf(ov.users_today)} hint={`${nf(ov.users_7d)} in 7 days`} />
          <Tile label="Tried the AI" value={nf(ov.activated)} hint={`${pct(ov.activated, ov.users_total)} of all users`} />
          <Tile label="Came back" value={nf(ov.returning)} hint="used the AI on 2+ different days" />
          <Tile label="Active today" value={nf(ov.active_today)} hint={`${nf(ov.active_7d)} in 7 days`} />
        </div>
      </Section>

      <Section title="Activity" note="Requests are counted by the usage limit. The cost is only an estimate from the number you type.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Tile label="AI requests today" value={nf(ov.requests_today)} hint={perReq ? "about " + money(ov.requests_today) : undefined} />
          <Tile label="Last 7 days" value={nf(ov.requests_7d)} hint={perReq ? "about " + money(ov.requests_7d) : undefined} />
          <Tile label="All time" value={nf(ov.requests_total)} hint={perReq ? "about " + money(ov.requests_total) : undefined} />
          <Tile label="Builds (7 days)" value={nf(ov.builds_7d)} hint={`${nf(ov.build_fails_7d)} failed`} />
          <Tile label="Limit reached (7 days)" value={nf(ov.limit_hits_7d)} hint="people who wanted more" />
        </div>
        <label className="flex items-center gap-2 text-xs text-white/50">
          Cost per AI request (USD)
          <input
            id="cost-per-request"
            className="input w-24"
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
          <span>Check your AI provider bill and type the real average.</span>
        </label>
      </Section>

      <Section
        title="Over time"
        right={
          <div className="flex flex-wrap gap-2">
            <select id="metric" className="input" value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)} aria-label="Metric">
              {METRICS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select id="days" className="input" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Days">
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
        }
      >
        <DailyChart rows={daily} metric={metric} />
      </Section>

      <Section
        title="What people build and use"
        note="From the first build of each project. Only counts and yes/no flags are saved, never the text people write."
        right={
          <select id="period" className="input" value={period} onChange={(e) => setPeriod(Number(e.target.value))} aria-label="Period">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs text-white/50">Kinds of site</p>
            <RankBars rows={types.map((t) => ({ label: t.type, n: t.n }))} empty="No builds yet in this period." />
          </div>
          <div className="space-y-2">
            <p className="text-xs text-white/50">Features (share of {nf(feat.builds)} builds)</p>
            <RankBars
              empty="No builds yet in this period."
              rows={[
                { label: "Forms", n: feat.forms, extra: pct(feat.forms, feat.builds) },
                { label: "Saved data", n: feat.data, extra: pct(feat.data, feat.builds) },
                { label: "Visitor login", n: feat.login, extra: pct(feat.login, feat.builds) },
                { label: "Reference URL", n: feat.reference, extra: pct(feat.reference, feat.builds) },
                { label: "Auto-fix runs", n: feat.autofix, extra: pct(feat.autofix, feat.builds) },
                { label: "Published", n: feat.publishes },
                { label: "Downloaded", n: feat.downloads },
                { label: "Build failed", n: feat.failed },
                { label: "Hit the limit", n: feat.limit_hits },
              ].filter((r) => feat.builds > 0 || r.n > 0)}
            />
          </div>
        </div>
      </Section>

      <Section title="Accounts and safety">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Live sites" value={nf(ov.sites_total)} />
          <Tile label="Reports" value={nf(ov.reports_total)} hint="see Sites and reports" />
          <Tile label="Pro users" value={nf(ov.pro_users)} />
          <Tile label="Banned users" value={nf(ov.banned_users)} />
        </div>
      </Section>
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

function UsersTab({ sb }: { sb: NonNullable<typeof supabase> }) {
  const PAGE = 50;
  const [rows, setRows] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
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

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [problem, setProblem] = useState<string | null>(null);

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

  let body: React.ReactNode;
  if (!checked || (session && admin === null)) {
    body = <p className="text-sm text-white/50">Loading...</p>;
  } else if (!supabase || !session || !admin) {
    body = (
      <div className="card max-w-md space-y-2 p-6">
        <p className="text-white">This page is only for admins.</p>
        {problem && <p className="text-sm text-amber-300">{problem}</p>}
        {!session && supabase && <p className="text-sm text-white/50">Sign in on the main page first, then open this page again.</p>}
      </div>
    );
  } else {
    body = (
      <>
        <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Admin sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${tab === t.id ? "border-accent text-white" : "border-transparent text-white/50 hover:text-white"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {tab === "overview" && <OverviewTab sb={supabase} />}
        {tab === "users" && <UsersTab sb={supabase} />}
        {tab === "sites" && <SitesTab sb={supabase} />}
        {tab === "log" && <LogTab sb={supabase} />}
      </>
    );
  }

  return (
    <main className="min-h-screen bg-app text-white/90">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-white">NEXA AI Admin</h1>
            {session?.user.email && <p className="text-xs text-white/40">{session.user.email}</p>}
          </div>
          <a href="/" className="btn btn-ghost">
            <ArrowLeft size={14} /> Back to the app
          </a>
        </header>
        {body}
      </div>
    </main>
  );
}
