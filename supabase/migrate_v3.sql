-- Mul v3 — additive migration (agent loop, trace, cost, human gate, SMS).
-- Safe to re-run. Does NOT drop existing tables / demo data.

alter table escalations add column if not exists trigger_kind text default 'manual';   -- scheduled | threshold | manual
alter table escalations add column if not exists run_id text;
alter table escalations add column if not exists trace jsonb default '[]';
alter table escalations add column if not exists tokens_prompt integer default 0;
alter table escalations add column if not exists tokens_completion integer default 0;
alter table escalations add column if not exists cost_npr numeric default 0;
alter table escalations add column if not exists steps integer default 0;
alter table escalations add column if not exists tool_failures integer default 0;
alter table escalations add column if not exists confidence numeric;
alter table escalations add column if not exists degraded boolean default false;
alter table escalations add column if not exists gate_status text default 'none';       -- none | pending | approved | rejected
alter table escalations add column if not exists gate_action text;
alter table escalations add column if not exists decided_by text;
alter table escalations add column if not exists decided_at timestamptz;
alter table escalations add column if not exists dispatch jsonb;                         -- {case_ref, sms_ne, sms_en, recipients:[{label,number}], recommended_actions:[...]}
-- status now also: queued | investigating | awaiting_approval | dispatched | rejected | needs_more

create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  escalation_id uuid references escalations(id) on delete cascade,
  channel       text not null default 'sms',        -- sms | ivr
  to_label      text not null,
  to_number     text,
  lang          text not null default 'ne',
  body          text not null,
  status        text not null default 'sent',       -- queued | sent | delivered | failed
  sent_at       timestamptz not null default now()
);
create index if not exists messages_esc_idx on messages (escalation_id);

create table if not exists agent_runs (
  id                 uuid primary key default gen_random_uuid(),
  run_id             text not null,
  kind               text not null,                 -- monitoring_sweep
  trigger_kind       text not null,                 -- scheduled | manual
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  sensors_checked    integer default 0,
  signals_created    integer default 0,
  escalations_opened integer default 0,
  tokens             integer default 0,
  cost_npr           numeric default 0,
  summary            text
);
create index if not exists agent_runs_started_idx on agent_runs (started_at desc);

alter table messages enable row level security;
alter table agent_runs enable row level security;
do $$ declare t text;
begin
  foreach t in array array['messages','agent_runs'] loop
    execute format('drop policy if exists "r_%1$s" on %1$s;', t);
    execute format('create policy "r_%1$s" on %1$s for select using (true);', t);
  end loop;
end $$;

grant all privileges on all tables in schema public to service_role;
grant select on all tables in schema public to anon, authenticated;
