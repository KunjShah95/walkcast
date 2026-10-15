-- Walkcast schema. Applied by `supabase db push` (Supabase CLI) or `npm run lab -- db migrate`.
--
-- Only the Walkcast server talks to these tables, over the Postgres connection string (the
-- `postgres` role, which bypasses RLS). Row Level Security is enabled with no policies, so the
-- public Supabase APIs (anon / authenticated keys through PostgREST) can read and write nothing.

create table if not exists users (
  id            text primary key,
  email         text not null,
  name          text,
  password_hash text,                 -- scrypt$N$salt$hash; null for Google-only accounts
  google_sub    text unique,
  created_at    timestamptz not null default now()
);
create unique index if not exists users_email_key on users (lower(email));

create table if not exists sessions (
  token_hash text primary key,        -- sha256 of the cookie token; the token itself is never stored
  user_id    text not null references users (id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expiry_idx on sessions (expires_at);

-- Fixed-window counters shared by every web instance (sign-in throttling, job quotas).
create table if not exists rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  count        integer not null
);

-- Work queue: the web tier enqueues, workers claim with FOR UPDATE SKIP LOCKED.
create table if not exists jobs (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('record', 'run')),
  owner           text references users (id) on delete cascade,
  status          text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  input           jsonb not null,
  secret          text,               -- AES-256-GCM sealed credentials; cleared when the job ends
  result          jsonb,
  error           text,
  progress        text,
  attempts        integer not null default 0,
  max_attempts    integer not null default 2,
  idempotency_key text,
  locked_by       text,
  lease_until     timestamptz,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz
);
create unique index if not exists jobs_idempotency_key on jobs (owner, idempotency_key) nulls not distinct where idempotency_key is not null;
create index if not exists jobs_queue_idx on jobs (created_at) where status = 'queued';
create index if not exists jobs_lease_idx on jobs (lease_until) where status = 'running';
create index if not exists jobs_owner_idx on jobs (owner, created_at desc);

create table if not exists recordings (
  id         text primary key,
  owner      text references users (id) on delete cascade,
  url        text not null,
  created_at timestamptz not null default now(),
  summary    jsonb not null           -- pages, captions, sign-in outcome, media file names
);
create index if not exists recordings_owner_idx on recordings (owner, created_at desc);

alter table users enable row level security;
alter table sessions enable row level security;
alter table rate_limits enable row level security;
alter table jobs enable row level security;
alter table recordings enable row level security;

-- On Supabase, also take away the API roles' table privileges (belt and braces with RLS).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on users, sessions, rate_limits, jobs, recordings from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on users, sessions, rate_limits, jobs, recordings from authenticated;
  end if;
end $$;
