/**
 * Ready-made starting points. Each one is a complete, working /App.tsx with
 * dark mode, so the AI only has to change it (texts, colours, sections)
 * instead of writing a whole site from nothing.
 * NOTE: the code inside the strings must not contain backticks or "${".
 */
export type Template = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  files: Record<string, string>;
};

const STORE = `import { useState } from "react";
import { ShoppingCart, Star, Moon, Sun, Search, Heart, Check } from "lucide-react";

const PRODUCTS = [
  { id: 1, name: "Classic Sneakers", price: 59, rating: 4.5, tag: "shoes" },
  { id: 2, name: "Leather Backpack", price: 89, rating: 4.8, tag: "bag" },
  { id: 3, name: "Minimal Watch", price: 129, rating: 4.7, tag: "watch" },
  { id: 4, name: "Wireless Headphones", price: 99, rating: 4.4, tag: "audio" },
  { id: 5, name: "Denim Jacket", price: 75, rating: 4.3, tag: "jacket" },
  { id: 6, name: "Sunglasses", price: 45, rating: 4.6, tag: "glasses" },
];

export default function App() {
  const [dark, setDark] = useState(false);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<number[]>([]);
  const [liked, setLiked] = useState<number[]>([]);
  const shown = PRODUCTS.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  const total = cart.reduce((sum, id) => sum + (PRODUCTS.find((p) => p.id === id)?.price ?? 0), 0);

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-900 dark:text-white">
        <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
          <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">ShopNest</span>
          <div className="relative ml-4 hidden flex-1 sm:block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full max-w-md rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <button onClick={() => setDark(!dark)} className="ml-auto rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <div className="relative rounded-full bg-indigo-600 p-2 text-white">
            <ShoppingCart className="h-5 w-5" />
            {cart.length > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 text-xs">{cart.length}</span>
            )}
          </div>
        </header>

        <section className="bg-gradient-to-br from-indigo-500 to-purple-600 px-6 py-16 text-center text-white">
          <h1 className="text-4xl font-extrabold sm:text-5xl">Summer Sale: up to 40% off</h1>
          <p className="mx-auto mt-3 max-w-xl text-indigo-100">Fresh styles, free delivery over $50 and 30 day returns.</p>
        </section>

        <main className="mx-auto max-w-6xl px-6 py-10">
          <h2 className="mb-6 text-2xl font-bold">Popular products</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="relative">
                  <img src={"https://picsum.photos/seed/" + p.tag + "/600/450"} alt={p.name} className="h-52 w-full object-cover" />
                  <button
                    onClick={() => setLiked(liked.includes(p.id) ? liked.filter((x) => x !== p.id) : [...liked, p.id])}
                    className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-rose-500"
                  >
                    <Heart className={"h-4 w-4 " + (liked.includes(p.id) ? "fill-rose-500" : "")} />
                  </button>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold">{p.name}</h3>
                  <div className="mt-1 flex items-center gap-1 text-sm text-amber-500">
                    <Star className="h-4 w-4 fill-amber-400" /> {p.rating}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-bold">{"$" + p.price}</span>
                    <button
                      onClick={() => setCart([...cart, p.id])}
                      className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
                    >
                      <Check className="h-4 w-4" /> Add to cart
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {shown.length === 0 && <p className="py-10 text-center text-slate-500">No products found.</p>}
          <div className="mt-10 rounded-2xl bg-slate-100 p-5 text-right dark:bg-slate-800">
            <span className="text-slate-500 dark:text-slate-400">Cart total: </span>
            <span className="text-xl font-bold">{"$" + total}</span>
          </div>
        </main>
        <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
          2025 ShopNest. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
`;

