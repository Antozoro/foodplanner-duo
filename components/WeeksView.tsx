"use client";

import { useState } from "react";
import { CalendarPlus, CircleCheck, Download, Trash2, TriangleAlert } from "lucide-react";
import { DAY_LABELS, DAY_SHORT } from "@/lib/config";
import { getText, keys } from "@/lib/entries";
import { hashPin } from "@/lib/pin";
import { applyWeek, captureWeek, listWeeks, type SavedWeek } from "@/lib/weeks";
import type { Household } from "@/lib/useHousehold";
import { ConfirmDialog, DayPickDialog, NameDialog } from "./Dialogs";
import { PinDialog } from "./PinDialog";

type Dlg =
  | null
  | { kind: "save" }
  | { kind: "confirm-load"; week: SavedWeek }
  | { kind: "pin-load"; week: SavedWeek }
  | { kind: "pick-day"; week: SavedWeek }
  | { kind: "pin-day"; week: SavedWeek; from: number; to: number }
  | { kind: "delete"; week: SavedWeek };

const ALL_DAYS = Array.from({ length: 7 }, (_, d) => ({ from: d, to: d }));

const list = (days: number[]) => days.map((d) => DAY_SHORT[d]).join(", ");

/** Riassunto di una riga per riconoscere una settimana: giorni ON/OFF e allenamenti al mattino. */
function summary(w: SavedWeek): string[] {
  const idx = (pred: (d: SavedWeek["days"][number]) => boolean) => w.days.map((d, i) => (pred(d) ? i : -1)).filter((i) => i >= 0);
  const on = idx((d) => d.mode === "ON");
  const off = idx((d) => d.mode === "OFF");
  const aM = idx((d) => d.antonioMorning);
  const gM = idx((d) => d.gildaMorning);
  const lines = [`Antonio: ON ${on.length ? list(on) : "nessun giorno"} · OFF ${off.length ? list(off) : "nessun giorno"}`];
  lines.push(
    aM.length || gM.length
      ? `Allenamento al mattino: ${[aM.length ? `Antonio ${list(aM)}` : "", gM.length ? `Gilda ${list(gM)}` : ""].filter(Boolean).join(" · ")}`
      : "Allenamenti tutti la sera",
  );
  return lines;
}

