-- The free voice trial: every account gets one recording narrated by Walkcast's own ElevenLabs
-- key. The key never leaves the tts-trial edge function; this ledger is what the function spends
-- against. Keyed by the Supabase auth user, so signing in on a second PC doesn't reset it.

create table if not exists tts_trials (
  auth_user   uuid primary key references auth.users (id) on delete cascade,
  -- The one recording the trial belongs to: the first one that asks for speech claims it, and
  -- every line of that recording may speak until the character cap. Any other recording is refused.
  recording   text not null,
  chars_used  integer not null default 0 check (chars_used >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Only the edge function (service role) touches the ledger.
alter table tts_trials enable row level security;

-- Claim-or-spend in one statement, so two lines spoken at once can't both slip under the cap.
-- Returns the characters left after this spend, or null when the trial refuses it.
create or replace function tts_trial_spend(p_user uuid, p_recording text, p_chars integer, p_cap integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  left_after integer;
begin
  insert into tts_trials (auth_user, recording, chars_used)
  values (p_user, p_recording, 0)
  on conflict (auth_user) do nothing;

  update tts_trials
     set chars_used = chars_used + p_chars, updated_at = now()
   where auth_user = p_user
     and recording = p_recording
     and chars_used + p_chars <= p_cap
  returning p_cap - chars_used into left_after;

  return left_after;
end;
$$;

revoke all on function tts_trial_spend(uuid, text, integer, integer) from public, anon, authenticated;

-- What the trial has left for a user, for the ticket endpoint. 'unused' when no recording claimed it.
create or replace function tts_trial_status(p_user uuid, p_cap integer)
returns table (state text, recording text, chars_left integer)
language sql
security definer
set search_path = public
as $$
  select case when t.auth_user is null then 'unused' else 'claimed' end,
         t.recording,
         greatest(p_cap - coalesce(t.chars_used, 0), 0)
    from (select 1) one
    left join tts_trials t on t.auth_user = p_user;
$$;

revoke all on function tts_trial_status(uuid, integer) from public, anon, authenticated;
