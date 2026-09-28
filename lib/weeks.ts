import { DAY_LABELS, MEALS, PEOPLE } from "./config";
import { buildWeek, type DayPair, type DayView, type Plans } from "./dayView";
import { getText, keys } from "./entries";
import type { Entries, EntryValue, MealId, Mode, PersonId } from "./types";
import { alignKey } from "@/utils/ingredients";
import { poolMenus } from "@/utils/menuMatcher";

/** Un'alternativa scelta a mano, ricordata per nome dell'ingrediente (non per posizione). */
export interface SavedPick {
  person: PersonId;
  meal: MealId;
  slot: number;
  key: string;
}

type PerMeal = { pranzo: string; cena: string };

/**
 * Un giorno di una settimana salvata. Ricorda le SCELTE (ON/OFF, orari, quale pasto, alternative,
 * verdure, testi), non gli alimenti: alimenti e grammature vengono sempre dal piano in vigore.
 */
export interface SavedDay {
  mode: Mode;
  antonioMorning: boolean;
  gildaMorning: boolean;
  /** Pasti che avevi scelto a mano (indice del menù del PDF). */
  forced: { antonioL?: number; antonioD?: number; gildaL?: number; gildaD?: number };
  /** Pasti effettivamente usati quel giorno (servono quando carichi un solo giorno). */
  menus: { antonioL: number; antonioD: number; gildaL: number; gildaD: number };
  picks: SavedPick[];
  veg: Record<PersonId, PerMeal>;
  notes: Record<PersonId, PerMeal>;
}

export interface SavedWeek {
  v: 1;
  id: string;
  name: string;
  savedAt: number;
  days: SavedDay[];
}

const PERSON_IDS: PersonId[] = ["antonio", "gilda"];
const SIDES = ["pranzo", "cena"] as const;

const personName = (p: PersonId) => PEOPLE.find((x) => x.id === p)!.name;
const FEMININE: MealId[] = ["cena", "colazione", "merenda"];
const mealLabel = (m: MealId) => MEALS.find((x) => x.id === m)!.label.toLowerCase();
/** "il pranzo" / "la cena", "del pranzo" / "della cena". */
const theMeal = (m: MealId) => `${FEMININE.includes(m) ? "la" : "il"} ${mealLabel(m)}`;
const ofMeal = (m: MealId) => `${m === "spuntino" ? "dello" : FEMININE.includes(m) ? "della" : "del"} ${mealLabel(m)}`;

