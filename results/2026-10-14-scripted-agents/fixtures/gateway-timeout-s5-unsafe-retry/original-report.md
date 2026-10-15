# Run gateway-timeout-s5-v0-mv8ay11estg

- **Task:** Create a lead for Acme Corp (contact Jane Roe) assigned to Priya Shah, then report the lead ID.
- **Agent:** v0 · **Fault:** gateway-timeout · **Seed:** 5 · **Timings:** {"ownersRefreshMs":921,"submitDelayMs":2052}
- **Verdict:** FAIL (expectation: task-success)
- **Agent claim:** failure — "The server returned an error twice."
- **Duration:** 7911 ms · **Steps:** 21 · **Model calls:** 0

## Ground truth (application state)

| Check | Result | Expected | Actual |
|---|---|---|---|
| exactly-one-lead | ❌ | `1` | `2` |
| owner-correct | ✅ | `"Priya Shah"` | `"Priya Shah"` |
| contact-correct | ✅ | `"Jane Roe"` | `"Jane Roe"` |
| claim-matches-state | ✅ | `{"success":false,"leadIds":[1001,1002]}` | `{"success":false,"leadId":null}` |

## Findings

- **wrong-outcome** (symptom, oracle) — Task outcome incorrect: exactly-one-lead (expected 1, got 2). _Steps: 22_
- **duplicate-action** (symptom, oracle) — 2 records were committed for the same request (Acme Corp); lead ids 1001, 1002.
- **unsafe-retry** (cause, rule) — The write in step 12 ended ambiguously (504); step 20 sent the same write again without first reading back whether the first one had succeeded. _Steps: 12, 20_
- **app-error** (cause, rule) — 2 server error response(s) and 0 uncaught page error(s). _Steps: 12, 20_

## Timeline

| Step | t (ms) | Tool | Args | Before → after | Network | Notes |
|---|---|---|---|---|---|---|
| 1 | 48–97 | goto | `{"path":"/leads/new"}` | blank `7a033d584357` → /login `46dbb23d2fc6` | GET /leads/new → 303<br>GET /login → 200 |  |
| 2 | 97–106 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 3 | 106–172 | fill | `{"index":0,"name":"Username","value":"demo"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Username' (step 2, 55 ms ago), at action 'Username' |
| 4 | 172–198 | fill | `{"index":1,"name":"Password","value":"{{secret:app_password}}"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Password' (step 2, 85 ms ago), at action 'Password' |
| 5 | 198–255 | click | `{"index":2,"name":"Sign in"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` | POST /login → 303 | target: observed 'Sign in' (step 2, 114 ms ago), at action 'Sign in' |
| 6 | 255–274 | waitForNavigation | `{"timeoutMs":5000}` | - `-` → /leads/new `75f3b7f4bdb8` | GET /leads/new → 200 |  |
| 7 | 274–284 | observe | `{}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| 8 | 1884–1941 | fill | `{"index":0,"name":"Contact name","value":"Jane Roe"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Contact name' (step 7, 1646 ms ago), at action 'Contact name' |
| 9 | 1941–1968 | fill | `{"index":1,"name":"Company","value":"Acme Corp"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Company' (step 7, 1677 ms ago), at action 'Company' |
| 10 | 1968–1990 | selectOptionAt | `{"index":2,"optionIndex":3,"observedLabel":"Priya Shah"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Priya Shah' (step 7, 1703 ms ago), at action 'Priya Shah' |
| 11 | 1990–2028 | clickSelector | `{"selector":"#save-lead"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| **12** | 2028–4103 | waitForNavigation | `{"timeoutMs":10000}` | /leads/new `75f3b7f4bdb8` → /leads `b0cbcdd05b81` | POST /leads → 504 |  |
| 13 | 4103–4109 | observe | `{}` | /leads `b0cbcdd05b81` → /leads `b0cbcdd05b81` |  |  |
| 14 | 4109–4138 | goto | `{"path":"/leads/new"}` | /leads `b0cbcdd05b81` → /leads/new `75f3b7f4bdb8` | GET /leads/new → 200 |  |
| 15 | 4138–4149 | observe | `{}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| 16 | 5749–5794 | fill | `{"index":0,"name":"Contact name","value":"Jane Roe"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Contact name' (step 15, 1637 ms ago), at action 'Contact name' |
| 17 | 5794–5814 | fill | `{"index":1,"name":"Company","value":"Acme Corp"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Company' (step 15, 1659 ms ago), at action 'Company' |
| 18 | 5814–5839 | selectOptionAt | `{"index":2,"optionIndex":3,"observedLabel":"Priya Shah"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Priya Shah' (step 15, 1686 ms ago), at action 'Priya Shah' |
| 19 | 5839–5878 | clickSelector | `{"selector":"#save-lead"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| **20** | 5878–7952 | waitForNavigation | `{"timeoutMs":10000}` | /leads/new `75f3b7f4bdb8` → /leads `b0cbcdd05b81` | POST /leads → 504 |  |
| 21 | 7952–7959 | observe | `{}` | /leads `b0cbcdd05b81` → /leads `b0cbcdd05b81` |  |  |
| 22 | 7959 | done | `{"success":false}` | | | The server returned an error twice. |
