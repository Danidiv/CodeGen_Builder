"use client";

import { Check, ChevronDown, Loader2, Pencil, Plus, Trash2, AlertCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProjectMeta } from "@/lib/projects";
import { IconButton, useDismiss } from "./ui";

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
  onRename: (name: string) => void;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

/** Save indicator (icon + short text). */
export function SaveBadge({ state }: { state: SaveState }) {
  if (state === "saving")
    return (
      <span className="flex items-center gap-1 text-xs text-white/50">
        <Loader2 size={12} className="animate-spin" /> Saving
      </span>
    );
  if (state === "saved")
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-300">
        <Check size={12} /> Saved
      </span>
    );
  if (state === "error")
    return (
      <span className="flex items-center gap-1 text-xs text-red-300" title="Not saved! Check your connection">
        <AlertCircle size={12} /> Not saved
      </span>
    );
  return null;
}

/** Name field: Enter or leaving the field saves, Esc cancels. */
export function NameEditor({ name, onSave, onCancel }: { name: string; onSave: (n: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(name);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  function finish(save: boolean) {
    if (done.current) return;
    done.current = true;
    const v = value.trim().slice(0, 60);
    if (save && v && v !== name) onSave(v);
    else onCancel();
  }
  return (
    <input
      ref={ref}
      value={value}
      maxLength={60}
      aria-label="Project name"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      className="input h-8 w-[200px] max-w-full py-1"
    />
  );
}

/** Local mode (no login): just the name, with rename. */
export function LocalName({ name, onRename, disabled }: { name: string; onRename: (n: string) => void; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <NameEditor
        name={name}
        onSave={(n) => {
          onRename(n);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="truncate px-2 text-sm text-white">{name}</span>
      <IconButton label="Rename project" disabled={disabled} onClick={() => setEditing(true)}>
        <Pencil size={14} />
      </IconButton>
    </div>
  );
}

/** Project name in the top bar; in cloud mode it opens the project list. */
export default function ProjectsBar({ projects, currentId, currentName, saveState, email, disabled, onOpen, onNew, onDelete, onRename }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, open, () => setOpen(false));

  return (
    <div ref={box} className="relative flex min-w-0 items-center gap-2">
      {editing ? (
        <NameEditor
          name={currentName}
          onSave={(n) => {
            onRename(n);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <button
            type="button"
            className="btn btn-ghost min-w-0 max-w-[200px] px-2 text-white"
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            title="Switch project"
          >
            <span className="truncate">{currentName}</span>
            <ChevronDown size={14} className="shrink-0 text-white/50" />
          </button>
          <IconButton label="Rename project" disabled={disabled || !currentId} onClick={() => setEditing(true)}>
            <Pencil size={14} />
          </IconButton>
        </>
      )}
      <span className="hidden sm:block">
        <SaveBadge state={saveState} />
      </span>

      {open && (
        <div className="menu absolute left-0 top-full z-50 mt-1 w-[280px]">
          <p className="px-2 py-1 text-xs text-white/40">Signed in as {email}</p>
          <div className="max-h-72 overflow-y-auto">
            {projects.length === 0 && <p className="px-2 py-2 text-xs text-white/60">No projects yet.</p>}
            {projects.map((p) => (
              <div key={p.id} className={`group flex items-center gap-1 rounded-btn ${p.id === currentId ? "bg-white/10" : ""}`}>
                <button
                  type="button"
                  className="menu-item min-w-0 flex-1 justify-between"
                  onClick={() => {
                    setOpen(false);
                    onOpen(p.id);
                  }}
                >
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 text-xs text-white/40">{formatDate(p.updated_at)}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${p.name}`}
                  data-tip="Delete project"
                  className="icon-btn tip tip-right h-8 w-8 shrink-0 hover:text-red-300"
                  onClick={() => {
                    setOpen(false);
                    onDelete(p.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-1 border-t border-line pt-1">
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                setOpen(false);
                onNew();
              }}
            >
              <Plus size={14} /> New project
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