/** Tutte le settimane salvate, dalla più recente. */
export function listWeeks(entries: Entries): SavedWeek[] {
  const out: SavedWeek[] = [];
  for (const [k, e] of Object.entries(entries)) {
    if (!k.startsWith("wk:") || typeof e.v !== "string" || !e.v) continue;
    try {
      const w = JSON.parse(e.v) as SavedWeek;
      if (w && w.v === 1 && typeof w.name === "string" && Array.isArray(w.days) && w.days.length === 7) out.push(w);
    } catch {
      /* voce rovinata: la salto */
    }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

/** Fotografia delle scelte della settimana attuale. */
export function captureWeek(name: string, days: DayPair[], entries: Entries): SavedWeek {
  const mealOf = (view: DayView, meal: MealId) => view.meals.find((m) => m.meal === meal)!;
  const perMeal = (read: (p: PersonId, m: "pranzo" | "cena") => string, p: PersonId): PerMeal => ({
    pranzo: read(p, "pranzo"),
    cena: read(p, "cena"),
  });

  const savedDays: SavedDay[] = days.map((pair) => {
    // un giorno bloccato conta come scelto da te; per gli altri conta solo ciò che hai scelto a mano
    const grab = (view: DayView, meal: "pranzo" | "cena") => {
      const mv = mealOf(view, meal);
      return pair.locked || mv.forcedSource ? mv.menuIdx : undefined;
    };
    const forced: SavedDay["forced"] = {};
    const aL = grab(pair.antonio, "pranzo");
    const aD = grab(pair.antonio, "cena");
    const gL = grab(pair.gilda, "pranzo");
    const gD = grab(pair.gilda, "cena");
    if (aL !== undefined) forced.antonioL = aL;
    if (aD !== undefined) forced.antonioD = aD;
    if (gL !== undefined) forced.gildaL = gL;
    if (gD !== undefined) forced.gildaD = gD;

    const picks: SavedPick[] = [];
    for (const view of [pair.antonio, pair.gilda]) {
      for (const mv of view.meals) {
        for (const item of mv.items) {
          if (item.explicit) picks.push({ person: view.person, meal: mv.meal, slot: item.slotIdx, key: alignKey(item.option.name) });
        }
      }
    }

    return {
      mode: pair.antonio.mode ?? "ON",
      antonioMorning: pair.antonio.morning,
      gildaMorning: pair.gilda.morning,
      forced,
      menus: {
        antonioL: mealOf(pair.antonio, "pranzo").menuIdx,
        antonioD: mealOf(pair.antonio, "cena").menuIdx,
        gildaL: mealOf(pair.gilda, "pranzo").menuIdx,
        gildaD: mealOf(pair.gilda, "cena").menuIdx,
      },
      picks,
      veg: {
        antonio: perMeal((p, m) => getText(entries, keys.veg(p, pair.day, m)), "antonio"),
        gilda: perMeal((p, m) => getText(entries, keys.veg(p, pair.day, m)), "gilda"),
      },
      notes: {
        antonio: perMeal((p, m) => getText(entries, keys.note(p, pair.day, m)), "antonio"),
        gilda: perMeal((p, m) => getText(entries, keys.note(p, pair.day, m)), "gilda"),
      },
    };
  });

  return { v: 1, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, savedAt: Date.now(), days: savedDays };
}

/**
 * Cosa scrivere per caricare una settimana (o un solo giorno) al posto di quella attuale.
 * Le scelte tornano com'erano, ma alimenti e grammature vengono dal piano in vigore: quello che nel piano
 * non esiste più non si ripristina (si usa il consigliato) e finisce tra gli avvisi.
 * `maps` dice da quale giorno salvato a quale giorno di adesso; `useMenus` fissa i pasti effettivamente
 * usati (serve per un solo giorno), altrimenti si fissano solo quelli che erano stati scelti a mano.
 */
export function applyWeek(
  plans: Plans,
  entries: Entries,
  saved: SavedWeek,
  maps: { from: number; to: number }[],
  useMenus: boolean,
): { updates: [string, EntryValue][]; warnings: string[] } {
  const now = Date.now();
  const next: Entries = { ...entries };
  const updates = new Map<string, EntryValue>();
  const put = (k: string, v: EntryValue) => {
    updates.set(k, v);
    next[k] = { v, t: now };
  };
  const warnings: string[] = [];
  const nA = plans.antonio.days.length;
  const nG = plans.gilda.days.length;

  // 1) azzero tutto ciò che riguarda i giorni di destinazione (blocchi, scelte, verdure, testi)
  const targets = [...new Set(maps.map((m) => m.to))];
  const clear = targets.map(
    (t) => new RegExp(`^(?:(?:lock|mode):${t}|(?:morning|src|veg|note|alt):(?:antonio|gilda):${t}(?::.*)?)$`),
  );
  for (const [k, e] of Object.entries(entries)) {
    if (e.v !== null && clear.some((re) => re.test(k))) put(k, null);
  }

  // 2) scrivo le scelte salvate
  for (const { from, to } of maps) {
    const sd = saved.days[from];
    if (!sd) continue;
    put(keys.mode(to), sd.mode);
    put(keys.morning("antonio", to), sd.antonioMorning);
    put(keys.morning("gilda", to), sd.gildaMorning);

    const antonioPool = poolMenus(sd.mode, nA);
    const wanted = useMenus ? sd.menus : sd.forced;
    const picks: [PersonId, "pranzo" | "cena", number | undefined][] = [
      ["antonio", "pranzo", wanted.antonioL],
      ["antonio", "cena", wanted.antonioD],
      ["gilda", "pranzo", wanted.gildaL],
      ["gilda", "cena", wanted.gildaD],
    ];
    for (const [person, meal, value] of picks) {
      if (value === undefined) continue;
      const ok = person === "antonio" ? antonioPool.includes(value) : value >= 0 && value < nG;
      if (ok) put(keys.src(person, to, meal), value);
      else warnings.push(`${DAY_LABELS[to]}: ${theMeal(meal)} scelto per ${personName(person)} non è più previsto nel piano, uso quello consigliato.`);
    }

    for (const person of PERSON_IDS) {
      for (const meal of SIDES) {
        const veg = sd.veg?.[person]?.[meal];
        if (veg) put(keys.veg(person, to, meal), veg);
        const note = sd.notes?.[person]?.[meal];
        if (note) put(keys.note(person, to, meal), note);
      }
    }
  }

  // 3) con la settimana così impostata trovo dove cadono le alternative e le rimetto per nome
  const week = buildWeek(plans, next);
  for (const { from, to } of maps) {
    const sd = saved.days[from];
    if (!sd) continue;
    const pair = week.days[to];
    for (const pick of sd.picks) {
      const mv = pair[pick.person].meals.find((m) => m.meal === pick.meal);
      const item = mv?.items[pick.slot];
      const idx = item ? item.options.findIndex((o) => alignKey(o.name) === pick.key) : -1;
      if (mv && idx >= 0) put(keys.alt(pick.person, to, mv.menuIdx, mv.source, pick.slot), idx);
      else {
        warnings.push(
          `${DAY_LABELS[to]}: “${pick.key}” non c’è più tra le alternative ${ofMeal(pick.meal)} di ${personName(pick.person)}, uso quella consigliata.`,
        );
      }
    }
  }

  return { updates: [...updates], warnings: [...new Set(warnings)] };
}
