/**
 * Design styles the user can pick above the chat box. The chosen style is
 * sent with the request and added to the prompt (see buildPrompt.ts).
 * "auto" = no extra style, the AI decides.
 */
export type DesignStyle = { id: string; name: string; emoji: string; prompt: string };

export const STYLES: DesignStyle[] = [
  { id: "auto", name: "Auto", emoji: "✨", prompt: "" },
  {
    id: "minimal",
    name: "Minimal light",
    emoji: "⬜",
    prompt:
      "Minimal light style: white and slate-50 backgrounds, one accent colour (indigo-600), lots of white space, thin borders (border-slate-200), rounded-xl, no heavy shadows, large clean headings, small muted body text.",
  },
  {
    id: "darkneon",
    name: "Dark neon",
    emoji: "🌌",
    prompt:
      "Dark neon style: near-black background (bg-slate-950), gradient accents (from-fuchsia-500 via-purple-500 to-cyan-400), glowing borders (border-white/10, shadow-lg shadow-purple-500/20), gradient text on the main heading (bg-clip-text text-transparent), glass cards (bg-white/5 backdrop-blur).",
  },
  {
    id: "warm",
    name: "Warm and soft",
    emoji: "🧡",
    prompt:
      "Warm and soft style: cream background (bg-amber-50 / bg-stone-50), terracotta and amber accents (orange-500, amber-600), serif headings (font-serif), very rounded corners (rounded-3xl), soft shadows, friendly wording.",
  },
  {
    id: "bold",
    name: "Bold and playful",
    emoji: "🎉",
    prompt:
      "Bold and playful style: saturated colours (yellow-300, pink-500, blue-600 blocks), very large black headings (text-6xl font-black), thick borders (border-4 border-black), hard offset shadows (shadow-[6px_6px_0_0_#000]), sticker-like badges, emoji accents.",
  },
  {
    id: "cinematic",
    name: "Cinematic dark",
    emoji: "🎬",
    prompt:
      "Cinematic dark style: near-black ink canvas (bg-neutral-950) with ONE electric accent (cyan-400). Full-screen hero with a big background photo (image:KEYWORDS, absolute inset-0 object-cover) under a dark gradient overlay (bg-gradient-to-b from-black/60 via-black/30 to-neutral-950). Huge display headings in a refined serif (style={{fontFamily:\"'Instrument Serif', serif\"}}, text-6xl md:text-8xl, tracking-tight, leading-[0.95]). Small uppercase mono labels for nav links and eyebrows (style={{fontFamily:\"'JetBrains Mono', monospace\"}}, text-xs tracking-[0.25em] uppercase, text-white/70). Body text in Inter, text-white/70. CTA as an underlined text link with an arrow (border-b-2 border-cyan-400 text-cyan-400) plus a ghost text link. Portfolio grid of large photos with hover zoom, thin white/10 dividers, lots of space.",
  },
  {
    id: "corporate",
    name: "Clean corporate",
    emoji: "🏢",
    prompt:
      "Clean corporate style: deep navy and blue (slate-900, blue-700), white sections alternating with slate-50, trust-building sections (logos row, numbers, testimonials), sans-serif, restrained shadows, precise alignment on a 12 column grid (max-w-6xl).",
  },
];

export function getStyle(id: unknown): DesignStyle | undefined {
  return typeof id === "string" ? STYLES.find((s) => s.id === id) : undefined;
}
