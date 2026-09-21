"use client";

import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

/** Finestra per il codice: "create" lo sceglie (due volte), "verify" lo chiede per sbloccare. */
export function PinDialog({
  mode,
  onSubmit,
  onClose,
}: {
  mode: "create" | "verify";
  /** Restituisce un messaggio d'errore, oppure null se è andato tutto bene. */
  onSubmit: (pin: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pin.length !== 4) return setError("Il codice ha 4 cifre.");
    if (mode === "create" && pin !== again) return setError("I due codici non coincidono.");
    setBusy(true);
    const err = await onSubmit(pin);
    setBusy(false);
    if (err) {
      setError(err);
      setPin("");
      setAgain("");
      first.current?.focus();
    }
  };

  const field =
    "mt-1 block w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-center text-2xl font-bold tracking-[0.6em] text-ink";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-title"
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-sm rounded-[22px] bg-surface p-5 shadow-xl"
      >
        <h2 id="pin-title" className="flex items-center gap-2 text-lg font-bold">
          <Lock size={18} aria-hidden />
          {mode === "create" ? "Scegli un codice" : "Inserisci il codice"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {mode === "create"
            ? "4 cifre, uguale per tutti e due i telefoni. Serve per modificare i giorni salvati. Segnatelo, non si può recuperare."
            : "Per modificare un giorno salvato serve il codice di 4 cifre."}
        </p>

        <label className="mt-4 block text-sm font-medium">
          {mode === "create" ? "Codice" : "Codice di 4 cifre"}
          <input
            ref={first}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(digits(e.target.value))}
            className={field}
          />
        </label>
        {mode === "create" && (
          <label className="mt-3 block text-sm font-medium">
            Ripeti il codice
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={again}
              onChange={(e) => setAgain(digits(e.target.value))}
              className={field}
            />
          </label>
        )}

        {error && (
          <p className="mt-3 text-sm font-medium text-bad" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="min-h-12 flex-1 rounded-full bg-ink px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {mode === "create" ? "Salva il giorno" : "Sblocca"}
          </button>
          <button type="button" onClick={onClose} className="min-h-12 rounded-full border border-line px-5 text-sm font-semibold">
            Annulla
          </button>
        </div>
      </form>
    </div>
  );
}
