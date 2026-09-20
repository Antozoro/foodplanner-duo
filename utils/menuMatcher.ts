import { ANTONIO_ON_DAYS, MEAL_ORDER } from "@/lib/config";
import type { DayMeals, DietPlan, MealId, Mode, Slot } from "@/lib/types";
import { alignKey } from "./ingredients";
import { keysOf, resolveRepeats, type Cell } from "./mealAlign";

/** Com'è impostata una giornata: ON/OFF di Antonio e orario dell'allenamento di entrambi. */
export interface DayFlags {
  mode: Mode;
  antonioMorning: boolean;
  gildaMorning: boolean;
}

/** Scelte fatte a mano (un valore per giorno, undefined = decide l'app). */
export interface Forced {
  gilda: (number | undefined)[];
  antonioL: (number | undefined)[];
  antonioD: (number | undefined)[];
}

/**
 * Per ogni giorno (0 = Lun): quale menù di Gilda, e da quale menù del PDF arrivano
 * il pranzo, la cena e gli altri pasti di Antonio.
 */
export interface Placement {
  gilda: number[];
  antonioL: number[];
  antonioD: number[];
  antonioBase: number[];
}

export const noForced = (n = 7): Forced => ({
  gilda: Array(n).fill(undefined),
  antonioL: Array(n).fill(undefined),
  antonioD: Array(n).fill(undefined),
});

/** Tipo di un menù di Antonio: i primi 4 del PDF sono ON, gli altri OFF. */
export function modeOfMenu(idx: number, onDays: number[] = ANTONIO_ON_DAYS): Mode {
  return onDays.includes(idx) ? "ON" : "OFF";
}

/** I menù del PDF di Antonio da cui si possono prendere i pasti di un giorno ON o OFF. */
export function poolMenus(mode: Mode, nMenus: number, onDays: number[] = ANTONIO_ON_DAYS): number[] {
  const all = Array.from({ length: nMenus }, (_, i) => i);
  const ids = all.filter((i) => modeOfMenu(i, onDays) === mode);
  return ids.length ? ids : all;
}

