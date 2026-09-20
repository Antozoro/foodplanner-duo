import { ANTONIO_ON_DAYS } from "./config";
import type { Entries, EntryValue, MealId, Mode, PersonId } from "./types";

/* Chiavi dello stato condiviso */
export const keys = {
  mode: (day: number) => `mode:${day}`,
  morning: (person: PersonId, day: number) => `morning:${person}:${day}`,
  alt: (person: PersonId, day: number, menuDay: number, meal: MealId, slotIdx: number) =>
    `alt:${person}:${day}:${menuDay}:${meal}:${slotIdx}`,
  altPrefix: (person: PersonId) => `alt:${person}:`,
  check: (itemKey: string) => `check:${itemKey}`,
};

/** Unisce due stati: per ogni chiave vince il valore più recente. */
export function mergeEntries(a: Entries, b: Entries): Entries {
  const out: Entries = { ...a };
  for (const [key, entry] of Object.entries(b)) {
    const cur = out[key];
    if (!cur || entry.t > cur.t) out[key] = entry;
  }
  return out;
}

export function getValue(entries: Entries, key: string): EntryValue | undefined {
  return entries[key]?.v;
}

/** ON/OFF di Antonio per un giorno (se non impostato: Lun-Gio ON, Ven-Dom OFF). */
export function getMode(entries: Entries, day: number): Mode {
  const v = getValue(entries, keys.mode(day));
  if (v === "ON" || v === "OFF") return v;
  return ANTONIO_ON_DAYS.includes(day) ? "ON" : "OFF";
}

/** true se l'allenamento è al mattino (pranzo e cena si scambiano). */
export function getMorning(entries: Entries, person: PersonId, day: number): boolean {
  return getValue(entries, keys.morning(person, day)) === true;
}

/** Indice dell'alternativa scelta per uno slot (0 = alimento fisso). */
export function getAlt(
  entries: Entries,
  person: PersonId,
  day: number,
  menuDay: number,
  meal: MealId,
  slotIdx: number,
): number {
  const v = getValue(entries, keys.alt(person, day, menuDay, meal, slotIdx));
  return typeof v === "number" && v >= 0 ? v : 0;
}
