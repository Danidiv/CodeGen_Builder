/**
 * A tiny "picture" of a project for the project cards: the first photo used in
 * the code (Pexels / Unsplash / picsum) and the main colours of the design.
 * Computed from the files when a project is saved; nothing is fetched here.
 */
export type Thumb = { img?: string; colors: string[] };

const PALETTE: Record<string, string> = {
  red: "#ef4444", orange: "#f97316", amber: "#f59e0b", yellow: "#eab308", lime: "#84cc16",
  green: "#22c55e", emerald: "#10b981", teal: "#14b8a6", cyan: "#06b6d4", sky: "#0ea5e9",
  blue: "#3b82f6", indigo: "#6366f1", violet: "#8b5cf6", purple: "#a855f7", fuchsia: "#d946ef",
  pink: "#ec4899", rose: "#f43f5e",
};
const NEUTRAL: Record<string, string> = {
  slate: "#334155", gray: "#374151", zinc: "#3f3f46", neutral: "#404040", stone: "#44403c",
};

const IMG_RE = /https:\/\/(?:images\.pexels\.com|images\.unsplash\.com|plus\.unsplash\.com|picsum\.photos)[^"'`\s)<>\\]*/;
const COLOR_RE = /\b(?:from|via|to|bg|text|border)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:[3-8]00)\b/g;
const NEUTRAL_RE = /\bbg-(slate|gray|zinc|neutral|stone)-(?:800|900|950)\b/;

export function computeThumb(files: Record<string, string>): Thumb {
  const code = files["/App.tsx"] ?? Object.values(files).join("\n");
  const img = code.match(IMG_RE)?.[0];

  const count: Record<string, number> = {};
  for (const m of code.matchAll(COLOR_RE)) count[m[1]] = (count[m[1]] ?? 0) + 1;
  const colors = Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => PALETTE[name]);
  if (colors.length === 0) {
    const n = code.match(NEUTRAL_RE)?.[1];
    colors.push(n ? NEUTRAL[n] : "#334155", "#0f172a");
  } else if (colors.length === 1) {
    colors.push("#0f172a");
  }
  return img ? { img, colors } : { colors };
}

/** CSS background (+ image URL) for a card; safe for missing or odd data. */
export function projectCover(thumb: Thumb | null | undefined): { img?: string; background: string } {
  const colors =
    thumb && Array.isArray(thumb.colors) && thumb.colors.length > 0
      ? thumb.colors.filter((c) => typeof c === "string" && /^#[0-9a-f]{3,8}$/i.test(c)).slice(0, 2)
      : [];
  const [a, b] = colors.length > 0 ? [colors[0], colors[1] ?? "#0f172a"] : ["#1e293b", "#0f172a"];
  const img = thumb && typeof thumb.img === "string" && thumb.img.startsWith("https://") ? thumb.img : undefined;
  return { img, background: `linear-gradient(135deg, ${a}, ${b})` };
}
