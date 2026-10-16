-- Sign in with OpenRouter (PKCE) mints a per-user API key; store it sealed.
alter table users add column if not exists openrouter_key text;
