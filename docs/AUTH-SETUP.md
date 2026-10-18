# Sign-in setup (Supabase + Google)

The desktop app shows nothing until a person is signed in. Accounts live in the project's
Supabase Auth. Release builds ship the project URL and its public anon key from the repo variables
`SUPABASE_URL` and `SUPABASE_ANON_KEY`, and a release fails if either is missing. Three things in
external dashboards decide whether sign-in actually works for real users.

Check the current state at any time:

```sh
node scripts/configure-supabase-auth.mjs --check
```

## 1. Email delivery (required before inviting users)

New accounts must confirm their email address. Supabase's built-in mailer only delivers to the
project's own team members, so without custom SMTP **nobody else ever receives the confirmation
link**. Use any SMTP provider (Resend, Postmark, Amazon SES, SendGrid, a Google Workspace relay).
You need its host, port, username, password and a From address on a domain you own.

## 2. Google sign-in (optional, recommended)

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), go to **Create
   credentials → OAuth client ID → Web application**.
2. Under **Authorized redirect URIs**, add exactly:
   `https://<project-ref>.supabase.co/auth/v1/callback` (`--check` prints yours).
3. Configure the OAuth consent screen (app name, support email). Then publish it: until it is
   published, only listed test users can sign in.
4. Copy the client ID and client secret.

The desktop app opens Google in the system browser, because Google blocks sign-in inside
embedded windows. The browser comes back to `http://127.0.0.1:4317/auth/desktop/callback/…`, and
the app window picks the session up. The Google button appears automatically once Supabase reports
Google as enabled.

## 3. Apply it to Supabase

Create a personal access token at supabase.com → Account → Access Tokens, then run:

```sh
SUPABASE_ACCESS_TOKEN=sbp_... \
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
SMTP_HOST=smtp.resend.com SMTP_PORT=587 SMTP_USER=resend SMTP_PASS=... SMTP_SENDER=no-reply@yourdomain.com \
  node scripts/configure-supabase-auth.mjs
```

The script:
- turns on Google with your client,
- configures SMTP,
- adds Walkcast's return URLs to **Authentication → URL Configuration → Redirect URLs**:
  - `http://127.0.0.1:4317/auth/**` (desktop app)
  - `http://127.0.0.1:4320/auth/**` and `http://localhost:4320/auth/**` (`walkcast ui`)
  - `<LAB_SITE_URL>/auth/**` (a deployed server).

It keeps existing entries and is safe to re-run. Supabase silently sends people to the project's
Site URL for any return URL that isn't on that list, which is the usual cause of "Google sign-in
lands on the wrong page".

## How the flows end

| Flow | Where it finishes |
| --- | --- |
| Email + password | In the app window. |
| Sign-up | "Check your email". The link opens in the system browser and confirms the address; the person then signs in in the app. |
| Google | The system browser shows "You're signed in, go back to Walkcast"; the app window signs in within a few seconds. |
| Forgot password | Hidden in the desktop app (the reset link can't come back to the app window); available on a deployed server. |

`LAB_AUTH=off` turns the sign-in wall off for local development only.
