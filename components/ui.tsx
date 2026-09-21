"use client";

import type { ReactNode } from "react";
import type { SyncStatus } from "@/lib/useHousehold";

export type Tone = "antonio" | "gilda" | "neutral";

const ACTIVE: Record<Tone, string> = {
  antonio: "bg-antonio text-white",
  gilda: "bg-gilda text-white",
  neutral: "bg-ink text-white",
};

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  tone = "neutral",
  disabled = false,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  tone?: Tone;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex rounded-xl border border-line bg-surface p-0.5 ${disabled ? "opacity-60" : ""}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`min-h-10 flex-auto rounded-[10px] px-1 text-[0.78rem] font-semibold whitespace-nowrap transition-colors ${
              active ? ACTIVE[tone] : "text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const SYNC_TEXT: Record<SyncStatus, { text: string; dot: string }> = {
  synced: { text: "Sincronizzato", dot: "bg-ok" },
  syncing: { text: "Sincronizzo", dot: "bg-warn" },
  local: { text: "Solo su questo telefono", dot: "bg-muted" },
  error: { text: "Non sincronizzato", dot: "bg-bad" },
};

export function SyncBadge({ status }: { status: SyncStatus }) {
  const s = SYNC_TEXT[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted" role="status">
      <span className={`size-2 rounded-full ${s.dot}`} aria-hidden />
      {s.text}
    </span>
  );
}
