# Run gateway-timeout-s3-v0-mv8axvsjkb6

- **Task:** Create a lead for Acme Corp (contact Jane Roe) assigned to Priya Shah, then report the lead ID.
- **Agent:** v0 · **Fault:** gateway-timeout · **Seed:** 3 · **Timings:** {"ownersRefreshMs":948,"submitDelayMs":2848}
- **Verdict:** FAIL (expectation: task-success)
- **Agent claim:** failure — "The server returned an error twice."
- **Duration:** 9516 ms · **Steps:** 21 · **Model calls:** 0

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
| 1 | 45–85 | goto | `{"path":"/leads/new"}` | blank `7a033d584357` → /login `46dbb23d2fc6` | GET /leads/new → 303<br>GET /login → 200 |  |
| 2 | 85–97 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 3 | 97–162 | fill | `{"index":0,"name":"Username","value":"demo"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Username' (step 2, 55 ms ago), at action 'Username' |
| 4 | 162–194 | fill | `{"index":1,"name":"Password","value":"{{secret:app_password}}"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Password' (step 2, 94 ms ago), at action 'Password' |
| 5 | 194–242 | click | `{"index":2,"name":"Sign in"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Sign in' (step 2, 111 ms ago), at action 'Sign in' |
| 6 | 242–275 | waitForNavigation | `{"timeoutMs":5000}` | /login `46dbb23d2fc6` → /leads/new `75f3b7f4bdb8` | POST /login → 303<br>GET /leads/new → 200 |  |
| 7 | 275–287 | observe | `{}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| 8 | 1887–1937 | fill | `{"index":0,"name":"Contact name","value":"Jane Roe"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Contact name' (step 7, 1644 ms ago), at action 'Contact name' |
| 9 | 1937–1961 | fill | `{"index":1,"name":"Company","value":"Acme Corp"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Company' (step 7, 1667 ms ago), at action 'Company' |
| 10 | 1961–1988 | selectOptionAt | `{"index":2,"optionIndex":3,"observedLabel":"Priya Shah"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Priya Shah' (step 7, 1694 ms ago), at action 'Priya Shah' |
| 11 | 1988–2031 | clickSelector | `{"selector":"#save-lead"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| **12** | 2031–4903 | waitForNavigation | `{"timeoutMs":10000}` | /leads/new `75f3b7f4bdb8` → /leads `b0cbcdd05b81` | POST /leads → 504 |  |
| 13 | 4903–4911 | observe | `{}` | /leads `b0cbcdd05b81` → /leads `b0cbcdd05b81` |  |  |
| 14 | 4911–4937 | goto | `{"path":"/leads/new"}` | /leads `b0cbcdd05b81` → /leads/new `75f3b7f4bdb8` | GET /leads/new → 200 |  |
| 15 | 4937–4946 | observe | `{}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| 16 | 6548–6591 | fill | `{"index":0,"name":"Contact name","value":"Jane Roe"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Contact name' (step 15, 1639 ms ago), at action 'Contact name' |
| 17 | 6591–6615 | fill | `{"index":1,"name":"Company","value":"Acme Corp"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Company' (step 15, 1659 ms ago), at action 'Company' |
| 18 | 6615–6634 | selectOptionAt | `{"index":2,"optionIndex":3,"observedLabel":"Priya Shah"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Priya Shah' (step 15, 1685 ms ago), at action 'Priya Shah' |
| 19 | 6634–6690 | clickSelector | `{"selector":"#save-lead"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| **20** | 6690–9552 | waitForNavigation | `{"timeoutMs":10000}` | /leads/new `pending` → /leads `b0cbcdd05b81` | POST /leads → 504 |  |
| 21 | 9552–9561 | observe | `{}` | /leads `b0cbcdd05b81` → /leads `b0cbcdd05b81` |  |  |
| 22 | 9561 | done | `{"success":false}` | | | The server returned an error twice. |
