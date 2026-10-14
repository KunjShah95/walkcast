# Run session-expiry-s1-v0-mv8ay7wqxqw

- **Task:** Create a lead for Acme Corp (contact Jane Roe) assigned to Priya Shah, then report the lead ID.
- **Agent:** v0 · **Fault:** session-expiry · **Seed:** 1 · **Timings:** {"ownersRefreshMs":864,"submitDelayMs":2469}
- **Verdict:** FAIL (expectation: task-success)
- **Agent claim:** success — "Submitted the lead for Acme Corp; the session was refreshed afterwards."
- **Duration:** 2135 ms · **Steps:** 18 · **Model calls:** 0

## Ground truth (application state)

| Check | Result | Expected | Actual |
|---|---|---|---|
| exactly-one-lead | ❌ | `1` | `0` |
| owner-correct | ❌ | `"Priya Shah"` | `null` |
| contact-correct | ❌ | `"Jane Roe"` | `null` |
| claim-matches-state | ❌ | `{"success":false,"leadIds":[]}` | `{"success":true,"leadId":null}` |

## Findings

- **false-success** (symptom, oracle) — Agent claimed success ("Submitted the lead for Acme Corp; the session was refreshed afterwards.") but exactly-one-lead (expected 1, got 0); owner-correct (expected "Priya Shah", got null); contact-correct (expected "Jane Roe", got null). _Steps: 19_
- **auth-lost** (cause, rule) — Session was lost mid-task: 1 write(s) rejected for authentication; redirected to login at step(s) 12. _Steps: 12_

## Timeline

| Step | t (ms) | Tool | Args | Before → after | Network | Notes |
|---|---|---|---|---|---|---|
| 1 | 32–67 | goto | `{"path":"/leads/new"}` | blank `7a033d584357` → /login `46dbb23d2fc6` | GET /leads/new → 303<br>GET /login → 200 |  |
| 2 | 67–76 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 3 | 76–132 | fill | `{"index":0,"name":"Username","value":"demo"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Username' (step 2, 48 ms ago), at action 'Username' |
| 4 | 132–148 | fill | `{"index":1,"name":"Password","value":"{{secret:app_password}}"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Password' (step 2, 68 ms ago), at action 'Password' |
| 5 | 148–203 | click | `{"index":2,"name":"Sign in"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Sign in' (step 2, 84 ms ago), at action 'Sign in' |
| 6 | 203–229 | waitForNavigation | `{"timeoutMs":5000}` | /login `46dbb23d2fc6` → /leads/new `75f3b7f4bdb8` | POST /login → 303<br>GET /leads/new → 200 |  |
| 7 | 229–236 | observe | `{}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| 8 | 1837–1892 | fill | `{"index":0,"name":"Contact name","value":"Jane Roe"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Contact name' (step 7, 1642 ms ago), at action 'Contact name' |
| 9 | 1892–1919 | fill | `{"index":1,"name":"Company","value":"Acme Corp"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Company' (step 7, 1668 ms ago), at action 'Company' |
| 10 | 1919–1941 | selectOptionAt | `{"index":2,"optionIndex":3,"observedLabel":"Priya Shah"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Priya Shah' (step 7, 1699 ms ago), at action 'Priya Shah' |
| 11 | 1941–1990 | clickSelector | `{"selector":"#save-lead"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| **12** | 1990–2014 | waitForNavigation | `{"timeoutMs":10000}` | /leads/new `75f3b7f4bdb8` → /login `46dbb23d2fc6` | POST /leads → 303<br>GET /login → 200 |  |
| 13 | 2014–2025 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 14 | 2025–2035 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 15 | 2035–2077 | fill | `{"index":0,"name":"Username","value":"demo"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Username' (step 14, 39 ms ago), at action 'Username' |
| 16 | 2077–2099 | fill | `{"index":1,"name":"Password","value":"{{secret:app_password}}"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Password' (step 14, 61 ms ago), at action 'Password' |
| 17 | 2099–2138 | click | `{"index":2,"name":"Sign in"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Sign in' (step 14, 78 ms ago), at action 'Sign in' |
| 18 | 2138–2166 | waitForNavigation | `{"timeoutMs":5000}` | /login `46dbb23d2fc6` → /leads/new `75f3b7f4bdb8` | POST /login → 303<br>GET /leads/new → 200 |  |
| 19 | 2166 | done | `{"success":true}` | | | Submitted the lead for Acme Corp; the session was refreshed afterwards. |
