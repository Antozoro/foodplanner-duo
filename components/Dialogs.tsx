"use client";

import { useEffect, useRef, useState } from "react";
import { DAY_LABELS } from "@/lib/config";

/** Finestra al centro dello schermo con sfondo scuro; si chiude con Esc o toccando fuori. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-sm rounded-[22px] bg-surface p-5 shadow-xl">
        <h2 className="text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const primary = "min-h-12 flex-1 rounded-full bg-ink px-5 text-sm font-semibold text-white disabled:opacity-50";
const secondary = "min-h-12 rounded-full border border-line px-5 text-sm font-semibold";

export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="mt-1 text-sm text-muted">{text}</p>
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onConfirm} className={danger ? `${primary} !bg-bad` : primary}>
          {confirmLabel}
        </button>
        <button type="button" onClick={onClose} className={secondary}>
          Annulla
        </button>
      </div>
    </Modal>
  );
}

export function NameDialog({ onSubmit, onClose }: { onSubmit: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const ok = name.trim().length > 0;
  return (
    <Modal title="Salva la settimana" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSubmit(name.trim());
        }}
      >
        <p className="mt-1 text-sm text-muted">
          Ricorda giorni ON/OFF, orari degli allenamenti, pasti scelti, alternative, verdure e testi. Gli alimenti e le grammature arrivano sempre dal piano in vigore.
        </p>
        <label className="mt-4 block text-sm font-medium">
          Nome
          <input
            ref={input}
            type="text"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Per esempio: Lui sera, lei mattina"
            className="mt-1 block w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-ink"
          />
        </label>
        <div className="mt-5 flex gap-2">
          <button type="submit" disabled={!ok} className={primary}>
            Salva
          </button>
          <button type="button" onClick={onClose} className={secondary}>
            Annulla
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Per caricare un solo giorno: quale giorno della settimana salvata e su quale giorno di adesso. */
export function DayPickDialog({
  weekName,
  onSubmit,
  onClose,
}: {
  weekName: string;
  onSubmit: (from: number, to: number) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const select = "mt-1 block w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-ink";
  return (
    <Modal title="Carica un solo giorno" onClose={onClose}>
      <p className="mt-1 text-sm text-muted">
        Prendi un giorno di “{weekName}” e mettilo su un giorno di questa settimana. Il resto della settimana non cambia.
      </p>
      <label className="mt-4 block text-sm font-medium">
        Giorno salvato
        <select
          className={select}
          value={from}
          onChange={(e) => {
            setFrom(Number(e.target.value));
            setTo(Number(e.target.value));
          }}
        >
          {DAY_LABELS.map((d, i) => (
            <option key={d} value={i} className="bg-surface text-ink">
              {d}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-sm font-medium">
        Mettilo su
        <select className={select} value={to} onChange={(e) => setTo(Number(e.target.value))}>
          {DAY_LABELS.map((d, i) => (
            <option key={d} value={i} className="bg-surface text-ink">
              {d}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={() => onSubmit(from, to)} className={primary}>
          Carica il giorno
        </button>
        <button type="button" onClick={onClose} className={secondary}>
          Annulla
        </button>
      </div>
    </Modal>
  );
}
