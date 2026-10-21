-- Notes pinned to a moment in a walkthrough.
--
-- A walkthrough is the evidence; a note is its owner's reading of it ("the CTA here is wrong",
-- "this page took two seconds to load"). The notes belong to the recording's owner and are
-- private to them until they put them on a share link.
--
-- The table is owner-scoped like every other one: one account's notes are never another
-- account's, and deleting the walkthrough takes its notes with it.

create table if not exists annotations (
  id           uuid primary key default gen_random_uuid(),
  recording_id text not null references recordings (id) on delete cascade,
  owner        text references users (id) on delete cascade,
  at_seconds   double precision not null check (at_seconds >= 0),
  text         text not null check (length(text) > 0),
  created_at   timestamptz not null default now()
);
create index if not exists annotations_recording_idx on annotations (recording_id, at_seconds);
create index if not exists annotations_owner_idx on annotations (owner);

alter table annotations enable row level security;

-- On Supabase, also take away the API roles' table privileges (belt and braces with RLS).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on annotations from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on annotations from authenticated;
  end if;
end $$;
