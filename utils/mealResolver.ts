import { MEAL_ORDER } from "@/lib/config";
import type { DayMeals, MealId, Slot } from "@/lib/types";

export interface ResolvedMeal {
  /** Pasto mostrato (nella posizione della giornata). */
  meal: MealId;
  /** Pasto del piano da cui arrivano gli slot (diverso da `meal` se c'è lo scambio). */
  source: MealId;
  swapped: boolean;
  slots: Slot[];
}

/**
 * Restituisce i pasti effettivi di una giornata.
 * Con `morningTraining` attivo, PRANZO e CENA si scambiano
 * (il pasto più carico segue l'allenamento). Funzione pura: non modifica l'input.
 */
export function resolveMeals(day: DayMeals, morningTraining: boolean): ResolvedMeal[] {
  return MEAL_ORDER.map((meal) => {
    let source: MealId = meal;
    if (morningTraining) {
      if (meal === "pranzo") source = "cena";
      else if (meal === "cena") source = "pranzo";
    }
    return { meal, source, swapped: source !== meal, slots: day[source] ?? [] };
  });
}
