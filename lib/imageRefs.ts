/**
 * Photo placeholders. The AI cannot know photo URLs, so it writes
 *   src="image:espresso coffee cup cafe"          (wide photo)
 *   src="image:smiling woman portrait|portrait"   (tall) or |square
 * and the app replaces every placeholder with a real photo found for those
 * keywords (Pexels, see app/api/images/route.ts). If no photo can be found, a
 * neutral placeholder photo is used, so nothing is ever broken.
 */
export type Orientation = "landscape" | "portrait" | "square";
type Files = Record<string, string>;

/** matches "image:keywords" or "image:keywords|portrait" inside quotes or backticks (no ${ } inside) */
const REF = /(["'`])image:([^"'`\s|$][^"'`\n|$]{1,79}?)(?:\|(landscape|portrait|square))?\1/g;

export type Ref = { query: string; orientation: Orientation };

const keyOf = (r: Ref) => `${r.orientation}|${r.query}`;

export function cleanQuery(q: string): string {
  return q.replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 80);
}

function refsIn(code: string): Ref[] {
  const out: Ref[] = [];
  for (const m of code.matchAll(REF)) {
    const query = cleanQuery(m[2]);
    if (query) out.push({ query, orientation: (m[3] as Orientation | undefined) ?? "landscape" });
  }
  return out;
}

/** How many photos each distinct (orientation, keywords) needs. */
export function collectRefs(files: Files): Map<string, { ref: Ref; count: number }> {
  const map = new Map<string, { ref: Ref; count: number }>();
  for (const code of Object.values(files)) {
    for (const ref of refsIn(code)) {
      const k = keyOf(ref);
      const entry = map.get(k);
      if (entry) entry.count++;
      else map.set(k, { ref, count: 1 });
    }
  }
  return map;
}

export function hasImageRefs(files: Files): boolean {
  return Object.values(files).some((c) => c.includes("image:") && refsIn(c).length > 0);
}

/** Neutral photo that always works (used when no real photo was found). */
export function fallbackUrl(query: string, index: number, orientation: Orientation): string {
  const size = orientation === "portrait" ? "600/800" : orientation === "square" ? "600/600" : "800/600";
  const seed = encodeURIComponent(query.replace(/\s+/g, "-") + "-" + index);
  return `https://picsum.photos/seed/${seed}/${size}`;
}

/** Looks up photos: returns up to `count` URLs for the keywords (empty list = none found). */
export type Fetcher = (query: string, orientation: Orientation, count: number) => Promise<string[]>;

export async function resolveImages(files: Files, fetcher: Fetcher): Promise<{ files: Files; realPhotos: number; fallbacks: number }> {
  const needs = collectRefs(files);
  if (needs.size === 0) return { files, realPhotos: 0, fallbacks: 0 };

  const found = new Map<string, string[]>();
  await Promise.all(
    [...needs.entries()].map(async ([k, { ref, count }]) => {
      try {
        found.set(k, (await fetcher(ref.query, ref.orientation, Math.min(count, 8))).filter(Boolean));
      } catch {
        found.set(k, []);
      }
    })
  );

  const used = new Map<string, number>();
  let realPhotos = 0;
  let fallbacks = 0;
  const out: Files = {};
  for (const [path, code] of Object.entries(files)) {
    out[path] = code.replace(REF, (whole, quote: string, raw: string, o: string | undefined) => {
      const query = cleanQuery(raw);
      if (!query) return whole;
      const orientation = (o as Orientation | undefined) ?? "landscape";
      const k = keyOf({ query, orientation });
      const n = used.get(k) ?? 0;
      used.set(k, n + 1);
      const list = found.get(k) ?? [];
      if (list.length > 0) {
        realPhotos++;
        return quote + list[n % list.length] + quote;
      }
      fallbacks++;
      return quote + fallbackUrl(query, n, orientation) + quote;
    });
  }
  return { files: out, realPhotos, fallbacks };
}