export function WeeksView({ hs }: { hs: Household }) {
  const [dlg, setDlg] = useState<Dlg>(null);
  const [notice, setNotice] = useState<{ text: string; warnings: string[] } | null>(null);
  const weeks = listWeeks(hs.entries);
  const pinHash = getText(hs.entries, keys.pin);
  const lockedDays = hs.week.days.filter((d) => d.locked).map((d) => d.day);
  const close = () => setDlg(null);

  const load = (week: SavedWeek, maps: { from: number; to: number }[], useMenus: boolean, text: string) => {
    const { updates, warnings } = applyWeek(hs.plans, hs.entries, week, maps, useMenus);
    hs.setEntries(updates);
    setNotice({ text, warnings });
    setDlg(null);
  };
  const loadWeek = (w: SavedWeek) => load(w, ALL_DAYS, false, `Settimana “${w.name}” caricata al posto di quella attuale.`);
  const loadDay = (w: SavedWeek, from: number, to: number) =>
    load(w, [{ from, to }], true, `${DAY_LABELS[from]} di “${w.name}” caricato su ${DAY_LABELS[to]}.`);

  const verifyPin = (then: () => void) => async (pin: string) => {
    if ((await hashPin(pin)) !== pinHash) return "Codice sbagliato.";
    then();
    return null;
  };

  const startLoadWeek = (w: SavedWeek) => setDlg(lockedDays.length > 0 && pinHash ? { kind: "pin-load", week: w } : { kind: "confirm-load", week: w });
  const pickedDay = (w: SavedWeek, from: number, to: number) => {
    if (hs.week.days[to].locked && pinHash) setDlg({ kind: "pin-day", week: w, from, to });
    else loadDay(w, from, to);
  };

  return (
    <section aria-labelledby="weeks-title" className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <h2 id="weeks-title" className="text-lg font-bold">
            Settimane salvate
          </h2>
          <p className="text-sm text-muted">Salva le scelte della settimana e recuperale quando vuoi.</p>
        </div>
        <button
          type="button"
          onClick={() => setDlg({ kind: "save" })}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold whitespace-nowrap text-white"
        >
          <CalendarPlus size={16} aria-hidden />
          Salva settimana
        </button>
      </div>

      {notice && (
        <div className="rounded-2xl border border-line bg-surface p-3" role="status">
          <p className="flex items-start gap-2 text-sm font-semibold text-ok">
            <CircleCheck size={18} className="mt-0.5 shrink-0" aria-hidden />
            {notice.text}
          </p>
          {notice.warnings.length > 0 && (
            <div className="mt-2">
              <p className="flex items-center gap-1.5 text-sm font-bold text-warn">
                <TriangleAlert size={16} aria-hidden />
                Da controllare
              </p>
              <ul className="mt-1 space-y-1 text-[0.82rem] leading-snug">
                {notice.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" onClick={() => setNotice(null)} className="mt-2 min-h-10 rounded-full border border-line px-4 text-sm font-semibold">
            Ok
          </button>
        </div>
      )}

      {weeks.length === 0 ? (
        <p className="rounded-[22px] border border-line bg-surface p-4 text-sm text-muted">
          Nessuna settimana salvata. Sistema la settimana come ti serve e premi “Salva settimana”.
        </p>
      ) : (
        <ul className="space-y-2">
          {weeks.map((w) => (
            <li key={w.id} className="rounded-[22px] border border-line bg-surface p-4">
              <h3 className="text-base font-bold">{w.name}</h3>
              <p className="text-xs text-muted">
                Salvata il {new Date(w.savedAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
              </p>
              {summary(w).map((line) => (
                <p key={line} className="mt-1 text-[0.82rem] leading-snug">
                  {line}
                </p>
              ))}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => startLoadWeek(w)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-white"
                >
                  <Download size={16} aria-hidden />
                  Carica
                </button>
                <button
                  type="button"
                  onClick={() => setDlg({ kind: "pick-day", week: w })}
                  className="min-h-11 rounded-full border border-line px-4 text-sm font-semibold"
                >
                  Solo un giorno
                </button>
                <button
                  type="button"
                  onClick={() => setDlg({ kind: "delete", week: w })}
                  aria-label={`Elimina ${w.name}`}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-semibold text-bad"
                >
                  <Trash2 size={16} aria-hidden />
                  Elimina
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dlg?.kind === "save" && (
        <NameDialog
          onClose={close}
          onSubmit={(name) => {
            const w = captureWeek(name, hs.week.days, hs.entries);
            hs.setEntry(keys.week(w.id), JSON.stringify(w));
            setNotice({ text: `Settimana “${name}” salvata.`, warnings: [] });
            close();
          }}
        />
      )}
      {dlg?.kind === "confirm-load" && (
        <ConfirmDialog
          title="Caricare la settimana?"
          text={`“${dlg.week.name}” prende il posto delle scelte di questa settimana: giorni ON/OFF, orari, pasti, alternative, verdure e testi.`}
          confirmLabel="Carica"
          onClose={close}
          onConfirm={() => loadWeek(dlg.week)}
        />
      )}
      {dlg?.kind === "pin-load" && (
        <PinDialog
          mode="verify"
          title="Caricare la settimana?"
          description={`Questa settimana ha dei giorni salvati (${list(lockedDays)}). Caricare “${dlg.week.name}” li sostituisce: inserisci il codice per confermare.`}
          submitLabel="Carica"
          onClose={close}
          onSubmit={verifyPin(() => loadWeek(dlg.week))}
        />
      )}
      {dlg?.kind === "pick-day" && (
        <DayPickDialog weekName={dlg.week.name} onClose={close} onSubmit={(from, to) => pickedDay(dlg.week, from, to)} />
      )}
      {dlg?.kind === "pin-day" && (
        <PinDialog
          mode="verify"
          title="Il giorno è salvato"
          description={`${DAY_LABELS[dlg.to]} è un giorno salvato. Inserisci il codice per sostituirlo con ${DAY_LABELS[dlg.from]} di “${dlg.week.name}”.`}
          submitLabel="Carica"
          onClose={close}
          onSubmit={verifyPin(() => loadDay(dlg.week, dlg.from, dlg.to))}
        />
      )}
      {dlg?.kind === "delete" && (
        <ConfirmDialog
          title="Eliminare la settimana?"
          text={`“${dlg.week.name}” sparisce dalla libreria, per tutti e due i telefoni. La settimana attuale non cambia.`}
          confirmLabel="Elimina"
          danger
          onClose={close}
          onConfirm={() => {
            hs.setEntry(keys.week(dlg.week.id), null);
            setNotice({ text: `Settimana “${dlg.week.name}” eliminata.`, warnings: [] });
            close();
          }}
        />
      )}
    </section>
  );
}
