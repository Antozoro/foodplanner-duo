import { MEAL_ORDER } from "./config";
import { getAlt, getMode, getMorning } from "./entries";
import type { DayMeals, DietPlan, Entries, FoodOption, MealId, Mode, PersonId } from "./types";
import { resolveMeals } from "@/utils/mealResolver";
import { pickMenuDay } from "@/utils/menuMatcher";

export interface ChosenItem {
  slotIdx: number;
  optionIdx: number;
  option: FoodOption;
  options: FoodOption[];
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
  /** Giorno del piano da cui arriva il menù (per Antonio può differire da `day`). */
  menuDay: number;
  mode: Mode | null;
  morning: boolean;
  meals: MealView[];
}

const EMPTY_DAY: DayMeals = { colazione: [], spuntino: [], pranzo: [], merenda: [], cena: [] };

export type Plans = Record<PersonId, DietPlan>;

/** Costruisce la giornata effettiva di una persona: menù scelto, scambio pranzo/cena, alternative selezionate. */
export function buildDayView(person: PersonId, day: number, plans: Plans, entries: Entries): DayView {
  const plan = plans[person];
  let mode: Mode | null = null;
  let menuDay = day;
  if (person === "antonio") {
    mode = getMode(entries, day);
    menuDay = pickMenuDay(day, mode, plans.antonio, plans.gilda);
  }
  const morning = getMorning(entries, person, day);
  const menu = plan.days[menuDay] ?? EMPTY_DAY;

  const meals: MealView[] = resolveMeals(menu, morning).map((rm) => ({
    meal: rm.meal,
    source: rm.source,
    swapped: rm.swapped,
    items: rm.slots
      .filter((slot) => slot.options.length > 0)
      .map((slot, slotIdx) => {
        // Le scelte sono legate al pasto d'origine, così non si perdono cambiando il timing.
        const raw = getAlt(entries, person, day, menuDay, rm.source, slotIdx);
        const optionIdx = raw < slot.options.length ? raw : 0;
        return { slotIdx, optionIdx, option: slot.options[optionIdx], options: slot.options };
      }),
  }));

  return { person, day, menuDay, mode, morning, meals: MEAL_ORDER.map((m) => meals.find((x) => x.meal === m)!) };
}
