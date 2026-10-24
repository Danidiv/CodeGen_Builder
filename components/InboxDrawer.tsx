"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Download, Inbox, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getPublishedId } from "@/lib/publish";
import { DataRecord, Submission, deleteRecord, deleteSubmission, listRecords, listSubmissions, toCsv } from "@/lib/submissions";
import { IconButton } from "./ui";

type Props = { sb: SupabaseClient; projectId: string; projectName: string; open: boolean; onClose: () => void };

function formatTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Right-side drawer: what visitors sent through the forms of the published site. */
export default function InboxDrawer({ sb, projectId, projectName, open, onClose }: Props) {
  const [rows, setRows] = useState<Submission[]>([]);
  const [records, setRecords] = useState<DataRecord[]>([]);
  const [tab, setTab] = useState<"forms" | "data">("forms");
  const [published, setPublished] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const siteId = await getPublishedId(sb, projectId);
      setPublished(siteId !== null);
      setRows(siteId ? await listSubmissions(sb, siteId) : []);
      setRecords(siteId ? await listRecords(sb, siteId) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the inbox.");
    } finally {
      setLoading(false);
    }
  }, [sb, projectId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open, onClose]);

  async function remove(id: number) {
    try {
      await deleteSubmission(sb, id);
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  async function removeRecord(id: string) {
    try {
      await deleteRecord(sb, id);
      setRecords((r) => r.filter((x) => x.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  function download() {
    const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.replace(/[^\w-]+/g, "_").slice(0, 40) || "site"}-submissions.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 animate-fadeIn bg-black/50" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Form submissions and saved data"
        className="absolute inset-y-0 right-0 flex w-full max-w-[420px] animate-slideIn flex-col border-l border-line bg-panel shadow-2xl"
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
          <Inbox size={16} className="text-white/60" />
          <h2 className="flex-1 text-sm font-medium">Inbox</h2>
          <IconButton label="Refresh" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </IconButton>
          <IconButton label="Download CSV (forms)" onClick={download} disabled={tab !== "forms" || rows.length === 0}>
            <Download size={16} />
          </IconButton>
          <IconButton label="Close" onClick={onClose} tip="right">
            <X size={16} />
          </IconButton>
        </header>
        <div role="tablist" aria-label="Inbox view" className="flex shrink-0 gap-1 border-b border-line px-2 py-2">
          {(
            [
              { id: "forms", label: `Forms (${rows.length})` },
              { id: "data", label: `Saved data (${records.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`btn btn-ghost h-8 ${tab === t.id ? "bg-white/10 text-white" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {error && <p className="rounded-btn bg-amber-950/60 px-3 py-2 text-xs text-amber-200">{error}</p>}
          {!error && published === false && (
            <p className="px-2 py-4 text-sm text-white/60">
              This project is not published yet. Forms only save on the published site, so press Publish first, then send a test form on the public link.
            </p>
          )}
          {!error && published && tab === "forms" && rows.length === 0 && !loading && (
            <p className="px-2 py-4 text-sm text-white/60">
              No submissions yet. Open your published site and send its form once to test. In the preview inside NEXA AI, forms run in test mode and are not saved.
            </p>
          )}
          {tab === "forms" && rows.map((r) => (
            <article key={r.id} className="card space-y-2 p-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-line bg-white/5 px-2 text-xs text-white/70">{r.form}</span>
                <span className="flex-1 text-xs text-white/40">{formatTime(r.created_at)}</span>
                <IconButton label="Delete" onClick={() => void remove(r.id)} tip="right" className="h-6 w-6">
                  <Trash2 size={14} />
                </IconButton>
              </div>
              <dl className="space-y-1 text-sm">
                {Object.entries(r.data).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-white/40">{k}</dt>
                    <dd className="whitespace-pre-wrap break-words text-white/90">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
          {!error && published && tab === "data" && records.length === 0 && !loading && (
            <p className="px-2 py-4 text-sm text-white/60">
              No saved data yet. Apps that use saved data (to-do lists, notes, bookings...) store it here once visitors use the published site. In the preview inside NEXA AI the data stays in your browser for testing.
            </p>
          )}
          {tab === "data" &&
            records.map((r) => (
              <article key={r.id} className="card space-y-2 p-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-line bg-white/5 px-2 text-xs text-white/70">{r.collection}</span>
                  <span className="flex-1 text-xs text-white/40">{formatTime(r.created_at)}</span>
                  <IconButton label="Delete" onClick={() => void removeRecord(r.id)} tip="right" className="h-6 w-6">
                    <Trash2 size={14} />
                  </IconButton>
                </div>
                <dl className="space-y-1 text-sm">
                  {Object.entries(r.data).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-white/40">{k}</dt>
                      <dd className="whitespace-pre-wrap break-words text-white/90">{typeof v === "string" ? v : JSON.stringify(v)}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
        </div>
      </aside>
    </div>
  );
}
