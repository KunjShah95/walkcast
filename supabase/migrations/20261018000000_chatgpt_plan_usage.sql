-- Sign in with ChatGPT plan usage: sealed credentials (refresh/access tokens, client id, host id, granted scope).
alter table users add column if not exists chatgpt jsonb;