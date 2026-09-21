import { ANTONIO_ON_DAYS } from "./config";
import type { Entries, EntryValue, MealId, Mode, PersonId } from "./types";
import type { Forced } from "@/utils/menuMatcher";

/* Chiavi dello stato condiviso */
export const keys = {
  mode: (day: number) => `mode:${day}`,
  morning: (person: PersonId, day: number) => `morning:${person}:${day}`,
  alt: (person: PersonId, day: number, menuDay: number, meal: MealId, slotIdx: number) =>
    `alt:${person}:${day}:${menuDay}:${meal}:${slotIdx}`,
  altPrefix: (person: PersonId) => `alt:${person}:`,
  /** Pasto di Antonio scelto a mano per pranzo o cena (indice del menù del PDF). */
  src: (day: number, meal: "pranzo" | "cena") => `src:antonio:${day}:${meal}`,
  /** Menù di Gilda scelto a mano per un giorno (indice del menù del PDF). */
  gmenu: (day: number) => `gmenu:${day}`,
  check: (itemKey: string) => `check:${itemKey}`,
  /** Cosa cucinano a pranzo o a cena (testo libero). */
  note: (person: PersonId, day: number, meal: "pranzo" | "cena") => `note:${person}:${day}:${meal}`,
  /** Verdura scelta per un pasto. */
  veg: (person: PersonId, day: number, meal: "pranzo" | "cena") => `veg:${person}:${day}:${meal}`,
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

const numberOrUndefined = (v: EntryValue | undefined) => (typeof v === "number" && v >= 0 ? v : undefined);

/** Scelte fatte a mano su quale menù/pasto usare in ogni giorno. */
export function forcedPicks(entries: Entries): Forced {
  const days = Array.from({ length: 7 }, (_, d) => d);
  return {
    gilda: days.map((d) => numberOrUndefined(getValue(entries, keys.gmenu(d)))),
    antonioL: days.map((d) => numberOrUndefined(getValue(entries, keys.src(d, "pranzo")))),
    antonioD: days.map((d) => numberOrUndefined(getValue(entries, keys.src(d, "cena")))),
  };
}

/** Testo scritto per un pasto (stringa vuota se non c'è nulla). */
export function getText(entries: Entries, key: string): string {
  const v = getValue(entries, key);
  return typeof v === "string" ? v : "";
}
