"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import { DAY_LABELS, DAY_SHORT } from "@/lib/config";
import { getMode, keys } from "@/lib/entries";
import type { Household } from "@/lib/useHousehold";
import { formatGrams } from "@/utils/ingredients";
import { buildShopping } from "@/utils/shopping";

export function ShoppingView({ hs }: { hs: Household }) {
  const items = useMemo(() => buildShopping(hs.week), [hs.week]);

  const isChecked = (key: string) => hs.entries[keys.check(key)]?.v === true;
  const checkedCount = items.filter((i) => isChecked(i.key)).length;
  const sorted = [...items].sort((a, b) => Number(isChecked(a.key)) - Number(isChecked(b.key)));

  const resetChecks = () => {
    for (const item of items) if (isChecked(item.key)) hs.setEntry(keys.check(item.key), false);
  };

  return (
    <div className="space-y-4">
      <section aria-labelledby="week-antonio" className="rounded-[22px] border border-line bg-surface p-3">
        <h2 id="week-antonio" className="text-sm font-bold text-antonio">
          Giorni di Antonio
        </h2>
        <p className="mt-0.5 text-xs text-muted">Tocca un giorno per passare da ON (allenamento) a OFF (riposo).</p>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {DAY_SHORT.map((d, i) => {
            const on = getMode(hs.entries, i) === "ON";
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                aria-label={`${DAY_LABELS[i]}: ${on ? "ON, allenamento" : "OFF, riposo"}`}
                onClick={() => hs.setEntry(keys.mode(i), on ? "OFF" : "ON")}
                className={`flex min-h-14 flex-col items-center justify-center rounded-xl text-xs font-semibold ${
                  on ? "bg-antonio text-white" : "border border-line bg-canvas text-ink"
                }`}
              >
                <span>{d}</span>
                <span className="text-base leading-none" aria-hidden>
                  {on ? "💪" : "☕"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="shopping-title">
        <div className="mb-2 flex items-end justify-between gap-3 px-1">
          <div>
            <h2 id="shopping-title" className="text-lg font-bold">
              Spesa della settimana
            </h2>
            <p className="text-xs text-muted">
              {checkedCount} di {items.length} nel carrello
            </p>
          </div>
          <button
            type="button"
            onClick={resetChecks}
            disabled={checkedCount === 0}
            className="min-h-10 rounded-full border border-line px-3 text-sm font-semibold disabled:opacity-40"
          >
            Azzera spunte
          </button>
        </div>

        <ul className="overflow-hidden rounded-[22px] border border-line bg-surface">
          {sorted.map((item, idx) => {
            const checked = isChecked(item.key);
            return (
              <li key={item.key} className={idx > 0 ? "border-t border-line" : ""}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => hs.setEntry(keys.check(item.key), !checked)}
                  className="flex min-h-14 w-full items-center gap-3 px-3.5 text-left"
                >
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-md border-2 ${
                      checked ? "border-ok bg-ok text-white" : "border-muted"
                    }`}
                    aria-hidden
                  >
                    {checked && <Check size={16} strokeWidth={3} />}
                  </span>
                  <span className={`flex-1 text-[0.98rem] font-medium ${checked ? "text-muted line-through" : ""}`}>
                    {item.name}
                  </span>
                  <span className={`text-[1.05rem] font-bold tabular-nums ${checked ? "text-muted" : ""}`}>
                    {formatGrams(item.grams)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
