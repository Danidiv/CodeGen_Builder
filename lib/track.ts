import { supabase } from "./supabase";

/**
 * Usage counting for the admin dashboard. It stores only WHAT happened (a kind and a few
 * yes/no flags), never the text the person wrote. Failures are ignored on purpose:
 * tracking must never get in the way of the app. Local mode (no Supabase) records nothing.
 */
export type EventKind = "build" | "build_fail" | "publish" | "unpublish" | "download" | "login" | "feedback";

export function track(kind: EventKind, meta: Record<string, string | boolean | number> = {}): void {
  if (!supabase) return;
  try {
    void Promise.resolve(supabase.rpc("track_event", { p_kind: kind, p_meta: meta })).then(
      () => {},
      () => {}
    );
  } catch {
    /* ignore */
  }
}

/** Kinds of site people ask for. The first matching word wins; no match = "other". */
const TYPES: [string, RegExp][] = [
  ["todo", /\bto-?do\b|\btasks?\b|checklist|planner/i],
  ["game", /\bgame\b|quiz|puzzle|tic-?tac|snake|memory card/i],
  ["ecommerce", /e-?commerce|online (store|shop)|\bstore\b|\bshop\b|\bcart\b|\bproducts?\b/i],
  ["portfolio", /portfolio|\bresume\b|\bcv\b|personal (site|website)/i],
  ["blog", /\bblog|\barticles?\b|\bnews\b/i],
  ["dashboard", /dashboard|admin panel|analytics|\bcrm\b|tracker/i],
  ["restaurant", /restaurant|cafe|café|menu|food|bakery/i],
  ["landing", /landing|startup|\bsaas\b|marketing|agency|company|business|\bapp promo/i],
  ["calculator", /calculator|converter|\bcalc\b|timer|stopwatch/i],
  ["education", /e-?learning|course|school|education|lms|tutor/i],
  ["booking", /booking|appointment|reservation|salon|clinic|hotel/i],
  ["chat", /\bchat\b|messag(e|ing)|social/i],
];

export function classifySite(prompt: string): string {
  const t = prompt.replace(/\[\[SITE_BRIEF\]\][\s\S]*$/, "").slice(0, 1500);
  for (const [name, re] of TYPES) if (re.test(t)) return name;
  return "other";
}

/** Yes/no flags about a finished build. Only the first build of a project gets a site type. */
export function buildMeta(opts: { files: Record<string, string>; prompt: string; first: boolean; reference: boolean; fix: boolean }) {
  const code = Object.values(opts.files).join("\n");
  return {
    type: opts.first ? classifySite(opts.prompt) : "edit",
    forms: /\bsubmitForm\s*\(/.test(code),
    data: /\bdb\s*\(\s*["'`]/.test(code),
    auth: /\bauth\s*\.\s*(signIn|signUp|me)\b/.test(code),
    ref: opts.reference,
    fix: opts.fix,
  };
}
