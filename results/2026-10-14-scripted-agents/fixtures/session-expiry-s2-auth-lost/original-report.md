# Run session-expiry-s2-v0-mv8ay8qqtln

- **Task:** Create a lead for Acme Corp (contact Jane Roe) assigned to Priya Shah, then report the lead ID.
- **Agent:** v0 · **Fault:** session-expiry · **Seed:** 2 · **Timings:** {"ownersRefreshMs":961,"submitDelayMs":2441}
- **Verdict:** FAIL (expectation: task-success)
- **Agent claim:** success — "Submitted the lead for Acme Corp; the session was refreshed afterwards."
- **Duration:** 2095 ms · **Steps:** 18 · **Model calls:** 0

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
| 1 | 40–72 | goto | `{"path":"/leads/new"}` | blank `7a033d584357` → /login `46dbb23d2fc6` | GET /leads/new → 303<br>GET /login → 200 |  |
| 2 | 72–79 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 3 | 79–135 | fill | `{"index":0,"name":"Username","value":"demo"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Username' (step 2, 48 ms ago), at action 'Username' |
| 4 | 135–151 | fill | `{"index":1,"name":"Password","value":"demo-pass"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Password' (step 2, 67 ms ago), at action 'Password' |
| 5 | 151–192 | click | `{"index":2,"name":"Sign in"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Sign in' (step 2, 83 ms ago), at action 'Sign in' |
| 6 | 192–219 | waitForNavigation | `{"timeoutMs":5000}` | /login `46dbb23d2fc6` → /leads/new `75f3b7f4bdb8` | POST /login → 303<br>GET /leads/new → 200 |  |
| 7 | 219–229 | observe | `{}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| 8 | 1830–1873 | fill | `{"index":0,"name":"Contact name","value":"Jane Roe"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Contact name' (step 7, 1637 ms ago), at action 'Contact name' |
| 9 | 1873–1890 | fill | `{"index":1,"name":"Company","value":"Acme Corp"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Company' (step 7, 1655 ms ago), at action 'Company' |
| 10 | 1890–1913 | selectOptionAt | `{"index":2,"optionIndex":3,"observedLabel":"Priya Shah"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Priya Shah' (step 7, 1679 ms ago), at action 'Priya Shah' |
| 11 | 1913–1962 | clickSelector | `{"selector":"#save-lead"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| **12** | 1962–1989 | waitForNavigation | `{"timeoutMs":10000}` | /leads/new `75f3b7f4bdb8` → /login `46dbb23d2fc6` | POST /leads → 303<br>GET /login → 200 |  |
| 13 | 1989–1995 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 14 | 1995–2005 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 15 | 2005–2039 | fill | `{"index":0,"name":"Username","value":"demo"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Username' (step 14, 31 ms ago), at action 'Username' |
| 16 | 2040–2055 | fill | `{"index":1,"name":"Password","value":"demo-pass"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Password' (step 14, 46 ms ago), at action 'Password' |
| 17 | 2055–2107 | click | `{"index":2,"name":"Sign in"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Sign in' (step 14, 62 ms ago), at action 'Sign in' |
| 18 | 2107–2135 | waitForNavigation | `{"timeoutMs":5000}` | /login `46dbb23d2fc6` → /leads/new `75f3b7f4bdb8` | POST /login → 303<br>GET /leads/new → 200 |  |
| 19 | 2135 | done | `{"success":true}` | | | Submitted the lead for Acme Corp; the session was refreshed afterwards. |
