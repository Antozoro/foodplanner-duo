-- Tabelle di FoodPlanner Duo (già create nel progetto Supabase).

create table public.plans (
  person text primary key check (person in ('antonio', 'gilda')),
  plan jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.household_state (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.plans enable row level security;
alter table public.household_state enable row level security;

create policy "anon read plans" on public.plans for select to anon using (true);
create policy "anon insert plans" on public.plans for insert to anon with check (true);
create policy "anon update plans" on public.plans for update to anon using (true) with check (true);

create policy "anon read state" on public.household_state for select to anon using (true);
create policy "anon insert state" on public.household_state for insert to anon with check (true);
create policy "anon update state" on public.household_state for update to anon using (true) with check (true);

alter publication supabase_realtime add table public.plans;
alter publication supabase_realtime add table public.household_state;
