import { buildDayView, type Plans } from "@/lib/dayView";
import type { Entries, PersonId } from "@/lib/types";
import { normalizeIngredient } from "./ingredients";

export interface ShoppingItem {
  /** Chiave stabile (nome canonico) usata anche per le spunte. */
  key: string;
  name: string;
  grams: number;
}

const PERSONS: PersonId[] = ["antonio", "gilda"];

/** Spesa dell'intera settimana (Lun-Dom, Antonio + Gilda), con ON/OFF e alternative scelte. */
export function buildShopping(plans: Plans, entries: Entries): ShoppingItem[] {
  const totals = new Map<string, number>();
  for (const person of PERSONS) {
    for (let day = 0; day < 7; day++) {
      const view = buildDayView(person, day, plans, entries);
      for (const meal of view.meals) {
        for (const item of meal.items) {
          const name = normalizeIngredient(item.option.name);
          totals.set(name, (totals.get(name) ?? 0) + item.option.grams);
        }
      }
    }
  }
  return [...totals.entries()]
    .map(([name, grams]) => ({ key: name.toLowerCase(), name, grams }))
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
}
