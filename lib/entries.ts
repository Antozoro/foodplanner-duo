import { ANTONIO_ON_DAYS } from "./config";
import type { DaySnapshot, Entries, EntryValue, MealId, Mode, PersonId } from "./types";
import type { Forced } from "@/utils/menuMatcher";

/* Chiavi dello stato condiviso */
export const keys = {
  mode: (day: number) => `mode:${day}`,
  morning: (person: PersonId, day: number) => `morning:${person}:${day}`,
  alt: (person: PersonId, day: number, menuDay: number, meal: MealId, slotIdx: number) =>
    `alt:${person}:${day}:${menuDay}:${meal}:${slotIdx}`,
  altPrefix: (person: PersonId) => `alt:${person}:`,
  /** Pasto scelto a mano per pranzo o cena (indice del menù del PDF). */
  src: (person: PersonId, day: number, meal: "pranzo" | "cena") => `src:${person}:${day}:${meal}`,
  /** Giorno salvato (bloccato): contiene il giorno com'era al momento del salvataggio. */
  lock: (day: number) => `lock:${day}`,
  /** Codice (in forma cifrata) per modificare i giorni salvati. */
  pin: "pin",
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

/** Il giorno salvato, se c'è. */
export function readSnapshot(entries: Entries, day: number): DaySnapshot | null {
  const raw = getValue(entries, keys.lock(day));
  if (typeof raw !== "string" || !raw) return null;
  try {
    const s = JSON.parse(raw) as DaySnapshot;
    return s && s.v === 1 && Array.isArray(s.antonio) && Array.isArray(s.gilda) ? s : null;
  } catch {
    return null;
  }
}

/** Scelte fatte a mano su quale menù/pasto usare in ogni giorno (i giorni salvati restano com'erano). */
export function forcedPicks(entries: Entries): Forced {
  const days = Array.from({ length: 7 }, (_, d) => d);
  const out: Forced = {
    antonioL: days.map((d) => numberOrUndefined(getValue(entries, keys.src("antonio", d, "pranzo")))),
    antonioD: days.map((d) => numberOrUndefined(getValue(entries, keys.src("antonio", d, "cena")))),
    gildaL: days.map((d) => numberOrUndefined(getValue(entries, keys.src("gilda", d, "pranzo")))),
    gildaD: days.map((d) => numberOrUndefined(getValue(entries, keys.src("gilda", d, "cena")))),
  };
  for (const d of days) {
    const snap = readSnapshot(entries, d);
    if (snap) {
      out.antonioL[d] = snap.aL;
      out.antonioD[d] = snap.aD;
      out.gildaL[d] = snap.gL;
      out.gildaD[d] = snap.gD;
    }
  }
  return out;
}

/** Testo scritto per un pasto (stringa vuota se non c'è nulla). */
export function getText(entries: Entries, key: string): string {
  const v = getValue(entries, key);
  return typeof v === "string" ? v : "";
}
