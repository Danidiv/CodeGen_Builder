"use client";

import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { X } from "lucide-react";
import { useDismiss } from "./ui";

const KINDS = [
  { id: "idea", label: "Idea" },
  { id: "problem", label: "Problem" },
  { id: "other", label: "Other" },
] as const;

/** Small form: the person writes a few lines, the owner reads them in the admin dashboard. */
export default function FeedbackModal({ sb, open, onClose }: { sb: SupabaseClient; open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("idea");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  function close() {
    onClose();
    // Reset after the dialog is gone.
    setTimeout(() => {
      setDone(false);
      setError(null);
      setText("");
    }, 200);
  }
  useDismiss(box, open, close);

  async function send() {
    if (text.trim().length < 3) {
      setError("Please write a few words.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await sb.rpc("submit_feedback", { p_kind: kind, p_message: text.trim(), p_choice: null });
      if (err) throw new Error(err.message);
      setDone(true);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setError(/could not find the function|schema cache/i.test(m) ? "Feedback is not set up yet." : m || "Could not send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Send feedback">
      <div ref={box} className="card w-full max-w-md space-y-4 p-5 shadow-xl animate-fadeIn">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Send feedback</h2>
            <p className="text-xs text-white/50">What should we build next, or what went wrong? I read every message.</p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
            <X size={16} />
          </button>
        </div>
        {done ? (
          <div className="space-y-3">
            <p className="text-sm text-white/80">Thank you. Your message was sent.</p>
            <button type="button" className="btn btn-primary" onClick={close}>
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-1" role="radiogroup" aria-label="Type of feedback">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.id}
                  onClick={() => setKind(k.id)}
                  className={`btn ${kind === k.id ? "btn-primary" : ""}`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <textarea
              id="feedback-text"
              className="input min-h-[120px] resize-y"
              maxLength={1000}
              placeholder="Write here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            {error && <p className="text-xs text-red-300">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={send} disabled={busy}>
                {busy ? "Sending..." : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
