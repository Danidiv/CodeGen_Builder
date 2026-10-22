"use client";

import { AlertTriangle, ChevronRight, Paperclip, RotateCcw, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TEMPLATES } from "@/lib/templates";
import type { Attachment } from "@/lib/attachments";
import ChatInput from "./ChatInput";
import GenerationSteps from "./GenerationSteps";
import { TEMPLATE_ICONS } from "./icons";
import { Rocket } from "lucide-react";

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

/**
 * Messages sent by the Auto-fix / "Fix with AI" flow are shown as a small chip.
 * Returns null for normal messages.
 */
export function parseFixMessage(content: string): { label: string; details: string } | null {
  const auto = content.match(/^\[Auto-fix (\d+)\/(\d+)\]\s*/);
  const manual = !auto && content.startsWith("The preview shows this error");
  if (!auto && !manual) return null;
  const marker = "output the full corrected files:";
  const at = content.indexOf(marker);
  const details = (at >= 0 ? content.slice(at + marker.length) : content.replace(/^\[Auto-fix \d+\/\d+\]\s*/, "")).trim();
  return {
    label: auto ? "Auto-fixed 1 error" + (Number(auto[1]) > 1 ? ` (attempt ${auto[1]}/${auto[2]})` : "") : "Asked AI to fix 1 error",
    details,
  };
}

function FixChip({ label, details }: { label: string; details: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="max-w-[92%]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex h-6 items-center gap-1 rounded-full border border-line bg-white/5 px-2 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white/80 active:bg-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
      >
        <Wrench size={12} />
        {label}
        <ChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-btn border border-line bg-white/5 p-2 text-xs text-white/60">
          {details || "(no details)"}
        </pre>
      )}
    </div>
  );
}

function TemplatePicker({ onPick, disabled }: { onPick: (id: string) => void; disabled: boolean }) {
  return (
    <div className="grid w-full grid-cols-2 gap-2">
      {TEMPLATES.map((t) => {
        const Icon = TEMPLATE_ICONS[t.id] ?? Rocket;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            disabled={disabled}
            className="card flex flex-col items-start gap-1 p-3 text-left transition-colors hover:border-white/20 hover:bg-raised active:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="flex items-center gap-2 text-sm text-white/90">
              <Icon size={14} className="text-white/60" /> {t.name}
            </span>
            <span className="text-xs text-white/50">{t.description}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Emoji inside message text (added by the page) are shown as icons instead. */
function cleanText(s: string): string {
  return s.replace(/⚠️\s*/g, "").replace(/^⏹\s*/, "");
}

export default function Chat({ messages, loading, status, onSend, onStop, onRetry, onTemplate, styleId, onStyle }: Props) {
  const [input, setInput] = useState("");
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
  const elapsedText = elapsed <= 0 ? "" : elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const lastIndex = messages.length - 1;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-white/50">Describe what you want to build, or change something in your project.</p>
        )}

        {messages.map((m, i) => {
          const fix = m.role === "user" ? parseFixMessage(m.content) : null;
          if (fix) {
            return (
              <div key={i} className="flex flex-col items-end">
                <FixChip label={fix.label} details={fix.details} />
              </div>
            );
          }
          const failed = m.role === "assistant" && !!m.kind;
          // "text\n📎 file1, file2" -> text + attachment chip
          const att = m.role === "user" ? m.content.match(/\n📎 ([\s\S]+)$/) : null;
          const text = att ? m.content.slice(0, att.index) : m.content;
          // The live answer bubble stays hidden while only the progress steps are needed.
          const pending = m.role === "assistant" && !m.content && i === lastIndex && loading;
          return (
            <div key={i} className={m.role === "user" ? "flex flex-col items-end" : "flex flex-col items-start"}>
              {!pending && (
                <div
                  className={`max-w-[92%] whitespace-pre-wrap break-words rounded-card px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-accent text-white"
                      : failed
                        ? "border border-amber-400/30 bg-amber-950/40 text-amber-100"
                        : "border border-line bg-white/5 text-white/90"
                  }`}
                >
                  {failed && <AlertTriangle size={14} className="mr-2 inline-block -translate-y-px" aria-hidden />}
                  {cleanText(text) || "..."}
                  {att && (
                    <span className="mt-1 flex items-center gap-1 text-xs text-white/70">
                      <Paperclip size={12} /> {att[1]}
                    </span>
                  )}
                </div>
              )}
              {m.showTemplates && (
                <div className="mt-2 w-full">
                  <TemplatePicker onPick={onTemplate} disabled={loading} />
                </div>
              )}
              {failed && i === lastIndex && !loading && (
                <button type="button" onClick={onRetry} className="btn mt-2" title="Send the same request again">
                  <RotateCcw size={14} /> Try again
                </button>
              )}
            </div>
          );
        })}

        {loading && <GenerationSteps status={status} elapsedText={elapsedText} />}
        {!loading && status && <p className="text-xs text-white/50">{status}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-line p-3">
        <ChatInput
          value={input}
          onChange={setInput}
          loading={loading}
          onSend={onSend}
          onStop={onStop}
          styleId={styleId}
          onStyle={onStyle}
        />
      </div>
    </div>
  );
}
