# FoodPlanner Duo

Web app mobile-first per i piani alimentari settimanali di Antonio e Gilda.

- **In cucina**: giorno e pasto, due card affiancate (Antonio / Gilda) con le pesate separate, alternative con un tocco, timing dell'allenamento (con scambio pranzo/cena) e ON/OFF di Antonio.
- **Spesa**: lista della settimana che si ricalcola con i giorni ON/OFF e le alternative scelte, con spunte condivise.
- **Piani**: importazione del PDF del nutrizionista, una persona alla volta.

Stack: Next.js (App Router, TypeScript), Tailwind CSS, Lucide, Supabase (stato condiviso in tempo reale).

## Variabili d'ambiente

Copia `.env.example` in `.env.local` (in locale) oppure impostale su Vercel:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Senza variabili l'app funziona lo stesso, ma solo su un telefono.

## Database

Le tabelle sono in `supabase/schema.sql` (`plans` e `household_state`).

## Struttura

- `data/dietPlans.ts`: piani iniziali (dai PDF del 15-16 settembre 2026)
- `utils/mealResolver.ts`: pasti effettivi di un giorno, con scambio pranzo/cena
- `utils/menuMatcher.ts`: menù di Antonio quando cambia ON/OFF
- `utils/parsePlan.ts`: lettura dei PDF del nutrizionista
- `app/page.tsx`: pagina principale con le tre schede

## Sviluppo

```
npm install
npm run dev
```

