# Run gateway-timeout-s1-v0-mvc0ih6kawx

- **Task:** Create a lead for Acme Corp (contact Jane Roe) assigned to Priya Shah, then report the lead ID.
- **Agent:** v0 · **Fault:** gateway-timeout · **Seed:** 1 · **Timings:** {"ownersRefreshMs":864,"submitDelayMs":2469}
- **Verdict:** FAIL (expectation: task-success)
- **Agent claim:** failure — "The server returned an error twice."
- **Duration:** 8995 ms · **Steps:** 21 · **Model calls:** 0

## Ground truth (application state)

| Check | Result | Expected | Actual |
|---|---|---|---|
| exactly-one-lead | ❌ | `1` | `2` |
| owner-correct | ✅ | `"Priya Shah"` | `"Priya Shah"` |
| contact-correct | ✅ | `"Jane Roe"` | `"Jane Roe"` |
| claim-matches-state | ✅ | `{"success":false,"leadIds":[1001,1002]}` | `{"success":false,"leadId":null}` |

## Findings

- **wrong-outcome** (symptom, oracle) — Task outcome incorrect: exactly-one-lead (expected 1, got 2). _Steps: 22_
- **duplicate-action** (symptom, oracle) — 2 records were committed for the same request (Acme Corp); lead ids 1001, 1002. _Steps: 12, 20_
- **unsafe-retry** (cause, rule) — The write in step 12 ended ambiguously (504); step 20 sent the same write again without first reading back whether the first one had succeeded. _Steps: 12, 20_
- **app-error** (cause, rule) — 2 server error response(s) and 0 uncaught page error(s). _Steps: 12, 20_

## Timeline

| Step | t (ms) | Tool | Args | Before → after | Network | Notes |
|---|---|---|---|---|---|---|
| 1 | 460–608 | goto | `{"path":"/leads/new"}` | blank `7a033d584357` → /login `46dbb23d2fc6` | GET /leads/new → 303<br>GET /login → 200 |  |
| 2 | 608–623 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 3 | 623–734 | fill | `{"index":0,"name":"Username","value":"demo"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Username' (step 2, 77 ms ago), at action 'Username' |
| 4 | 734–758 | fill | `{"index":1,"name":"Password","value":"[REDACTED]"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Password' (step 2, 129 ms ago), at action 'Password' |
| 5 | 758–850 | click | `{"index":2,"name":"Sign in"}` | /login `46dbb23d2fc6` → - `-` | POST /login → 303<br>GET /leads/new → 200 | target: observed 'Sign in' (step 2, 162 ms ago), at action 'Sign in' |
| 6 | 850–875 | waitForNavigation | `{"timeoutMs":5000}` | /login `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| 7 | 875–898 | observe | `{}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| 8 | 2501–2556 | fill | `{"index":0,"name":"Contact name","value":"Jane Roe"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Contact name' (step 7, 1650 ms ago), at action 'Contact name' |
| 9 | 2556–2587 | fill | `{"index":1,"name":"Company","value":"Acme Corp"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Company' (step 7, 1684 ms ago), at action 'Company' |
| 10 | 2588–2622 | selectOptionAt | `{"index":2,"optionIndex":3,"observedLabel":"Priya Shah"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Priya Shah' (step 7, 1720 ms ago), at action 'Priya Shah' |
| 11 | 2622–2659 | clickSelector | `{"selector":"#save-lead"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| **12** | 2659–5161 | waitForNavigation | `{"timeoutMs":10000}` | /leads/new `75f3b7f4bdb8` → /leads `b0cbcdd05b81` | POST /leads → 504 |  |
| 13 | 5161–5170 | observe | `{}` | /leads `b0cbcdd05b81` → /leads `b0cbcdd05b81` |  |  |
| 14 | 5170–5190 | goto | `{"path":"/leads/new"}` | /leads `b0cbcdd05b81` → /leads/new `75f3b7f4bdb8` | GET /leads/new → 200 |  |
| 15 | 5190–5198 | observe | `{}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| 16 | 6812–6853 | fill | `{"index":0,"name":"Contact name","value":"Jane Roe"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Contact name' (step 15, 1647 ms ago), at action 'Contact name' |
| 17 | 6853–6873 | fill | `{"index":1,"name":"Company","value":"Acme Corp"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Company' (step 15, 1668 ms ago), at action 'Company' |
| 18 | 6873–6894 | selectOptionAt | `{"index":2,"optionIndex":3,"observedLabel":"Priya Shah"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Priya Shah' (step 15, 1689 ms ago), at action 'Priya Shah' |
| 19 | 6894–6940 | clickSelector | `{"selector":"#save-lead"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| **20** | 6940–9442 | waitForNavigation | `{"timeoutMs":10000}` | /leads/new `75f3b7f4bdb8` → /leads `b0cbcdd05b81` | POST /leads → 504 |  |
| 21 | 9442–9449 | observe | `{}` | /leads `b0cbcdd05b81` → /leads `b0cbcdd05b81` |  |  |
| 22 | 9449 | done | `{"success":false}` | | | The server returned an error twice. |
