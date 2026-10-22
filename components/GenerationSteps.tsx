"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const STEPS = ["Planning", "Writing files", "Checking", "Preview ready"];

/**
 * Which step are we in? Worked out from the status text the page already sets
 * (no change to the generation flow). Steps never go backwards while running.
 */
export function stepFromStatus(status: string | null): number {
  if (!status) return 0;
  if (/^Writing (?!the answer)/.test(status) || /^Preparing changes/.test(status)) return 1;
  if (/^Finding photos/.test(status) || /Trying once more/.test(status)) return 2;
  return 0;
}

export default function GenerationSteps({ status, elapsedText }: { status: string | null; elapsedText: string }) {
  const [reached, setReached] = useState(0);
  const last = useRef(0);
  useEffect(() => {
    const s = stepFromStatus(status);
    if (/Trying once more/.test(status ?? "")) {
      last.current = Math.max(last.current, 1);
    } else {
      last.current = Math.max(last.current, s);
    }
    setReached(last.current);
  }, [status]);

  return (
    <div className="card space-y-2 p-3" role="status" aria-live="polite">
      <ol className="space-y-2">
        {STEPS.map((label, i) => {
          const done = i < reached;
          const current = i === reached && i < STEPS.length - 1;
          return (
            <li key={label} className={`flex items-center gap-2 text-sm ${done ? "text-white/90" : current ? "text-white" : "text-white/30"}`}>
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  done ? "bg-emerald-500/20 text-emerald-300" : current ? "text-white/70" : "border border-white/15"
                }`}
              >
                {done ? <Check size={12} /> : current ? <Loader2 size={14} className="animate-spin" /> : null}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
      {status && (
        <p className="truncate text-xs text-white/40">
          {status}
          {elapsedText ? ` · ${elapsedText}` : ""}
        </p>
      )}
    </div>
  );
}
