-- Spring Sentinel — minimal schema (v2). Safe to re-run.
create extension if not exists "pgcrypto";

drop table if exists escalations cascade;
drop table if exists signals cascade;
drop table if exists readings cascade;
drop table if exists sensors cascade;

create table sensors (
  id            text primary key,          -- e.g. DRC-01
  name          text not null,             -- spring name
  village       text not null,
  lat           double precision not null,
  lng           double precision not null,
  elevation_m   integer not null default 1500,
  installed_on  date not null default current_date,
  active        boolean not null default true,
  expected_flow_lpm double precision not null default 6,
  scenario      text not null default 'stable',   -- stable | declining | irregular | recovering
  created_at    timestamptz not null default now()
);

create table readings (
  id         uuid primary key default gen_random_uuid(),
  sensor_id  text not null references sensors(id) on delete cascade,
  flow_lpm   double precision not null,
  ts         timestamptz not null default now(),
  synthetic  boolean not null default true
);
create index on readings (sensor_id, ts desc);

create table signals (
  id             uuid primary key default gen_random_uuid(),
  sensor_id      text not null references sensors(id) on delete cascade,
  detected_at    timestamptz not null default now(),
  kind           text not null,             -- declining | irregular | stable | inactive | recovering
  severity       text not null default 'low', -- low | medium | high
  metrics        jsonb not null default '{}',
  headline       text not null,
  agent_reasoning text,
  decision       text not null default 'normal', -- normal | watching | escalated
  model          text
);
create index on signals (detected_at desc);

create table escalations (
  id           uuid primary key default gen_random_uuid(),
  sensor_id    text not null references sensors(id) on delete cascade,
  signal_id    uuid references signals(id) on delete set null,
  created_at   timestamptz not null default now(),
  status       text not null default 'analyzing', -- analyzing | complete | error
  error        text,
  -- deep-analysis results
  rainfall     jsonb,   -- {annual_normal_mm, last12_mm, anomaly_pct, dry_spell_days, monsoon_anomaly_pct, yearly:[...]}
  recharge     jsonb,   -- {polygon (geojson), area_km2, elev_min_m, elev_max_m, method, spring_cell}
  satellite    jsonb,   -- {bbox, past_period, recent_period, ndvi_past, ndvi_recent, ndvi_change_pct, ndbi_past, ndbi_recent, builtup_change_pp, valid_coverage, interpretation}
  factors      jsonb,   -- {flow_anomaly_pct, trend_pct, ...}
  verdict      jsonb,   -- {primary_cause, ranked_causes:[{cause,confidence,evidence[]}], explanation, implicated_zone, suggestions[], uncertainty}
  models_used  text[] default '{}',
  completed_at timestamptz
);
create index on escalations (created_at desc);

-- grants (tables made by postgres role don't auto-grant to api roles)
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant select on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant select on tables to anon, authenticated;

alter table sensors enable row level security;
alter table readings enable row level security;
alter table signals enable row level security;
alter table escalations enable row level security;
do $$ declare t text;
begin
  foreach t in array array['sensors','readings','signals','escalations'] loop
    execute format('drop policy if exists "r_%1$s" on %1$s;', t);
    execute format('create policy "r_%1$s" on %1$s for select using (true);', t);
  end loop;
end $$;
