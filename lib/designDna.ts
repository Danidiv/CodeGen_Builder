/**
 * "Design DNA": a different look for every NEW website, so the AI does not fall back to one fixed design.
 * A palette, a font pairing, a hero layout, a few section ideas and a few motion ideas are drawn from
 * hand-made pools. The block is added to the request of a first build only (see buildPrompt.ts); the
 * motion recipes themselves (the code patterns) live in the system prompt (prompts.ts).
 */

type Palette = { name: string; look: string };
type Fonts = { name: string; look: string };

export const PALETTES: Palette[] = [
  { name: "Ink and cyan", look: "page bg-neutral-950, text white and white/70, ONE accent cyan-400, thin white/10 dividers" },
  { name: "Ivory and terracotta", look: "page bg-[#faf7f2], text stone-900, accent orange-600, soft stone-200 borders" },
  { name: "Forest and sand", look: "page bg-emerald-950, text amber-50, accent amber-300, subtle emerald-900 panels" },
  { name: "Midnight violet", look: "page bg-slate-950, text white, accent violet-400 with a faint fuchsia glow, glass panels bg-white/5" },
  { name: "Paper and cobalt", look: "page bg-white, text slate-900, accent blue-700, sections alternating with slate-50" },
  { name: "Charcoal and lime", look: "page bg-zinc-900, text zinc-100, accent lime-300, sharp corners, high contrast" },
  { name: "Rose quartz", look: "page bg-rose-50, text stone-800, accent rose-600, soft pink-100 cards, rounded-3xl" },
  { name: "Deep ocean", look: "page bg-sky-950, text sky-50, accent sky-300, gradient from-sky-950 to-slate-950" },
  { name: "Editorial sand", look: "page bg-amber-50, text stone-900, accent red-700, black hairline rules, newspaper feel" },
  { name: "Neo brutalist", look: "page bg-white, text black, accent yellow-300 blocks, border-2 border-black, hard shadow-[4px_4px_0_0_#000]" },
];

export const FONT_PAIRS: Fonts[] = [
  { name: "Instrument Serif + Inter + JetBrains Mono", look: "serif display headings, Inter body, mono uppercase labels" },
  { name: "Playfair Display + Inter", look: "elegant high-contrast serif headings, clean sans body" },
  { name: "Fraunces + DM Sans", look: "soft characterful serif headings, friendly DM Sans body" },
  { name: "Space Grotesk + Inter", look: "technical grotesk headings, tight tracking, Inter body" },
  { name: "Syne + DM Sans", look: "wide bold Syne headings (font-extrabold), DM Sans body" },
  { name: "Manrope only", look: "Manrope for everything: font-extrabold headings, regular body" },
];

export const HEROES = [
  "full-screen background photo under a dark gradient overlay, huge heading bottom-left, small eyebrow label above it",
  "split hero: heading, text and buttons on the left, one tall rounded portrait photo on the right",
  "typographic hero: no photo at the top, giant heading (text-7xl to text-9xl), a scrolling marquee strip right under it",
  "centered hero with three overlapping tilted photos below the heading",
  "bento hero: heading in a big tile, next to it a photo tile, a stat tile and a button tile",
  "asymmetric collage: heading on the left, a 2 by 2 photo collage of different sizes on the right",
];

export const SECTIONS = [
  "bento grid of 5 to 6 feature tiles with different sizes",
  "numbered services list (01, 02, 03) with a big title per row and an arrow that moves on hover",
  "horizontal scroll gallery that moves sideways while the page scrolls down",
  "sticky storytelling block: text changes on one side while a big photo stays pinned",
  "masonry photo gallery with hover zoom",
  "alternating image and text rows (image left, then right)",
  "big numbers row (counters that count up when visible)",
  "one large testimonial quote with the person's photo, instead of many small cards",
  "FAQ accordion that really opens and closes",
  "logo or keyword marquee that scrolls by itself",
  "pricing in 3 columns with the middle plan highlighted",
  "process in 4 steps along a line",
];

export const MOTIONS = [
  "reveal: sections fade and slide up when they come into view",
  "stagger: cards appear one after another",
  "parallax: photos move slower than the page",
  "hero zoom: the hero photo slowly scales up while scrolling",
  "marquee: an endlessly scrolling text or logo strip",
  "tilt: cards tilt in 3D under the mouse",
  "carousel3d: a 360 degree rotating 3D ring of cards (CSS 3D)",
  "count-up: numbers count up",
  "progress: a thin scroll progress bar at the top",
  "clip reveal: photos are uncovered with a clip-path wipe",
];

/** Takes `n` different items; `rand` returns a number in [0, 1). */
function take<T>(pool: readonly T[], n: number, rand: () => number): T[] {
  const left = [...pool];
  const out: T[] = [];
  while (out.length < n && left.length > 0) {
    out.push(left.splice(Math.floor(rand() * left.length), 1)[0]);
  }
  return out;
}

export function pickDna(rand: () => number = Math.random): string {
  const [palette] = take(PALETTES, 1, rand);
  const [fonts] = take(FONT_PAIRS, 1, rand);
  const [hero] = take(HEROES, 1, rand);
  const sections = take(SECTIONS, 3, rand);
  const motions = take(MOTIONS, 3, rand);
  return (
    "DESIGN DNA (drawn for this new build so that every site looks different; follow it unless the request or an attached reference says otherwise):\n" +
    `- Palette "${palette.name}": ${palette.look}.\n` +
    `- Fonts "${fonts.name}": ${fonts.look}. Apply with style={{ fontFamily: "'Family Name', serif" }} (these families are already loaded).\n` +
    `- Hero: ${hero}.\n` +
    `- Include these section ideas (add the usual nav, footer and call-to-action too): ${sections.join("; ")}.\n` +
    `- Motion (use the MOTION RECIPES from the rules): ${motions.join("; ")}.\n` +
    "If this is an app or tool (to-do, calculator, dashboard, game) and not a website, use only the palette and fonts and keep the layout functional, without hero, marquee or big motion. " +
    "If the palette clearly clashes with the topic (for example black for a children's bakery), adapt the colours but keep the hero, sections and motion ideas.\n"
  );
}
