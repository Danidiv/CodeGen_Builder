"use client";

import { useState } from "react";
import type { ProjectMeta } from "@/lib/projects";

export type SaveState = "idle" | "saving" | "saved" | "error";

type Props = {
  projects: ProjectMeta[];
  currentId: string | null;
  currentName: string;
  saveState: SaveState;
  email: string;
  disabled: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onSignOut: () => void;
};

const BTN =
  "rounded-md border border-white/10 px-2 py-1 text-xs text-white/80 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

function saveLabel(state: SaveState): { text: string; className: string } {
  switch (state) {
    case "saving":
      return { text: "Saving...", className: "text-white/50" };
    case "saved":
      return { text: "Saved", className: "text-emerald-300" };
    case "error":
      return { text: "Not saved! Check your connection", className: "text-red-300" };
    default:
      return { text: "", className: "" };
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

export default function ProjectsBar({
  projects,
  currentId,
  currentName,
  saveState,
  email,
  disabled,
  onOpen,
  onNew,
  onDelete,
  onSignOut,
}: Props) {
  const [open, setOpen] = useState(false);
  const save = saveLabel(saveState);

  return (
    <div className="relative border-b border-white/10 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <button
          className={`${BTN} min-w-0 flex-1 truncate text-left`}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          title="Switch project"
        >
          <span className="truncate">{currentName}</span> <span className="text-white/40">v</span>
        </button>
        <button className={BTN} disabled={disabled} onClick={onNew} title="Start a new project">
          + New
        </button>
        <button className={BTN} disabled={disabled} onClick={onSignOut} title={`Signed in as ${email}`}>
          Sign out
        </button>
      </div>
      <div className="mt-1 h-4 text-xs">
        <span className={save.className}>{save.text}</span>
      </div>

      {open && (
        <div className="absolute inset-x-3 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-[#12151c] p-1 shadow-xl">
          <p className="px-2 py-1 text-[11px] text-white/40">Signed in as {email}</p>
          {projects.length === 0 && <p className="px-2 py-2 text-xs text-white/60">No projects yet.</p>}
          {projects.map((p) => (
            <div
              key={p.id}
              className={`flex items-center gap-1 rounded-md hover:bg-white/5 ${
                p.id === currentId ? "bg-indigo-600/30" : ""
              }`}
            >
              <button
                className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-1.5 text-left text-xs text-white/90"
                onClick={() => {
                  setOpen(false);
                  onOpen(p.id);
                }}
              >
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 text-white/40">{formatDate(p.updated_at)}</span>
              </button>
              <button
                className="shrink-0 rounded px-2 py-1 text-xs text-white/40 hover:bg-red-950/60 hover:text-red-300"
                title="Delete project"
                onClick={() => {
                  setOpen(false);
                  onDelete(p.id);
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
