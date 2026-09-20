import { ANTONIO_ON_DAYS, MEAL_ORDER } from "@/lib/config";
import type { DayMeals, DietPlan, MealId, Mode, Slot } from "@/lib/types";
import { alignKey } from "./ingredients";

/** Com'è impostata una giornata: ON/OFF di Antonio e orario dell'allenamento di entrambi. */
export interface DayFlags {
  mode: Mode;
  antonioMorning: boolean;
  gildaMorning: boolean;
}

/** Per ogni giorno della settimana (0 = Lun): quale menù del PDF usa ciascuno. */
export interface Placement {
  antonio: number[];
  gilda: number[];
}

/** Tipo di un menù di Antonio: i primi 4 del PDF sono ON, gli altri OFF. */
export function modeOfMenu(idx: number, onDays: number[] = ANTONIO_ON_DAYS): Mode {
  return onDays.includes(idx) ? "ON" : "OFF";
}

interface MealSets {
  /** Ingredienti FISSI del pasto. */
  main: Set<string>;
  /** Tutti gli ingredienti che il pasto permette (fissi + alternative). */
  opts: Set<string>;
}

function mealSets(slots: Slot[]): MealSets {
  const main = new Set<string>();
  const opts = new Set<string>();
  for (const slot of slots) {
    slot.options.forEach((o, i) => {
      const key = alignKey(o.name);
      opts.add(key);
      if (i === 0) main.add(key);
    });
  }
  return { main, opts };
}

function menuSets(day: DayMeals): Record<MealId, MealSets> {
  const out = {} as Record<MealId, MealSets>;
  for (const meal of MEAL_ORDER) out[meal] = mealSets(day[meal] ?? []);
  return out;
}

/** Con l'allenamento al mattino pranzo e cena si scambiano. */
function sourceMeal(meal: MealId, morning: boolean): MealId {
  if (!morning) return meal;
  if (meal === "pranzo") return "cena";
  if (meal === "cena") return "pranzo";
  return meal;
}

/**
 * Quanto si "assomigliano" due giornate, pasto per pasto: conta gli ingredienti fissi
 * di uno che l'altro può mangiare (fissi o alternative), e viceversa.
 */
function affinity(
  g: Record<MealId, MealSets>,
  gMorning: boolean,
  a: Record<MealId, MealSets>,
  aMorning: boolean,
): number {
  let score = 0;
  for (const meal of MEAL_ORDER) {
    const G = g[sourceMeal(meal, gMorning)];
    const A = a[sourceMeal(meal, aMorning)];
    // pesa di più ciò che Gilda ha e Antonio può avere (il suo piano è quello più vincolato)
    for (const x of G.main) if (A.opts.has(x)) score += 2;
    for (const x of A.main) if (G.opts.has(x)) score += 1;
  }
  return score;
}

/**
 * Decide quale menù usare in ogni giorno, per far coincidere il più possibile gli ingredienti:
 * - i 7 menù di Gilda possono andare in qualsiasi giorno (ognuno una volta);
 * - i giorni ON di Antonio usano i menù ON, quelli OFF i menù OFF (si scambiano liberamente
 *   dentro il proprio tipo; se un tipo ha più giorni che menù, i menù si ripetono in modo uniforme).
 * A parità di risultato si tiene la disposizione "naturale" (lunedì al lunedì...).
 */
export function planPlacement(
  antonio: DietPlan,
  gilda: DietPlan,
  flags: DayFlags[],
  onDays: number[] = ANTONIO_ON_DAYS,
): Placement {
  const nDays = flags.length;
  const nG = gilda.days.length;
  const nA = antonio.days.length;
  const natural = (n: number) => Array.from({ length: nDays }, (_, d) => Math.min(d, Math.max(0, n - 1)));
  if (nG !== nDays || nA === 0) return { antonio: natural(nA), gilda: natural(nG) };

  const allA = Array.from({ length: nA }, (_, i) => i);
  const menusOf = (t: Mode) => {
    const ids = allA.filter((i) => modeOfMenu(i, onDays) === t);
    return ids.length ? ids : allA;
  };
  const menus: Record<Mode, number[]> = { ON: menusOf("ON"), OFF: menusOf("OFF") };
  const count: Record<Mode, number> = {
    ON: flags.filter((f) => f.mode === "ON").length,
    OFF: flags.filter((f) => f.mode === "OFF").length,
  };
  const cap: Record<Mode, number> = {
    ON: Math.max(1, Math.ceil(count.ON / menus.ON.length)),
    OFF: Math.max(1, Math.ceil(count.OFF / menus.OFF.length)),
  };

  const gSets = gilda.days.map(menuSets);
  const aSets = antonio.days.map(menuSets);
  const score = flags.map((f, d) =>
    gSets.map((gs, g) =>
      aSets.map((as, a) => affinity(gs, f.gildaMorning, as, f.antonioMorning) * 100 + (g === d ? 1 : 0) + (a === d ? 1 : 0)),
    ),
  );

  const memo = new Map<string, { v: number; g: number; a: number }>();
  const usage: number[] = Array(nA).fill(0);
  const solve = (d: number, mask: number): { v: number; g: number; a: number } => {
    if (d === nDays) return { v: 0, g: -1, a: -1 };
    const key = `${d}|${mask}|${usage.join(",")}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const t = flags[d].mode;
    let best = { v: -Infinity, g: -1, a: -1 };
    for (let g = 0; g < nG; g++) {
      if (mask & (1 << g)) continue;
      for (const a of menus[t]) {
        if (usage[a] >= cap[t]) continue;
        usage[a]++;
        const v = score[d][g][a] + solve(d + 1, mask | (1 << g)).v;
        usage[a]--;
        if (v > best.v) best = { v, g, a };
      }
    }
    memo.set(key, best);
    return best;
  };

  const out: Placement = { antonio: [], gilda: [] };
  let mask = 0;
  for (let d = 0; d < nDays; d++) {
    const step = solve(d, mask);
    if (step.g < 0) return { antonio: natural(nA), gilda: natural(nG) };
    out.gilda.push(step.g);
    out.antonio.push(step.a);
    mask |= 1 << step.g;
    usage[step.a]++;
  }
  return out;
}
