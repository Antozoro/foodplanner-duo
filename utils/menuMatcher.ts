import { ANTONIO_ON_DAYS, MEAL_ORDER } from "@/lib/config";
import type { DayMeals, DietPlan, Mode } from "@/lib/types";
import { normalizeIngredient } from "./ingredients";

/** Ingredienti "principali" di una giornata: gli alimenti FISSI di tutti i pasti. */
export function mainIngredients(day: DayMeals): Set<string> {
  const out = new Set<string>();
  for (const meal of MEAL_ORDER) {
    for (const slot of day[meal] ?? []) {
      const main = slot.options[0];
      if (main) out.add(normalizeIngredient(main.name));
    }
  }
  return out;
}

/** Quanti ingredienti principali hanno in comune due giornate. */
export function overlapScore(a: DayMeals, b: DayMeals): number {
  const setA = mainIngredients(a);
  let score = 0;
  for (const ing of mainIngredients(b)) if (setA.has(ing)) score++;
  return score;
}

export function modeOfDay(day: number, onDays: number[] = ANTONIO_ON_DAYS): Mode {
  return onDays.includes(day) ? "ON" : "OFF";
}

/**
 * Sceglie quale menù di Antonio usare in un giorno.
 * - Se la modalità richiesta è quella "naturale" del giorno, usa il menù del giorno.
 * - Altrimenti sceglie, tra i menù della modalità richiesta, quello con più ingredienti
 *   in comune con il menù di Gilda di quel giorno. A parità, ruota in modo fisso.
 */
export function pickMenuDay(
  day: number,
  mode: Mode,
  antonio: DietPlan,
  gilda: DietPlan,
  onDays: number[] = ANTONIO_ON_DAYS,
): number {
  if (modeOfDay(day, onDays) === mode) return day;
  const candidates = antonio.days.map((_, i) => i).filter((i) => modeOfDay(i, onDays) === mode);
  if (candidates.length === 0) return day;
  const gildaDay = gilda.days[day];
  if (!gildaDay) return candidates[day % candidates.length];

  const start = day % candidates.length;
  let best = candidates[start];
  let bestScore = -1;
  for (let step = 0; step < candidates.length; step++) {
    const cand = candidates[(start + step) % candidates.length];
    const score = overlapScore(gildaDay, antonio.days[cand]);
    if (score > bestScore) {
      best = cand;
      bestScore = score;
    }
  }
  return best;
}
