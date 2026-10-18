-- Schedules, webhooks and the webhook outbox move into the shared store. Before this they were
-- JSON files on each instance's disk: with several web instances every one of them ran the
-- scheduler (N enqueues per due schedule) and kept an outbox of its own that a separate worker
-- never wrote to. Every table is owner-scoped: a user's webhooks hear only that user's jobs.

create table if not exists schedules (
  id          uuid primary key default gen_random_uuid(),
  owner       text references users (id) on delete cascade,
  url         text not null,
  spec        text not null,  -- the interval as written ("60m", "@daily")
  interval_ms bigint not null check (interval_ms >= 1000),
  authorized  boolean not null default false,
  created_at  timestamptz not null default now(),
  last_run_at timestamptz
);
create index if not exists schedules_owner_idx on schedules (owner, created_at);

create table if not exists webhooks (
  id         uuid primary key default gen_random_uuid(),
  owner      text references users (id) on delete cascade,
  url        text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists webhooks_owner_url_key on webhooks (owner, url) nulls not distinct;

-- Transactional outbox: rows are inserted in the same transaction as the job's terminal
-- transition (PgStore.finish) and leased to a dispatcher with FOR UPDATE SKIP LOCKED.
create table if not exists webhook_deliveries (
  id          uuid primary key default gen_random_uuid(),
  webhook_id  uuid references webhooks (id) on delete cascade,
  owner       text references users (id) on delete cascade,
  url         text not null,
  event       text not null,
  payload     jsonb not null,
  status      text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts    integer not null default 0,
  next_at     timestamptz not null default now(),
  locked_by   text,
  lease_until timestamptz,
  last_error  text,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists webhook_deliveries_due_idx on webhook_deliveries (next_at) where status = 'pending';
create index if not exists webhook_deliveries_owner_idx on webhook_deliveries (owner, created_at desc);

alter table schedules enable row level security;
alter table webhooks enable row level security;
alter table webhook_deliveries enable row level security;
