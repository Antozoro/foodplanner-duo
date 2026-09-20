"use client";

import { ArrowLeftRight, ChevronDown, Coffee, Dumbbell, Moon, Sun } from "lucide-react";
import { DAY_LABELS, DAY_SHORT, MEALS, PEOPLE } from "@/lib/config";
import { buildDayView, type DayView } from "@/lib/dayView";
import { keys } from "@/lib/entries";
import type { MealId, Mode, PersonId } from "@/lib/types";
import type { ReactNode } from "react";
import type { Household } from "@/lib/useHousehold";
import { formatGrams } from "@/utils/ingredients";
import { Segmented } from "./ui";

const TONE = {
  antonio: { text: "text-antonio", soft: "bg-antonio-soft", top: "border-t-antonio", ring: "ring-antonio" },
  gilda: { text: "text-gilda", soft: "bg-gilda-soft", top: "border-t-gilda", ring: "ring-gilda" },
} as const;

const withIcon = (icon: ReactNode, text: string) => (
  <span className="inline-flex items-center justify-center gap-1">
    {icon}
    {text}
  </span>
);

const TIMING = [
  { value: "sera", label: withIcon(<Moon size={14} aria-hidden />, "Sera") },
  { value: "mattina", label: withIcon(<Sun size={14} aria-hidden />, "Mattina") },
];

const DAY_MODE: { value: Mode; label: ReactNode }[] = [
  { value: "ON", label: withIcon(<Dumbbell size={14} aria-hidden />, "ON") },
  { value: "OFF", label: withIcon(<Coffee size={14} aria-hidden />, "OFF") },
];

function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="px-1 pt-1 pb-0.5 text-[0.7rem] leading-none font-medium text-muted">{children}</p>;
}

