"use client";

import { useRef, useState } from "react";
import { FileUp, TriangleAlert, CircleAlert, CircleCheck } from "lucide-react";
import { DAY_LABELS, MEALS, PEOPLE } from "@/lib/config";
import type { DietPlan, PersonId } from "@/lib/types";
import type { Household } from "@/lib/useHousehold";
import { extractPdfLines } from "@/utils/pdfText";
import { parsePlanLines, type ParsedPlan } from "@/utils/parsePlan";
import { formatGrams } from "@/utils/ingredients";

const TONE = {
  antonio: { text: "text-antonio", top: "border-t-antonio", btn: "bg-antonio text-white" },
  gilda: { text: "text-gilda", top: "border-t-gilda", btn: "bg-gilda text-white" },
} as const;

function formatDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString("it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Preview({ plan }: { plan: DietPlan }) {
  return (
    <div className="mt-3 divide-y divide-line rounded-2xl border border-line">
      {plan.days.map((day, i) => {
        const foods = MEALS.reduce((n, m) => n + day[m.id].length, 0);
        return (
          <details key={i} className="group">
            <summary className="flex min-h-12 cursor-pointer items-center justify-between px-3 text-sm font-semibold">
              <span>{DAY_LABELS[i]}</span>
              <span className="text-xs font-medium text-muted">{foods} alimenti</span>
            </summary>
            <div className="space-y-3 px-3 pb-3">
              {MEALS.map((m) => (
                <div key={m.id}>
                  <p className="text-xs font-bold">{m.label}</p>
                  <ul className="mt-1 space-y-1">
                    {day[m.id].map((slot) => (
                      <li key={slot.id} className="text-[0.8rem] leading-snug">
                        <span className="font-semibold">
                          {slot.options[0].name} {formatGrams(slot.options[0].grams)}
                        </span>
                        {slot.options.slice(1).map((o) => (
                          <span key={o.id} className="block pl-3 text-muted">
                            alternativa: {o.name} {formatGrams(o.grams)}
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function PlanCard({ person, hs }: { person: PersonId; hs: Household }) {
  const name = PEOPLE.find((p) => p.id === person)!.name;
  const tone = TONE[person];
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"reading" | "saving" | null>(null);
  const [parsed, setParsed] = useState<ParsedPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const stored = hs.storedPlans[person];
  const importedAt = formatDate(stored?.importedAt);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setDone(null);
    setParsed(null);
    setBusy("reading");
    try {
      const lines = await extractPdfLines(file);
      const result = parsePlanLines(lines, person);
      if (result.plan.days.every((d) => Object.values(d).every((s) => s.length === 0))) {
        setError("Non ho trovato nessun pasto in questo PDF. Controlla che sia un piano del nutrizionista.");
      } else {
        setParsed(result);
      }
    } catch {
      setError("Non riesco a leggere questo PDF. Riprova con il file originale scaricato dal sito del nutrizionista.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const confirm = async () => {
    if (!parsed || parsed.errors.length > 0) return;
    setBusy("saving");
    const res = await hs.savePlan(parsed.plan);
    setBusy(null);
    setParsed(null);
    setDone(
      res.shared
        ? `Piano di ${name} aggiornato, lo vedono entrambi i telefoni. Le alternative che avevi scelto per ${name} sono state azzerate.`
        : `Piano di ${name} aggiornato solo su questo telefono: non sono riuscito a salvarlo online. Riprova con una connessione migliore.`,
    );
  };

  return (
    <section className={`rounded-[22px] border border-t-[5px] border-line bg-surface p-4 ${tone.top}`}>
      <h2 className={`text-lg font-bold ${tone.text}`}>{name}</h2>
      <p className="mt-0.5 text-sm text-muted">
        {stored
          ? `${stored.title ?? "Piano importato"}. Importato il ${importedAt}.`
          : "Piano iniziale, dai PDF del nutrizionista del 15 e 16 settembre 2026."}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        onChange={(e) => void onFile(e.target.files?.[0])}
        aria-label={`Scegli il PDF del piano di ${name}`}
      />
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => inputRef.current?.click()}
        className={`mt-3 inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-50 ${tone.btn}`}
      >
        <FileUp size={18} aria-hidden />
        {busy === "reading" ? "Leggo il PDF" : `Importa il PDF di ${name}`}
      </button>

      {error && (
        <p className="mt-3 flex gap-2 text-sm text-bad" role="alert">
          <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      {done && (
        <p className="mt-3 flex gap-2 text-sm text-ok" role="status">
          <CircleCheck size={18} className="mt-0.5 shrink-0" aria-hidden />
          {done}
        </p>
      )}

      {parsed && (
        <div className="mt-4">
          <p className="text-sm font-semibold">
            Ho letto il piano{parsed.detectedName ? ` di ${parsed.detectedName}` : ""}
            {parsed.issuedOn ? ` del ${parsed.issuedOn}` : ""}. Controlla i giorni qui sotto, poi conferma.
          </p>

          {parsed.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-bad" role="alert">
              {parsed.errors.map((e) => (
                <li key={e} className="flex gap-2">
                  <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
                  {e}
                </li>
              ))}
            </ul>
          )}
          {parsed.warnings.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-warn">
              {parsed.warnings.map((w) => (
                <li key={w} className="flex gap-2">
                  <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
                  {w}
                </li>
              ))}
            </ul>
          )}

          <Preview plan={parsed.plan} />

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy !== null || parsed.errors.length > 0}
              className={`min-h-12 flex-1 rounded-full px-5 text-sm font-semibold disabled:opacity-40 ${tone.btn}`}
            >
              {busy === "saving" ? "Salvo" : `Conferma il piano di ${name}`}
            </button>
            <button
              type="button"
              onClick={() => setParsed(null)}
              disabled={busy !== null}
              className="min-h-12 rounded-full border border-line px-5 text-sm font-semibold"
            >
              Annulla
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function PlansView({ hs }: { hs: Household }) {
  return (
    <div className="space-y-3">
      <p className="px-1 text-sm text-muted">
        Quando il nutrizionista cambia un piano, importa il nuovo PDF. Sostituisce solo il piano della persona scelta e l&apos;altro resta com&apos;è.
      </p>
      <PlanCard person="antonio" hs={hs} />
      <PlanCard person="gilda" hs={hs} />
    </div>
  );
}
