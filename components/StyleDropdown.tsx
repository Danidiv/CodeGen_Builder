"use client";

import { Check, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { STYLES } from "@/lib/styles";
import { useDismiss } from "./ui";

/** Small colour swatch per style (UI only). */
const SWATCH: Record<string, string> = {
  auto: "conic-gradient(#6366f1, #ec4899, #f59e0b, #10b981, #6366f1)",
  minimal: "linear-gradient(135deg, #ffffff 50%, #6366f1 50%)",
  darkneon: "linear-gradient(135deg, #d946ef, #22d3ee)",
  warm: "linear-gradient(135deg, #fef3c7 45%, #ea580c 45%)",
  bold: "linear-gradient(135deg, #fde047 50%, #ec4899 50%)",
  corporate: "linear-gradient(135deg, #0f172a 50%, #1d4ed8 50%)",
};

export function Swatch({ id }: { id: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 shrink-0 rounded-full border border-white/20"
      style={{ background: SWATCH[id] ?? SWATCH.auto }}
    />
  );
}

export default function StyleDropdown({ styleId, onStyle, up = true }: { styleId: string; onStyle: (id: string) => void; up?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, open, () => setOpen(false));
  const current = STYLES.find((s) => s.id === styleId) ?? STYLES[0];

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="btn btn-ghost px-2"
        title="Design style for the next answer"
      >
        <Swatch id={current.id} />
        <span>Style: {current.name}</span>
        <ChevronDown size={14} className="text-white/50" />
      </button>
      {open && (
        <div role="listbox" aria-label="Design style" className={`menu absolute left-0 z-50 w-[220px] ${up ? "bottom-full mb-1" : "top-full mt-1"}`}>
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={s.id === styleId}
              className="menu-item"
              title={s.prompt || "The AI decides the look"}
              onClick={() => {
                onStyle(s.id);
                setOpen(false);
              }}
            >
              <Swatch id={s.id} />
              <span className="flex-1">{s.name}</span>
              {s.id === styleId && <Check size={14} className="text-white/70" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
