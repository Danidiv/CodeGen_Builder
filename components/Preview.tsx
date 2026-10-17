"use client";

import {
  SandpackProvider,
  SandpackLayout,
  SandpackPreview,
  SandpackCodeEditor,
  SandpackFileExplorer,
  useSandpack,
} from "@codesandbox/sandpack-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { detectDependencies } from "@/lib/deps";
import {
  PROBE_AFTER,
  SHOW_HELP_AFTER,
  describeStall,
  probeServer,
  shouldAutoReload,
  type Probe,
} from "@/lib/previewHealth";

type Props = {
  files: Record<string, string>;
  onError?: (message: string | null) => void;
  /** True while the AI is writing: the preview is not touched during that time. */
  busy?: boolean;
  /** Goes up every time the AI finished or a version was restored. */
  settledTick?: number;
  /** Called (debounced) when the user typed in the Code tab; gets the complete file set. */
  onFilesEdit?: (files: Record<string, string>) => void;
};

/** Small stable hash, so the preview restarts exactly when the files change. */
function hashFiles(files: Record<string, string>): string {
  let h = 5381;
  for (const path of Object.keys(files).sort()) {
    const s = path + "\u0000" + files[path] + "\u0001";
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** Sits inside SandpackProvider and reports runtime/compile errors upward. */
function ErrorWatcher({ onError }: { onError?: (message: string | null) => void }) {
  const { sandpack } = useSandpack();
  const message = sandpack.error?.message ?? null;

  useEffect(() => {
    onError?.(message);
  }, [message, onError]);

  return null;
}

/**
 * Passes manual edits from the Code tab upward (after the typing pauses).
 * `lastEmitted` lets the parent tell the Preview "this change came from the
 * editor", so the preview does not restart and the cursor stays where it is.
 */
function EditSync({
  base,
  onEdit,
  lastEmitted,
  busy,
}: {
  busy: boolean;
  base: Record<string, string>;
  onEdit?: (files: Record<string, string>) => void;
  lastEmitted: React.MutableRefObject<string>;
}) {
  const { sandpack } = useSandpack();
  const baseRef = useRef(base);
  baseRef.current = base;

  // Only files that already belong to the project; template extras are ignored.
  const current: Record<string, string> = {};
  for (const path of Object.keys(baseRef.current)) {
    const f = sandpack.files[path];
    if (f && typeof f.code === "string") current[path] = f.code;
  }
  const currentHash = hashFiles(current);

  useEffect(() => {
    if (!onEdit || busy) return;
    if (currentHash === hashFiles(baseRef.current)) return;
    const t = setTimeout(() => {
      lastEmitted.current = currentHash;
      onEdit({ ...baseRef.current, ...current });
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHash, onEdit, busy]);

  return null;
}

/**
 * Shows how the preview start is going. "Ready" means the bundler itself sent
 * its "done" message (Sandpack's own `status` never says that, so we listen).
 * If the start takes long, a panel explains why and offers a restart.
 */
function PreviewStatus({
  onReload,
  busy,
  autoReloads,
}: {
  onReload: () => void;
  busy: boolean;
  autoReloads: React.MutableRefObject<number>;
}) {
  const { sandpack, listen } = useSandpack();
  const [ready, setReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [probe, setProbe] = useState<Probe | null>(null);
  const probing = useRef(false);

  useEffect(() => {
    const stop = listen((msg: { type?: string }) => {
      if (msg?.type === "done") setReady(true);
    });
    return () => stop();
  }, [listen]);

  // Seconds since this preview started (this component remounts with every restart).
  useEffect(() => {
    if (ready) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [ready]);

  const timedOut = sandpack.status === "timeout";

  useEffect(() => {
    if (ready || probing.current) return;
    if (elapsed >= PROBE_AFTER || timedOut) {
      probing.current = true;
      probeServer().then(setProbe);
    }
  }, [elapsed, timedOut, ready]);

  useEffect(() => {
    if (ready) return;
    if (shouldAutoReload(elapsed, busy, autoReloads.current)) {
      autoReloads.current += 1;
      onReload();
    }
  }, [elapsed, busy, ready, autoReloads, onReload]);

  if (ready) return null;

  if (timedOut || elapsed >= SHOW_HELP_AFTER) {
    const info = describeStall(elapsed, probe, timedOut);
    return (
      <div className="absolute inset-x-3 bottom-3 z-10 rounded-lg border border-white/10 bg-[#11141b]/95 p-4 text-sm shadow-xl">
        <p className="font-medium text-white">{info.headline}</p>
        <ul className="mt-2 space-y-1 text-white/70">
          {info.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        <button onClick={onReload} className="mt-3 rounded-md bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-500">
          Reload preview
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-black/60 px-3 py-1 text-xs text-white/70">
      Starting preview... ({elapsed}s, the first time can take up to 30 seconds)
    </div>
  );
}

export default function Preview({ files, onError, busy = false, onFilesEdit }: Props) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  // Bumping this restarts the preview.
  const [reloadKey, setReloadKey] = useState(0);
  const autoReloads = useRef(0);

  // The preview only follows the files once the AI has finished writing:
  // updates sent while the bundler is still compiling get lost.
  const [shown, setShown] = useState(files);
  // Hash of the last change that came from the Code tab: the editor already has it.
  const lastEmitted = useRef("");
  useEffect(() => {
    if (busy) return;
    if (lastEmitted.current && hashFiles(files) === lastEmitted.current) return;
    lastEmitted.current = "";
    setShown(files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, busy]);
  const filesRef = useRef(files);
  filesRef.current = files;

  const dependencies = useMemo(() => detectDependencies(shown), [shown]);
  const depsKey = Object.keys(dependencies).sort().join(",");
  const filesKey = useMemo(() => hashFiles(shown), [shown]);
  const reload = useRef(() => {});
  reload.current = () => {
    // A restart must start from the newest files, including edits typed in the Code tab.
    lastEmitted.current = "";
    setShown(filesRef.current);
    setReloadKey((k) => k + 1);
  };
  const stableReload = useRef(() => reload.current()).current;

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-white/10 p-2">
        {(["preview", "code"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1 text-sm capitalize ${
              tab === t ? "bg-white/10 text-white" : "text-white/60 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
        <button
          onClick={() => {
            autoReloads.current = 0;
            stableReload();
          }}
          className="ml-auto rounded-md border border-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/5"
          title="Restart the preview (try this if it stays blank or shows 'Couldn't connect to server')"
        >
          Reload preview
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <SandpackProvider
          // New key = a clean restart: new files, new packages or the Reload button.
          key={`${depsKey}:${reloadKey}:${filesKey}`}
          template="react-ts"
          theme="dark"
          files={shown}
          customSetup={{ dependencies }}
          options={{
            externalResources: ["https://cdn.tailwindcss.com"],
            initMode: "immediate",
            bundlerTimeOut: 120000,
          }}
          style={{ height: "100%" }}
        >
          <ErrorWatcher onError={onError} />
          <EditSync base={files} onEdit={onFilesEdit} lastEmitted={lastEmitted} busy={busy} />
          <PreviewStatus onReload={stableReload} busy={busy} autoReloads={autoReloads} />
          {/* Both views stay mounted; we only hide one. */}
          <div style={{ position: "absolute", inset: 0, display: tab === "preview" ? "block" : "none" }}>
            <SandpackLayout style={{ height: "100%", border: 0, borderRadius: 0 }}>
              <SandpackPreview showNavigator={false} showOpenInCodeSandbox={false} style={{ height: "100%" }} />
            </SandpackLayout>
          </div>
          <div style={{ position: "absolute", inset: 0, display: tab === "code" ? "block" : "none" }}>
            <SandpackLayout style={{ height: "100%", border: 0, borderRadius: 0 }}>
              <SandpackFileExplorer style={{ height: "100%", minWidth: 160 }} />
              <SandpackCodeEditor showLineNumbers style={{ height: "100%", flex: 1 }} />
            </SandpackLayout>
          </div>
        </SandpackProvider>
      </div>
    </div>
  );
}
