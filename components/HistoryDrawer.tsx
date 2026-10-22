"use client";

import { Check, History, RotateCcw, X } from "lucide-react";
import { useEffect } from "react";
import type { Version } from "@/lib/versions";
import { IconButton } from "./ui";

type Props = {
  open: boolean;
  versions: Version[];
  active: number;
  disabled: boolean;
  onRestore: (index: number) => void;
  onClose: () => void;
};

function formatTime(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

/** Right-side drawer with every saved version and a Restore button. */
export default function HistoryDrawer({ open, versions, active, disabled, onRestore, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 animate-fadeIn bg-black/50" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Version history"
        className="absolute inset-y-0 right-0 flex w-full max-w-[360px] animate-slideIn flex-col border-l border-line bg-panel shadow-2xl"
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
          <History size={16} className="text-white/60" />
          <h2 className="flex-1 text-sm font-medium">Version history</h2>
          <span className="text-xs text-white/40">{versions.length} versions</span>
          <IconButton label="Close" onClick={onClose} tip="right">
            <X size={16} />
          </IconButton>
        </header>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {versions
            .map((v, i) => ({ v, i }))
            .reverse()
            .map(({ v, i }) => {
              const current = i === active;
              return (
                <li
                  key={v.id}
                  className={`flex items-center gap-2 rounded-card border px-3 py-2 ${
                    current ? "border-white/20 bg-white/5" : "border-line"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white/90" title={v.label}>
                      {v.label}
                    </p>
                    <p className="text-xs text-white/40">
                      #{i} · {formatTime(v.createdAt)}
                    </p>
                  </div>
                  {current ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-white/60">
                      <Check size={14} /> Current
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn shrink-0"
                      disabled={disabled}
                      onClick={() => {
                        onRestore(i);
                        onClose();
                      }}
                    >
                      <RotateCcw size={14} /> Restore
                    </button>
                  )}
                </li>
              );
            })}
        </ul>
      </aside>
    </div>
  );
}
