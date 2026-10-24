import { requireUser } from "@/lib/serverAuth";
import { FetchBlocked, fetchPublicText } from "@/lib/safeFetch";
import { analyzeHtml, buildBrief } from "@/lib/siteBrief";

export const runtime = "nodejs";

/**
 * Reads ONE public web page and answers with a short text brief about its layout and look
 * (see lib/siteBrief.ts). Used when the user pastes a reference link in the chat.
 * It never returns the page's images or full text, only structure, colours and fonts.
 */
const hits = new Map<string, number[]>();
const MAX_PER_HOUR = 20;

function limited(key: string): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= MAX_PER_HOUR) {
    hits.set(key, list);
    return true;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 500) hits.clear();
  return false;
}

export async function POST(req: Request) {
  const denied = await requireUser(req);
  if (denied) return denied;

  const who = (req.headers.get("authorization") ?? "").slice(-24) || req.headers.get("x-forwarded-for") || "local";
  if (limited(who)) return Response.json({ ok: false, error: "Too many website reads this hour. Try again later." });

  let url = "";
  try {
    const body = (await req.json()) as { url?: unknown };
    url = typeof body.url === "string" ? body.url.slice(0, 2000) : "";
  } catch {
    return Response.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  try {
    const page = await fetchPublicText(url, 600_000);
    if (!/html|xml/i.test(page.type) && !/<html|<!doctype/i.test(page.body.slice(0, 500))) {
      return Response.json({ ok: false, error: "That link is not a web page." });
    }
    // Up to two stylesheets, for colours and fonts.
    const base = new URL(page.url);
    const links = [...page.body.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)]
      .map((m) => m[0].match(/href=["']([^"']+)["']/i)?.[1])
      .filter((h): h is string => !!h && !/fonts\.googleapis/i.test(h))
      .slice(0, 2);
    let css = "";
    for (const href of links) {
      try {
        const sheet = await fetchPublicText(new URL(href, base).toString(), 250_000, "text/css,*/*");
        css += "\n" + sheet.body;
      } catch {
        // a missing stylesheet is fine
      }
    }
    const info = analyzeHtml(page.body, base.hostname.replace(/^www\./, ""), css);
    return Response.json({ ok: true, brief: buildBrief(info), host: info.host, jsHeavy: info.jsHeavy });
  } catch (err) {
    if (err instanceof FetchBlocked) return Response.json({ ok: false, error: err.message });
    return Response.json({ ok: false, error: "Could not read that website (it may be down or block readers)." });
  }
}