interface MealSets {
  main: Set<string>;
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

/** Quanto due pasti si assomigliano: pesa di più ciò che Gilda ha e Antonio può avere. */
function affinity(g: MealSets, a: MealSets): number {
  let score = 0;
  for (const x of g.main) if (a.opts.has(x)) score += 2;
  for (const x of a.main) if (g.opts.has(x)) score += 1;
  return score;
}

const cellsOf = (person: "A" | "G", meal: "L" | "D", slots: Slot[]): Cell[] =>
  slots.map((s) => ({ person, meal, keys: keysOf(s), idx: 0, locked: false, link: null }));

/**
 * Decide, per ogni giorno, quale menù di Gilda e quali pasti di Antonio usare per far coincidere
 * gli ingredienti, senza ripetere lo stesso ingrediente a pranzo e a cena:
 * - i 7 menù di Gilda possono andare in qualsiasi giorno (ognuno una volta);
 * - Antonio, in un giorno ON, prende pranzo e cena dai pasti ON; in un giorno OFF dai pasti OFF.
 *   Ogni pranzo ON si scambia con un altro pranzo ON, ogni cena ON con un'altra cena ON (e lo stesso per OFF);
 * - le scelte fatte a mano restano fisse e il resto si organizza intorno.
 */
export function planPlacement(
  antonio: DietPlan,
  gilda: DietPlan,
  flags: DayFlags[],
  forced: Forced = noForced(flags.length),
  onDays: number[] = ANTONIO_ON_DAYS,
): Placement {
  const nDays = flags.length;
  const nG = gilda.days.length;
  const nA = antonio.days.length;
  const natural = (n: number) => Array.from({ length: nDays }, (_, d) => Math.min(d, Math.max(0, n - 1)));
  const fallback = (): Placement => ({
    gilda: natural(nG),
    antonioL: natural(nA),
    antonioD: natural(nA),
    antonioBase: natural(nA),
  });
  if (nG !== nDays || nA === 0) return fallback();

  const pools: Record<Mode, number[]> = {
    ON: poolMenus("ON", nA, onDays),
    OFF: poolMenus("OFF", nA, onDays),
  };
  const count: Record<Mode, number> = {
    ON: flags.filter((f) => f.mode === "ON").length,
    OFF: flags.filter((f) => f.mode === "OFF").length,
  };
  const srcL = (f: DayFlags): "pranzo" | "cena" => (f.antonioMorning ? "cena" : "pranzo");
  const srcD = (f: DayFlags): "pranzo" | "cena" => (f.antonioMorning ? "pranzo" : "cena");
  const gSrcL = (f: DayFlags): MealId => (f.gildaMorning ? "cena" : "pranzo");
  const gSrcD = (f: DayFlags): MealId => (f.gildaMorning ? "pranzo" : "cena");

  const gSets = gilda.days.map((d) => Object.fromEntries(MEAL_ORDER.map((m) => [m, mealSets(d[m] ?? [])])) as Record<MealId, MealSets>);
  const aSets = antonio.days.map((d) => Object.fromEntries(MEAL_ORDER.map((m) => [m, mealSets(d[m] ?? [])])) as Record<MealId, MealSets>);
  const aMeal = (menu: number, m: MealId): Slot[] => (antonio.days[menu] as DayMeals)[m] ?? [];
  const gMeal = (menu: number, m: MealId): Slot[] => (gilda.days[menu] as DayMeals)[m] ?? [];

  // Scelte a mano valide
  const fixedG: (number | undefined)[] = [];
  const seenG = new Set<number>();
  for (let d = 0; d < nDays; d++) {
    const v = forced.gilda[d];
    if (v !== undefined && v >= 0 && v < nG && !seenG.has(v)) {
      fixedG.push(v);
      seenG.add(v);
    } else fixedG.push(undefined);
  }
  const reserved = [...seenG].reduce((m, g) => m | (1 << g), 0);
  const validA = (v: number | undefined, d: number) => (v !== undefined && pools[flags[d].mode].includes(v) ? v : undefined);
  const fixedL = flags.map((_, d) => validA(forced.antonioL[d], d));
  const fixedD = flags.map((_, d) => validA(forced.antonioD[d], d));

  // Conflitti che non si possono evitare nemmeno con le alternative
  const aConfMemo = new Map<string, boolean>();
  const aConflict = (l: number, sl: MealId, dd: number, sd: MealId) => {
    const key = `${l}${sl}${dd}${sd}`;
    let v = aConfMemo.get(key);
    if (v === undefined) {
      v = resolveRepeats([...cellsOf("A", "L", aMeal(l, sl)), ...cellsOf("A", "D", aMeal(dd, sd))]).length > 0;
      aConfMemo.set(key, v);
    }
    return v;
  };
  const gConfMemo = new Map<string, boolean>();
  const gConflict = (g: number, f: DayFlags) => {
    const key = `${g}${f.gildaMorning}`;
    let v = gConfMemo.get(key);
    if (v === undefined) {
      v = resolveRepeats([...cellsOf("G", "L", gMeal(g, gSrcL(f))), ...cellsOf("G", "D", gMeal(g, gSrcD(f)))]).length > 0;
      gConfMemo.set(key, v);
    }
    return v;
  };

  // Tabella dei punteggi (giorno, menù di Gilda, pranzo e cena di Antonio), calcolata una volta sola
  const table: number[][][][] = flags.map((f, d) =>
    gSets.map((gs, g) =>
      aSets.map((asL, l) =>
        aSets.map((asD, dd) => {
          let s = (affinity(gs[gSrcL(f)], asL[srcL(f)]) + affinity(gs[gSrcD(f)], asD[srcD(f)])) * 100;
          if (aConflict(l, srcL(f), dd, srcD(f))) s -= 5000;
          if (gConflict(g, f)) s -= 5000;
          if (g === d) s += 1;
          if (l === d) s += 1;
          if (dd === d) s += 1;
          return s;
        }),
      ),
    ),
  );

  // Ogni (tipo, pranzo/cena d'origine, menù) ha un contatore d'uso; li codifico in un solo numero
  const slotOf = new Map<string, number>();
  for (const mode of ["ON", "OFF"] as Mode[])
    for (const src of ["pranzo", "cena"])
      for (const m of pools[mode]) slotOf.set(`${mode}${src}${m}`, slotOf.size);
  const numSlots = slotOf.size;
  const BASE = 8; // un contatore non supera mai 7 (un uso al giorno)
  const compact = numSlots <= 14;
  const pw = Array.from({ length: numSlots }, (_, i) => BASE ** i);
  const pwTotal = BASE ** numSlots;

  const run = (extra: number): Placement | null => {
    const cap: Record<Mode, number> = {
      ON: Math.max(1, Math.ceil(count.ON / Math.max(1, pools.ON.length))) + extra,
      OFF: Math.max(1, Math.ceil(count.OFF / Math.max(1, pools.OFF.length))) + extra,
    };
    const usage: number[] = Array(numSlots).fill(0);
    let code = 0;
    const memo: Map<number | string, { v: number; g: number; l: number; d: number }>[] = Array.from({ length: nDays }, () => new Map());
    const NONE = { v: -Infinity, g: -1, l: -1, d: -1 };
    const TERMINAL = { v: 0, g: -1, l: -1, d: -1 };

    // per ogni giorno: pasti disponibili e contatori (calcolati una volta per non allocare nella ricerca)
    const dayInfo = flags.map((f, d) => {
      const pl = pools[f.mode];
      return {
        mode: f.mode,
        menus: pl,
        sl: pl.map((m) => slotOf.get(`${f.mode}${srcL(f)}${m}`)!),
        sd: pl.map((m) => slotOf.get(`${f.mode}${srcD(f)}${m}`)!),
        fl: fixedL[d],
        fd: fixedD[d],
        fg: fixedG[d],
      };
    });

    const solve = (d: number, mask: number): { v: number; g: number; l: number; d: number } => {
      if (d === nDays) return TERMINAL;
      const key: number | string = compact ? mask * pwTotal + code : `${mask}|${usage.join("")}`;
      const hit = memo[d].get(key);
      if (hit) return hit;
      const info = dayInfo[d];
      const limit = cap[info.mode];
      const tab = table[d];

      let bv = -Infinity;
      let bg = -1;
      let bl = -1;
      let bd = -1;
      for (let li = 0; li < info.menus.length; li++) {
        const l = info.menus[li];
        if (info.fl !== undefined ? l !== info.fl : usage[info.sl[li]] >= limit) continue;
        const il = info.sl[li];
        usage[il]++;
        code += pw[il];
        for (let di = 0; di < info.menus.length; di++) {
          const dd = info.menus[di];
          if (info.fd !== undefined ? dd !== info.fd : usage[info.sd[di]] >= limit) continue;
          const id = info.sd[di];
          usage[id]++;
          code += pw[id];
          for (let g = 0; g < nG; g++) {
            if (info.fg !== undefined ? g !== info.fg : mask & (1 << g) || reserved & (1 << g)) continue;
            const v = tab[g][l][dd] + solve(d + 1, mask | (1 << g)).v;
            if (v > bv) {
              bv = v;
              bg = g;
              bl = l;
              bd = dd;
            }
          }
          usage[id]--;
          code -= pw[id];
        }
        usage[il]--;
        code -= pw[il];
      }
      const res = bg < 0 ? NONE : { v: bv, g: bg, l: bl, d: bd };
      memo[d].set(key, res);
      return res;
    };

    const out: Placement = { gilda: [], antonioL: [], antonioD: [], antonioBase: [] };
    let mask = 0;
    for (let d = 0; d < nDays; d++) {
      const step = solve(d, mask);
      if (step.g < 0 || step.v === -Infinity) return null;
      out.gilda.push(step.g);
      out.antonioL.push(step.l);
      out.antonioD.push(step.d);
      out.antonioBase.push(step.l);
      mask |= 1 << step.g;
      const f = flags[d];
      const il = slotOf.get(`${f.mode}${srcL(f)}${step.l}`)!;
      const id = slotOf.get(`${f.mode}${srcD(f)}${step.d}`)!;
      usage[il]++;
      code += pw[il];
      usage[id]++;
      code += pw[id];
    }
    return out;
  };

  // Se le scelte a mano non lasciano abbastanza pasti, permetto di ripetere qualche pasto
  for (let extra = 0; extra <= nDays; extra++) {
    const res = run(extra);
    if (res) return res;
  }
  return fallback();
}
