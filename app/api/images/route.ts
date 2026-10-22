import { requireUser } from "@/lib/serverAuth";
import { cleanQuery, type Orientation } from "@/lib/imageRefs";
import { providerOrder, searchPexels, searchUnsplash, type Found } from "@/lib/imageProviders";

export const runtime = "nodejs";

/**
 * Finds photos for keywords. Providers: Pexels (PEXELS_API_KEY) and Unsplash (UNSPLASH_ACCESS_KEY),
 * tried in the order of IMAGE_PROVIDERS (default "pexels,unsplash"). Without any key the answer
 * is an empty list and the app uses neutral placeholder photos.
 * Answers are cached in memory (Pexels allows 200 requests per hour, Unsplash demo mode only 50).
 */
type Entry = { at: number; found: Found; provider: string };
const cache = new Map<string, Entry>();
const TTL = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;

export async function GET(req: Request) {
  const denied = await requireUser(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const query = cleanQuery(url.searchParams.get("q") ?? "");
  const o = url.searchParams.get("o");
  const orientation: Orientation = o === "portrait" || o === "square" ? o : "landscape";
  const count = Math.min(Math.max(Number(url.searchParams.get("count")) || 1, 1), 8);
  if (!query) return Response.json({ urls: [] });

  const pexelsKey = process.env.PEXELS_API_KEY;
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  const order = providerOrder(process.env.IMAGE_PROVIDERS, { pexels: !!pexelsKey, unsplash: !!unsplashKey });
  if (order.length === 0) return Response.json({ urls: [], provider: "none" });

  const ck = `${orientation}|${query}`;
  let entry = cache.get(ck);
  if (!entry || Date.now() - entry.at >= TTL) {
    entry = undefined;
    for (const provider of order) {
      try {
        const found =
          provider === "pexels"
            ? await searchPexels(pexelsKey as string, query, orientation)
            : await searchUnsplash(unsplashKey as string, query, orientation);
        if (found.urls.length > 0) {
          entry = { at: Date.now(), found, provider };
          break;
        }
      } catch {
        // try the next provider
      }
    }
    if (!entry) return Response.json({ urls: [], provider: order[0], error: "No photos found" });
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(ck, entry);
  }

  const urls = entry.found.urls.slice(0, count);

  // Unsplash rule: report every use of a photo to its download endpoint.
  if (entry.provider === "unsplash" && unsplashKey && !/^(0|false|no)$/i.test(process.env.UNSPLASH_TRACK_DOWNLOADS ?? "")) {
    const targets = entry.found.track.slice(0, count).filter(Boolean);
    await Promise.race([
      Promise.allSettled(
        targets.map((t) => fetch(t, { headers: { Authorization: `Client-ID ${unsplashKey}`, "Accept-Version": "v1" } }))
      ),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }

  return Response.json({ urls, provider: entry.provider });
}
