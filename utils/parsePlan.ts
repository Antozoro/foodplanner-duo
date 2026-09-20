import { DAY_LABELS, MEAL_ORDER } from "@/lib/config";
import type { DayMeals, DietPlan, FoodOption, MealId, PersonId, Slot } from "@/lib/types";

export interface ParsedPlan {
  plan: DietPlan;
  detectedName?: string;
  issuedOn?: string;
  /** Cose da controllare (non bloccano l'importazione). */
  warnings: string[];
  /** Problemi che impediscono di importare il piano. */
  errors: string[];
}

const DAY_KEYS = ["LUNEDI", "MARTEDI", "MERCOLEDI", "GIOVEDI", "VENERDI", "SABATO", "DOMENICA"];

const MEAL_HEADERS: Record<string, MealId> = {
  COLAZIONE: "colazione",
  "SPUNTINO MATTINA": "spuntino",
  SPUNTINO: "spuntino",
  PRANZO: "pranzo",
  MERENDA: "merenda",
  CENA: "cena",
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

const emptyDay = (): DayMeals => ({ colazione: [], spuntino: [], pranzo: [], merenda: [], cena: [] });

export function slotId(person: PersonId, day: number, meal: MealId, slotIdx: number) {
  return `${person}-${day}-${meal}-${slotIdx}`;
}

const FOOD_LINE = /^(FISSO|(?:↳\s*)?ALTERNATIVA)\s+(.*)$/i;
const GRAMS_TAIL = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*g$/i;
const PAGE_NOISE = /^(https?:\/\/|\d{1,2}\/\d{1,2}\/\d{2,4},)/i;

/** Trasforma le righe di testo del PDF del nutrizionista in un piano strutturato. */
export function parsePlanLines(lines: string[], person: PersonId): ParsedPlan {
  const warnings: string[] = [];
  const errors: string[] = [];
  const days: DayMeals[] = Array.from({ length: 7 }, emptyDay);
  const seenDays = new Set<number>();

  let detectedName: string | undefined;
  let issuedOn: string | undefined;
  let dayIdx = -1;
  let meal: MealId | null = null;
  let pending: { kind: "fixed" | "alt"; text: string } | null = null;

  const addFood = (kind: "fixed" | "alt", name: string, grams: number) => {
    if (dayIdx < 0 || !meal) {
      warnings.push(`Alimento fuori da un pasto ignorato: ${name}`);
      return;
    }
    const slots = days[dayIdx][meal];
    if (kind === "fixed") {
      const id = slotId(person, dayIdx, meal, slots.length);
      slots.push({ id, options: [{ id: `${id}-0`, name, grams }] });
      return;
    }
    const slot: Slot | undefined = slots[slots.length - 1];
    if (!slot) {
      warnings.push(`${DAY_LABELS[dayIdx]}: alternativa senza alimento fisso (${name})`);
      return;
    }
    const option: FoodOption = { id: `${slot.id}-${slot.options.length}`, name, grams };
    slot.options.push(option);
  };

  const tryComplete = (kind: "fixed" | "alt", text: string): boolean => {
    const m = text.match(GRAMS_TAIL);
    if (!m) return false;
    addFood(kind, m[1].trim().replace(/\s+,/g, ","), parseFloat(m[2].replace(",", ".")));
    return true;
  };

  for (const line of lines) {
    const nameMatch = line.match(/Piano Alimentare\s*-\s*(.+)$/i);
    if (nameMatch && !detectedName) detectedName = nameMatch[1].trim();
    const dateMatch = line.match(/Piano Alimentare\s*•\s*(.+)$/i);
    if (dateMatch && !issuedOn) issuedOn = dateMatch[1].trim();
    if (PAGE_NOISE.test(line)) continue;

    const folded = fold(line);
    const dayPos = DAY_KEYS.indexOf(folded);
    const mealKey = folded.replace(/\s*-\s*$/, "").trim();
    const isMealHeader = mealKey in MEAL_HEADERS && /^[A-Z ]+\s*-?$/.test(folded);
    const looksLikeMealHeader = /^[A-Z][A-Z ]+\s-$/.test(folded);

    if (dayPos >= 0) {
      pending = null;
      if (seenDays.has(dayPos)) errors.push(`${DAY_LABELS[dayPos]} compare due volte nel PDF`);
      seenDays.add(dayPos);
      dayIdx = dayPos;
      meal = null;
      continue;
    }
    if (dayIdx >= 0 && (isMealHeader || looksLikeMealHeader)) {
      pending = null;
      if (isMealHeader) {
        meal = MEAL_HEADERS[mealKey];
      } else {
        meal = null;
        warnings.push(`${DAY_LABELS[dayIdx]}: pasto non riconosciuto "${line}" (alimenti ignorati)`);
      }
      continue;
    }
    if (dayIdx < 0) continue; // intestazione e note generali prima del Lunedì

    const food = line.match(FOOD_LINE);
    if (food) {
      if (pending) warnings.push(`${DAY_LABELS[dayIdx]}: riga incompleta ignorata "${pending.text}"`);
      pending = null;
      const kind = food[1].toUpperCase() === "FISSO" ? "fixed" : "alt";
      if (!tryComplete(kind, food[2])) pending = { kind, text: food[2] };
      continue;
    }
    if (pending) {
      // il nome è andato a capo: la riga successiva contiene il resto (e i grammi)
      const joined = `${pending.text} ${line}`;
      if (tryComplete(pending.kind, joined)) pending = null;
      else pending.text = joined;
    }
  }

  // Controlli finali
  for (let d = 0; d < 7; d++) {
    if (!seenDays.has(d)) {
      errors.push(`Manca ${DAY_LABELS[d]}`);
      continue;
    }
    for (const m of MEAL_ORDER) {
      if (days[d][m].length === 0) warnings.push(`${DAY_LABELS[d]}: nessun alimento in ${m}`);
    }
  }

  const firstName = person === "antonio" ? "antonio" : "gilda";
  if (detectedName && !detectedName.toLowerCase().includes(firstName)) {
    warnings.push(
      `Il PDF sembra intestato a "${detectedName}", ma stai importando il piano di ${person === "antonio" ? "Antonio" : "Gilda"}.`,
    );
  }
  if (!detectedName) warnings.push("Non trovo il nome nel PDF: controlla che sia il piano giusto.");

  return {
    plan: {
      person,
      title: issuedOn ? `Piano alimentare del ${issuedOn.replace(/^Piano Alimentare\s*•\s*/i, "")}` : undefined,
      days,
    },
    detectedName,
    issuedOn,
    warnings,
    errors,
  };
}
