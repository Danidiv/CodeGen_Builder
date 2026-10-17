"use client";

import { useState } from "react";
import type { Version } from "@/lib/versions";

type Props = {
  versions: Version[];
  active: number;
  disabled: boolean;
  autoFix: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRestore: (index: number) => void;
  onDownload: () => void;
  onToggleAutoFix: (value: boolean) => void;
};

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const BTN =
  "rounded-md border border-white/10 px-2 py-1 text-xs text-white/80 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

export default function Toolbar({
  versions,
  active,
  disabled,
  autoFix,
  onUndo,
  onRedo,
  onRestore,
  onDownload,
  onToggleAutoFix,
}: Props) {
  const [open, setOpen] = useState(false);
  const canUndo = active > 0;
  const canRedo = active < versions.length - 1;

  return (
    <div className="relative border-b border-white/10 px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button className={BTN} disabled={disabled || !canUndo} onClick={onUndo} title="Go back one version">
          Undo
        </button>
        <button className={BTN} disabled={disabled || !canRedo} onClick={onRedo} title="Go forward one version">
          Redo
        </button>
        <button className={BTN} disabled={disabled} onClick={() => setOpen((o) => !o)}>
          History ({versions.length})
        </button>
        <button className={BTN} disabled={disabled} onClick={onDownload} title="Download project as .zip">
          Download ZIP
        </button>
        <label
          className="ml-auto flex cursor-pointer items-center gap-1 text-xs text-white/70"
          title="When the preview shows an error, ask the AI to fix it automatically (up to 2 times)"
        >
          <input
            type="checkbox"
            checked={autoFix}
            onChange={(e) => onToggleAutoFix(e.target.checked)}
            className="accent-indigo-500"
          />
          Auto-fix
        </label>
      </div>

      {open && (
        <div className="absolute inset-x-3 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-[#12151c] p-1 shadow-xl">
          {versions
            .map((v, i) => ({ v, i }))
            .reverse()
            .map(({ v, i }) => (
              <button
                key={v.id}
                onClick={() => {
                  onRestore(i);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/5 ${
                  i === active ? "bg-indigo-600/30 text-white" : "text-white/80"
                }`}
              >
                <span className="truncate">
                  #{i} · {v.label}
                </span>
                <span className="shrink-0 text-white/40">{formatTime(v.createdAt)}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
