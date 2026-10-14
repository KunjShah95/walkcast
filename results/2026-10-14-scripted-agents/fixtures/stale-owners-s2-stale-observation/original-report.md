# Run stale-owners-s2-v0-mv8axs8yk1t

- **Task:** Create a lead for Acme Corp (contact Jane Roe) assigned to Priya Shah, then report the lead ID.
- **Agent:** v0 · **Fault:** stale-owners · **Seed:** 2 · **Timings:** {"ownersRefreshMs":961,"submitDelayMs":2441}
- **Verdict:** FAIL (expectation: task-success)
- **Agent claim:** success — "Lead 1001 created for Acme Corp, owner Priya Shah."
- **Duration:** 2288 ms · **Steps:** 14 · **Model calls:** 0

## Ground truth (application state)

| Check | Result | Expected | Actual |
|---|---|---|---|
| exactly-one-lead | ✅ | `1` | `1` |
| owner-correct | ❌ | `"Priya Shah"` | `"Alex Kim"` |
| contact-correct | ✅ | `"Jane Roe"` | `"Jane Roe"` |
| claim-matches-state | ❌ | `{"success":false,"leadIds":[1001]}` | `{"success":true,"leadId":1001}` |

## Findings

- **false-success** (symptom, oracle) — Agent claimed success ("Lead 1001 created for Acme Corp, owner Priya Shah.") but owner-correct (expected "Priya Shah", got "Alex Kim"). _Steps: 15_
- **stale-observation** (cause, rule) — Step 10 (selectOptionAt) targeted 'Priya Shah' from the observation in step 7, 1772 ms old, but the element at that position was 'Alex Kim' when the action ran. _Steps: 7, 10_

## Timeline

| Step | t (ms) | Tool | Args | Before → after | Network | Notes |
|---|---|---|---|---|---|---|
| 1 | 54–123 | goto | `{"path":"/leads/new"}` | blank `7a033d584357` → /login `46dbb23d2fc6` | GET /leads/new → 303<br>GET /login → 200 |  |
| 2 | 123–150 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 3 | 150–265 | fill | `{"index":0,"name":"Username","value":"demo"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Username' (step 2, 103 ms ago), at action 'Username' |
| 4 | 265–298 | fill | `{"index":1,"name":"Password","value":"demo-pass"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Password' (step 2, 143 ms ago), at action 'Password' |
| 5 | 298–355 | click | `{"index":2,"name":"Sign in"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Sign in' (step 2, 176 ms ago), at action 'Sign in' |
| 6 | 355–409 | waitForNavigation | `{"timeoutMs":5000}` | /login `46dbb23d2fc6` → /leads/new `75f3b7f4bdb8` | POST /login → 303<br>GET /leads/new → 200 |  |
| **7** | 409–432 | observe | `{}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` | GET /api/owners → 200 |  |
| 8 | 2034–2124 | fill | `{"index":0,"name":"Contact name","value":"Jane Roe"}` | /leads/new `63a5a9ba916f` → /leads/new `63a5a9ba916f` |  | target: observed 'Contact name' (step 7, 1682 ms ago), at action 'Contact name' |
| 9 | 2124–2163 | fill | `{"index":1,"name":"Company","value":"Acme Corp"}` | /leads/new `63a5a9ba916f` → /leads/new `63a5a9ba916f` |  | target: observed 'Company' (step 7, 1727 ms ago), at action 'Company' |
| **10** | 2163–2211 | selectOptionAt | `{"index":2,"optionIndex":3,"observedLabel":"Priya Shah"}` | /leads/new `63a5a9ba916f` → /leads/new `63a5a9ba916f` |  | target: observed 'Priya Shah' (step 7, 1772 ms ago), at action 'Alex Kim' **STALE** |
| 11 | 2211–2253 | clickSelector | `{"selector":"#save-lead"}` | /leads/new `63a5a9ba916f` → /leads/new `63a5a9ba916f` |  |  |
| 12 | 2253–2311 | waitForNavigation | `{"timeoutMs":10000}` | /leads/new `63a5a9ba916f` → /leads/1001 `c98690898ca5` | POST /leads → 303<br>GET /leads/1001 → 200 |  |
| 13 | 2311–2328 | observe | `{}` | /leads/1001 `c98690898ca5` → /leads/1001 `c98690898ca5` |  |  |
| 14 | 2328–2342 | observe | `{}` | /leads/1001 `c98690898ca5` → /leads/1001 `c98690898ca5` |  |  |
| 15 | 2342 | done | `{"success":true,"leadId":1001}` | | | Lead 1001 created for Acme Corp, owner Priya Shah. |
