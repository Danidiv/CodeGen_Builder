"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthForm() {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "forgot") {
        // The link in the email opens this site again; the page then asks for the new password.
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (error) throw error;
        setInfo("If this email has an account, we sent a link to choose a new password. Check your inbox and spam folder.");
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        // On success the page picks up the new session by itself.
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) {
          setInfo("Account created. Open the confirmation email we sent you, click the link, then sign in here.");
          setMode("signin");
        }
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : "";
      setError(/rate limit|too many/i.test(m) ? "Too many emails were sent. Please wait a few minutes and try again." : m || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const input = "input";

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 card p-6"
      >
        <div>
          <h1 className="text-lg font-semibold">NEXA AI</h1>
          <p className="mt-1 text-sm text-white/60">
            {mode === "signin" ? "Sign in to open your projects." : mode === "signup" ? "Create an account to save your projects." : "Enter your email and we send you a link to choose a new password."}
          </p>
        </div>

        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
        {mode !== "forgot" && (
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder="Password (at least 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
        )}
        {mode === "signin" && (
          <button
            type="button"
            onClick={() => {
              setMode("forgot");
              setError(null);
              setInfo(null);
            }}
            className="-mt-2 text-xs text-white/50 underline hover:text-white/80"
          >
            Forgot password?
          </button>
        )}

        {error && <p className="rounded-btn bg-red-950/70 px-3 py-2 text-sm text-red-200">{error}</p>}
        {info && <p className="rounded-btn bg-emerald-950/70 px-3 py-2 text-sm text-emerald-200">{info}</p>}

        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary w-full"
        >
          {busy ? "Please wait..." : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setPassword("");
            setError(null);
            setInfo(null);
          }}
          className="btn btn-ghost w-full text-xs text-white/60"
        >
          {mode === "signin" ? "No account yet? Create one" : mode === "signup" ? "Already have an account? Sign in" : "Back to sign in"}
        </button>
      </form>
    </main>
  );
}
