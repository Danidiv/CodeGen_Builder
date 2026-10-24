import { lookup } from "dns/promises";
import { isIP } from "net";

/** True for addresses that must never be fetched from the server (private, loopback, link-local...). */
export function isPrivateIp(ip: string): boolean {
  let a = ip.toLowerCase();
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) a = mapped[1];
  if (isIP(a) === 4) {
    const [p, q] = a.split(".").map(Number);
    return (
      p === 0 || p === 10 || p === 127 || (p === 169 && q === 254) || (p === 172 && q >= 16 && q <= 31) ||
      (p === 192 && q === 168) || (p === 100 && q >= 64 && q <= 127) || p >= 224
    );
  }
  if (isIP(a) === 6) {
    return a === "::1" || a === "::" || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe8") || a.startsWith("fe9") || a.startsWith("fea") || a.startsWith("feb");
  }
  return true;
}

export class FetchBlocked extends Error {}

/** Throws FetchBlocked unless the URL is a public http(s) address on the normal ports. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new FetchBlocked("That is not a valid link.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new FetchBlocked("Only http and https links work.");
  if (u.username || u.password) throw new FetchBlocked("Links with a login inside are not allowed.");
  if (u.port && u.port !== "80" && u.port !== "443") throw new FetchBlocked("This link uses an unusual port.");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new FetchBlocked("This address is not public.");
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0) throw new FetchBlocked("Could not find that website.");
  if (addrs.some((x) => isPrivateIp(x.address))) throw new FetchBlocked("This address is not public.");
  return u;
}

/**
 * GET with timeout, size limit and manual redirects (every hop is checked again).
 * Returns the body as text (truncated to maxBytes).
 */
export async function fetchPublicText(raw: string, maxBytes: number, accept = "text/html,*/*"): Promise<{ url: string; type: string; body: string }> {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    const u = await assertPublicUrl(url);
    const res = await fetch(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NexaAI-Reader/1.0)", Accept: accept },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location") as string, u).toString();
      continue;
    }
    if (!res.ok) throw new FetchBlocked(`The website answered with error ${res.status}. It may block automatic readers.`);
    const type = res.headers.get("content-type") ?? "";
    const reader = res.body?.getReader();
    if (!reader) return { url: u.toString(), type, body: "" };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    const all = new Uint8Array(Math.min(size, maxBytes));
    let off = 0;
    for (const c of chunks) {
      const part = c.subarray(0, Math.max(0, all.length - off));
      all.set(part, off);
      off += part.length;
    }
    return { url: u.toString(), type, body: new TextDecoder("utf-8", { fatal: false }).decode(all) };
  }
  throw new FetchBlocked("Too many redirects.");
}
