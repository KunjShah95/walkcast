# Run ui-drift-s1-v0-mvc0ikwlz5o

- **Task:** Create a lead for Acme Corp (contact Jane Roe) assigned to Priya Shah, then report the lead ID.
- **Agent:** v0 · **Fault:** ui-drift · **Seed:** 1 · **Timings:** {"ownersRefreshMs":864,"submitDelayMs":2469}
- **Verdict:** FAIL (expectation: task-success)
- **Agent claim:** failure — "Could not submit the form: page.click: Timeout 2000ms exceeded."
- **Duration:** 3894 ms · **Steps:** 11 · **Model calls:** 0

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
| 1 | 54–82 | goto | `{"path":"/leads/new"}` | blank `7a033d584357` → /login `46dbb23d2fc6` | GET /leads/new → 303<br>GET /login → 200 |  |
| 2 | 82–93 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 3 | 93–153 | fill | `{"index":0,"name":"Username","value":"demo"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Username' (step 2, 45 ms ago), at action 'Username' |
| 4 | 153–173 | fill | `{"index":1,"name":"Password","value":"[REDACTED]"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Password' (step 2, 76 ms ago), at action 'Password' |
| 5 | 173–215 | click | `{"index":2,"name":"Sign in"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Sign in' (step 2, 95 ms ago), at action 'Sign in' |
| 6 | 215–237 | waitForNavigation | `{"timeoutMs":5000}` | /login `46dbb23d2fc6` → /leads/new `36e6a974a7d2` | POST /login → 303<br>GET /leads/new → 200 |  |
| 7 | 237–245 | observe | `{}` | /leads/new `36e6a974a7d2` → /leads/new `36e6a974a7d2` |  |  |
| 8 | 1847–1881 | fill | `{"index":0,"name":"Contact name","value":"Jane Roe"}` | /leads/new `36e6a974a7d2` → /leads/new `36e6a974a7d2` |  | target: observed 'Contact name' (step 7, 1631 ms ago), at action 'Contact name' |
| 9 | 1882–1904 | fill | `{"index":1,"name":"Company","value":"Acme Corp"}` | /leads/new `36e6a974a7d2` → /leads/new `36e6a974a7d2` |  | target: observed 'Company' (step 7, 1650 ms ago), at action 'Company' |
| 10 | 1904–1921 | selectOptionAt | `{"index":2,"optionIndex":3,"observedLabel":"Priya Shah"}` | /leads/new `36e6a974a7d2` → /leads/new `36e6a974a7d2` |  | target: observed 'Priya Shah' (step 7, 1672 ms ago), at action 'Priya Shah' |
| **11** | 1921–3940 | clickSelector | `{"selector":"#save-lead"}` | /leads/new `36e6a974a7d2` → /leads/new `36e6a974a7d2` |  | ⚠️ page.click: Timeout 2000ms exceeded. |
| 12 | 3940 | done | `{"success":false}` | | | Could not submit the form: page.click: Timeout 2000ms exceeded. |
