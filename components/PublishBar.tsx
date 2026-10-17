"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { filesFingerprint, getPublishedId, publishSite, siteUrl, unpublishSite } from "@/lib/publish";

type Props = {
  sb: SupabaseClient;
  projectId: string;
  name: string;
  files: Record<string, string>;
  disabled: boolean;
};

const BTN =
  "rounded-md border border-white/10 px-2 py-1 text-xs text-white/80 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40";

/** Publish / update / unpublish the site of the current project and show its public link. */
export default function PublishBar({ sb, projectId, name, files, disabled }: Props) {
  const [siteId, setSiteId] = useState<string | null>(null);
  const [publishedPrint, setPublishedPrint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish.");
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    if (!window.confirm("Unpublish this site? The public link will stop working.")) return;
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

  return (
    <div className="border-b border-white/10 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        {!siteId ? (
          <button onClick={publish} disabled={busy || disabled} className={BTN} title="Make this site available at a public link">
            {busy ? "Publishing..." : "🌐 Publish site"}
          </button>
        ) : (
          <>
            <a href={url} target="_blank" rel="noreferrer" className="max-w-[150px] truncate text-indigo-300 hover:underline" title={url}>
              {url.replace(/^https?:\/\//, "")}
            </a>
            <button onClick={copy} className={BTN}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button onClick={publish} disabled={busy || disabled} className={BTN} title="Publish the current version to the same link">
              {busy ? "..." : changed ? "Update ●" : "Update"}
            </button>
            <button onClick={unpublish} disabled={busy} className={BTN}>
              Unpublish
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-1 text-amber-300">{error}</p>}
    </div>
  );
}
