"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Riquadro di testo libero (es. "Riso, zucchine e tonno"). Scrive subito sul telefono e salva
 * dopo una breve pausa; se l'altro telefono lo modifica mentre non stai scrivendo, si aggiorna.
 */
export function NoteBox({
  label,
  tone,
  value,
  onCommit,
  readOnly = false,
}: {
  label: string;
  tone: "antonio" | "gilda";
  value: string;
  onCommit: (text: string) => void;
  readOnly?: boolean;
}) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);

  useEffect(() => {
    if (!focused.current) {
      setText(value);
      latest.current = value;
    }
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const commit = (t: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (t !== latest.current) {
      latest.current = t;
      onCommit(t);
    }
  };

  return (
    <label className="block rounded-[22px] border border-line bg-surface p-3">
      <span className={`text-sm font-bold ${tone === "antonio" ? "text-antonio" : "text-gilda"}`}>{label}</span>
      <textarea
        value={text}
        rows={3}
        readOnly={readOnly}
        placeholder="Scrivi cosa cucinate, per esempio: riso, zucchine e tonno"
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          commit(text);
        }}
        onChange={(e) => {
          setText(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          const t = e.target.value;
          timer.current = setTimeout(() => commit(t), 600);
        }}
        className={`mt-1.5 block w-full resize-none rounded-xl border border-line bg-canvas px-3 py-2 text-base leading-snug placeholder:text-muted/70 ${readOnly ? "text-muted" : ""}`}
      />
    </label>
  );
}
