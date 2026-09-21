import type { Week } from "@/lib/dayView";
import { keys } from "@/lib/entries";
import type { Entries } from "@/lib/types";
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

/** Verdure scelte nella settimana (senza quantità: sono libere), in ordine alfabetico. */
export function buildVegetables(entries: Entries): string[] {
  const out = new Set<string>();
  for (let day = 0; day < 7; day++) {
    for (const person of ["antonio", "gilda"] as const) {
      for (const meal of ["pranzo", "cena"] as const) {
        const v = entries[keys.veg(person, day, meal)]?.v;
        if (typeof v === "string" && v) out.add(v);
      }
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b, "it"));
}
