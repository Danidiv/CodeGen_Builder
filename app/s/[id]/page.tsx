"use client";

import { SandpackPreview, SandpackProvider } from "@codesandbox/sandpack-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { detectDependencies } from "@/lib/deps";
import { fetchPublicSite } from "@/lib/publish";
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
      <a
        href="/"
        className="fixed bottom-3 right-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white/80 hover:bg-black"
        target="_blank"
        rel="noreferrer"
      >
        Made with CodeGen Builder
      </a>
    </div>
  );
}
