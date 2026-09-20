import { MEAL_ORDER } from "./config";
import { getMode, getMorning, getValue, keys } from "./entries";
import type { DayMeals, DietPlan, Entries, FoodOption, MealId, Mode, PersonId, Slot } from "./types";
import { alignKey } from "@/utils/ingredients";
import { resolveMeals } from "@/utils/mealResolver";
import { planPlacement, type DayFlags, type Placement } from "@/utils/menuMatcher";

export type Plans = Record<PersonId, DietPlan>;

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
  source: MealId;
  swapped: boolean;
  items: ChosenItem[];
}

export interface DayView {
  person: PersonId;
  day: number;
  /** Giorno del PDF da cui arriva il menù (può essere diverso dal giorno della settimana). */
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
  /** Ingredienti che uno dei due ha e l'altro non può avere. */
  notes: Note[];
}

export interface Week {
  days: DayPair[];
}

const EMPTY_DAY: DayMeals = { colazione: [], spuntino: [], pranzo: [], merenda: [], cena: [] };

/** Primo a pranzo, pane a cena: sono le scelte iniziali per la fonte di carboidrati. */
const PRIMO = new Set(["Pasta integrale", "Riso"]);
const PANE = new Set(["Pane integrale", "Panbauletto integrale Mulino Bianco", "Pane bianco"]);

const OLIO = "Olio extra vergine";

const keysOf = (slot: Slot) => slot.options.map((o) => alignKey(o.name));

function targetFor(meal: MealId): Set<string> | null {
  if (meal === "pranzo") return PRIMO;
  if (meal === "cena") return PANE;
  return null;
}

/** Scelta iniziale di uno slot preso da solo: primo a pranzo, pane a cena, altrimenti l'alimento del piano. */
function ruleIndex(meal: MealId, optionKeys: string[]): number {
  const target = targetFor(meal);
  if (!target) return 0;
  const i = optionKeys.findIndex((k) => target.has(k));
  return i >= 0 ? i : 0;
}

interface MealAlignment {
  a: number[];
  g: number[];
  aLink: (number | null)[];
  gLink: (number | null)[];
}

/**
 * Allinea lo stesso pasto di Antonio e Gilda: collega gli slot che hanno ingredienti in comune
 * e fa scegliere a entrambi lo stesso ingrediente (ognuno con la sua grammatura).
 */
function alignMeal(meal: MealId, aSlots: Slot[], gSlots: Slot[]): MealAlignment {
  const aKeys = aSlots.map(keysOf);
  const gKeys = gSlots.map(keysOf);
  const a = aKeys.map((k) => ruleIndex(meal, k));
  const g = gKeys.map((k) => ruleIndex(meal, k));
  const aLink: (number | null)[] = aSlots.map(() => null);
  const gLink: (number | null)[] = gSlots.map(() => null);

  const pairs: { i: number; j: number; common: string[] }[] = [];
  aKeys.forEach((ak, i) =>
    gKeys.forEach((gk, j) => {
      // l'olio non fa da alternativa a un altro alimento (es. "tonno o olio"): non lo uso per collegare gli slot
      const multi = aSlots[i].options.length > 1 || gSlots[j].options.length > 1;
      const common = [...new Set(ak.filter((k) => gk.includes(k) && !(multi && k === OLIO)))];
      if (common.length) pairs.push({ i, j, common });
    }),
  );
  pairs.sort((p, q) => q.common.length - p.common.length || p.i - q.i || p.j - q.j);

  const target = targetFor(meal);
  for (const { i, j, common } of pairs) {
    if (aLink[i] !== null || gLink[j] !== null) continue;
    aLink[i] = j;
    gLink[j] = i;
    const carb = target !== null && aKeys[i].some((k) => PRIMO.has(k) || PANE.has(k));
    let x: string | undefined;
    if (carb) {
      // se non c'è un primo (a pranzo) o un pane (a cena) in comune, ognuno segue la sua regola
      x = common.find((k) => target!.has(k));
    } else if (common.includes(aKeys[i][0])) {
      x = aKeys[i][0];
    } else if (common.includes(gKeys[j][0])) {
      x = gKeys[j][0];
    } else {
      x = common[0];
    }
    if (x !== undefined) {
      a[i] = aKeys[i].indexOf(x);
      g[j] = gKeys[j].indexOf(x);
    }
  }
  return { a, g, aLink, gLink };
}

