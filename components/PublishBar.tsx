"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, ChevronDown, Copy, ExternalLink, Globe, Loader2, RefreshCw, Unplug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDismiss } from "./ui";
import { filesFingerprint, getPublishedId, publishSite, siteUrl, unpublishSite } from "@/lib/publish";

type Props = {
  sb: SupabaseClient;
  projectId: string;
  name: string;
  files: Record<string, string>;
  disabled: boolean;
};

/** Publish / update / unpublish the site of the current project and show its public link. */
export default function PublishBar({ sb, projectId, name, files, disabled }: Props) {
  const [siteId, setSiteId] = useState<string | null>(null);
  const [publishedPrint, setPublishedPrint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, open, () => setOpen(false));

  // Is this project already published? (checked when the project changes)
  useEffect(() => {
    let cancelled = false;
    setSiteId(null);
    setPublishedPrint(null);
    setError(null);
    getPublishedId(sb, projectId)
      .then((id) => {
        if (!cancelled) setSiteId(id);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not check publishing.");
      });
    return () => {
      cancelled = true;
    };
  }, [sb, projectId]);

  const url = siteId && typeof window !== "undefined" ? siteUrl(window.location.origin, siteId) : "";
  const changed = siteId !== null && publishedPrint !== null && publishedPrint !== filesFingerprint(files);

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const id = await publishSite(sb, projectId, name, files);
      setSiteId(id);
      setPublishedPrint(filesFingerprint(files));
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish.");
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    if (!window.confirm("Unpublish this site? The public link will stop working, and the form messages, visitor accounts and saved data of this site will be deleted.")) return;
    setBusy(true);
    setError(null);
    try {
      await unpublishSite(sb, projectId);
      setSiteId(null);
      setPublishedPrint(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unpublish.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  const popover = open || (error !== null && !busy);

  return (
    <div ref={box} className="relative">
      {!siteId ? (
        <button
          type="button"
          onClick={publish}
          disabled={busy || disabled}
          className="btn btn-primary"
          title="Make this site available at a public link"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
          {busy ? "Publishing..." : "Publish"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="btn btn-primary"
          title="Your site is live. Open the publish menu"
        >
          <Globe size={16} />
          Published
          {changed && <span className="h-2 w-2 rounded-full bg-amber-300" aria-label="Unpublished changes" />}
          <ChevronDown size={14} />
        </button>
      )}

      {popover && (
        <div className="menu absolute right-0 top-full z-50 mt-1 w-[300px] space-y-2 p-3">
          {error && <p className="rounded-btn bg-amber-950/60 px-2 py-2 text-xs text-amber-200">{error}</p>}
          {siteId && (
            <>
              <div className="flex items-center gap-2 rounded-btn border border-line bg-white/5 px-2 py-1">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-xs text-white/80 hover:text-white hover:underline"
                  title={url}
                >
                  {url.replace(/^https?:\/\//, "")}
                </a>
                <button type="button" onClick={copy} aria-label="Copy link" data-tip={copied ? "Copied" : "Copy link"} className="icon-btn tip tip-right h-6 w-6">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <a href={url} target="_blank" rel="noreferrer" aria-label="Open site" data-tip="Open site" className="icon-btn tip tip-right h-6 w-6">
                  <ExternalLink size={14} />
                </a>
              </div>
              <button
                type="button"
                onClick={publish}
                disabled={busy || disabled}
                className="btn w-full"
                title="Publish the current version to the same link"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {busy ? "Updating..." : changed ? "Update site (changes not published)" : "Update site"}
              </button>
              <button type="button" onClick={unpublish} disabled={busy} className="btn btn-ghost w-full text-red-300 hover:text-red-200">
                <Unplug size={14} /> Unpublish
              </button>
            </>
          )}
          {!siteId && !error && <p className="text-xs text-white/60">Not published yet.</p>}
        </div>
      )}
    </div>
  );
}
