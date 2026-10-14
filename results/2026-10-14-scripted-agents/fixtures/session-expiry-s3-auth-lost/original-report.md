# Run session-expiry-s3-v0-mv8ay9a4wof

- **Task:** Create a lead for Acme Corp (contact Jane Roe) assigned to Priya Shah, then report the lead ID.
- **Agent:** v0 · **Fault:** session-expiry · **Seed:** 3 · **Timings:** {"ownersRefreshMs":948,"submitDelayMs":2848}
- **Verdict:** FAIL (expectation: task-success)
- **Agent claim:** success — "Submitted the lead for Acme Corp; the session was refreshed afterwards."
- **Duration:** 2186 ms · **Steps:** 18 · **Model calls:** 0

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
| 1 | 40–84 | goto | `{"path":"/leads/new"}` | blank `7a033d584357` → /login `46dbb23d2fc6` | GET /leads/new → 303<br>GET /login → 200 |  |
| 2 | 84–101 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 3 | 101–165 | fill | `{"index":0,"name":"Username","value":"demo"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Username' (step 2, 52 ms ago), at action 'Username' |
| 4 | 165–190 | fill | `{"index":1,"name":"Password","value":"demo-pass"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Password' (step 2, 83 ms ago), at action 'Password' |
| 5 | 190–246 | click | `{"index":2,"name":"Sign in"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Sign in' (step 2, 105 ms ago), at action 'Sign in' |
| 6 | 246–279 | waitForNavigation | `{"timeoutMs":5000}` | /login `46dbb23d2fc6` → /leads/new `75f3b7f4bdb8` | POST /login → 303<br>GET /leads/new → 200 |  |
| 7 | 279–294 | observe | `{}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| 8 | 1896–1938 | fill | `{"index":0,"name":"Contact name","value":"Jane Roe"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Contact name' (step 7, 1642 ms ago), at action 'Contact name' |
| 9 | 1938–1958 | fill | `{"index":1,"name":"Company","value":"Acme Corp"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Company' (step 7, 1660 ms ago), at action 'Company' |
| 10 | 1958–1980 | selectOptionAt | `{"index":2,"optionIndex":3,"observedLabel":"Priya Shah"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Priya Shah' (step 7, 1682 ms ago), at action 'Priya Shah' |
| 11 | 1980–2029 | clickSelector | `{"selector":"#save-lead"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| **12** | 2029–2062 | waitForNavigation | `{"timeoutMs":10000}` | /leads/new `75f3b7f4bdb8` → /login `46dbb23d2fc6` | POST /leads → 303<br>GET /login → 200 |  |
| 13 | 2062–2070 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 14 | 2070–2082 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 15 | 2082–2130 | fill | `{"index":0,"name":"Username","value":"demo"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Username' (step 14, 42 ms ago), at action 'Username' |
| 16 | 2130–2154 | fill | `{"index":1,"name":"Password","value":"demo-pass"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Password' (step 14, 63 ms ago), at action 'Password' |
| 17 | 2154–2194 | click | `{"index":2,"name":"Sign in"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Sign in' (step 14, 87 ms ago), at action 'Sign in' |
| 18 | 2194–2226 | waitForNavigation | `{"timeoutMs":5000}` | /login `46dbb23d2fc6` → /leads/new `75f3b7f4bdb8` | POST /login → 303<br>GET /leads/new → 200 |  |
| 19 | 2226 | done | `{"success":true}` | | | Submitted the lead for Acme Corp; the session was refreshed afterwards. |
