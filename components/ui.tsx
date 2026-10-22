"use client";

import { useEffect, type ReactNode, type RefObject } from "react";

/** Icon-only button: always has a tooltip (data-tip) and an aria-label. */
export function IconButton({
  label,
  onClick,
  disabled,
  children,
  className = "",
  tip = "down",
  pressed,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  tip?: "down" | "up" | "right";
  pressed?: boolean;
}) {
  const tipClass = tip === "up" ? "tip-up" : tip === "right" ? "tip-right" : "";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      data-tip={label}
      onClick={onClick}
      disabled={disabled}
      className={`icon-btn tip ${tipClass} ${pressed ? "bg-white/10 text-white" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

/** Small on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
  title,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      onClick={() => onChange(!checked)}
      className="group flex h-8 items-center gap-2 rounded-btn px-2 text-xs text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
    >
      <span
        className={`relative h-4 w-8 rounded-full transition-colors group-active:opacity-80 ${checked ? "bg-accent" : "bg-white/20"}`}
      >
        <span
          className={`absolute left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
      {label}
    </button>
  );
}

/** Calls `onClose` for a click outside `ref` or when Escape is pressed (while `active`). */
export function useDismiss(ref: RefObject<HTMLElement>, active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    function down(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [ref, active, onClose]);
}