function mealView(
  person: PersonId,
  day: number,
  menuDay: number,
  rm: { meal: MealId; source: MealId; swapped: boolean; slots: Slot[] },
  defaults: number[],
  links: (number | null)[],
  entries: Entries,
): MealView {
  return {
    meal: rm.meal,
    source: rm.source,
    swapped: rm.swapped,
    items: rm.slots.map((slot, slotIdx) => {
      // Le scelte a mano sono legate al pasto d'origine, così non si perdono cambiando il timing.
      const raw = getValue(entries, keys.alt(person, day, menuDay, rm.source, slotIdx));
      const explicit = typeof raw === "number" && raw >= 0 && raw < slot.options.length;
      const optionIdx = explicit ? (raw as number) : (defaults[slotIdx] ?? 0);
      return { slotIdx, optionIdx, option: slot.options[optionIdx], options: slot.options, explicit, link: links[slotIdx] ?? null };
    }),
  };
}

/** Segnala gli ingredienti di pranzo e cena che Gilda ha e che nel piano di Antonio non sono previsti. */
function buildNotes(antonio: DayView, gilda: DayView): Note[] {
  const notes: Note[] = [];
  for (const meal of ["pranzo", "cena"] as MealId[]) {
    const am = antonio.meals.find((m) => m.meal === meal)!;
    const gm = gilda.meals.find((m) => m.meal === meal)!;
    const reachable = new Set(am.items.flatMap((i) => i.options.map((o) => alignKey(o.name))));
    for (const item of gm.items) {
      const x = alignKey(item.option.name);
      if (x !== OLIO && !reachable.has(x)) {
        notes.push({
          meal,
          text: `Gilda ha ${x.toLowerCase()}, ma nel piano di Antonio non è previsto in un giorno ${antonio.mode}.`,
        });
      }
    }
  }
  return notes;
}

/** ON/OFF e orario dell'allenamento di ogni giorno. */
export function dayFlags(entries: Entries): DayFlags[] {
  return Array.from({ length: 7 }, (_, d) => ({
    mode: getMode(entries, d),
    antonioMorning: getMorning(entries, "antonio", d),
    gildaMorning: getMorning(entries, "gilda", d),
  }));
}

export function flagsKey(flags: DayFlags[]): string {
  return flags.map((f) => `${f.mode[1]}${f.antonioMorning ? "m" : "s"}${f.gildaMorning ? "m" : "s"}`).join(".");
}

/**
 * Costruisce la settimana: quale menù mangia ciascuno in ogni giorno, con gli ingredienti allineati
 * tra Antonio e Gilda e le scelte fatte a mano sopra quelle proposte dall'app.
 */
export function buildWeek(plans: Plans, entries: Entries, placement?: Placement): Week {
  const flags = dayFlags(entries);
  const place = placement ?? planPlacement(plans.antonio, plans.gilda, flags);

  const days: DayPair[] = flags.map((f, day) => {
    const aMenuDay = place.antonio[day];
    const gMenuDay = place.gilda[day];
    const aRes = resolveMeals(plans.antonio.days[aMenuDay] ?? EMPTY_DAY, f.antonioMorning);
    const gRes = resolveMeals(plans.gilda.days[gMenuDay] ?? EMPTY_DAY, f.gildaMorning);

    const aMeals: MealView[] = [];
    const gMeals: MealView[] = [];
    MEAL_ORDER.forEach((meal, i) => {
      const al = alignMeal(meal, aRes[i].slots, gRes[i].slots);
      aMeals.push(mealView("antonio", day, aMenuDay, aRes[i], al.a, al.aLink, entries));
      gMeals.push(mealView("gilda", day, gMenuDay, gRes[i], al.g, al.gLink, entries));
    });

    const antonio: DayView = { person: "antonio", day, menuDay: aMenuDay, mode: f.mode, morning: f.antonioMorning, meals: aMeals };
    const gilda: DayView = { person: "gilda", day, menuDay: gMenuDay, mode: null, morning: f.gildaMorning, meals: gMeals };
    return { day, antonio, gilda, notes: buildNotes(antonio, gilda) };
  });

  return { days };
}