const CORPORATE = `import { useState } from "react";
import { Moon, Sun, Briefcase, Shield, Zap, Users, Phone, Mail, MapPin, ArrowRight } from "lucide-react";

const SERVICES = [
  { icon: Briefcase, title: "Consulting", text: "Clear strategy and practical advice for growing companies." },
  { icon: Shield, title: "Risk and Security", text: "Protect your business with proven processes and audits." },
  { icon: Zap, title: "Digital Transformation", text: "Modern tools that save time and cut costs." },
  { icon: Users, title: "Team Training", text: "Hands-on workshops that make your people better." },
];
const STATS = [
  { value: "15+", label: "Years" },
  { value: "400", label: "Clients" },
  { value: "98%", label: "Satisfaction" },
  { value: "25", label: "Experts" },
];
const TEAM = ["Sara Khan", "Ali Raza", "Maria Lopez"];

export default function App() {
  const [dark, setDark] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-white text-slate-800 dark:bg-slate-950 dark:text-slate-100">
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <span className="text-xl font-bold text-blue-700 dark:text-blue-400">Northwind Group</span>
          <nav className="hidden gap-6 text-sm sm:flex">
            <a href="#services">Services</a>
            <a href="#team">Team</a>
            <a href="#contact">Contact</a>
          </nav>
          <button onClick={() => setDark(!dark)} className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </header>

        <section className="relative">
          <img src="https://picsum.photos/seed/office/1600/700" alt="Our office" className="h-[420px] w-full object-cover" />
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/60 px-6 text-center text-white">
            <h1 className="text-4xl font-extrabold sm:text-5xl">We help businesses grow with confidence</h1>
            <p className="mt-3 max-w-xl text-slate-200">Trusted advisors for strategy, security and technology.</p>
            <a href="#contact" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-medium hover:bg-blue-500">
              Book a free call <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-6 bg-blue-700 px-6 py-10 text-center text-white sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="text-3xl font-bold">{s.value}</div>
              <div className="text-blue-100">{s.label}</div>
            </div>
          ))}
        </section>

        <section id="services" className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="mb-8 text-center text-3xl font-bold">Our services</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map((s) => (
              <div key={s.title} className="rounded-2xl border border-slate-200 p-6 dark:border-slate-800 dark:bg-slate-900">
                <s.icon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="team" className="bg-slate-50 px-6 py-16 dark:bg-slate-900">
          <h2 className="mb-8 text-center text-3xl font-bold">Meet the team</h2>
          <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-3">
            {TEAM.map((name) => (
              <div key={name} className="text-center">
                <img src={"https://picsum.photos/seed/" + name.split(" ")[0] + "/300/300"} alt={name} className="mx-auto h-32 w-32 rounded-full object-cover" />
                <p className="mt-3 font-semibold">{name}</p>
                <p className="text-sm text-slate-500">Senior partner</p>
              </div>
            ))}
          </div>
        </section>

        <section id="contact" className="mx-auto grid max-w-5xl gap-10 px-6 py-16 md:grid-cols-2">
          <div className="space-y-3 text-slate-600 dark:text-slate-300">
            <h2 className="text-3xl font-bold text-slate-800 dark:text-white">Contact us</h2>
            <p className="flex items-center gap-2"><Phone className="h-4 w-4" /> +1 555 010 2020</p>
            <p className="flex items-center gap-2"><Mail className="h-4 w-4" /> hello@northwind.example</p>
            <p className="flex items-center gap-2"><MapPin className="h-4 w-4" /> 12 Market Street, Karachi</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
            className="space-y-3"
          >
            <input required placeholder="Your name" className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" />
            <input required type="email" placeholder="Email" className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" />
            <textarea required rows={4} placeholder="How can we help?" className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" />
            <button className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-500">Send message</button>
            {sent && <p className="text-sm text-green-600">Thank you! We will reply soon.</p>}
          </form>
        </section>
        <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500 dark:border-slate-800">
          2025 Northwind Group
        </footer>
      </div>
    </div>
  );
}
`;

