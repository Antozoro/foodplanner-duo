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

/** Un alimento di un pasto salvato. */
export interface SnapItem {
  name: string;
  grams: number;
}

export interface SnapMeal {
  meal: MealId;
  source: MealId;
  swapped: boolean;
  menuIdx: number;
  items: SnapItem[];
}

/**
 * Giorno salvato (bloccato): tutto ciò che si vede quel giorno, com'era al momento del salvataggio.
 * Non cambia più finché non lo sblocchi, nemmeno se cambiano gli altri giorni o il piano.
 */
export interface DaySnapshot {
  v: 1;
  savedAt: number;
  mode: Mode;
  antonioMorning: boolean;
  gildaMorning: boolean;
  /** Pasti di Antonio e di Gilda (indici dei menù del PDF), per non spostare gli altri giorni. */
  aL: number;
  aD: number;
  aBase: number;
  gL: number;
  gD: number;
  gBase: number;
  antonio: SnapMeal[];
  gilda: SnapMeal[];
  notes: { meal: MealId; text: string }[];
}
