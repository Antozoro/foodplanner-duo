"use client";

import { DAY_LABELS } from "@/lib/config";
import { getText, keys } from "@/lib/entries";
import type { Household } from "@/lib/useHousehold";

const MEAL_LINES = [
  { id: "pranzo", label: "Pranzo" },
  { id: "cena", label: "Cena" },
] as const;

/** Il menù della settimana "a grandi linee": solo quello che avete scritto voi in cucina. */
export function MenuView({ hs, today }: { hs: Household; today: number }) {
  return (
    <div className="space-y-3">
      <p className="px-1 text-sm text-muted">
        Quello che scrivi nella scheda In cucina compare qui, giorno per giorno.
      </p>
      {DAY_LABELS.map((label, day) => {
        const rows = MEAL_LINES.map((m) => ({
          ...m,
          antonio: getText(hs.entries, keys.note("antonio", day, m.id)).trim(),
          gilda: getText(hs.entries, keys.note("gilda", day, m.id)).trim(),
        })).filter((r) => r.antonio || r.gilda);

        return (
          <section
            key={label}
            aria-label={label}
            className={`rounded-[22px] border bg-surface p-4 ${today === day ? "border-ink" : "border-line"}`}
          >
            <h2 className="flex items-center gap-2 text-lg font-bold">
              {label}
              {today === day && <span className="rounded-full bg-ink px-2 py-0.5 text-[0.7rem] font-semibold text-white">oggi</span>}
            </h2>
            {rows.length === 0 ? (
              <p className="mt-1 text-sm text-muted">Ancora niente di scritto.</p>
            ) : (
              <div className="mt-2 space-y-3">
                {rows.map((r) => (
                  <div key={r.id}>
                    <p className="text-xs font-bold tracking-wide text-muted">{r.label}</p>
                    {r.antonio && (
                      <p className="mt-0.5 text-[0.95rem] leading-snug">
                        <span className="font-bold text-antonio">Antonio </span>
                        <span className="whitespace-pre-wrap">{r.antonio}</span>
                      </p>
                    )}
                    {r.gilda && (
                      <p className="mt-0.5 text-[0.95rem] leading-snug">
                        <span className="font-bold text-gilda">Gilda </span>
                        <span className="whitespace-pre-wrap">{r.gilda}</span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
