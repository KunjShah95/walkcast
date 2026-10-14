# Run ui-drift-s2-v0-mv8aybbjnek

- **Task:** Create a lead for Acme Corp (contact Jane Roe) assigned to Priya Shah, then report the lead ID.
- **Agent:** v0 · **Fault:** ui-drift · **Seed:** 2 · **Timings:** {"ownersRefreshMs":961,"submitDelayMs":2441}
- **Verdict:** FAIL (expectation: task-success)
- **Agent claim:** failure — "Could not submit the form: page.click: Timeout 2000ms exceeded."
- **Duration:** 3908 ms · **Steps:** 11 · **Model calls:** 0

## Ground truth (application state)

| Check | Result | Expected | Actual |
|---|---|---|---|
| exactly-one-lead | ❌ | `1` | `0` |
| owner-correct | ❌ | `"Priya Shah"` | `null` |
| contact-correct | ❌ | `"Jane Roe"` | `null` |
| claim-matches-state | ✅ | `{"success":false,"leadIds":[]}` | `{"success":false,"leadId":null}` |

## Findings

- **wrong-outcome** (symptom, oracle) — Task outcome incorrect: exactly-one-lead (expected 1, got 0); owner-correct (expected "Priya Shah", got null); contact-correct (expected "Jane Roe", got null). _Steps: 12_
- **locator-not-found** (cause, rule) — Step 11 (clickSelector "#save-lead") found no matching element: page.click: Timeout 2000ms exceeded. _Steps: 11_

## Timeline

| Step | t (ms) | Tool | Args | Before → after | Network | Notes |
|---|---|---|---|---|---|---|
| 1 | 39–76 | goto | `{"path":"/leads/new"}` | blank `7a033d584357` → /login `46dbb23d2fc6` | GET /leads/new → 303<br>GET /login → 200 |  |
| 2 | 76–83 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 3 | 83–154 | fill | `{"index":0,"name":"Username","value":"demo"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Username' (step 2, 58 ms ago), at action 'Username' |
| 4 | 154–176 | fill | `{"index":1,"name":"Password","value":"demo-pass"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Password' (step 2, 84 ms ago), at action 'Password' |
| 5 | 176–220 | click | `{"index":2,"name":"Sign in"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Sign in' (step 2, 113 ms ago), at action 'Sign in' |
| 6 | 220–251 | waitForNavigation | `{"timeoutMs":5000}` | /login `46dbb23d2fc6` → /leads/new `36e6a974a7d2` | POST /login → 303<br>GET /leads/new → 200 |  |
| 7 | 251–259 | observe | `{}` | /leads/new `36e6a974a7d2` → /leads/new `36e6a974a7d2` |  |  |
| 8 | 1860–1901 | fill | `{"index":0,"name":"Contact name","value":"Jane Roe"}` | /leads/new `36e6a974a7d2` → /leads/new `36e6a974a7d2` |  | target: observed 'Contact name' (step 7, 1636 ms ago), at action 'Contact name' |
| 9 | 1901–1921 | fill | `{"index":1,"name":"Company","value":"Acme Corp"}` | /leads/new `36e6a974a7d2` → /leads/new `36e6a974a7d2` |  | target: observed 'Company' (step 7, 1657 ms ago), at action 'Company' |
| 10 | 1921–1940 | selectOptionAt | `{"index":2,"optionIndex":3,"observedLabel":"Priya Shah"}` | /leads/new `36e6a974a7d2` → /leads/new `36e6a974a7d2` |  | target: observed 'Priya Shah' (step 7, 1677 ms ago), at action 'Priya Shah' |
| **11** | 1940–3948 | clickSelector | `{"selector":"#save-lead"}` | /leads/new `36e6a974a7d2` → /leads/new `36e6a974a7d2` |  | ⚠️ page.click: Timeout 2000ms exceeded. |
| 12 | 3948 | done | `{"success":false}` | | | Could not submit the form: page.click: Timeout 2000ms exceeded. |
