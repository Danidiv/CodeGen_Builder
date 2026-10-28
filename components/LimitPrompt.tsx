"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

const KEY = "nexa-upgrade-day";
const CHOICES = ["The free limit is enough for me", "$5 / month", "$10 / month", "$20 / month", "I would not pay"];

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Shown at the top of the chat when the daily limit is used up. One question: would the person
 * pay for more, and how much. The answer goes to the admin dashboard (one answer per day).
 */
export default function LimitPrompt({ sb, used, limit }: { sb: SupabaseClient; used: number; limit: number }) {
  const [answered, setAnswered] = useState(true); // hidden until we know
  const [thanks, setThanks] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setAnswered(localStorage.getItem(KEY) === today());
    } catch {
      setAnswered(false);
    }
  }, []);

  async function answer(choice: string) {
    setBusy(true);
    try {
      await sb.rpc("submit_feedback", { p_kind: "upgrade", p_message: "", p_choice: choice });
    } catch {
      /* the answer is optional: never show an error for it */
    }
    try {
      localStorage.setItem(KEY, today());
    } catch {
      /* ignore */
    }
    setBusy(false);
    setThanks(true);
  }

  if (answered && !thanks) return null;
  return (
    <div className="shrink-0 border-b border-line bg-raised p-3" role="region" aria-label="Daily limit reached">
      {thanks ? (
        <div className="flex items-center justify-between gap-2 text-sm text-white/80">
          <span>Thank you. This helps me decide the plans.</span>
          <button type="button" className="btn btn-ghost" onClick={() => setAnswered(true)}>
            Close
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-white">
            You used all {used} of {limit} AI requests today. It resets at 05:00 Pakistan time.
          </p>
          <p className="text-xs text-white/60">If there was a paid plan with many more requests, what would you pay?</p>
          <div className="flex flex-wrap gap-2">
            {CHOICES.map((c) => (
              <button key={c} type="button" className="btn" disabled={busy} onClick={() => answer(c)}>
                {c}
              </button>
            ))}
          </div>
          <button type="button" className="text-xs text-white/40 underline hover:text-white/70" onClick={() => setAnswered(true)}>
            Not now
          </button>
        </div>
      )}
    </div>
  );
}
