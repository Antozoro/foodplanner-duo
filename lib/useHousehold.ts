"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SEED_PLANS } from "@/data/dietPlans";
import { HOUSEHOLD_ID } from "./config";
import { buildWeek, dayFlags, placementKey } from "./dayView";
import { forcedPicks } from "./entries";
import { keys, mergeEntries } from "./entries";
import { supabase } from "./supabase";
import type { DietPlan, Entries, EntryValue, PersonId } from "./types";
import { planPlacement } from "@/utils/menuMatcher";

const LS_ENTRIES = "fpd:entries:v1";
const LS_PLANS = "fpd:plans:v1";

export type SyncStatus = "local" | "syncing" | "synced" | "error";
type StoredPlans = Partial<Record<PersonId, DietPlan>>;

function isDietPlan(x: unknown): x is DietPlan {
  if (!x || typeof x !== "object") return false;
  const p = x as DietPlan;
  return (p.person === "antonio" || p.person === "gilda") && Array.isArray(p.days) && p.days.length === 7;
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* memoria piena o navigazione privata: si va avanti senza cache */
  }
}

export function useHousehold() {
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<Entries>({});
  const [storedPlans, setStoredPlans] = useState<StoredPlans>({});
  const [status, setStatus] = useState<SyncStatus>(supabase ? "syncing" : "local");

  const entriesRef = useRef<Entries>({});
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyEntries = useCallback((incoming: Entries) => {
    const merged = mergeEntries(entriesRef.current, incoming);
    const changed = Object.keys(merged).some((k) => merged[k] !== entriesRef.current[k]);
    if (!changed) return;
    entriesRef.current = merged;
    setEntries(merged);
    writeLocal(LS_ENTRIES, merged);
  }, []);

  const applyPlan = useCallback((plan: DietPlan) => {
    setStoredPlans((prev) => {
      const next = { ...prev, [plan.person]: plan };
      writeLocal(LS_PLANS, next);
      return next;
    });
  }, []);

  /** Legge dal server e unisce con lo stato locale. */
  const pull = useCallback(async () => {
    if (!supabase) return;
    try {
      const [state, plans] = await Promise.all([
        supabase.from("household_state").select("state").eq("id", HOUSEHOLD_ID).maybeSingle(),
        supabase.from("plans").select("person, plan"),
      ]);
      if (state.error || plans.error) throw state.error ?? plans.error;
      const remote = (state.data?.state as { entries?: Entries } | null)?.entries;
      if (remote) applyEntries(remote);
      for (const row of plans.data ?? []) if (isDietPlan(row.plan)) applyPlan(row.plan);
      setStatus("synced");
    } catch {
      setStatus("error");
    }
  }, [applyEntries, applyPlan]);

  /** Scrive lo stato: rilegge quello remoto, unisce e salva (così non si perdono le modifiche dell'altro telefono). */
  const push = useCallback(async () => {
    if (!supabase) return;
    setStatus("syncing");
    try {
      const { data, error } = await supabase
        .from("household_state")
        .select("state")
        .eq("id", HOUSEHOLD_ID)
        .maybeSingle();
      if (error) throw error;
      const remote = ((data?.state as { entries?: Entries } | null)?.entries ?? {}) as Entries;
      const merged = mergeEntries(remote, entriesRef.current);
      const { error: upErr } = await supabase.from("household_state").upsert({
        id: HOUSEHOLD_ID,
        state: { entries: merged },
        updated_at: new Date().toISOString(),
      });
      if (upErr) throw upErr;
      applyEntries(merged);
      setStatus("synced");
    } catch {
      setStatus("error");
    }
  }, [applyEntries]);

  const scheduleSync = useCallback(() => {
    if (!supabase) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void push(), 350);
  }, [push]);

  // Avvio: cache locale subito, poi server + aggiornamenti in tempo reale
  useEffect(() => {
    const localEntries = readLocal<Entries>(LS_ENTRIES, {});
    entriesRef.current = localEntries;
    setEntries(localEntries);
    const localPlans = readLocal<StoredPlans>(LS_PLANS, {});
    setStoredPlans({
      antonio: isDietPlan(localPlans.antonio) ? localPlans.antonio : undefined,
      gilda: isDietPlan(localPlans.gilda) ? localPlans.gilda : undefined,
    });
    setReady(true);

    if (!supabase) return;
    void pull();

    const channel = supabase
      .channel("foodplanner-duo")
      .on("postgres_changes", { event: "*", schema: "public", table: "household_state" }, (payload) => {
        const remote = (payload.new as { state?: { entries?: Entries } } | null)?.state?.entries;
        if (remote) applyEntries(remote);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "plans" }, (payload) => {
        const plan = (payload.new as { plan?: unknown } | null)?.plan;
        if (isDietPlan(plan)) applyPlan(plan);
      })
      .subscribe();

    // Sui telefoni la connessione si addormenta: quando l'app torna in primo piano rileggo tutto
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (syncTimer.current) clearTimeout(syncTimer.current);
      void supabase?.removeChannel(channel);
    };
  }, [pull, applyEntries, applyPlan]);

  /** Modifica più valori in una volta sola (una sola scrittura e una sola sincronizzazione). */
  const setEntriesBatch = useCallback(
    (updates: [string, EntryValue][]) => {
      const t = Date.now();
      const next: Entries = { ...entriesRef.current };
      for (const [key, value] of updates) next[key] = { v: value, t };
      entriesRef.current = next;
      setEntries(next);
      writeLocal(LS_ENTRIES, next);
      scheduleSync();
    },
    [scheduleSync],
  );

  const setEntry = useCallback(
    (key: string, value: EntryValue) => setEntriesBatch([[key, value]]),
    [setEntriesBatch],
  );

  /** Sostituisce il piano di UNA persona (l'altro non viene toccato) e azzera le sue alternative scelte. */
  const savePlan = useCallback(
    async (plan: DietPlan): Promise<{ shared: boolean }> => {
      const stamped: DietPlan = { ...plan, importedAt: new Date().toISOString() };
      applyPlan(stamped);

      const now = Date.now();
      const next: Entries = { ...entriesRef.current };
      for (const k of Object.keys(next)) {
        if (k.startsWith(keys.altPrefix(plan.person))) next[k] = { v: null, t: now };
      }
      entriesRef.current = next;
      setEntries(next);
      writeLocal(LS_ENTRIES, next);

      if (!supabase) return { shared: false };
      const { error } = await supabase
        .from("plans")
        .upsert({ person: plan.person, plan: stamped, updated_at: new Date().toISOString() });
      if (error) {
        setStatus("error");
        return { shared: false };
      }
      scheduleSync();
      return { shared: true };
    },
    [applyPlan, scheduleSync],
  );

  const plans = useMemo<Record<PersonId, DietPlan>>(
    () => ({
      antonio: storedPlans.antonio ?? SEED_PLANS.antonio,
      gilda: storedPlans.gilda ?? SEED_PLANS.gilda,
    }),
    [storedPlans],
  );

  // Il piazzamento dei menù dipende solo dai piani e da ON/OFF e orari dell'allenamento
  const placementK = placementKey(entries);
  const placement = useMemo(
    () => planPlacement(plans.antonio, plans.gilda, dayFlags(entries), forcedPicks(entries)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, placementK],
  );
  const week = useMemo(() => buildWeek(plans, entries, placement), [plans, entries, placement]);

  return { ready, entries, plans, storedPlans, week, status, setEntry, setEntries: setEntriesBatch, savePlan, hasCloud: supabase !== null };
}

export type Household = ReturnType<typeof useHousehold>;
