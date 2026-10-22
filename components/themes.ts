/** Background themes for the start screen (UI only). Picked in the account menu. */
export const THEMES: { id: string; name: string; bg: string; dot: string }[] = [
  {
    id: "aurora",
    name: "Aurora",
    bg: "radial-gradient(ellipse 70% 50% at 15% 0%, rgba(99,102,241,0.38), transparent 60%), radial-gradient(ellipse 60% 45% at 85% 5%, rgba(236,72,153,0.24), transparent 60%), radial-gradient(ellipse 70% 40% at 50% 100%, rgba(34,211,238,0.18), transparent 60%), #0b0d12",
    dot: "linear-gradient(135deg,#6366f1,#ec4899)",
  },
  {
    id: "midnight",
    name: "Midnight",
    bg: "radial-gradient(ellipse 80% 55% at 50% -10%, rgba(59,130,246,0.35), transparent 65%), radial-gradient(ellipse 60% 40% at 50% 110%, rgba(30,64,175,0.25), transparent 60%), #070a12",
    dot: "linear-gradient(135deg,#1d4ed8,#0f172a)",
  },
  {
    id: "sunset",
    name: "Sunset",
    bg: "radial-gradient(ellipse 70% 50% at 0% 0%, rgba(249,115,22,0.30), transparent 60%), radial-gradient(ellipse 60% 50% at 100% 15%, rgba(236,72,153,0.26), transparent 60%), radial-gradient(ellipse 70% 40% at 50% 110%, rgba(168,85,247,0.2), transparent 60%), #0e0a10",
    dot: "linear-gradient(135deg,#f97316,#ec4899)",
  },
  {
    id: "forest",
    name: "Forest",
    bg: "radial-gradient(ellipse 70% 50% at 10% 0%, rgba(16,185,129,0.28), transparent 60%), radial-gradient(ellipse 60% 45% at 90% 100%, rgba(20,184,166,0.22), transparent 60%), #080d0c",
    dot: "linear-gradient(135deg,#10b981,#0f766e)",
  },
  {
    id: "grid",
    name: "Grid",
    bg: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(99,102,241,0.25), transparent 65%), linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px) 0 0 / 32px 32px, linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px) 0 0 / 32px 32px, #0b0d12",
    dot: "linear-gradient(135deg,#334155,#0f172a)",
  },
  { id: "plain", name: "Plain dark", bg: "#0b0d12", dot: "#0b0d12" },
];
export const THEME_KEY = "codegen-bg";

export function themeBg(id: string): string {
  return (THEMES.find((t) => t.id === id) ?? THEMES[0]).bg;
}