function gramsText(g: number) {
  return g.toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

function PersonCard({
  view,
  meal,
  hs,
}: {
  view: DayView;
  meal: MealId;
  hs: Household;
}) {
  const tone = TONE[view.person];
  const name = PEOPLE.find((p) => p.id === view.person)!.name;
  const mealView = view.meals.find((m) => m.meal === meal)!;
  const otherMenu = view.person === "antonio" && view.menuDay !== view.day;

  return (
    <section
      aria-label={`${name}: ${MEALS.find((m) => m.id === meal)!.label}`}
      className={`min-w-0 rounded-[22px] border border-t-[5px] border-line bg-surface px-3 pt-3 pb-1 ${tone.top}`}
    >
      <header className="pb-2">
        <h2 className={`text-lg font-bold ${tone.text}`}>{name}</h2>
        <div className="mt-1 flex flex-wrap gap-1">
          {view.mode && (
            <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${tone.soft} ${tone.text}`}>
              {view.mode === "ON" ? "Giorno ON" : "Giorno OFF"}
            </span>
          )}
          {otherMenu && (
            <span className="rounded-full bg-canvas px-2 py-0.5 text-[0.7rem] font-medium text-muted">
              menù del {DAY_SHORT[view.menuDay]}
            </span>
          )}
          {mealView.swapped && (
            <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[0.7rem] font-medium text-muted">
              <ArrowLeftRight size={11} aria-hidden />
              porzioni {MEALS.find((m) => m.id === mealView.source)!.label.toLowerCase()}
            </span>
          )}
        </div>
      </header>

      {mealView.items.length === 0 && <p className="border-t border-line py-4 text-sm text-muted">Nessun alimento in questo pasto.</p>}

      <ul>
        {mealView.items.map((item) => {
          const changed = item.optionIdx !== 0;
          return (
            <li key={item.slotIdx} className="border-t border-line py-3">
              <p className="text-[0.92rem] leading-snug font-medium break-words">{item.option.name}</p>
              <div className="mt-1.5 flex items-end justify-between gap-2">
                <span className="grams text-[2.6rem]" aria-label={`${gramsText(item.option.grams)} grammi`}>
                  {gramsText(item.option.grams)}
                  <span className="ml-0.5 text-base font-medium text-muted">g</span>
                </span>
                {item.options.length > 1 && (
                  <label
                    className={`relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-0.5 rounded-full px-2 ${
                      changed ? `${tone.soft} ${tone.text} ring-2 ${tone.ring}` : "bg-canvas text-ink"
                    }`}
                  >
                    <ArrowLeftRight size={16} aria-hidden />
                    <ChevronDown size={12} aria-hidden />
                    <select
                      aria-label={`Alternativa per ${item.options[0].name}`}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      value={item.optionIdx}
                      onChange={(e) =>
                        hs.setEntry(
                          keys.alt(view.person, view.day, view.menuDay, mealView.source, item.slotIdx),
                          Number(e.target.value),
                        )
                      }
                    >
                      {item.options.map((o, i) => (
                        <option key={o.id} value={i}>
                          {o.name}: {formatGrams(o.grams)}
                          {i === 0 ? " (piano)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function KitchenView({
  hs,
  day,
  meal,
  onDay,
  onMeal,
  today,
}: {
  hs: Household;
  day: number;
  meal: MealId;
  onDay: (d: number) => void;
  onMeal: (m: MealId) => void;
  today: number;
}) {
  const antonio = buildDayView("antonio", day, hs.plans, hs.entries);
  const gilda = buildDayView("gilda", day, hs.plans, hs.entries);

  const setMorning = (person: PersonId, v: string) => hs.setEntry(keys.morning(person, day), v === "mattina");

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Giorno" className="grid grid-cols-7 gap-1.5">
        {DAY_SHORT.map((d, i) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={day === i}
            aria-label={DAY_LABELS[i]}
            aria-current={today === i ? "date" : undefined}
            onClick={() => onDay(i)}
            className={`relative min-h-12 rounded-2xl px-0 text-[0.92rem] font-semibold ${
              day === i ? "bg-ink text-white" : "bg-surface text-ink"
            }`}
          >
            {d}
            {today === i && (
              <span
                className={`absolute bottom-1.5 left-1/2 size-1 -translate-x-1/2 rounded-full ${day === i ? "bg-white" : "bg-ink"}`}
                aria-hidden
              />
            )}
          </button>
        ))}
      </div>

      <div role="tablist" aria-label="Pasto" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {MEALS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={meal === m.id}
            onClick={() => onMeal(m.id)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${
              meal === m.id ? "bg-ink text-white" : "border border-line bg-transparent text-ink"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-[22px] border border-line bg-canvas p-2">
        <div className="min-w-0">
          <p className="px-1 text-sm font-bold text-antonio">Antonio</p>
          <FieldLabel>Allenamento</FieldLabel>
          <Segmented
            label="Antonio: orario dell'allenamento"
            tone="antonio"
            value={antonio.morning ? "mattina" : "sera"}
            options={TIMING}
            onChange={(v) => setMorning("antonio", v)}
          />
          <FieldLabel>Tipo di giorno</FieldLabel>
          <Segmented<Mode>
            label="Antonio: giorno di allenamento o di riposo"
            tone="antonio"
            value={antonio.mode ?? "OFF"}
            options={DAY_MODE}
            onChange={(v) => hs.setEntry(keys.mode(day), v)}
          />
        </div>
        <div className="min-w-0">
          <p className="px-1 text-sm font-bold text-gilda">Gilda</p>
          <FieldLabel>Allenamento</FieldLabel>
          <Segmented
            label="Gilda: orario dell'allenamento"
            tone="gilda"
            value={gilda.morning ? "mattina" : "sera"}
            options={TIMING}
            onChange={(v) => setMorning("gilda", v)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 items-start gap-2">
        <PersonCard view={antonio} meal={meal} hs={hs} />
        <PersonCard view={gilda} meal={meal} hs={hs} />
      </div>
    </div>
  );
}
