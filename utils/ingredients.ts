/**
 * Nome "canonico" di un alimento, usato per sommare la spesa e per confrontare i menù.
 * Regole: crudo/cotto/scatola non contano, tranne per i legumi (fagioli, lenticchie secche,
 * lenticchie cotte, ceci) che restano distinti per forma. Tutti i tipi di tacchino sono "Tacchino".
 */
const RULES: [RegExp, string][] = [
  [/^fagioli/i, "Fagioli borlotti"],
  [/^lenticchie.*cott/i, "Lenticchie cotte"],
  [/^lenticchie/i, "Lenticchie secche"],
  [/^ceci/i, "Ceci in scatola"],
  [/^pollo/i, "Petto di pollo"],
  [/^tacchino/i, "Tacchino"],
  [/^pasta di semola/i, "Pasta integrale"],
  [/^pane di tipo integrale/i, "Pane integrale"],
  [/^panbauletto/i, "Panbauletto integrale Mulino Bianco"],
  [/^pane bianco/i, "Pane bianco"],
  [/^riso.*brillato/i, "Riso brillato"],
  [/^riso/i, "Riso integrale"],
  [/^olio/i, "Olio extra vergine"],
  [/^yogurt greco/i, "Yogurt greco 0%"],
  [/^tonno/i, "Tonno sott'olio"],
  [/^bresaola/i, "Bresaola"],
  [/^parmigiano/i, "Parmigiano Reggiano"],
  [/^uova/i, "Uova"],
  [/^mandorle/i, "Mandorle"],
  [/^banane/i, "Banane"],
  [/^latte/i, "Latte Zymil senza lattosio"],
  [/^hamburger/i, "Hamburger di carne"],
  [/^prosciutto crudo/i, "Prosciutto crudo"],
  [/^tsunami/i, "Tsunami Iso Whey"],
  [/^formaggio cremoso/i, "Formaggio spalmabile light"],
  [/^ricotta santa lucia/i, "Ricotta Santa Lucia Light"],
  [/^ricotta/i, "Ricotta di vacca"],
  [/^gullon/i, "Gullon digestive senza zucchero"],
  [/^gallette/i, "Gallette di riso Scotti"],
  [/^burro di arachidi/i, "Burro di arachidi Prozis"],
  [/^merluzzo/i, "Merluzzo o nasello"],
  [/^salmone/i, "Salmone"],
  [/^patate/i, "Patate"],
  [/^corn flakes/i, "Corn flakes"],
  [/^miele/i, "Miele"],
  [/^marmellata/i, "Marmellata"],
  [/^fette biscottate/i, "Fette biscottate"],
];

const NOISE = /^(crudo|cruda|cotto|cotta|cotti|cotte|bollito|bollita|bolliti|bollite|scolato|scolata|scolati|scolate|sgocciolato|sgocciolata|fresco|fresca|freschi|fresche)$/i;

export function normalizeIngredient(raw: string): string {
  const name = raw.trim();
  for (const [re, canonical] of RULES) {
    if (re.test(name)) return canonical;
  }
  // Alimento nuovo: tolgo solo le sfumature crudo/cotto/scatola e ripulisco le virgole.
  const cleaned = name
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !NOISE.test(p))
    .join(" ");
  const out = cleaned || name;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Grammi in formato leggibile: "850 g" oppure "1,25 kg". */
export function formatGrams(grams: number): string {
  if (grams >= 1000) {
    return `${(grams / 1000).toLocaleString("it-IT", { maximumFractionDigits: 2 })} kg`;
  }
  return `${grams.toLocaleString("it-IT", { maximumFractionDigits: 1 })} g`;
}
