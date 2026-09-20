import { MEAL_ORDER } from "./config";
import { forcedPicks, getMode, getMorning, getValue, keys } from "./entries";
import type { DayMeals, DietPlan, Entries, FoodOption, MealId, Mode, PersonId, Slot } from "./types";
import { alignKey } from "@/utils/ingredients";
import { alignMeal, describeMeal, keysOf, OLIO, resolveRepeats, type Cell } from "@/utils/mealAlign";
import { resolveMeals } from "@/utils/mealResolver";
import { planPlacement, poolMenus, type DayFlags, type Placement } from "@/utils/menuMatcher";

export type Plans = Record<PersonId, DietPlan>;

export interface Choice {
  value: number;
  label: string;
}

export interface ChosenItem {
  slotIdx: number;
  optionIdx: number;
  option: FoodOption;
  options: FoodOption[];
  /** true se la scelta è stata fatta a mano, false se è quella proposta dall'app. */
  explicit: boolean;
  /** Posizione dello slot dell'altra persona che corrisponde a questo (stesso pasto), se c'è. */
  link: number | null;
}

export interface MealView {
  meal: MealId;
  /** Pasto del piano da cui arrivano gli slot (diverso da `meal` se c'è lo scambio pranzo/cena). */
  source: MealId;
  swapped: boolean;
  /** Menù del PDF da cui arriva questo pasto. */
  menuIdx: number;
  items: ChosenItem[];
  /** Solo pranzo e cena di Antonio: i pasti tra cui può scegliere (stesso tipo ON/OFF). */
  sourceChoices?: Choice[];
  forcedSource?: boolean;
}

export interface DayView {
  person: PersonId;
  day: number;
  /** Solo Gilda: menù del PDF usato in questo giorno. */
  menuDay: number;
  mode: Mode | null;
  morning: boolean;
  meals: MealView[];
  /** Solo Gilda: i menù tra cui può scegliere per questo giorno. */
  menuChoices?: Choice[];
  forcedMenu?: boolean;
}

export interface Note {
  meal: MealId;
  text: string;
}

export interface DayPair {
  day: number;
  antonio: DayView;
  gilda: DayView;
  /** Cose da controllare: ingredienti che non coincidono o ripetuti. */
  notes: Note[];
}

export interface Week {
  days: DayPair[];
}

const EMPTY_DAY: DayMeals = { colazione: [], spuntino: [], pranzo: [], merenda: [], cena: [] };

/** ON/OFF e orario dell'allenamento di ogni giorno. */
export function dayFlags(entries: Entries): DayFlags[] {
  return Array.from({ length: 7 }, (_, d) => ({
    mode: getMode(entries, d),
    antonioMorning: getMorning(entries, "antonio", d),
    gildaMorning: getMorning(entries, "gilda", d),
  }));
}

/** Chiave che cambia solo quando cambia qualcosa che sposta i menù (e non per le altre scelte). */
export function placementKey(entries: Entries): string {
  const flags = dayFlags(entries)
    .map((f) => `${f.mode[1]}${f.antonioMorning ? "m" : "s"}${f.gildaMorning ? "m" : "s"}`)
    .join(".");
  const forced = forcedPicks(entries);
  return `${flags}|${forced.gilda.join(",")}|${forced.antonioL.join(",")}|${forced.antonioD.join(",")}`;
}

function uniqueLabels(labels: string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map((l) => {
    const n = (seen.get(l) ?? 0) + 1;
    seen.set(l, n);
    return n > 1 ? `${l} (${n})` : l;
  });
}

function slotsOf(plan: DietPlan, menu: number, meal: MealId): Slot[] {
  return ((plan.days[menu] ?? EMPTY_DAY) as DayMeals)[meal] ?? [];
}

interface MealSpec {
  meal: MealId;
  source: MealId;
  menuIdx: number;
  slots: Slot[];
}

