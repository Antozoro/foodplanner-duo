import type { MealId, Slot } from "@/lib/types";
import { alignKey } from "./ingredients";

export const OLIO = "Olio extra vergine";

/** Primo a pranzo, pane a cena: sono le scelte iniziali per la fonte di carboidrati. */
export const PRIMO = new Set(["Pasta integrale", "Riso"]);
export const PANE = new Set(["Pane integrale", "Panbauletto integrale Mulino Bianco", "Pane bianco"]);

export const keysOf = (slot: Slot) => slot.options.map((o) => alignKey(o.name));

function targetFor(meal: MealId): Set<string> | null {
  if (meal === "pranzo") return PRIMO;
  if (meal === "cena") return PANE;
  return null;
}

/** Scelta iniziale di uno slot preso da solo: primo a pranzo, pane a cena, altrimenti l'alimento del piano. */
function ruleIndex(meal: MealId, optionKeys: string[]): number {
  const target = targetFor(meal);
  if (!target) return 0;
  const i = optionKeys.findIndex((k) => target.has(k));
  return i >= 0 ? i : 0;
}

export interface MealAlignment {
  a: number[];
  g: number[];
  aLink: (number | null)[];
  gLink: (number | null)[];
}

/**
 * Allinea lo stesso pasto di Antonio e Gilda: collega gli slot che hanno ingredienti in comune
 * e fa scegliere a entrambi lo stesso ingrediente (ognuno con la sua grammatura).
 */
export function alignMeal(meal: MealId, aSlots: Slot[], gSlots: Slot[]): MealAlignment {
  const aKeys = aSlots.map(keysOf);
  const gKeys = gSlots.map(keysOf);
  const a = aKeys.map((k) => ruleIndex(meal, k));
  const g = gKeys.map((k) => ruleIndex(meal, k));
  const aLink: (number | null)[] = aSlots.map(() => null);
  const gLink: (number | null)[] = gSlots.map(() => null);

  const pairs: { i: number; j: number; common: string[] }[] = [];
  aKeys.forEach((ak, i) =>
    gKeys.forEach((gk, j) => {
      // l'olio non fa da alternativa a un altro alimento (es. "tonno o olio"): non lo uso per collegare gli slot
      const multi = aSlots[i].options.length > 1 || gSlots[j].options.length > 1;
      const common = [...new Set(ak.filter((k) => gk.includes(k) && !(multi && k === OLIO)))];
      if (common.length) pairs.push({ i, j, common });
    }),
  );
  pairs.sort((p, q) => q.common.length - p.common.length || p.i - q.i || p.j - q.j);

  const target = targetFor(meal);
  for (const { i, j, common } of pairs) {
    if (aLink[i] !== null || gLink[j] !== null) continue;
    aLink[i] = j;
    gLink[j] = i;
    const carb = target !== null && aKeys[i].some((k) => PRIMO.has(k) || PANE.has(k));
    let x: string | undefined;
    if (carb) {
      // se non c'è un primo (a pranzo) o un pane (a cena) in comune, ognuno segue la sua regola
      x = common.find((k) => target!.has(k));
    } else if (common.includes(aKeys[i][0])) {
      x = aKeys[i][0];
    } else if (common.includes(gKeys[j][0])) {
      x = gKeys[j][0];
    } else {
      x = common[0];
    }
    if (x !== undefined) {
      a[i] = aKeys[i].indexOf(x);
      g[j] = gKeys[j].indexOf(x);
    }
  }
  return { a, g, aLink, gLink };
}

/** Uno slot scelto, usato per evitare che lo stesso ingrediente compaia a pranzo e a cena. */
export interface Cell {
  person: "A" | "G";
  meal: "L" | "D";
  keys: string[];
  idx: number;
  locked: boolean;
  link: Cell | null;
}

export interface Repeat {
  person: "A" | "G";
  key: string;
}

const chosenSet = (cells: Cell[], person: "A" | "G", meal: "L" | "D") =>
  new Set(cells.filter((c) => c.person === person && c.meal === meal).map((c) => c.keys[c.idx]).filter((k) => k !== OLIO));

/**
 * Evita lo stesso ingrediente a pranzo e a cena nello stesso giorno, usando le alternative del piano.
 * Se possibile cambia insieme lo slot collegato dell'altra persona, così restano allineati.
 * Restituisce le ripetizioni che non si riescono a evitare.
 */
export function resolveRepeats(cells: Cell[]): Repeat[] {
  for (let iter = 0; iter < 8; iter++) {
    let changed = false;
    for (const P of ["A", "G"] as const) {
      const Q = P === "A" ? "G" : "A";
      const L = chosenSet(cells, P, "L");
      const D = chosenSet(cells, P, "D");
      for (const x of [...L].filter((k) => D.has(k))) {
        const candidates = [
          ...cells.filter((c) => c.person === P && c.meal === "D" && c.keys[c.idx] === x),
          ...cells.filter((c) => c.person === P && c.meal === "L" && c.keys[c.idx] === x),
        ].filter((c) => !c.locked);
        for (const c of candidates) {
          const opposite = chosenSet(cells, P, c.meal === "D" ? "L" : "D");
          const same = chosenSet(cells, P, c.meal);
          const ok = (y: string) => y !== x && y !== OLIO && !opposite.has(y) && !same.has(y);
          const other = c.link && !c.link.locked ? c.link : null;
          let pick = -1;
          let pickOther = -1;
          if (other) {
            const oppositeQ = chosenSet(cells, Q, other.meal === "D" ? "L" : "D");
            const sameQ = chosenSet(cells, Q, other.meal);
            pick = c.keys.findIndex((y) => ok(y) && other.keys.includes(y) && !oppositeQ.has(y) && !sameQ.has(y));
            if (pick >= 0) pickOther = other.keys.indexOf(c.keys[pick]);
          }
          if (pick < 0) pick = c.keys.findIndex(ok);
          if (pick >= 0) {
            c.idx = pick;
            if (other && pickOther >= 0) other.idx = pickOther;
            changed = true;
            break;
          }
        }
      }
    }
    if (!changed) break;
  }

  const left: Repeat[] = [];
  for (const P of ["A", "G"] as const) {
    const D = chosenSet(cells, P, "D");
    for (const x of chosenSet(cells, P, "L")) if (D.has(x)) left.push({ person: P, key: x });
  }
  return left;
}

/** Descrizione breve di un pasto: i suoi alimenti principali (senza olio). */
export function describeMeal(slots: Slot[]): string {
  const names = slots.map((s) => alignKey(s.options[0].name)).filter((k) => k !== OLIO);
  return names.length ? names.join(", ") : "Nessun alimento";
}
