"use client";

import { ArrowUp, FileText, Paperclip, Square, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Attachment, MAX_IMAGES, MAX_TEXT_FILES, readAttachment } from "@/lib/attachments";
import StyleDropdown from "./StyleDropdown";
import { IconButton } from "./ui";

type Props = {
  value: string;
  onChange: (v: string) => void;
  loading: boolean;
  onSend: (text: string, attachments?: Attachment[]) => void;
  onStop: () => void;
  styleId: string;
  onStyle: (id: string) => void;
  /** Bigger box for the empty screen. */
  large?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement>;
  /** Open the style menu downwards (when the box is near the top of the screen). */
  menuDown?: boolean;
};

const MAX_HEIGHT = 200;

/** Auto-growing prompt box: Enter sends, Shift+Enter = new line. */
export default function ChatInput({ value, onChange, loading, onSend, onStop, styleId, onStyle, large, textareaRef, menuDown }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ta = textareaRef ?? ownRef;

  // Grow with the text (up to MAX_HEIGHT, then scroll).
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT) + "px";
  }, [value, ta]);

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

  function submit() {
    let text = value.trim();
    if ((!text && attachments.length === 0) || loading) return;
    if (!text) {
      text = attachments.some((a) => a.kind === "image")
        ? "Build a page that looks like the attached reference image."
        : "Use the attached file for the content.";
    }
    const files = attachments;
    onChange("");
    setAttachments([]);
    setAttachError(null);
    onSend(text, files);
  }

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !loading;

  return (
    <div className={`card transition-colors focus-within:border-white/20 ${large ? "p-4" : "p-3"}`}>
      {(attachments.length > 0 || attachError) && (
        <div className="mb-2 space-y-1">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <span key={i} className="flex items-center gap-2 rounded-btn border border-line bg-white/5 py-1 pl-2 pr-1 text-xs text-white/80">
                  {a.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.data} alt={a.name} className="h-4 w-4 rounded-[4px] object-cover" />
                  ) : (
                    <FileText size={14} />
                  )}
                  <span className="max-w-[110px] truncate">{a.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${a.name}`}
                    data-tip="Remove"
                    onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}
                    className="icon-btn tip h-6 w-6"
                  >
                    <X size={12} />
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

      <textarea
        ref={ta}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && loading) {
            onStop();
            return;
          }
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
        rows={large ? 3 : 1}
        aria-label="Message"
        placeholder="Describe your app, e.g. a coffee shop landing page"
        className={`block w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-white/40 ${
          large ? "min-h-[72px]" : "min-h-[24px]"
        }`}
        style={{ maxHeight: MAX_HEIGHT }}
      />

      <div className="mt-2 flex items-center gap-1">
        <IconButton label="Attach a text file or reference image (you can also paste an image)" disabled={loading} onClick={() => fileRef.current?.click()} tip={menuDown ? "down" : "up"}>
          <Paperclip size={16} />
        </IconButton>
        <StyleDropdown styleId={styleId} onStyle={onStyle} up={!menuDown} />
        <div className="ml-auto">
          {loading ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop (Esc)"
              data-tip="Stop (Esc)"
              className="tip tip-right tip-up flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-500 active:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70"
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              aria-label="Send"
              data-tip="Send (Enter)"
              className="tip tip-right tip-up flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover active:bg-accent-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
            >
              <ArrowUp size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
