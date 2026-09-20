import type { Week } from "@/lib/dayView";
import { normalizeIngredient } from "./ingredients";

export interface ShoppingItem {
  /** Chiave stabile (nome canonico) usata anche per le spunte. */
  key: string;
  name: string;
  grams: number;
}

/** Spesa dell'intera settimana (Lun-Dom, Antonio + Gilda), con ON/OFF, allineamento e alternative scelte. */
export function buildShopping(week: Week): ShoppingItem[] {
  const totals = new Map<string, number>();
  for (const pair of week.days) {
    for (const view of [pair.antonio, pair.gilda]) {
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
