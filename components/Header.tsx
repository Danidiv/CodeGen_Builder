"use client";

import { ArrowLeft, Code2, Eye, LogOut, Plus, User } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import UsageBar, { usageLevel } from "./UsageBar";
import { IconButton, useDismiss } from "./ui";
import { THEMES } from "./themes";

export type Tab = "preview" | "code";

type Props = {
  /** Project switcher (cloud) or plain name (local). */
  projectSlot: ReactNode;
  /** Preview/Code and Publish are only shown once there is a project. */
  showTools: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  publishSlot: ReactNode;
  email: string | null;
  usage: { used: number; limit: number } | null;
  disabled: boolean;
  /** Local mode only: start a new project from the menu. */
  onNew?: () => void;
  /** Cloud mode only. */
  onSignOut?: () => void;
  /** Background of the start screen. */
  /** Back to the start page with all projects (only given when that makes sense). */
  onHome?: () => void;
  bgTheme: string;
  onBgTheme: (id: string) => void;
};

function Segmented({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string; Icon: typeof Eye }[] = [
    { id: "preview", label: "Preview", Icon: Eye },
    { id: "code", label: "Code", Icon: Code2 },
  ];
  return (
    <div role="group" aria-label="View" className="flex items-center rounded-btn border border-line bg-white/5 p-1">
      {items.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={tab === id}
          onClick={() => onTab(id)}
          className={`flex h-6 items-center gap-1 rounded-[6px] px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 active:bg-white/[0.16] ${
            tab === id ? "bg-white/10 text-white" : "text-white/50 hover:text-white"
          }`}
        >
          <Icon size={14} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

/** ONE top bar: logo + project | Preview/Code | Publish + avatar menu. */
export default function Header({ projectSlot, showTools, tab, onTab, publishSlot, email, usage, disabled, onNew, onSignOut, onHome, bgTheme, onBgTheme }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, open, () => setOpen(false));
  const level = usage ? usageLevel(usage.used, usage.limit) : "ok";
  const initial = email ? email.trim().charAt(0).toUpperCase() : "";

  return (
    <header className="relative z-40 grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center md:grid-cols-[1fr_auto_1fr] gap-2 border-b border-line bg-panel px-3">
      <div className="flex min-w-0 items-center gap-2">
        {onHome && (
          <IconButton label="Back to all projects" onClick={onHome}>
            <ArrowLeft size={16} />
          </IconButton>
        )}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-btn border border-line bg-white/10" aria-hidden>
          <Code2 size={16} />
        </span>
        <span className="hidden text-sm font-semibold lg:block">NEXA AI</span>
        <span className="hidden h-4 w-px bg-line lg:block" aria-hidden />
        {projectSlot}
      </div>

      {showTools ? <Segmented tab={tab} onTab={onTab} /> : <span aria-hidden />}

      <div className="flex items-center justify-end gap-2">
        {showTools && publishSlot}
        <div ref={box} className="relative">
          <button
            type="button"
            aria-label="Account menu"
            aria-expanded={open}
            data-tip="Account"
            onClick={() => setOpen((o) => !o)}
            className="tip tip-right relative flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white/10 text-sm text-white transition-colors hover:bg-white/[0.16] active:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
          >
            {initial || <User size={16} />}
            {level !== "ok" && (
              <span
                className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${level === "full" ? "bg-red-500" : "bg-orange-500"}`}
                aria-label="Usage almost used up"
              />
            )}
          </button>
          {open && (
            <div className="menu absolute right-0 top-full z-50 mt-1 w-[260px] space-y-2 p-2">
              <div className="px-2 py-1">
                <p className="truncate text-sm text-white" title={email ?? undefined}>
                  {email ?? "Local mode"}
                </p>
                <p className="text-xs text-white/40">{email ? "Signed in" : "Project is kept in this browser"}</p>
              </div>
              {usage && usage.limit > 0 && (
                <div className="border-t border-line px-2 pt-2">
                  <UsageBar used={usage.used} limit={usage.limit} />
                </div>
              )}
              <div className="border-t border-line px-2 pt-2" role="group" aria-label="Background theme">
                <p className="mb-2 text-xs text-white/50">Background</p>
                <div className="flex items-center gap-2 pb-1">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-label={`Background: ${t.name}`}
                      aria-pressed={bgTheme === t.id}
                      data-tip={t.name}
                      onClick={() => onBgTheme(t.id)}
                      className={`tip h-6 w-6 rounded-full border transition-transform hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                        bgTheme === t.id ? "border-white" : "border-white/20"
                      }`}
                      style={{ background: t.dot }}
                    />
                  ))}
                </div>
              </div>
              <div className="border-t border-line pt-1">
                {onNew && (
                  <button
                    type="button"
                    className="menu-item"
                    disabled={disabled}
                    onClick={() => {
                      setOpen(false);
                      onNew();
                    }}
                  >
                    <Plus size={14} /> New project
                  </button>
                )}
                {onSignOut && (
                  <button
                    type="button"
                    className="menu-item"
                    disabled={disabled}
                    onClick={() => {
                      setOpen(false);
                      onSignOut();
                    }}
                  >
                    <LogOut size={14} /> Sign out
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
