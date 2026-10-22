-- ============================================================================
-- File: docs/migrations/002_map_layers.sql
-- 002_map_layers.sql — golive.wiki own design, no third-party code.
-- Adds 4 tables that back the 4 toggleable map layers:
--   demand     — current-popularity hotspots by category × grid cell
--   risk_zones — translucent polygons (construction, protest, hazard)
--   signals    — realtime activity pulses (truck, foot traffic, deliveries)
--   valuation  — market price benchmarks by category × grid cell
-- ============================================================================

-- 1/4 — demand table ------------------------------------------------------
create table if not exists public.demand (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,
  lat         double precision not null,
  lng         double precision not null,
  intensity   real not null check (intensity between 0 and 1),
  observed_at timestamptz not null default now()
);
create index if not exists demand_observed_idx on public.demand (observed_at desc);
create index if not exists demand_category_idx on public.demand (category);
alter table public.demand enable row level security;
drop policy if exists "demand_select_all" on public.demand;
create policy "demand_select_all" on public.demand for select
  using (auth.role() = 'authenticated' or auth.role() = 'anon');

-- 2/4 — risk_zones table --------------------------------------------------
create table if not exists public.risk_zones (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  reason      text not null check (reason in (
                'construction', 'protest', 'hazard', 'weather', 'crime'
              )),
  severity    text not null default 'low' check (severity in ('low','medium','high')),
  -- GeoJSON polygon coordinates as a JSONB array of [lng,lat] pairs
  -- (PostGIS upgrade is a separate future migration).
  coordinates jsonb not null,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists risk_zones_active_idx on public.risk_zones (ends_at);
alter table public.risk_zones enable row level security;
drop policy if exists "risk_zones_select_all" on public.risk_zones;
create policy "risk_zones_select_all" on public.risk_zones for select
  using (auth.role() = 'authenticated' or auth.role() = 'anon');

-- 3/4 — signals table -----------------------------------------------------
create table if not exists public.signals (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in (
                'vehicle', 'foot_traffic', 'delivery', 'service_start', 'service_end'
              )),
  lat         double precision not null,
  lng         double precision not null,
  observed_at timestamptz not null default now()
);
create index if not exists signals_observed_idx on public.signals (observed_at desc);
alter table public.signals enable row level security;
drop policy if exists "signals_select_all" on public.signals;
create policy "signals_select_all" on public.signals for select
  using (auth.role() = 'authenticated' or auth.role() = 'anon');

-- 4/4 — valuation table ---------------------------------------------------
create table if not exists public.valuation (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,
  lat         double precision not null,
  lng         double precision not null,
  avg_price   numeric not null,
  sample_size int    not null check (sample_size > 0),
  observed_at timestamptz not null default now()
);
create index if not exists valuation_category_idx on public.valuation (category);
alter table public.valuation enable row level security;
drop policy if exists "valuation_select_all" on public.valuation;
create policy "valuation_select_all" on public.valuation for select
  using (auth.role() = 'authenticated' or auth.role() = 'anon');

-- Grants ------------------------------------------------------------------
grant select on public.demand     to anon, authenticated;
grant select on public.risk_zones to anon, authenticated;
grant select on public.signals    to anon, authenticated;
grant select on public.valuation  to anon, authenticated;