/**
 * Costruisce la settimana: quale menù/pasto mangia ciascuno in ogni giorno, con gli ingredienti allineati
 * tra Antonio e Gilda, senza ripetere lo stesso ingrediente a pranzo e a cena, e con le scelte fatte a mano
 * sopra quelle proposte dall'app.
 */
export function buildWeek(plans: Plans, entries: Entries, placement?: Placement): Week {
  const flags = dayFlags(entries);
  const forced = forcedPicks(entries);
  const place = placement ?? planPlacement(plans.antonio, plans.gilda, flags, forced);
  const nA = plans.antonio.days.length;

  const days: DayPair[] = flags.map((f, day) => {
    const gMenu = place.gilda[day];
    const aSpecs: MealSpec[] = MEAL_ORDER.map((meal) => {
      let source: MealId = meal;
      let menuIdx = place.antonioBase[day];
      if (meal === "pranzo") {
        source = f.antonioMorning ? "cena" : "pranzo";
        menuIdx = place.antonioL[day];
      } else if (meal === "cena") {
        source = f.antonioMorning ? "pranzo" : "cena";
        menuIdx = place.antonioD[day];
      }
      return { meal, source, menuIdx, slots: slotsOf(plans.antonio, menuIdx, source) };
    });
    const gRes = resolveMeals(plans.gilda.days[gMenu] ?? EMPTY_DAY, f.gildaMorning);
    const gSpecs: MealSpec[] = gRes.map((rm) => ({ meal: rm.meal, source: rm.source, menuIdx: gMenu, slots: rm.slots }));

    // 1) scelta iniziale allineata + 2) scelte a mano + 3) niente ripetizioni tra pranzo e cena
    const aCells: Cell[][] = [];
    const gCells: Cell[][] = [];
    const explicit = { A: [] as boolean[][], G: [] as boolean[][] };
    const links: { A: (number | null)[][]; G: (number | null)[][] } = { A: [], G: [] };
    const allCells: Cell[] = [];

    MEAL_ORDER.forEach((meal, i) => {
      const tag: "L" | "D" | "X" = meal === "pranzo" ? "L" : meal === "cena" ? "D" : "X";
      const al = alignMeal(meal, aSpecs[i].slots, gSpecs[i].slots);
      const make = (person: "A" | "G", spec: MealSpec, defaults: number[], slotLinks: (number | null)[]) => {
        const personId: PersonId = person === "A" ? "antonio" : "gilda";
        const ex: boolean[] = [];
        const cells = spec.slots.map((slot, slotIdx) => {
          const raw = getValue(entries, keys.alt(personId, day, spec.menuIdx, spec.source, slotIdx));
          const isExplicit = typeof raw === "number" && raw >= 0 && raw < slot.options.length;
          ex.push(isExplicit);
          const cell: Cell = {
            person,
            meal: tag === "X" ? "L" : tag,
            keys: keysOf(slot),
            idx: isExplicit ? (raw as number) : (defaults[slotIdx] ?? 0),
            locked: isExplicit,
            link: null,
          };
          return cell;
        });
        (person === "A" ? explicit.A : explicit.G).push(ex);
        (person === "A" ? links.A : links.G).push(slotLinks);
        return cells;
      };
      aCells.push(make("A", aSpecs[i], al.a, al.aLink));
      gCells.push(make("G", gSpecs[i], al.g, al.gLink));
      aCells[i].forEach((c, k) => {
        const j = al.aLink[k];
        if (j !== null) c.link = gCells[i][j];
      });
      gCells[i].forEach((c, k) => {
        const j = al.gLink[k];
        if (j !== null) c.link = aCells[i][j];
      });
      if (tag !== "X") allCells.push(...aCells[i], ...gCells[i]);
    });
    const repeats = resolveRepeats(allCells);

    const toMealView = (personId: PersonId, spec: MealSpec, cells: Cell[], ex: boolean[], slotLinks: (number | null)[]): MealView => ({
      meal: spec.meal,
      source: spec.source,
      swapped: spec.source !== spec.meal,
      menuIdx: spec.menuIdx,
      items: spec.slots.map((slot, slotIdx) => ({
        slotIdx,
        optionIdx: cells[slotIdx].idx,
        option: slot.options[cells[slotIdx].idx],
        options: slot.options,
        explicit: ex[slotIdx],
        link: slotLinks[slotIdx] ?? null,
      })),
    });

    const aMeals = MEAL_ORDER.map((_, i) => toMealView("antonio", aSpecs[i], aCells[i], explicit.A[i], links.A[i]));
    const gMeals = MEAL_ORDER.map((_, i) => toMealView("gilda", gSpecs[i], gCells[i], explicit.G[i], links.G[i]));

    // Scelte possibili per pranzo e cena di Antonio (stessi pasti ON o OFF)
    const pool = poolMenus(f.mode, nA);
    for (const meal of ["pranzo", "cena"] as const) {
      const mv = aMeals.find((m) => m.meal === meal)!;
      const labels = uniqueLabels(pool.map((m) => describeMeal(slotsOf(plans.antonio, m, mv.source))));
      mv.sourceChoices = pool.map((m, k) => ({ value: m, label: labels[k] }));
      const fv = forced[meal === "pranzo" ? "antonioL" : "antonioD"][day];
      mv.forcedSource = fv !== undefined && pool.includes(fv);
    }

    const antonio: DayView = { person: "antonio", day, menuDay: place.antonioBase[day], mode: f.mode, morning: f.antonioMorning, meals: aMeals };
    const gLabels = uniqueLabels(
      plans.gilda.days.map((d) => `Pranzo: ${describeMeal(d.pranzo)}. Cena: ${describeMeal(d.cena)}`),
    );
    const gilda: DayView = {
      person: "gilda",
      day,
      menuDay: gMenu,
      mode: null,
      morning: f.gildaMorning,
      meals: gMeals,
      menuChoices: gLabels.map((label, value) => ({ value, label })),
      forcedMenu: forced.gilda[day] !== undefined && forced.gilda[day]! < plans.gilda.days.length,
    };

    return { day, antonio, gilda, notes: buildNotes(plans, antonio, gilda, repeats) };
  });

  return { days };
}