const BLOG = `import { useState } from "react";
import { Moon, Sun, Clock, ArrowRight, Mail } from "lucide-react";

const POSTS = [
  { id: 1, title: "10 habits of productive developers", cat: "Career", min: 6, text: "Small daily routines that make a big difference over a year." },
  { id: 2, title: "Why simple code beats clever code", cat: "Coding", min: 4, text: "Readable code is cheaper to maintain and easier to fix." },
  { id: 3, title: "A beginner guide to Tailwind CSS", cat: "Design", min: 8, text: "Build good looking pages quickly without leaving your HTML." },
  { id: 4, title: "How I plan my week", cat: "Life", min: 3, text: "A tiny system with one notebook and three priorities." },
  { id: 5, title: "Learning React in 30 days", cat: "Coding", min: 7, text: "A realistic plan with projects instead of only videos." },
];
const CATS = ["All", "Coding", "Design", "Career", "Life"];

export default function App() {
  const [dark, setDark] = useState(false);
  const [cat, setCat] = useState("All");
  const [open, setOpen] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const list = POSTS.filter((p) => cat === "All" || p.cat === cat);
  const [first, ...rest] = list;

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <span className="font-serif text-2xl font-bold">The Daily Note</span>
          <button onClick={() => setDark(!dark)} className="rounded-full p-2 hover:bg-stone-200 dark:hover:bg-stone-800">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </header>
        <div className="mx-auto flex max-w-5xl flex-wrap gap-2 px-6">
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={"rounded-full px-4 py-1.5 text-sm " + (cat === c ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "bg-stone-200 dark:bg-stone-800")}
            >
              {c}
            </button>
          ))}
        </div>

        <main className="mx-auto max-w-5xl px-6 py-8">
          {first && (
            <article className="grid overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-stone-900 md:grid-cols-2">
              <img src={"https://picsum.photos/seed/post" + first.id + "/800/600"} alt={first.title} className="h-64 w-full object-cover md:h-full" />
              <div className="p-6">
                <span className="text-xs font-semibold uppercase tracking-wide text-orange-600">{first.cat}</span>
                <h1 className="mt-2 font-serif text-3xl font-bold">{first.title}</h1>
                <p className="mt-3 text-stone-600 dark:text-stone-400">{first.text}</p>
                <p className="mt-4 flex items-center gap-1 text-sm text-stone-500"><Clock className="h-4 w-4" /> {first.min} min read</p>
              </div>
            </article>
          )}
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {rest.map((p) => (
              <article key={p.id} className="rounded-2xl bg-white p-5 shadow-sm dark:bg-stone-900">
                <img src={"https://picsum.photos/seed/post" + p.id + "/600/320"} alt={p.title} className="h-40 w-full rounded-xl object-cover" />
                <span className="mt-3 block text-xs font-semibold uppercase text-orange-600">{p.cat}</span>
                <h2 className="mt-1 font-serif text-xl font-bold">{p.title}</h2>
                {open === p.id && <p className="mt-2 text-stone-600 dark:text-stone-400">{p.text} Read the full story to learn more.</p>}
                <button onClick={() => setOpen(open === p.id ? null : p.id)} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-orange-600">
                  {open === p.id ? "Show less" : "Read more"} <ArrowRight className="h-4 w-4" />
                </button>
              </article>
            ))}
          </div>

          <section className="mt-12 rounded-2xl bg-stone-900 p-8 text-center text-white dark:bg-stone-800">
            <Mail className="mx-auto h-8 w-8 text-orange-400" />
            <h2 className="mt-2 font-serif text-2xl font-bold">Get new posts by email</h2>
            {joined ? (
              <p className="mt-3 text-green-400">You are subscribed. Thank you!</p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (email) setJoined(true);
                }}
                className="mx-auto mt-4 flex max-w-sm gap-2"
              >
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" className="flex-1 rounded-lg px-3 py-2 text-stone-900" />
                <button className="rounded-lg bg-orange-500 px-4 py-2 font-medium">Join</button>
              </form>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
`;

