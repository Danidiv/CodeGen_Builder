import type { Config } from "tailwindcss";

// Design tokens: one accent (indigo), subtle borders, 8px controls, 12px cards.
// Spacing in the UI sticks to 4 / 8 / 12 / 16 / 24 px (Tailwind 1, 2, 3, 4, 6).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "#0b0d12",
        panel: "#11141b",
        raised: "#171b24",
        line: "rgba(255,255,255,0.08)",
        accent: { DEFAULT: "#4f46e5", hover: "#6366f1", active: "#4338ca" },
      },
      borderRadius: { btn: "8px", card: "12px" },
      fontFamily: { sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"] },
      keyframes: {
        shimmer: { "0%": { backgroundPosition: "200% 0" }, "100%": { backgroundPosition: "-200% 0" } },
        slideIn: { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        shimmer: "shimmer 2s linear infinite",
        slideIn: "slideIn 180ms ease-out",
        fadeIn: "fadeIn 150ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
