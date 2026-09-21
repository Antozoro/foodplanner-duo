"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ChefHat, FileUp, ShoppingBasket } from "lucide-react";
import { KitchenView } from "@/components/KitchenView";
import { MenuView } from "@/components/MenuView";
import { PlansView } from "@/components/PlansView";
import { ShoppingView } from "@/components/ShoppingView";
import { SyncBadge } from "@/components/ui";
import type { MealId } from "@/lib/types";
import { useHousehold } from "@/lib/useHousehold";

type Tab = "cucina" | "menu" | "spesa" | "piani";

const TABS: { id: Tab; label: string; icon: typeof ChefHat }[] = [
  { id: "cucina", label: "In cucina", icon: ChefHat },
  { id: "menu", label: "Menù", icon: CalendarDays },
  { id: "spesa", label: "Spesa", icon: ShoppingBasket },
  { id: "piani", label: "Piani", icon: FileUp },
];

/** Lunedì = 0 ... Domenica = 6 */
function todayIndex() {
  return (new Date().getDay() + 6) % 7;
}

function currentMeal(): MealId {
  const h = new Date().getHours();
  if (h < 10) return "colazione";
  if (h < 12) return "spuntino";
  if (h < 16) return "pranzo";
  if (h < 19) return "merenda";
  return "cena";
}

export default function Home() {
  const hs = useHousehold();
  const [tab, setTab] = useState<Tab>("cucina");
  const [day, setDay] = useState(0);
  const [meal, setMeal] = useState<MealId>("pranzo");
  const [today, setToday] = useState(-1);

  // Giorno e pasto di partenza: quelli di adesso (calcolati dopo l'avvio, per non differire dal server)
  useEffect(() => {
    setToday(todayIndex());
    setDay(todayIndex());
    setMeal(currentMeal());
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-canvas/90 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 backdrop-blur">
        <h1 className="text-xl font-bold tracking-tight">FoodPlanner Duo</h1>
        <SyncBadge status={hs.status} />
      </header>

      <main className="flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        {!hs.ready ? (
          <p className="py-10 text-center text-sm text-muted" role="status">
            Carico i piani
          </p>
        ) : tab === "cucina" ? (
          <KitchenView hs={hs} day={day} meal={meal} onDay={setDay} onMeal={setMeal} today={today} />
        ) : tab === "menu" ? (
          <MenuView hs={hs} today={today} />
        ) : tab === "spesa" ? (
          <ShoppingView hs={hs} />
        ) : (
          <PlansView hs={hs} />
        )}
      </main>

      <nav
        aria-label="Sezioni"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex max-w-2xl">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
              className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold ${
                tab === id ? "text-ink" : "text-muted"
              }`}
            >
              <Icon size={22} strokeWidth={tab === id ? 2.6 : 2} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