const PORTFOLIO = `import { useState } from "react";
import { Moon, Sun, Mail, MapPin, ArrowRight, Layers, Palette, Zap } from "lucide-react";

const PROJECTS = [
  { id: 1, title: "Fintech Dashboard", kind: "Web", text: "Analytics dashboard with live charts and dark mode." },
  { id: 2, title: "Travel App", kind: "Mobile", text: "Trip planner with maps, bookings and offline mode." },
  { id: 3, title: "Coffee Brand", kind: "Design", text: "Logo, packaging and a small marketing site." },
  { id: 4, title: "Online Store", kind: "Web", text: "Fast shop with cart, search and checkout." },
];
const SKILLS = [
  { icon: Layers, name: "Frontend", text: "React, TypeScript, Tailwind" },
  { icon: Palette, name: "UI design", text: "Figma, design systems" },
  { icon: Zap, name: "Performance", text: "Fast, accessible pages" },
];
const FILTERS = ["All", "Web", "Mobile", "Design"];

export default function App() {
  const [dark, setDark] = useState(true);
  const [filter, setFilter] = useState("All");
  const shown = PROJECTS.filter((p) => filter === "All" || p.kind === filter);

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <span className="text-lg font-bold">Ayesha.dev</span>
          <button onClick={() => setDark(!dark)} className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </header>

        <section className="mx-auto grid max-w-5xl items-center gap-10 px-6 py-14 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-violet-600 dark:text-violet-400">Hello, I am Ayesha</p>
            <h1 className="mt-2 text-5xl font-extrabold leading-tight">Frontend developer and designer</h1>
            <p className="mt-4 text-slate-600 dark:text-slate-400">I build clean, fast websites and apps that people enjoy using.</p>
            <a href="#contact" className="mt-6 inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-3 font-medium text-white hover:bg-violet-500">
              Work with me <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <img src="https://picsum.photos/seed/portrait/600/600" alt="Portrait" className="mx-auto h-72 w-72 rounded-3xl object-cover shadow-xl" />
        </section>

        <section className="mx-auto grid max-w-5xl gap-4 px-6 sm:grid-cols-3">
          {SKILLS.map((s) => (
            <div key={s.name} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
              <s.icon className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              <h3 className="mt-3 font-semibold">{s.name}</h3>
              <p className="text-sm text-slate-500">{s.text}</p>
            </div>
          ))}
        </section>

        <section className="mx-auto max-w-5xl px-6 py-14">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-3xl font-bold">Selected work</h2>
            <div className="flex gap-2">
              {FILTERS.map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={"rounded-full px-4 py-1 text-sm " + (filter === f ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-slate-800")}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {shown.map((p) => (
              <div key={p.id} className="group overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                <img src={"https://picsum.photos/seed/work" + p.id + "/800/500"} alt={p.title} className="h-48 w-full object-cover transition group-hover:scale-105" />
                <div className="p-5">
                  <span className="text-xs font-semibold uppercase text-violet-600 dark:text-violet-400">{p.kind}</span>
                  <h3 className="mt-1 text-lg font-bold">{p.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{p.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="contact" className="bg-violet-600 px-6 py-14 text-center text-white">
          <h2 className="text-3xl font-bold">Let us build something together</h2>
          <p className="mt-2 flex items-center justify-center gap-2 text-violet-100"><MapPin className="h-4 w-4" /> Karachi, Pakistan</p>
          <a href="mailto:hello@ayesha.example" className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-medium text-violet-700">
            <Mail className="h-4 w-4" /> hello@ayesha.example
          </a>
        </section>
      </div>
    </div>
  );
}
`;

