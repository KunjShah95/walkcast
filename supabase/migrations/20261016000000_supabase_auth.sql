-- Supabase Auth: users sign in through auth.users (GoTrue); `auth_id` links our row to theirs.
-- Our own `id` stays the key for jobs and recordings, so accounts that existed before the switch
-- keep their history when they first sign in through Supabase (linked by confirmed email).
alter table users add column if not exists auth_id text;
create unique index if not exists users_auth_id_key on users (auth_id) where auth_id is not null;
