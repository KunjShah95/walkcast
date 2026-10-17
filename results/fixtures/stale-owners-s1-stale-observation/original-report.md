# Run stale-owners-s1-v0-mvc0ih6jn8g

- **Task:** Create a lead for Acme Corp (contact Jane Roe) assigned to Priya Shah, then report the lead ID.
- **Agent:** v0 · **Fault:** stale-owners · **Seed:** 1 · **Timings:** {"ownersRefreshMs":864,"submitDelayMs":2469}
- **Verdict:** FAIL (expectation: task-success)
- **Agent claim:** success — "Lead 1001 created for Acme Corp, owner Priya Shah."
- **Duration:** 2291 ms · **Steps:** 14 · **Model calls:** 0

## Ground truth (application state)

| Check | Result | Expected | Actual |
|---|---|---|---|
| exactly-one-lead | ✅ | `1` | `1` |
| owner-correct | ❌ | `"Priya Shah"` | `"Alex Kim"` |
| contact-correct | ✅ | `"Jane Roe"` | `"Jane Roe"` |
| claim-matches-state | ❌ | `{"success":false,"leadIds":[1001]}` | `{"success":true,"leadId":1001}` |

## Findings

- **false-success** (symptom, oracle) — Agent claimed success ("Lead 1001 created for Acme Corp, owner Priya Shah.") but owner-correct (expected "Priya Shah", got "Alex Kim"). _Steps: 15_
- **stale-observation** (cause, rule) — Step 10 (selectOptionAt) targeted 'Priya Shah' from the observation in step 7, 1725 ms old, but the element at that position was 'Alex Kim' when the action ran. _Steps: 7, 10_

## Timeline

| Step | t (ms) | Tool | Args | Before → after | Network | Notes |
|---|---|---|---|---|---|---|
| 1 | 455–611 | goto | `{"path":"/leads/new"}` | blank `7a033d584357` → /login `46dbb23d2fc6` | GET /leads/new → 303<br>GET /login → 200 |  |
| 2 | 611–621 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 3 | 621–733 | fill | `{"index":0,"name":"Username","value":"demo"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Username' (step 2, 74 ms ago), at action 'Username' |
| 4 | 733–758 | fill | `{"index":1,"name":"Password","value":"[REDACTED]"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  | target: observed 'Password' (step 2, 127 ms ago), at action 'Password' |
| 5 | 758–850 | click | `{"index":2,"name":"Sign in"}` | /login `46dbb23d2fc6` → - `-` | POST /login → 303<br>GET /leads/new → 200 | target: observed 'Sign in' (step 2, 164 ms ago), at action 'Sign in' |
| 6 | 850–877 | waitForNavigation | `{"timeoutMs":5000}` | /login `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| **7** | 877–900 | observe | `{}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` | GET /api/owners → 200 |  |
| 8 | 2503–2564 | fill | `{"index":0,"name":"Contact name","value":"Jane Roe"}` | /leads/new `63a5a9ba916f` → /leads/new `63a5a9ba916f` |  | target: observed 'Contact name' (step 7, 1657 ms ago), at action 'Contact name' |
| 9 | 2564–2596 | fill | `{"index":1,"name":"Company","value":"Acme Corp"}` | /leads/new `63a5a9ba916f` → /leads/new `63a5a9ba916f` |  | target: observed 'Company' (step 7, 1691 ms ago), at action 'Company' |
| **10** | 2596–2629 | selectOptionAt | `{"index":2,"optionIndex":3,"observedLabel":"Priya Shah"}` | /leads/new `63a5a9ba916f` → /leads/new `63a5a9ba916f` |  | target: observed 'Priya Shah' (step 7, 1725 ms ago), at action 'Alex Kim' **STALE** |
| 11 | 2629–2663 | clickSelector | `{"selector":"#save-lead"}` | /leads/new `63a5a9ba916f` → /leads/new `63a5a9ba916f` |  |  |
| 12 | 2663–2696 | waitForNavigation | `{"timeoutMs":10000}` | - `-` → /leads/1001 `39d56917a7c6` | POST /leads → 303<br>GET /leads/1001 → 200 |  |
| 13 | 2696–2710 | observe | `{}` | /leads/1001 `39d56917a7c6` → /leads/1001 `39d56917a7c6` |  |  |
| 14 | 2711–2722 | observe | `{}` | /leads/1001 `39d56917a7c6` → /leads/1001 `39d56917a7c6` |  |  |
| 15 | 2722 | done | `{"success":true,"leadId":1001}` | | | Lead 1001 created for Acme Corp, owner Priya Shah. |
