import type { MealId, PersonId } from "./types";

export const DAY_LABELS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
export const DAY_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export const MEALS: { id: MealId; label: string }[] = [
  { id: "colazione", label: "Colazione" },
  { id: "spuntino", label: "Spuntino" },
  { id: "pranzo", label: "Pranzo" },
  { id: "merenda", label: "Merenda" },
  { id: "cena", label: "Cena" },
];

export const MEAL_ORDER: MealId[] = MEALS.map((m) => m.id);

export const PEOPLE: { id: PersonId; name: string }[] = [
  { id: "antonio", name: "Antonio" },
  { id: "gilda", name: "Gilda" },
];

/**
 * Giorni "ON" (allenamento) del piano di Antonio: Lunedì-Giovedì.
 * Gli altri (Venerdì-Domenica) sono i giorni "OFF" (riposo).
 * Sono anche i valori di partenza dei toggle.
 */
export const ANTONIO_ON_DAYS = [0, 1, 2, 3];

/** Riga condivisa in Supabase (una sola "casa"). */
export const HOUSEHOLD_ID = "casa";
