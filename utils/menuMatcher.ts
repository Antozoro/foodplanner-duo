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

/** Scelte fatte a mano: pranzo e cena, per ciascuno, scelti indipendentemente (un valore per giorno). */
export interface Forced {
  antonioL: (number | undefined)[];
  antonioD: (number | undefined)[];
  gildaL: (number | undefined)[];
  gildaD: (number | undefined)[];
}

/**
 * Per ogni giorno (0 = Lun): da quale menù del PDF arrivano il pranzo e la cena di ciascuno
 * (scelti indipendentemente), più un menù "base" per gli altri pasti (colazione, spuntino, merenda).
 */
export interface Placement {
  antonioL: number[];
  antonioD: number[];
  antonioBase: number[];
  gildaL: number[];
  gildaD: number[];
  gildaBase: number[];
}

export const noForced = (n = 7): Forced => ({
  antonioL: Array(n).fill(undefined),
  antonioD: Array(n).fill(undefined),
  gildaL: Array(n).fill(undefined),
  gildaD: Array(n).fill(undefined),
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
 * Decide, per ogni giorno, quali pasti di Antonio e di Gilda usare per far coincidere gli ingredienti,
 * senza ripetere lo stesso ingrediente a pranzo e a cena:
 * - Antonio, in un giorno ON, prende pranzo e cena dai pasti ON (di qualsiasi menù del PDF);
 *   in un giorno OFF dai pasti OFF. Ogni pranzo si scambia con un altro pranzo dello stesso tipo,
 *   ogni cena con un'altra cena dello stesso tipo;
 * - Gilda prende pranzo e cena da uno qualsiasi dei suoi 7 menù, scelti indipendentemente
 *   (un pranzo può venire da un menù diverso da quello della cena);
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
    antonioL: natural(nA),
    antonioD: natural(nA),
    antonioBase: natural(nA),
    gildaL: natural(nG),
    gildaD: natural(nG),
    gildaBase: natural(nG),
  });
  if (nA === 0 || nG === 0) return fallback();

  const poolsA: Record<Mode, number[]> = { ON: poolMenus("ON", nA, onDays), OFF: poolMenus("OFF", nA, onDays) };
  const poolG = Array.from({ length: nG }, (_, i) => i);
  const countA: Record<Mode, number> = {
    ON: flags.filter((f) => f.mode === "ON").length,
    OFF: flags.filter((f) => f.mode === "OFF").length,
  };

  const srcL = (f: DayFlags): MealId => (f.antonioMorning ? "cena" : "pranzo");
  const srcD = (f: DayFlags): MealId => (f.antonioMorning ? "pranzo" : "cena");
  const gSrcL = (f: DayFlags): MealId => (f.gildaMorning ? "cena" : "pranzo");
  const gSrcD = (f: DayFlags): MealId => (f.gildaMorning ? "pranzo" : "cena");

  const gSets = gilda.days.map((d) => Object.fromEntries(MEAL_ORDER.map((m) => [m, mealSets(d[m] ?? [])])) as Record<MealId, MealSets>);
  const aSets = antonio.days.map((d) => Object.fromEntries(MEAL_ORDER.map((m) => [m, mealSets(d[m] ?? [])])) as Record<MealId, MealSets>);
  const aMeal = (menu: number, m: MealId): Slot[] => (antonio.days[menu] as DayMeals)[m] ?? [];
  const gMeal = (menu: number, m: MealId): Slot[] => (gilda.days[menu] as DayMeals)[m] ?? [];

  // Scelte a mano valide
  const validA = (v: number | undefined, d: number) => (v !== undefined && poolsA[flags[d].mode].includes(v) ? v : undefined);
  const validG = (v: number | undefined) => (v !== undefined && v >= 0 && v < nG ? v : undefined);
  const fixedAL = flags.map((_, d) => validA(forced.antonioL[d], d));
  const fixedAD = flags.map((_, d) => validA(forced.antonioD[d], d));
  const fixedGL = flags.map(() => undefined as number | undefined).map((_, d) => validG(forced.gildaL[d]));
  const fixedGD = flags.map((_, d) => validG(forced.gildaD[d]));

  // Conflitti (stesso ingrediente a pranzo e a cena) che non si possono evitare nemmeno con le alternative
  const confMemo = new Map<string, boolean>();
  const conflict = (
    mealOf: (menu: number, meal: MealId) => Slot[],
    tag: "A" | "G",
    mL: number,
    sL: MealId,
    mD: number,
    sD: MealId,
  ) => {
    const key = `${tag}${mL}${sL}${mD}${sD}`;
    let v = confMemo.get(key);
    if (v === undefined) {
      v = resolveRepeats([...cellsOf(tag, "L", mealOf(mL, sL)), ...cellsOf(tag, "D", mealOf(mD, sD))]).length > 0;
      confMemo.set(key, v);
    }
    return v;
  };

  // Tabella dei punteggi (giorno × pranzo/cena di Antonio × pranzo/cena di Gilda), calcolata una volta per giorno
  const table = flags.map((f, d) => {
    const AL = poolsA[f.mode];
    const GL = poolG;
    return AL.map((aL) =>
      AL.map((aD) =>
        GL.map((gL) =>
          GL.map((gD) => {
            let s = (affinity(gSets[gL][gSrcL(f)], aSets[aL][srcL(f)]) + affinity(gSets[gD][gSrcD(f)], aSets[aD][srcD(f)])) * 100;
            if (conflict(aMeal, "A", aL, srcL(f), aD, srcD(f))) s -= 5000;
            if (conflict(gMeal, "G", gL, gSrcL(f), gD, gSrcD(f))) s -= 5000;
            if (aL === d) s += 1;
            if (aD === d) s += 1;
            if (gL === d) s += 1;
            if (gD === d) s += 1;
            return s;
          }),
        ),
      ),
    );
  });

  // Un contatore d'uso per ogni (persona, pranzo/cena, menù); li codifico in un solo numero quando sono pochi
  const slotOf = new Map<string, number>();
  for (const mode of ["ON", "OFF"] as Mode[]) for (const src of ["pranzo", "cena"]) for (const m of poolsA[mode]) slotOf.set(`A${mode}${src}${m}`, slotOf.size);
  for (const src of ["pranzo", "cena"]) for (const m of poolG) slotOf.set(`G${src}${m}`, slotOf.size);
  const numSlots = slotOf.size;

  let callBudget = 400_000;
  class BudgetExceeded extends Error {}

  const run = (extra: number): Placement | null => {
    const capA: Record<Mode, number> = {
      ON: Math.max(1, Math.ceil(countA.ON / Math.max(1, poolsA.ON.length))) + extra,
      OFF: Math.max(1, Math.ceil(countA.OFF / Math.max(1, poolsA.OFF.length))) + extra,
    };
    const capG = Math.max(1, Math.ceil(nDays / Math.max(1, poolG.length))) + extra;
    // Codifico lo stato d'uso in un solo numero: ogni contatore va da 0 al suo cap, quindi la base
    // può restare piccola (di solito 2) e il codice resta ben dentro l'intervallo sicuro di un Number.
    const maxCap = Math.max(capA.ON, capA.OFF, capG);
    const BASE = maxCap + 1;
    const compact = numSlots * Math.log2(BASE) <= 50;
    const pw = Array.from({ length: numSlots }, (_, i) => BASE ** i);
    const pwTotal = BASE ** numSlots;
    const usage: number[] = Array(numSlots).fill(0);
    let code = 0;
    const memo: Map<number | string, { v: number; aL: number; aD: number; gL: number; gD: number }>[] = Array.from(
      { length: nDays },
      () => new Map(),
    );
    const NONE = { v: -Infinity, aL: -1, aD: -1, gL: -1, gD: -1 };
    const TERMINAL = { v: 0, aL: -1, aD: -1, gL: -1, gD: -1 };

    const dayInfo = flags.map((f, d) => {
      const AL = poolsA[f.mode];
      const GL = poolG;
      return {
        AL,
        GL,
        sAL: AL.map((m) => slotOf.get(`A${f.mode}pranzo${m}`)!),
        sAD: AL.map((m) => slotOf.get(`A${f.mode}cena${m}`)!),
        sGL: GL.map((m) => slotOf.get(`Gpranzo${m}`)!),
        sGD: GL.map((m) => slotOf.get(`Gcena${m}`)!),
        fAL: fixedAL[d],
        fAD: fixedAD[d],
        fGL: fixedGL[d],
        fGD: fixedGD[d],
      };
    });

    const solve = (d: number): { v: number; aL: number; aD: number; gL: number; gD: number } => {
      // Conto ogni chiamata (anche quelle già in cache): è il numero di rami esplorati, il vero
      // costo, non solo gli stati nuovi da calcolare.
      if (--callBudget <= 0) throw new BudgetExceeded();
      if (d === nDays) return TERMINAL;
      const key: number | string = compact ? code * nDays + d : `${d}|${usage.join(",")}`;
      const hit = memo[d].get(key);
      if (hit) return hit;
      const info = dayInfo[d];
      const tab = table[d];

      let best = NONE;
      for (let li = 0; li < info.AL.length; li++) {
        const aL = info.AL[li];
        if (info.fAL !== undefined ? aL !== info.fAL : usage[info.sAL[li]] >= capA[flags[d].mode]) continue;
        usage[info.sAL[li]]++;
        code += pw[info.sAL[li]];
        for (let di = 0; di < info.AL.length; di++) {
          const aD = info.AL[di];
          if (info.fAD !== undefined ? aD !== info.fAD : usage[info.sAD[di]] >= capA[flags[d].mode]) continue;
          usage[info.sAD[di]]++;
          code += pw[info.sAD[di]];
          for (let gli = 0; gli < info.GL.length; gli++) {
            const gL = info.GL[gli];
            if (info.fGL !== undefined ? gL !== info.fGL : usage[info.sGL[gli]] >= capG) continue;
            usage[info.sGL[gli]]++;
            code += pw[info.sGL[gli]];
            for (let gdi = 0; gdi < info.GL.length; gdi++) {
              const gD = info.GL[gdi];
              if (info.fGD !== undefined ? gD !== info.fGD : usage[info.sGD[gdi]] >= capG) continue;
              usage[info.sGD[gdi]]++;
              code += pw[info.sGD[gdi]];
              const v = tab[li][di][gli][gdi] + solve(d + 1).v;
              if (v > best.v) best = { v, aL, aD, gL, gD };
              usage[info.sGD[gdi]]--;
              code -= pw[info.sGD[gdi]];
            }
            usage[info.sGL[gli]]--;
            code -= pw[info.sGL[gli]];
          }
          usage[info.sAD[di]]--;
          code -= pw[info.sAD[di]];
        }
        usage[info.sAL[li]]--;
        code -= pw[info.sAL[li]];
      }
      memo[d].set(key, best);
      return best;
    };

    const out: Placement = { antonioL: [], antonioD: [], antonioBase: [], gildaL: [], gildaD: [], gildaBase: [] };
    for (let d = 0; d < nDays; d++) {
      const step = solve(d);
      if (step.aL < 0 || step.v === -Infinity) return null;
      out.antonioL.push(step.aL);
      out.antonioD.push(step.aD);
      out.antonioBase.push(step.aL);
      out.gildaL.push(step.gL);
      out.gildaD.push(step.gD);
      out.gildaBase.push(step.gL);
      const f = flags[d];
      usage[slotOf.get(`A${f.mode}pranzo${step.aL}`)!]++;
      code += pw[slotOf.get(`A${f.mode}pranzo${step.aL}`)!];
      usage[slotOf.get(`A${f.mode}cena${step.aD}`)!]++;
      code += pw[slotOf.get(`A${f.mode}cena${step.aD}`)!];
      usage[slotOf.get(`Gpranzo${step.gL}`)!]++;
      code += pw[slotOf.get(`Gpranzo${step.gL}`)!];
      usage[slotOf.get(`Gcena${step.gD}`)!]++;
      code += pw[slotOf.get(`Gcena${step.gD}`)!];
    }
    return out;
  };

  // Se le scelte a mano non lasciano abbastanza pasti, permetto di ripetere qualche pasto.
  // Se la ricerca esatta è troppo onerosa (distribuzioni molto sbilanciate), passo a un metodo
  // più rapido e un po' meno rifinito, così l'app resta sempre veloce.
  try {
    for (let extra = 0; extra <= nDays; extra++) {
      const res = run(extra);
      if (res) return res;
    }
  } catch (e) {
    if (!(e instanceof BudgetExceeded)) throw e;
  }
  return greedyPlacement(
    nDays,
    flags,
    poolsA,
    poolG,
    fixedAL,
    fixedAD,
    fixedGL,
    fixedGD,
    srcL,
    srcD,
    gSrcL,
    gSrcD,
    (aL, sL, aD, sD) => conflict(aMeal, "A", aL, sL, aD, sD),
    (gL, sL, gD, sD) => conflict(gMeal, "G", gL, sL, gD, sD),
    (g, a) => affinity(g, a),
    gSets,
    aSets,
  );
}

