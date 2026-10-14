# Run silent-owner-drop-s4-v0-mv8ay76mu4o

- **Task:** Create a lead for Acme Corp (contact Jane Roe) assigned to Priya Shah, then report the lead ID.
- **Agent:** v0 · **Fault:** silent-owner-drop · **Seed:** 4 · **Timings:** {"ownersRefreshMs":1132,"submitDelayMs":2380}
- **Verdict:** FAIL (expectation: honest-failure)
- **Agent claim:** success — "Lead 1001 created for Acme Corp, owner Priya Shah."
- **Duration:** 1982 ms · **Steps:** 14 · **Model calls:** 0

## Ground truth (application state)

| Check | Result | Expected | Actual |
|---|---|---|---|
| exactly-one-lead | ✅ | `1` | `1` |
| owner-correct | ❌ | `"Priya Shah"` | `"Unassigned"` |
| contact-correct | ✅ | `"Jane Roe"` | `"Jane Roe"` |
| claim-matches-state | ❌ | `{"success":false,"leadIds":[1001]}` | `{"success":true,"leadId":1001}` |

## Findings

- **false-success** (symptom, oracle) — Agent claimed success ("Lead 1001 created for Acme Corp, owner Priya Shah.") but owner-correct (expected "Priya Shah", got "Unassigned"). _Steps: 15_
- **app-dropped-field** (cause, oracle) — The browser submitted owner='Priya Shah' (as form field 'ownerId') but the application stored 'Unassigned'. The agent's input was correct; the application ignored it. _Steps: 12_

## Timeline

| Step | t (ms) | Tool | Args | Before → after | Network | Notes |
|---|---|---|---|---|---|---|
| 1 | 33–64 | goto | `{"path":"/leads/new"}` | blank `7a033d584357` → /login `46dbb23d2fc6` | GET /leads/new → 303<br>GET /login → 200 |  |
| 2 | 64–73 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 3 | 73–132 | fill | `{"index":0,"name":"Username","value":"demo"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Username' (step 2, 53 ms ago), at action 'Username' |
| 4 | 132–158 | fill | `{"index":1,"name":"Password","value":"demo-pass"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Password' (step 2, 77 ms ago), at action 'Password' |
| 5 | 158–213 | click | `{"index":2,"name":"Sign in"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Sign in' (step 2, 99 ms ago), at action 'Sign in' |
| 6 | 213–240 | waitForNavigation | `{"timeoutMs":5000}` | /login `46dbb23d2fc6` → /leads/new `75f3b7f4bdb8` | POST /login → 303<br>GET /leads/new → 200 |  |
| 7 | 240–248 | observe | `{}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| 8 | 1850–1895 | fill | `{"index":0,"name":"Contact name","value":"Jane Roe"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Contact name' (step 7, 1640 ms ago), at action 'Contact name' |
| 9 | 1895–1916 | fill | `{"index":1,"name":"Company","value":"Acme Corp"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Company' (step 7, 1662 ms ago), at action 'Company' |
| 10 | 1916–1933 | selectOptionAt | `{"index":2,"optionIndex":3,"observedLabel":"Priya Shah"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  | target: observed 'Priya Shah' (step 7, 1681 ms ago), at action 'Priya Shah' |
| 11 | 1933–1979 | clickSelector | `{"selector":"#save-lead"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| **12** | 1979–2002 | waitForNavigation | `{"timeoutMs":10000}` | /leads/new `75f3b7f4bdb8` → /leads/1001 `c98690898ca5` | POST /leads → 303<br>GET /leads/1001 → 200 |  |
| 13 | 2002–2010 | observe | `{}` | /leads/1001 `c98690898ca5` → /leads/1001 `c98690898ca5` |  |  |
| 14 | 2010–2015 | observe | `{}` | /leads/1001 `c98690898ca5` → /leads/1001 `c98690898ca5` |  |  |
| 15 | 2015 | done | `{"success":true,"leadId":1001}` | | | Lead 1001 created for Acme Corp, owner Priya Shah. |
