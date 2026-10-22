import { Briefcase, Building2, CheckSquare, GraduationCap, LayoutDashboard, LayoutTemplate, Palette, PenLine, Rocket, ShoppingCart } from "lucide-react";

/** lucide icon per ready-made template (replaces the emoji). */
export const TEMPLATE_ICONS: Record<string, typeof Rocket> = {
  ecommerce: ShoppingCart,
  business: Building2,
  blog: PenLine,
  portfolio: Palette,
  elearning: GraduationCap,
  saas: Rocket,
};

/** Cards on the empty screen: clicking one fills the prompt box. */
export const START_CARDS: { id: string; name: string; Icon: typeof Rocket; prompt: string }[] = [
  { id: "landing", name: "Landing page", Icon: LayoutTemplate, prompt: "A modern landing page for a coffee shop with a hero section, menu highlights, customer reviews and a contact form" },
  { id: "dashboard", name: "Dashboard", Icon: LayoutDashboard, prompt: "An analytics dashboard with stat cards, a sales chart, a recent orders table and a dark theme" },
  { id: "portfolio", name: "Portfolio", Icon: Briefcase, prompt: "A personal portfolio website for a web developer with an about section, skills, projects grid and contact links" },
  { id: "todo", name: "Todo app", Icon: CheckSquare, prompt: "A todo app with categories, due dates, filters (all, active, done) and a dark theme" },
  { id: "blog", name: "Blog", Icon: PenLine, prompt: "A clean blog with a featured post, article cards, categories and a newsletter signup" },
  { id: "store", name: "Online store", Icon: ShoppingCart, prompt: "An online store with a product grid, search, product ratings, favourites and a shopping cart" },
];
