"use client";

import { ArrowLeftRight, ChevronDown, Coffee, Dumbbell, Moon, Shuffle, Sun, TriangleAlert } from "lucide-react";
import { DAY_LABELS, DAY_SHORT, MEALS, PEOPLE } from "@/lib/config";
import type { ChosenItem, Choice, DayView, MealView } from "@/lib/dayView";
import { getText, keys } from "@/lib/entries";
import { VEGETABLES } from "@/data/vegetables";
import type { MealId, Mode, PersonId } from "@/lib/types";
import type { ReactNode } from "react";
import type { Household } from "@/lib/useHousehold";
import { alignKey, formatGrams } from "@/utils/ingredients";
import { NoteBox } from "./NoteBox";
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

/** Scelta del pasto (o del menù): "Consigliato" lo decide l'app, gli altri sono scelte tue. */
function ChangeChip({
  label,
  forced,
  value,
  choices,
  onChange,
}: {
  label: string;
  forced: boolean;
  value: number;
  choices: Choice[];
  onChange: (value: number | null) => void;
}) {
  return (
    <label
      className={`relative mt-1.5 inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${
        forced ? "bg-ink text-white" : "bg-canvas text-ink"
      }`}
    >
      <Shuffle size={14} aria-hidden />
      {label}
      <ChevronDown size={12} aria-hidden />
      <select
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        value={forced ? value : "auto"}
        onChange={(e) => onChange(e.target.value === "auto" ? null : Number(e.target.value))}
      >
        <option value="auto">Consigliato dall&apos;app</option>
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PersonCard({
  view,
  meal,
  onPick,
  onSource,
  onGildaMenu,
  vegetable,
  onVegetable,
}: {
  view: DayView;
  meal: MealId;
  vegetable: string;
  onVegetable: (view: DayView, meal: "pranzo" | "cena", value: string) => void;
  onPick: (view: DayView, mealView: MealView, item: ChosenItem, optionIdx: number) => void;
  onSource: (view: DayView, mealView: MealView, value: number | null) => void;
  onGildaMenu: (view: DayView, value: number | null) => void;
}) {
  const tone = TONE[view.person];
  const name = PEOPLE.find((p) => p.id === view.person)!.name;
  const mealView = view.meals.find((m) => m.meal === meal)!;

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
          {mealView.swapped && (
            <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[0.7rem] font-medium text-muted">
              <ArrowLeftRight size={11} aria-hidden />
              porzioni {MEALS.find((m) => m.id === mealView.source)!.label.toLowerCase()}
            </span>
          )}
        </div>
        {view.person === "antonio" && mealView.sourceChoices && (
          <ChangeChip
            label="Cambia pasto"
            forced={mealView.forcedSource === true}
            value={mealView.menuIdx}
            choices={mealView.sourceChoices}
            onChange={(v) => onSource(view, mealView, v)}
          />
        )}
        {view.person === "gilda" && view.menuChoices && (
          <ChangeChip
            label="Cambia menù"
            forced={view.forcedMenu === true}
            value={view.menuDay}
            choices={view.menuChoices}
            onChange={(v) => onGildaMenu(view, v)}
          />
        )}
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
                      onChange={(e) => onPick(view, mealView, item, Number(e.target.value))}
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

      {(meal === "pranzo" || meal === "cena") && (
        <div className="border-t border-line py-3">
          <label className="block">
            <span className="text-xs font-medium text-muted">Verdura</span>
            <span className="relative mt-1 flex min-h-11 items-center rounded-xl bg-canvas px-3 text-[0.92rem] font-medium">
              <span className="truncate pr-6">{vegetable || "Nessuna"}</span>
              <ChevronDown size={16} className="absolute right-3" aria-hidden />
              <select
                aria-label={`Verdura per ${view.person === "antonio" ? "Antonio" : "Gilda"}`}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={vegetable}
                onChange={(e) => onVegetable(view, meal, e.target.value)}
              >
                <option value="">Nessuna</option>
                {VEGETABLES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </span>
          </label>
        </div>
      )}
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
  const pair = hs.week.days[day];
  const { antonio, gilda } = pair;

  /** Cambia un ingrediente: l'altra persona passa in automatico allo stesso ingrediente, se il suo pasto lo prevede. */
  const onPick = (view: DayView, mealView: MealView, item: ChosenItem, optionIdx: number) => {
    const updates: [string, number][] = [
      [keys.alt(view.person, view.day, mealView.menuIdx, mealView.source, item.slotIdx), optionIdx],
    ];
    if (item.link !== null) {
      const other = view.person === "antonio" ? gilda : antonio;
      const otherMeal = other.meals.find((m) => m.meal === mealView.meal)!;
      const otherItem = otherMeal.items[item.link];
      const x = alignKey(item.options[optionIdx].name);
      const j = otherItem?.options.findIndex((o) => alignKey(o.name) === x) ?? -1;
      if (otherItem && j >= 0) {
        updates.push([keys.alt(other.person, other.day, otherMeal.menuIdx, otherMeal.source, otherItem.slotIdx), j]);
      }
    }
    hs.setEntries(updates);
  };

  const onSource = (view: DayView, mealView: MealView, value: number | null) => {
    if (mealView.meal === "pranzo" || mealView.meal === "cena") {
      hs.setEntry(keys.src(view.day, mealView.meal), value);
    }
  };
  const onVegetable = (view: DayView, m: "pranzo" | "cena", value: string) =>
    hs.setEntry(keys.veg(view.person, view.day, m), value || null);
  const vegOf = (person: "antonio" | "gilda") =>
    meal === "pranzo" || meal === "cena" ? getText(hs.entries, keys.veg(person, day, meal)) : "";
  const onGildaMenu = (view: DayView, value: number | null) => hs.setEntry(keys.gmenu(view.day), value);

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
            {pair.notes.some((n) => n.meal === m.id) && (
              <>
                <span className="ml-1.5 inline-block size-1.5 rounded-full bg-warn align-middle" aria-hidden />
                <span className="sr-only"> (ingredienti che non coincidono)</span>
              </>
            )}
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

      {pair.notes.some((n) => n.meal === meal) && (
        <div className="rounded-2xl border border-warn/40 bg-surface p-3" role="status">
          <p className="flex items-center gap-1.5 text-sm font-bold text-warn">
            <TriangleAlert size={16} aria-hidden />
            Da controllare
          </p>
          <ul className="mt-1.5 space-y-1 text-[0.82rem] leading-snug">
            {pair.notes
              .filter((n) => n.meal === meal)
              .map((n) => (
                <li key={n.text}>{n.text}</li>
              ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 items-start gap-2">
        <PersonCard view={antonio} meal={meal} onPick={onPick} onSource={onSource} onGildaMenu={onGildaMenu} vegetable={vegOf("antonio")} onVegetable={onVegetable} />
        <PersonCard view={gilda} meal={meal} onPick={onPick} onSource={onSource} onGildaMenu={onGildaMenu} vegetable={vegOf("gilda")} onVegetable={onVegetable} />
      </div>

      {(meal === "pranzo" || meal === "cena") && (
        <section aria-label={`Cosa cucinate a ${meal}`} className="space-y-2 pt-1">
          <h3 className="px-1 text-sm font-bold">Cosa cucinate a {meal}</h3>
          <NoteBox
            key={`antonio-${day}-${meal}`}
            label={`${meal === "pranzo" ? "Pranzo" : "Cena"} di Antonio`}
            tone="antonio"
            value={getText(hs.entries, keys.note("antonio", day, meal))}
            onCommit={(t) => hs.setEntry(keys.note("antonio", day, meal), t.trim() ? t : null)}
          />
          <NoteBox
            key={`gilda-${day}-${meal}`}
            label={`${meal === "pranzo" ? "Pranzo" : "Cena"} di Gilda`}
            tone="gilda"
            value={getText(hs.entries, keys.note("gilda", day, meal))}
            onCommit={(t) => hs.setEntry(keys.note("gilda", day, meal), t.trim() ? t : null)}
          />
        </section>
      )}
    </div>
  );
}
