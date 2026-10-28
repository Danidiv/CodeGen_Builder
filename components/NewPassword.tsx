"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

/** Shown after the person clicked the link in the "reset password" email. */
export default function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    if (password.length < 6) return setError("The password needs at least 6 characters.");
    if (password !== again) return setError("The two passwords are not the same.");
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      onDone(); // the person stays signed in
    } catch (err) {
      const m = err instanceof Error ? err.message : "";
      setError(/same as the old|different from the old/i.test(m) ? "Choose a password you did not use before." : m || "Could not change the password. Please try again.");
      setBusy(false);
    }
  }

  async function cancel() {
    try {
      await supabase?.auth.signOut();
    } catch {
      /* ignore */
    }
    onDone();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">Choose a new password</h1>
          <p className="mt-1 text-sm text-white/60">After this you are signed in.</p>
        </div>
        <input id="new-password" type="password" required minLength={6} autoComplete="new-password" autoFocus placeholder="New password (at least 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
        <input id="new-password-again" type="password" required minLength={6} autoComplete="new-password" placeholder="Type it again" value={again} onChange={(e) => setAgain(e.target.value)} className="input" />
        {error && <p className="rounded-btn bg-red-950/70 px-3 py-2 text-sm text-red-200">{error}</p>}
        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? "Please wait..." : "Save password"}
        </button>
        <button type="button" onClick={cancel} disabled={busy} className="btn btn-ghost w-full text-xs text-white/60">
          Cancel
        </button>
      </form>
    </main>
  );
}
