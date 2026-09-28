import { buildWeek, type DayPair, type Plans, type Week } from "./dayView";
import { getMode, keys } from "./entries";
import type { Entries, EntryValue } from "./types";

// Le chiavi legate a un giorno: blocco e ON/OFF (lock:1, mode:1) oppure orari, pasti scelti,
// verdure, testi e alternative di una persona (morning:antonio:1, alt:gilda:1:2:pranzo:0, ...).
const DAY_KEY = /^(?:(lock|mode):(\d)|(morning|src|veg|note|alt):(antonio|gilda):(\d)(:.*)?)$/;

function dayOf(key: string): number | null {
  const m = DAY_KEY.exec(key);
  return m ? Number(m[2] ?? m[5]) : null;
}

function withDay(key: string, day: number): string {
  return key.replace(DAY_KEY, (_all, k1, _d1, k2, person, _d2, rest) => (k1 ? `${k1}:${day}` : `${k2}:${person}:${day}${rest ?? ""}`));
}

/** Ciò che si vede in un giorno: per capire se è cambiato. */
const daySignature = (p: DayPair) =>
  JSON.stringify([
    p.antonio.mode,
    p.antonio.morning,
    p.gilda.morning,
    p.antonio.meals.map((m) => m.items.map((i) => i.option.name + i.option.grams)),
    p.gilda.meals.map((m) => m.items.map((i) => i.option.name + i.option.grams)),
  ]);

/** Fissa pranzo e cena di un giorno com'erano (l'app non li sposta più). */
function freeze(out: Map<string, EntryValue>, pair: DayPair, day: number) {
  for (const view of [pair.antonio, pair.gilda]) {
    for (const meal of ["pranzo", "cena"] as const) {
      out.set(keys.src(view.person, day, meal), view.meals.find((m) => m.meal === meal)!.menuIdx);
    }
  }
}

/**
 * Cosa scrivere per invertire due giorni: ognuno prende tutto ciò che aveva l'altro
 * (ON/OFF, orari, pasti, alternative, verdure, testi e l'eventuale blocco).
 * I pasti dei due giorni vengono fissati com'erano, così arrivano identici. Se per questo l'app
 * riorganizza altri giorni, anche quelli vengono fissati com'erano: gli altri giorni non cambiano.
 */
export function swapDays(plans: Plans, entries: Entries, week: Week, a: number, b: number): [string, EntryValue][] {
  const out = new Map<string, EntryValue>();
  const days = [a, b];

  // 1) svuoto ciò che c'è adesso sui due giorni
  for (const [k, e] of Object.entries(entries)) {
    const d = dayOf(k);
    if (d !== null && days.includes(d) && e.v !== null) out.set(k, null);
  }

  // 2) porto ogni giorno sull'altro
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const [k, e] of Object.entries(entries)) {
      if (e.v === null || dayOf(k) !== from) continue;
      if (k.startsWith("src:") || k.startsWith("mode:")) continue; // li riscrivo qui sotto
      out.set(withDay(k, to), e.v);
    }
    const pair = week.days[from];
    out.set(keys.mode(to), pair.antonio.mode ?? getMode(entries, from));
    freeze(out, pair, to);
  }

  // 3) se gli altri giorni si spostano per effetto dell'inversione, li fisso com'erano
  const frozen = new Set<number>(days);
  for (let round = 0; round < 6; round++) {
    const t = Date.now();
    const merged: Entries = { ...entries };
    for (const [k, v] of out) merged[k] = { v, t };
    const after = buildWeek(plans, merged);
    const moved = after.days.filter((d) => !frozen.has(d.day) && !week.days[d.day].locked && daySignature(d) !== daySignature(week.days[d.day]));
    if (moved.length === 0) break;
    for (const d of moved) {
      freeze(out, week.days[d.day], d.day);
      frozen.add(d.day);
    }
  }
  return [...out];
}
