"use client";

/** Thin progress bar + number. Orange from 80%, red at 100%. limit 0 = unlimited (nothing shown). */
export function usageLevel(used: number, limit: number): "ok" | "warn" | "full" {
  if (limit <= 0) return "ok";
  const pct = used / limit;
  if (pct >= 1) return "full";
  if (pct >= 0.8) return "warn";
  return "ok";
}

export default function UsageBar({ used, limit, label = "AI requests today" }: { used: number; limit: number; label?: string }) {
  if (limit <= 0) return null;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const level = usageLevel(used, limit);
  const bar = level === "full" ? "bg-red-500" : level === "warn" ? "bg-orange-500" : "bg-white/60";
  const text = level === "full" ? "text-red-300" : level === "warn" ? "text-orange-300" : "text-white/70";
  return (
    <div title="AI requests used today (resets at 05:00 Pakistan time)">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-white/50">{label}</span>
        <span className={`tabular-nums ${text}`}>
          {used}/{limit}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        className="h-1 overflow-hidden rounded-full bg-white/10"
      >
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