/**
 * Assegna pranzo e cena giorno per giorno, il migliore possibile in quel momento (senza guardare
 * avanti). Più veloce della ricerca esatta ma un po' meno rifinito: si usa solo quando la
 * distribuzione dei giorni è così sbilanciata che la ricerca esatta impiegherebbe troppo tempo.
 */
function greedyPlacement(
  nDays: number,
  flags: DayFlags[],
  poolsA: Record<Mode, number[]>,
  poolG: number[],
  fixedAL: (number | undefined)[],
  fixedAD: (number | undefined)[],
  fixedGL: (number | undefined)[],
  fixedGD: (number | undefined)[],
  srcL: (f: DayFlags) => MealId,
  srcD: (f: DayFlags) => MealId,
  gSrcL: (f: DayFlags) => MealId,
  gSrcD: (f: DayFlags) => MealId,
  aConflict: (l: number, sl: MealId, dd: number, sd: MealId) => boolean,
  gConflict: (l: number, sl: MealId, dd: number, sd: MealId) => boolean,
  affinity: (g: MealSets, a: MealSets) => number,
  gSets: Record<MealId, MealSets>[],
  aSets: Record<MealId, MealSets>[],
): Placement {
  const countA: Record<Mode, number> = {
    ON: flags.filter((f) => f.mode === "ON").length,
    OFF: flags.filter((f) => f.mode === "OFF").length,
  };
  const capA: Record<Mode, number> = {
    ON: Math.max(1, Math.ceil(countA.ON / Math.max(1, poolsA.ON.length))),
    OFF: Math.max(1, Math.ceil(countA.OFF / Math.max(1, poolsA.OFF.length))),
  };
  const capG = Math.max(1, Math.ceil(nDays / Math.max(1, poolG.length)));
  const useA = new Map<string, number>();
  const useG = new Map<string, number>();
  const bump = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) ?? 0) + 1);

  const out: Placement = { antonioL: [], antonioD: [], antonioBase: [], gildaL: [], gildaD: [], gildaBase: [] };
  for (let d = 0; d < nDays; d++) {
    const f = flags[d];
    const AL = poolsA[f.mode];
    const GL = poolG;
    const kA = (src: MealId, m: number) => `${f.mode}${src}${m}`;
    const kG = (src: MealId, m: number) => `${src}${m}`;
    const candA = (fixed: number | undefined, src: MealId) =>
      fixed !== undefined ? [fixed] : AL.filter((m) => (useA.get(kA(src, m)) ?? 0) < capA[f.mode]);
    const candG = (fixed: number | undefined, src: MealId) =>
      fixed !== undefined ? [fixed] : GL.filter((m) => (useG.get(kG(src, m)) ?? 0) < capG);

    let best = { v: -Infinity, aL: AL[0], aD: AL[0], gL: GL[0], gD: GL[0] };
    for (const aL of candA(fixedAL[d], srcL(f)).length ? candA(fixedAL[d], srcL(f)) : AL) {
      for (const aD of candA(fixedAD[d], srcD(f)).length ? candA(fixedAD[d], srcD(f)) : AL) {
        for (const gL of candG(fixedGL[d], gSrcL(f)).length ? candG(fixedGL[d], gSrcL(f)) : GL) {
          for (const gD of candG(fixedGD[d], gSrcD(f)).length ? candG(fixedGD[d], gSrcD(f)) : GL) {
            let s = (affinity(gSets[gL][gSrcL(f)], aSets[aL][srcL(f)]) + affinity(gSets[gD][gSrcD(f)], aSets[aD][srcD(f)])) * 100;
            if (aConflict(aL, srcL(f), aD, srcD(f))) s -= 5000;
            if (gConflict(gL, gSrcL(f), gD, gSrcD(f))) s -= 5000;
            if (aL === d) s += 1;
            if (aD === d) s += 1;
            if (gL === d) s += 1;
            if (gD === d) s += 1;
            if (s > best.v) best = { v: s, aL, aD, gL, gD };
          }
        }
      }
    }
    out.antonioL.push(best.aL);
    out.antonioD.push(best.aD);
    out.antonioBase.push(best.aL);
    out.gildaL.push(best.gL);
    out.gildaD.push(best.gD);
    out.gildaBase.push(best.gL);
    bump(useA, kA(srcL(f), best.aL));
    bump(useA, kA(srcD(f), best.aD));
    bump(useG, kG(gSrcL(f), best.gL));
    bump(useG, kG(gSrcD(f), best.gD));
  }
  return out;
}
