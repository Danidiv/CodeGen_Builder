"use client";

import { useEffect, useRef, useState } from "react";
import { TEMPLATES } from "@/lib/templates";
import { STYLES } from "@/lib/styles";
import { Attachment, MAX_IMAGES, MAX_TEXT_FILES, readAttachment } from "@/lib/attachments";

export type UiMessage = {
  role: "user" | "assistant";
  content: string;
  /** Set on assistant messages that ended without a result, so the chat can offer "Try again". */
  kind?: "error" | "stopped" | "warning";
  /** Show the template buttons under this message. */
  showTemplates?: boolean;
};

type Props = {
  messages: UiMessage[];
  loading: boolean;
  status: string | null;
  onSend: (text: string, attachments?: Attachment[]) => void;
  onStop: () => void;
  onRetry: () => void;
  onTemplate: (id: string) => void;
  styleId: string;
  onStyle: (id: string) => void;
};

const SUGGESTIONS = [
  "A todo app with categories and a dark theme",
  "A landing page for a coffee shop",
  "A personal finance dashboard with mock charts",
];

function TemplatePicker({ onPick, disabled }: { onPick: (id: string) => void; disabled: boolean }) {
  return (
    <div className="grid w-full grid-cols-2 gap-2">
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          onClick={() => onPick(t.id)}
          disabled={disabled}
          className="rounded-lg border border-white/10 px-3 py-2 text-left text-sm hover:bg-white/5 disabled:opacity-50"
        >
          <span className="block text-white/90">
            {t.emoji} {t.name}
          </span>
          <span className="block text-xs text-white/50">{t.description}</span>
        </button>
      ))}
    </div>
  );
}

export default function Chat({ messages, loading, status, onSend, onStop, onRetry, onTemplate, styleId, onStyle }: Props) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addFiles(list: FileList | File[]) {
    setAttachError(null);
    let next = [...attachments];
    for (const file of Array.from(list)) {
      try {
        const a = await readAttachment(file);
        const sameKind = next.filter((x) => x.kind === a.kind).length;
        if (a.kind === "image" && sameKind >= MAX_IMAGES) throw new Error("At most " + MAX_IMAGES + " images per message.");
        if (a.kind === "text" && sameKind >= MAX_TEXT_FILES) throw new Error("At most " + MAX_TEXT_FILES + " text files per message.");
        next = [...next, a];
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : "Could not attach this file.");
      }
    }
    setAttachments(next);
  }
  const bottomRef = useRef<HTMLDivElement>(null);

  // How long the current answer has been running (local models can take minutes).
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);
  const elapsedText = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  function submit() {
    let text = input.trim();
    if ((!text && attachments.length === 0) || loading) return;
    if (!text) {
      text = attachments.some((a) => a.kind === "image")
        ? "Build a page that looks like the attached reference image."
        : "Use the attached file for the content.";
    }
    const files = attachments;
    setInput("");
    setAttachments([]);
    setAttachError(null);
    onSend(text, files);
  }

  const lastIndex = messages.length - 1;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-white/60">Start from a template:</p>
            <TemplatePicker onPick={onTemplate} disabled={loading} />
            <p className="pt-2 text-sm text-white/60">Or try one of these:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => onSend(s)}
                disabled={loading}
                className="block w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/5 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => {
          const failed = m.role === "assistant" && !!m.kind;
          return (
            <div key={i} className={m.role === "user" ? "flex flex-col items-end" : "flex flex-col items-start"}>
              <div
                className={`max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white"
                    : failed
                      ? "border border-amber-400/30 bg-amber-950/40 text-amber-100"
                      : "bg-white/5 text-white/90"
                }`}
              >
                {m.content || "..."}
              </div>
              {m.showTemplates && <div className="mt-2 w-full"><TemplatePicker onPick={onTemplate} disabled={loading} /></div>}
              {failed && i === lastIndex && !loading && (
                <button
                  onClick={onRetry}
                  className="mt-1.5 rounded-md border border-white/15 px-3 py-1 text-xs text-white/80 hover:bg-white/5"
                  title="Send the same request again"
                >
                  ↻ Try again
                </button>
              )}
            </div>
          );
        })}

        {status && (
          <div className="text-xs text-indigo-300">
            {status}
            {loading && elapsed > 0 ? ` · ${elapsedText}` : ""}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-white/40">Style:</span>
          {STYLES.map((st) => (
            <button
              key={st.id}
              onClick={() => onStyle(st.id)}
              className={`rounded-full border px-2.5 py-0.5 ${
                styleId === st.id
                  ? "border-indigo-400 bg-indigo-500/20 text-white"
                  : "border-white/10 text-white/60 hover:bg-white/5"
              }`}
              title={st.prompt || "The AI decides the look"}
            >
              {st.emoji} {st.name}
            </button>
          ))}
        </div>
        {(attachments.length > 0 || attachError) && (
          <div className="mb-2 space-y-1">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((a, i) => (
                  <span key={i} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-1 pl-1.5 pr-2 text-xs text-white/80">
                    {a.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.data} alt={a.name} className="h-6 w-6 rounded object-cover" />
                    ) : (
                      <span>📄</span>
                    )}
                    <span className="max-w-[110px] truncate">{a.name}</span>
                    <button onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} className="text-white/50 hover:text-white" title="Remove">
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            {attachError && <p className="text-xs text-amber-300">{attachError}</p>}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.markdown,.json,.csv,.html,.css,.js,.ts,.tsx,.jsx,text/plain"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="self-end rounded-lg border border-white/10 px-2.5 py-2 text-sm text-white/70 hover:bg-white/5 disabled:opacity-40"
            title="Attach a text file or a reference image (you can also paste an image)"
          >
            📎
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && loading) {
                onStop();
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            onPaste={(e) => {
              const imgs = Array.from(e.clipboardData.files as FileList).filter((f: File) => f.type.startsWith("image/"));
              if (imgs.length > 0) {
                e.preventDefault();
                void addFiles(imgs);
              }
            }}
            rows={2}
            placeholder="Describe your app or ask for a change..."
            className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/40 focus:border-indigo-400"
          />
          {loading ? (
            <button
              onClick={onStop}
              className="self-end rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              title="Stop the AI (Esc)"
            >
              ■ Stop
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!input.trim()}
              className="self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
