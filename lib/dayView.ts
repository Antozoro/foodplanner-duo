import { MEAL_ORDER } from "./config";
import { forcedPicks, getMode, getMorning, getValue, keys, readSnapshot } from "./entries";
import type { DayMeals, DaySnapshot, DietPlan, Entries, EntryValue, FoodOption, MealId, Mode, PersonId, SnapMeal, Slot } from "./types";
import { alignKey } from "@/utils/ingredients";
import { alignMeal, describeMeal, keysOf, OLIO, resolveRepeats, type Cell } from "@/utils/mealAlign";
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
  /** Solo pranzo e cena: i pasti tra cui si può scegliere (stesso tipo, per Antonio ON o OFF). */
  sourceChoices?: Choice[];
  forcedSource?: boolean;
}

export interface DayView {
  person: PersonId;
  day: number;
  /** Menù "base" usato per colazione, spuntino e merenda (lo stesso da cui viene il pranzo). */
  menuDay: number;
  mode: Mode | null;
  morning: boolean;
  meals: MealView[];
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
  /** true se il giorno è stato salvato (bloccato). */
  locked: boolean;
}

export interface Week {
  days: DayPair[];
}

const EMPTY_DAY: DayMeals = { colazione: [], spuntino: [], pranzo: [], merenda: [], cena: [] };

/** ON/OFF e orario dell'allenamento di ogni giorno. */
export function dayFlags(entries: Entries): DayFlags[] {
  return Array.from({ length: 7 }, (_, d) => {
    const snap = readSnapshot(entries, d);
    if (snap) return { mode: snap.mode, antonioMorning: snap.antonioMorning, gildaMorning: snap.gildaMorning };
    return {
      mode: getMode(entries, d),
      antonioMorning: getMorning(entries, "antonio", d),
      gildaMorning: getMorning(entries, "gilda", d),
    };
  });
}