const ELEARNING = `import { useState } from "react";
import { Moon, Sun, GraduationCap, Clock, Users, Star, Play, Search } from "lucide-react";

const COURSES = [
  { id: 1, title: "React from Zero to Hero", cat: "Programming", level: "Beginner", hours: 18, students: 2400, price: 49 },
  { id: 2, title: "UI Design Fundamentals", cat: "Design", level: "Beginner", hours: 10, students: 1800, price: 39 },
  { id: 3, title: "Data Analysis with Python", cat: "Data", level: "Intermediate", hours: 22, students: 3100, price: 59 },
  { id: 4, title: "Digital Marketing Basics", cat: "Business", level: "Beginner", hours: 8, students: 1200, price: 29 },
  { id: 5, title: "Advanced TypeScript", cat: "Programming", level: "Advanced", hours: 14, students: 900, price: 55 },
  { id: 6, title: "Public Speaking", cat: "Business", level: "Beginner", hours: 6, students: 2000, price: 25 },
];
const CATS = ["All", "Programming", "Design", "Data", "Business"];

export default function App() {
  const [dark, setDark] = useState(false);
  const [cat, setCat] = useState("All");
  const [query, setQuery] = useState("");
  const [enrolled, setEnrolled] = useState<number[]>([]);
  const shown = COURSES.filter(
    (c) => (cat === "All" || c.cat === cat) && c.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <span className="flex items-center gap-2 text-xl font-bold text-emerald-600">
            <GraduationCap className="h-6 w-6" /> LearnHub
          </span>
          <button onClick={() => setDark(!dark)} className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </header>

        <section className="bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-14 text-center text-white">
          <h1 className="text-4xl font-extrabold">Learn new skills at your own pace</h1>
          <p className="mt-2 text-emerald-50">Video lessons, quizzes and certificates.</p>
          <div className="relative mx-auto mt-6 max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search courses..." className="w-full rounded-full py-2.5 pl-9 pr-4 text-slate-900 outline-none" />
          </div>
        </section>

        <main className="mx-auto max-w-6xl px-6 py-10">
          <div className="mb-6 flex flex-wrap gap-2">
            {CATS.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={"rounded-full px-4 py-1.5 text-sm " + (cat === c ? "bg-emerald-600 text-white" : "bg-white dark:bg-slate-800")}>
                {c}
              </button>
            ))}
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((c) => (
              <div key={c.id} className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-900">
                <div className="relative">
                  <img src={"https://picsum.photos/seed/course" + c.id + "/600/340"} alt={c.title} className="h-40 w-full object-cover" />
                  <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">{c.level}</span>
                  <Play className="absolute bottom-3 right-3 h-8 w-8 rounded-full bg-white/90 p-2 text-emerald-600" />
                </div>
                <div className="p-4">
                  <h3 className="font-semibold">{c.title}</h3>
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {c.hours}h</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {c.students}</span>
                    <span className="flex items-center gap-1 text-amber-500"><Star className="h-3 w-3 fill-amber-400" /> 4.7</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-lg font-bold">{"$" + c.price}</span>
                    <button
                      onClick={() => setEnrolled(enrolled.includes(c.id) ? enrolled : [...enrolled, c.id])}
                      className={"rounded-lg px-3 py-1.5 text-sm font-medium " + (enrolled.includes(c.id) ? "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" : "bg-emerald-600 text-white hover:bg-emerald-500")}
                    >
                      {enrolled.includes(c.id) ? "Enrolled" : "Enroll now"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {shown.length === 0 && <p className="py-10 text-center text-slate-500">No courses found.</p>}
        </main>
      </div>
    </div>
  );
}
`;

