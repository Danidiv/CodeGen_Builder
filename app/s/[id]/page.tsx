"use client";

import { SandpackPreview, SandpackProvider } from "@codesandbox/sandpack-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { detectDependencies } from "@/lib/deps";
import { fetchPublicSite, reportSite } from "@/lib/publish";
import { REPORT_REASONS } from "@/lib/publishRules";
import { supabase } from "@/lib/supabase";

/** Public page of a published site: just the site, full screen, no login needed. */
export default function PublishedSite() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [site, setSite] = useState<{ name: string; files: Record<string, string> } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) {
      setState("error");
      setMessage("This server is not connected to a database.");
      return;
    }
    if (!/^[a-z0-9]{6,32}$/i.test(id)) {
      setState("missing");
      return;
    }
    let cancelled = false;
    fetchPublicSite(supabase, id)
      .then((s) => {
        if (cancelled) return;
        if (!s) setState("missing");
        else {
          setSite(s);
          setState("ready");
          document.title = s.name;
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState("error");
        setMessage(err instanceof Error ? err.message : "Could not load the site.");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [reportError, setReportError] = useState("");

  async function sendReport() {
    if (!supabase) return;
    setReportState("sending");
    try {
      await reportSite(supabase, id, reason, details);
      setReportState("sent");
    } catch (err) {
      setReportState("error");
      setReportError(err instanceof Error ? err.message : "Could not send the report.");
    }
  }

  const dependencies = useMemo(() => (site ? detectDependencies(site.files) : {}), [site]);

  if (state === "loading") {
    return <div className="flex h-screen items-center justify-center bg-[#0b0d12] text-sm text-white/60">Loading site...</div>;
  }
  if (state === "missing" || state === "error" || !site) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-[#0b0d12] p-6 text-center text-white">
        <p className="text-lg font-semibold">{state === "missing" ? "This site does not exist (anymore)." : "Something went wrong."}</p>
        {message && <p className="max-w-md text-sm text-white/60">{message}</p>}
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen bg-white">
      <SandpackProvider
        template="react-ts"
        files={site.files}
        customSetup={{ dependencies }}
        options={{ externalResources: ["https://cdn.tailwindcss.com"], initMode: "immediate", bundlerTimeOut: 120000 }}
        style={{ height: "100%" }}
      >
        <SandpackPreview
          showNavigator={false}
          showOpenInCodeSandbox={false}
          showRefreshButton={false}
          style={{ height: "100vh", width: "100vw" }}
        />
      </SandpackProvider>
      <div className="fixed bottom-3 right-3 flex flex-col items-end gap-2 text-xs">
        {reporting && (
          <div className="w-72 rounded-xl bg-[#11141b] p-3 text-white shadow-xl">
            {reportState === "sent" ? (
              <p>Thank you. We will look at this site.</p>
            ) : (
              <>
                <p className="mb-2 font-medium">Report this site</p>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="mb-2 w-full rounded bg-white/10 p-1.5">
                  {REPORT_REASONS.map((r) => (
                    <option key={r} value={r} className="text-black">
                      {r}
                    </option>
                  ))}
                </select>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  maxLength={300}
                  rows={2}
                  placeholder="Details (optional)"
                  className="mb-2 w-full rounded bg-white/10 p-1.5 placeholder:text-white/40"
                />
                {reportState === "error" && <p className="mb-2 text-amber-300">{reportError}</p>}
                <button
                  onClick={sendReport}
                  disabled={reportState === "sending"}
                  className="rounded bg-red-600 px-3 py-1 font-medium hover:bg-red-500 disabled:opacity-50"
                >
                  {reportState === "sending" ? "Sending..." : "Send report"}
                </button>
              </>
            )}
          </div>
        )}
        <div className="flex gap-1.5">
          <button onClick={() => setReporting(!reporting)} className="rounded-full bg-black/70 px-3 py-1 text-white/80 hover:bg-black">
            Report
          </button>
          <a href="/" target="_blank" rel="noreferrer" className="rounded-full bg-black/70 px-3 py-1 text-white/80 hover:bg-black">
            Made with NEXA AI
          </a>
        </div>
      </div>
    </div>
  );
}