/** Chiave che cambia solo quando cambia qualcosa che sposta i menù (e non per le altre scelte). */
export function placementKey(entries: Entries): string {
  const flags = dayFlags(entries)
    .map((f) => `${f.mode[1]}${f.antonioMorning ? "m" : "s"}${f.gildaMorning ? "m" : "s"}`)
    .join(".");
  const forced = forcedPicks(entries);
  const locks = Array.from({ length: 7 }, (_, d) => readSnapshot(entries, d)?.savedAt ?? 0).join(",");
  return `${flags}|${forced.antonioL.join(",")}|${forced.antonioD.join(",")}|${forced.gildaL.join(",")}|${forced.gildaD.join(",")}|${locks}`;
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

/** Pranzo e cena di una persona in un giorno: da quale menù arrivano (con lo scambio del mattino) e i pasti disponibili per la scelta a mano. */
function personSpecs(
  plan: DietPlan,
  day: number,
  f: DayFlags,
  morning: boolean,
  L: number,
  D: number,
  base: number,
): MealSpec[] {
  return MEAL_ORDER.map((meal) => {
    let source: MealId = meal;
    let menuIdx = base;
    if (meal === "pranzo") {
      source = morning ? "cena" : "pranzo";
      menuIdx = L;
    } else if (meal === "cena") {
      source = morning ? "pranzo" : "cena";
      menuIdx = D;
    }
    return { meal, source, menuIdx, slots: slotsOf(plan, menuIdx, source) };
  });
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
  const nG = plans.gilda.days.length;

  const days: DayPair[] = flags.map((f, day) => {
    const snap = readSnapshot(entries, day);
    if (snap) return pairFromSnapshot(day, snap);

    const aSpecs = personSpecs(plans.antonio, day, f, f.antonioMorning, place.antonioL[day], place.antonioD[day], place.antonioBase[day]);
    const gSpecs = personSpecs(plans.gilda, day, f, f.gildaMorning, place.gildaL[day], place.gildaD[day], place.gildaBase[day]);

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

    const toMealView = (spec: MealSpec, cells: Cell[], ex: boolean[], slotLinks: (number | null)[]): MealView => ({
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

    const aMeals = MEAL_ORDER.map((_, i) => toMealView(aSpecs[i], aCells[i], explicit.A[i], links.A[i]));
    const gMeals = MEAL_ORDER.map((_, i) => toMealView(gSpecs[i], gCells[i], explicit.G[i], links.G[i]));

    // Scelte possibili per pranzo e cena, per ciascuno: Antonio tra i pasti dello stesso tipo (ON/OFF),
    // Gilda tra tutti i suoi 7 menù.
    const antonioPool = poolMenus(f.mode, nA);
    const gildaPool = Array.from({ length: nG }, (_, i) => i);
    for (const [meals, plan, pool, forcedKey] of [
      [aMeals, plans.antonio, antonioPool, "antonioL"] as const,
      [aMeals, plans.antonio, antonioPool, "antonioD"] as const,
      [gMeals, plans.gilda, gildaPool, "gildaL"] as const,
      [gMeals, plans.gilda, gildaPool, "gildaD"] as const,
    ]) {
      const meal = forcedKey.endsWith("L") ? "pranzo" : "cena";
      const mv = meals.find((m) => m.meal === meal)!;
      const labels = uniqueLabels(pool.map((m) => describeMeal(slotsOf(plan, m, mv.source))));
      mv.sourceChoices = pool.map((m, k) => ({ value: m, label: labels[k] }));
      const fv = forced[forcedKey][day];
      mv.forcedSource = fv !== undefined && pool.includes(fv);
    }

    const antonio: DayView = { person: "antonio", day, menuDay: place.antonioBase[day], mode: f.mode, morning: f.antonioMorning, meals: aMeals };
    const gilda: DayView = { person: "gilda", day, menuDay: place.gildaBase[day], mode: null, morning: f.gildaMorning, meals: gMeals };

    return { day, antonio, gilda, notes: buildNotes(plans, antonio, gilda, repeats), locked: false };
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

function viewFromSnapshot(person: PersonId, day: number, snap: DaySnapshot): DayView {
  const src = person === "antonio" ? snap.antonio : snap.gilda;
  return {
    person,
    day,
    menuDay: person === "antonio" ? snap.aBase : snap.gBase,
    mode: person === "antonio" ? snap.mode : null,
    morning: person === "antonio" ? snap.antonioMorning : snap.gildaMorning,
    meals: src.map((sm) => ({
      meal: sm.meal,
      source: sm.source,
      swapped: sm.swapped,
      menuIdx: sm.menuIdx,
      items: sm.items.map((it, slotIdx) => {
        const option: FoodOption = { id: `${person}-${day}-${sm.meal}-${slotIdx}`, name: it.name, grams: it.grams };
        return { slotIdx, optionIdx: 0, option, options: [option], explicit: true, link: null };
      }),
    })),
  };
}

/** Un giorno salvato viene mostrato esattamente com'era, senza ricalcolarlo. */
function pairFromSnapshot(day: number, snap: DaySnapshot): DayPair {
  return {
    day,
    antonio: viewFromSnapshot("antonio", day, snap),
    gilda: viewFromSnapshot("gilda", day, snap),
    notes: snap.notes,
    locked: true,
  };
}

const snapMeals = (view: DayView): SnapMeal[] =>
  view.meals.map((m) => ({
    meal: m.meal,
    source: m.source,
    swapped: m.swapped,
    menuIdx: m.menuIdx,
    items: m.items.map((i) => ({ name: i.option.name, grams: i.option.grams })),
  }));

/** Fotografia del giorno così com'è adesso, da salvare. */
export function makeSnapshot(pair: DayPair): DaySnapshot {
  const menuOf = (view: DayView, meal: MealId) => view.meals.find((m) => m.meal === meal)!.menuIdx;
  return {
    v: 1,
    savedAt: Date.now(),
    mode: pair.antonio.mode ?? "ON",
    antonioMorning: pair.antonio.morning,
    gildaMorning: pair.gilda.morning,
    aL: menuOf(pair.antonio, "pranzo"),
    aD: menuOf(pair.antonio, "cena"),
    aBase: pair.antonio.menuDay,
    gL: menuOf(pair.gilda, "pranzo"),
    gD: menuOf(pair.gilda, "cena"),
    gBase: pair.gilda.menuDay,
    antonio: snapMeals(pair.antonio),
    gilda: snapMeals(pair.gilda),
    notes: pair.notes,
  };
}

/**
 * Cosa scrivere per salvare (bloccare) un giorno: la fotografia del giorno, più le scelte fissate,
 * così se poi lo sblocchi resta com'era.
 */
export function lockUpdates(pair: DayPair): [string, EntryValue][] {
  const day = pair.day;
  const out: [string, EntryValue][] = [[keys.lock(day), JSON.stringify(makeSnapshot(pair))]];
  for (const view of [pair.antonio, pair.gilda]) {
    for (const meal of ["pranzo", "cena"] as const) {
      out.push([keys.src(view.person, day, meal), view.meals.find((m) => m.meal === meal)!.menuIdx]);
    }
    for (const mv of view.meals) {
      for (const item of mv.items) out.push([keys.alt(view.person, day, mv.menuIdx, mv.source, item.slotIdx), item.optionIdx]);
    }
  }
  return out;
}