/** Cose da controllare: ingredienti di Gilda che Antonio non ha, e ingredienti ripetuti a pranzo e a cena. */
function buildNotes(
  plans: Plans,
  antonio: DayView,
  gilda: DayView,
  repeats: { person: "A" | "G"; key: string }[],
): Note[] {
  const notes: Note[] = [];
  const pool = poolMenus(antonio.mode ?? "ON", plans.antonio.days.length);
  for (const meal of ["pranzo", "cena"] as MealId[]) {
    const am = antonio.meals.find((m) => m.meal === meal)!;
    const gm = gilda.meals.find((m) => m.meal === meal)!;
    const inMeal = new Set(am.items.flatMap((i) => i.options.map((o) => alignKey(o.name))));
    const inPool = new Set(
      pool.flatMap((m) => slotsOf(plans.antonio, m, am.source).flatMap((s) => s.options.map((o) => alignKey(o.name)))),
    );
    for (const item of gm.items) {
      const x = alignKey(item.option.name);
      if (x === OLIO || inMeal.has(x)) continue;
      notes.push({
        meal,
        text: inPool.has(x)
          ? `Gilda ha ${x.toLowerCase()}: cambia il pasto di Antonio per averlo anche lui.`
          : `Gilda ha ${x.toLowerCase()}, ma nel piano di Antonio non è previsto in un giorno ${antonio.mode}.`,
      });
    }
  }
  for (const r of repeats) {
    notes.push({
      meal: "cena",
      text: `${r.person === "A" ? "Antonio" : "Gilda"} ha ${r.key.toLowerCase()} sia a pranzo sia a cena, e nel piano non ci sono alternative.`,
    });
  }
  return notes;
}
