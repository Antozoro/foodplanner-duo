export type PersonId = "antonio" | "gilda";

export type MealId = "colazione" | "spuntino" | "pranzo" | "merenda" | "cena";

/** Un alimento con la sua grammatura (come scritto nel piano del nutrizionista). */
export interface FoodOption {
  id: string;
  name: string;
  grams: number;
}

/**
 * Uno "slot" di un pasto: options[0] è l'alimento FISSO del piano,
 * le altre sono le ALTERNATIVE previste dal nutrizionista (con la grammatura equivalente).
 */
export interface Slot {
  id: string;
  options: FoodOption[];
}

export type DayMeals = Record<MealId, Slot[]>;

/** Piano di una persona: days[0] = Lunedì ... days[6] = Domenica. */
export interface DietPlan {
  person: PersonId;
  title?: string;
  /** Data di importazione (ISO). Assente per il piano iniziale incluso nel codice. */
  importedAt?: string;
  days: DayMeals[];
}

export type Mode = "ON" | "OFF";

export type EntryValue = string | number | boolean | null;

/** Stato condiviso: ogni chiave ha valore + timestamp (vince l'ultima modifica). */
export type Entries = Record<string, { v: EntryValue; t: number }>;