const SAAS = `import { useState } from "react";
import { Moon, Sun, Check, Zap, Shield, BarChart3, ArrowRight } from "lucide-react";

const FEATURES = [
  { icon: Zap, title: "Lightning fast", text: "Set up in minutes, not weeks." },
  { icon: Shield, title: "Secure by default", text: "Encryption and role based access." },
  { icon: BarChart3, title: "Clear analytics", text: "See what matters in one dashboard." },
];
const PLANS = [
  { name: "Starter", monthly: 0, items: ["1 project", "Basic analytics", "Community support"] },
  { name: "Pro", monthly: 19, items: ["Unlimited projects", "Advanced analytics", "Priority support"], popular: true },
  { name: "Team", monthly: 49, items: ["Everything in Pro", "Team roles", "Single sign-on"] },
];
const FAQ = [
  { q: "Can I cancel anytime?", a: "Yes. There are no contracts and you can cancel in one click." },
  { q: "Is there a free trial?", a: "The Starter plan is free forever and Pro has a 14 day trial." },
];

export default function App() {
  const [dark, setDark] = useState(true);
  const [yearly, setYearly] = useState(false);
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">Flowly</span>
          <div className="flex items-center gap-3">
            <button onClick={() => setDark(!dark)} className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">Sign up</button>
          </div>
        </header>

        <section className="mx-auto max-w-3xl px-6 py-20 text-center">
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">New: team workspaces</span>
          <h1 className="mt-5 text-5xl font-extrabold leading-tight sm:text-6xl">Manage your work in one simple place</h1>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">Flowly helps small teams plan, track and ship projects faster.</p>
          <div className="mt-8 flex justify-center gap-3">
            <button className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-500">
              Start free <ArrowRight className="h-4 w-4" />
            </button>
            <button className="rounded-lg border border-slate-300 px-6 py-3 font-medium dark:border-slate-700">Watch demo</button>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-6 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-200 p-6 dark:border-slate-800 dark:bg-slate-900">
              <f.icon className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{f.text}</p>
            </div>
          ))}
        </section>

        <section className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold">Simple pricing</h2>
          <div className="mt-4 flex items-center justify-center gap-3 text-sm">
            <span className={yearly ? "text-slate-500" : "font-semibold"}>Monthly</span>
            <button onClick={() => setYearly(!yearly)} className="relative h-6 w-11 rounded-full bg-indigo-600">
              <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all " + (yearly ? "left-5" : "left-0.5")} />
            </button>
            <span className={yearly ? "font-semibold" : "text-slate-500"}>Yearly (save 20%)</span>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {PLANS.map((p) => (
              <div key={p.name} className={"rounded-2xl border p-6 " + (p.popular ? "border-indigo-500 shadow-lg dark:bg-slate-900" : "border-slate-200 dark:border-slate-800")}>
                <h3 className="font-semibold">{p.name}</h3>
                <p className="mt-2 text-4xl font-extrabold">
                  {"$" + (yearly ? Math.round(p.monthly * 0.8) : p.monthly)}
                  <span className="text-base font-normal text-slate-500">/mo</span>
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {p.items.map((it) => (
                    <li key={it} className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> {it}</li>
                  ))}
                </ul>
                <button className={"mt-6 w-full rounded-lg py-2 font-medium " + (p.popular ? "bg-indigo-600 text-white" : "border border-slate-300 dark:border-slate-700")}>Choose plan</button>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-2xl px-6 pb-20">
          <h2 className="mb-4 text-center text-3xl font-bold">Questions</h2>
          {FAQ.map((f, i) => (
            <div key={f.q} className="border-b border-slate-200 py-3 dark:border-slate-800">
              <button onClick={() => setOpen(open === i ? null : i)} className="w-full text-left font-medium">{f.q}</button>
              {open === i && <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{f.a}</p>}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
`;

function withDefaults(app: string): Record<string, string> {
  return { "/App.tsx": app };
}

export const TEMPLATES: Template[] = [
  { id: "ecommerce", name: "E-commerce", emoji: "🛒", description: "Product grid, search, cart, favourites", files: withDefaults(STORE) },
  { id: "business", name: "Business / Corporate", emoji: "🏢", description: "Hero, services, team, contact form", files: withDefaults(CORPORATE) },
  { id: "blog", name: "Blog", emoji: "📝", description: "Featured post, categories, newsletter", files: withDefaults(BLOG) },
  { id: "portfolio", name: "Portfolio", emoji: "🎨", description: "About, skills, filterable projects", files: withDefaults(PORTFOLIO) },
  { id: "elearning", name: "E-learning", emoji: "🎓", description: "Course catalogue, search, enroll", files: withDefaults(ELEARNING) },
  { id: "saas", name: "SaaS landing", emoji: "🚀", description: "Features, pricing toggle, FAQ", files: withDefaults(SAAS) },
];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
