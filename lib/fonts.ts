/**
 * Fonts the generated sites may use. One place, used by the preview, the live page and the .zip.
 * Keep FONT_NAMES and the URL in sync: the AI is told it may use exactly these families.
 */
export const FONT_NAMES = [
  "Instrument Serif",
  "Inter",
  "JetBrains Mono",
  "Playfair Display",
  "Fraunces",
  "DM Sans",
  "Space Grotesk",
  "Syne",
  "Manrope",
] as const;

export const FONTS_URL =
  "https://fonts.googleapis.com/css2" +
  "?family=Instrument+Serif:ital@0;1" +
  "&family=Inter:wght@400;500;600;700" +
  "&family=JetBrains+Mono:wght@400;500" +
  "&family=Playfair+Display:ital,wght@0,500;0,700;1,500" +
  "&family=Fraunces:ital,wght@0,400;0,600;1,400" +
  "&family=DM+Sans:wght@400;500;700" +
  "&family=Space+Grotesk:wght@400;500;700" +
  "&family=Syne:wght@600;700;800" +
  "&family=Manrope:wght@400;600;800" +
  "&display=swap";

export const EXTERNAL_RESOURCES = ["https://cdn.tailwindcss.com", FONTS_URL];
