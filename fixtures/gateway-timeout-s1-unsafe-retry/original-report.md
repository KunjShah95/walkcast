# Run gateway-timeout-s1-v0-mv8axu2mkob

- **Task:** Create a lead for Acme Corp (contact Jane Roe) assigned to Priya Shah, then report the lead ID.
- **Agent:** v0 · **Fault:** gateway-timeout · **Seed:** 1 · **Timings:** {"ownersRefreshMs":864,"submitDelayMs":2469}
- **Verdict:** FAIL (expectation: task-success)
- **Agent claim:** failure — "The server returned an error twice."
- **Duration:** 8935 ms · **Steps:** 21 · **Model calls:** 0

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
| 1 | 82–138 | goto | `{"path":"/leads/new"}` | blank `7a033d584357` → /login `46dbb23d2fc6` | GET /leads/new → 303<br>GET /login → 200 |  |
| 2 | 138–166 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 3 | 166–258 | fill | `{"index":0,"name":"Username","value":"demo"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Username' (step 2, 82 ms ago), at action 'Username' |
| 4 | 258–293 | fill | `{"index":1,"name":"Password","value":"demo-pass"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Password' (step 2, 122 ms ago), at action 'Password' |
| 5 | 293–383 | click | `{"index":2,"name":"Sign in"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` | POST /login → 303 | target: observed 'Sign in' (step 2, 163 ms ago), at action 'Sign in' |
| 6 | 383–406 | waitForNavigation | `{"timeoutMs":5000}` | - `-` → /leads/new `75f3b7f4bdb8` | GET /leads/new → 200 |  |
| 7 | 406–418 | observe | `{}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| 8 | 2019–2081 | fill | `{"index":0,"name":"Contact name","value":"Jane Roe"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Contact name' (step 7, 1652 ms ago), at action 'Contact name' |
| 9 | 2081–2120 | fill | `{"index":1,"name":"Company","value":"Acme Corp"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Company' (step 7, 1689 ms ago), at action 'Company' |
| 10 | 2120–2154 | selectOptionAt | `{"index":2,"optionIndex":3,"observedLabel":"Priya Shah"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Priya Shah' (step 7, 1732 ms ago), at action 'Priya Shah' |
| 11 | 2154–2193 | clickSelector | `{"selector":"#save-lead"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| **12** | 2193–4693 | waitForNavigation | `{"timeoutMs":10000}` | /leads/new `75f3b7f4bdb8` → /leads `b0cbcdd05b81` | POST /leads → 504 |  |
| 13 | 4693–4702 | observe | `{}` | /leads `b0cbcdd05b81` → /leads `b0cbcdd05b81` |  |  |
| 14 | 4702–4728 | goto | `{"path":"/leads/new"}` | /leads `b0cbcdd05b81` → /leads/new `75f3b7f4bdb8` | GET /leads/new → 200 |  |
| 15 | 4728–4740 | observe | `{}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| 16 | 6341–6393 | fill | `{"index":0,"name":"Contact name","value":"Jane Roe"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Contact name' (step 15, 1646 ms ago), at action 'Contact name' |
| 17 | 6393–6419 | fill | `{"index":1,"name":"Company","value":"Acme Corp"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Company' (step 15, 1674 ms ago), at action 'Company' |
| 18 | 6419–6450 | selectOptionAt | `{"index":2,"optionIndex":3,"observedLabel":"Priya Shah"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Priya Shah' (step 15, 1698 ms ago), at action 'Priya Shah' |
| 19 | 6450–6487 | clickSelector | `{"selector":"#save-lead"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| **20** | 6487–9000 | waitForNavigation | `{"timeoutMs":10000}` | /leads/new `75f3b7f4bdb8` → /leads `b0cbcdd05b81` | POST /leads → 504 |  |
| 21 | 9001–9017 | observe | `{}` | /leads `b0cbcdd05b81` → /leads `b0cbcdd05b81` |  |  |
| 22 | 9017 | done | `{"success":false}` | | | The server returned an error twice. |
