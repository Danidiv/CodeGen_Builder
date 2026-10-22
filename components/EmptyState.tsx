"use client";

import { LayoutTemplate, Sparkles, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import type { Attachment } from "@/lib/attachments";
import type { ProjectMeta } from "@/lib/projects";
import type { Thumb } from "@/lib/thumb";
import ChatInput from "./ChatInput";
import { START_CARDS } from "./icons";
import { projectCover } from "@/lib/thumb";

type Props = {
  loading: boolean;
  onSend: (text: string, attachments?: Attachment[]) => void;
  onStop: () => void;
  styleId: string;
  onStyle: (id: string) => void;
  /** Cloud mode: the user's other projects (shown as cards). */
  projects?: ProjectMeta[];
  onOpenProject?: (id: string) => void;
  onDeleteProject?: (id: string) => void;
  /** CSS background of this screen (chosen in the account menu). */
  bg: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

/** Picture of a project: its first photo if it has one, otherwise a gradient in its colours. */
function ProjectCover({ thumb }: { thumb?: Thumb | null }) {
  const [broken, setBroken] = useState(false);
  const { img, background } = projectCover(thumb);
  return (
    <span className="relative block aspect-[16/9] w-full overflow-hidden" style={{ background }}>
      {img && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-white/60" aria-hidden>
          <LayoutTemplate size={28} />
        </span>
      )}
    </span>
  );
}

/** Shown when there is no project yet: big prompt box, starting cards and your other projects. */
export default function EmptyState({ loading, onSend, onStop, styleId, onStyle, projects = [], onOpenProject, onDeleteProject, bg }: Props) {
  const [input, setInput] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto" style={{ background: bg }}>
      <div className="flex flex-1 flex-col items-center justify-center p-4 py-8">
        <div className="w-full max-w-[720px] space-y-6">
          <div className="space-y-2 text-center">
            <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-btn border border-line bg-white/10" aria-hidden>
              <Sparkles size={16} />
            </span>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">What do you want to build?</h1>
            <p className="text-sm text-white/60">Describe your app and get working code with a live preview.</p>
          </div>

          <ChatInput
            large
            menuDown
            value={input}
            onChange={setInput}
            loading={loading}
            onSend={onSend}
            onStop={onStop}
            styleId={styleId}
            onStyle={onStyle}
            textareaRef={ref}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {START_CARDS.map(({ id, name, Icon, prompt }) => (
              <button
                key={id}
                type="button"
                disabled={loading}
                onClick={() => {
                  setInput(prompt);
                  ref.current?.focus();
                }}
                className="card flex flex-col items-start gap-2 bg-panel/80 p-3 text-left backdrop-blur transition-colors hover:border-white/20 hover:bg-raised active:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon size={16} className="text-white/60" />
                <span className="text-sm text-white/90">{name}</span>
              </button>
            ))}
          </div>
        </div>

        {projects.length > 0 && (
          <section aria-label="Your projects" className="mx-auto mt-8 w-full max-w-[1040px] space-y-3">
            <h2 className="text-base font-semibold text-white">Your projects</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {projects.map((p) => (
                <div key={p.id} className="group relative">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => onOpenProject?.(p.id)}
                    className="block w-full text-left focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="block overflow-hidden rounded-card border border-line transition-colors group-hover:border-white/30 group-focus-within:ring-2 group-focus-within:ring-indigo-400/70">
                      <ProjectCover thumb={p.thumb} />
                    </span>
                    <span className="mt-2 block truncate text-sm font-medium text-white/90">{p.name}</span>
                    <span className="block text-xs text-white/40">Edited {formatDate(p.updated_at)}</span>
                  </button>
                  {onDeleteProject && (
                    <button
                      type="button"
                      aria-label={`Delete ${p.name}`}
                      data-tip="Delete project"
                      disabled={loading}
                      onClick={() => onDeleteProject(p.id)}
                      className="icon-btn tip tip-right absolute right-2 top-2 bg-black/50 opacity-0 hover:bg-black/70 hover:text-red-300 focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

    </div>
  );
}
