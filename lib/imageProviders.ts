/**
 * Photo search providers. Only providers whose rules allow using the returned
 * URLs inside a site are here:
 *  - Pexels: URLs may be used as they are; a visible link to Pexels is required.
 *  - Unsplash: URLs must be used directly (hotlinked); credit to photographer and
 *    Unsplash is required; every use must be reported to the download endpoint.
 * Pixabay is NOT here on purpose: its rules forbid permanent hotlinking of its URLs
 * (images must be downloaded to your own server first).
 */
import type { Orientation } from "./imageRefs";

export type ProviderName = "pexels" | "unsplash";
export type Found = {
  urls: string[];
  /** Unsplash only: the "download_location" URL of each photo, same order as urls */
  track: string[];
};
type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const EMPTY: Found = { urls: [], track: [] };

export async function searchPexels(key: string, query: string, orientation: Orientation, f: FetchFn = fetch): Promise<Found> {
  const res = await f(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=15`,
    { headers: { Authorization: key }, cache: "no-store" }
  );
  if (!res.ok) return EMPTY;
  const data = (await res.json()) as { photos?: { src?: Record<string, string> }[] };
  const urls: string[] = [];
  for (const p of data.photos ?? []) {
    const s = p.src ?? {};
    const u = (orientation === "portrait" ? s.portrait : orientation === "landscape" ? s.landscape : s.large) ?? s.large;
    if (u) urls.push(u);
  }
  return { urls, track: [] };
}

export async function searchUnsplash(key: string, query: string, orientation: Orientation, f: FetchFn = fetch): Promise<Found> {
  const o = orientation === "square" ? "squarish" : orientation;
  const res = await f(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=${o}&per_page=15&content_filter=high`,
    { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" }, cache: "no-store" }
  );
  if (!res.ok) return EMPTY;
  const data = (await res.json()) as {
    results?: { urls?: { regular?: string }; user?: { username?: string }; links?: { download_location?: string } }[];
  };
  const urls: string[] = [];
  const track: string[] = [];
  for (const p of data.results ?? []) {
    const base = p.urls?.regular;
    if (!base) continue;
    // The photographer's username travels in the URL (the image server ignores it);
    // /index.tsx reads it to show the required credit.
    const who = (p.user?.username ?? "").replace(/[^\w.-]/g, "");
    urls.push(who ? base + (base.includes("?") ? "&" : "?") + "credit=" + encodeURIComponent(who) : base);
    track.push(p.links?.download_location ?? "");
  }
  return { urls, track };
}

/** Which providers to try, in order: IMAGE_PROVIDERS (e.g. "unsplash,pexels") filtered by the keys that exist. */
export function providerOrder(raw: string | undefined, available: Record<ProviderName, boolean>): ProviderName[] {
  const wanted = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ProviderName => s === "pexels" || s === "unsplash");
  const order: ProviderName[] = wanted.length > 0 ? wanted : ["pexels", "unsplash"];
  return order.filter((p, i) => order.indexOf(p) === i && available[p]);
}
