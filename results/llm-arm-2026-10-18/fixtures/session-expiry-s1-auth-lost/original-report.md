# Run session-expiry-s1-sh-p0-mvdasynwltr

- **Task:** Create a lead for Acme Corp (contact Jane Roe) assigned to Priya Shah, then report the lead ID.
- **Agent:** sh-p0 · **Fault:** session-expiry · **Seed:** 1 · **Timings:** {"ownersRefreshMs":864,"submitDelayMs":2469}
- **Verdict:** FAIL (expectation: task-success)
- **Agent claim:** failure — "Attempted to create a lead for Acme Corp (contact Jane Roe, owner Priya Shah). Filled in the form and clicked Save, but the session expired and required re-authentication. After re-entering credentials, the browser/RPC connection closed permanently (CDP connection closed, RPC client closed) and could not be recovered despite multiple retries. Unable to confirm whether the lead was created or obtain a lead ID."
- **Duration:** 350139 ms · **Steps:** 24 · **Model calls:** 29

## Ground truth (application state)

| Check | Result | Expected | Actual |
|---|---|---|---|
| exactly-one-lead | ❌ | `1` | `0` |
| owner-correct | ❌ | `"Priya Shah"` | `null` |
| contact-correct | ❌ | `"Jane Roe"` | `null` |
| claim-matches-state | ✅ | `{"success":false,"leadIds":[]}` | `{"success":false,"leadId":null}` |

## Findings

- **wrong-outcome** (symptom, oracle) — Task outcome incorrect: exactly-one-lead (expected 1, got 0); owner-correct (expected "Priya Shah", got null); contact-correct (expected "Jane Roe", got null). _Steps: 25_
- **auth-lost** (cause, rule) — Session was lost mid-task: 1 write(s) rejected for authentication; redirected to login at step(s) 10. _Steps: 10_

## Timeline

| Step | t (ms) | Tool | Args | Before → after | Network | Notes |
|---|---|---|---|---|---|---|
| 1 | 4332–4369 | navigate | `{"path":"/leads/new"}` | /blank.html `97aea528cd5e` → /login `46dbb23d2fc6` | GET /leads/new → 303<br>GET /login → 200 |  |
| 2 | 6218–6223 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 3 | 8692–11745 | act | `{"instruction":"Type 'demo' into the Username field"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 4 | 11745–14546 | act | `{"instruction":"Type '{{secret:app_password}}' into the Password field"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 5 | 16632–19310 | act | `{"instruction":"Click the Sign in button"}` | /login `46dbb23d2fc6` → /leads/new `75f3b7f4bdb8` | POST /login → 303<br>GET /leads/new → 200 |  |
| 6 | 21056–21061 | observe | `{}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| 7 | 24041–27346 | act | `{"instruction":"Type 'Jane Roe' into the Contact name field"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| 8 | 27346–30120 | act | `{"instruction":"Type 'Acme Corp' into the Company field"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| 9 | 30120–32609 | act | `{"instruction":"Select 'Priya Shah' from the Owner dropdown"}` | /leads/new `75f3b7f4bdb8` → /leads/new `75f3b7f4bdb8` |  |  |
| **10** | 34479–37605 | act | `{"instruction":"Click the Save lead button"}` | /leads/new `75f3b7f4bdb8` → /login `46dbb23d2fc6` | POST /leads → 303<br>GET /login → 200 |  |
| 11 | 40568–40572 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 12 | 43421–46722 | act | `{"instruction":"Type 'demo' into the Username field"}` | /login `46dbb23d2fc6` → - `-` |  | ⚠️ CDP connection closed (close code 1006) |
| 13 | 46722–46725 | act | `{"instruction":"Type '{{secret:app_password}}' into the Password field"}` | - `-` → - `-` |  | ⚠️ RPC client is closed |
| 14 | 319511–319512 | observe | `{}` | - `-` → - `-` |  | ⚠️ page.evaluate: Target page, context or browser has been closed |
| 15 | 321288–321289 | navigate | `{"path":"/leads/new"}` | - `-` → - `-` |  | ⚠️ RPC client is closed |
| 16 | 324060–324061 | navigate | `{"path":"/leads/new"}` | - `-` → - `-` |  | ⚠️ RPC client is closed |
| 17 | 325440–325441 | observe | `{}` | - `-` → - `-` |  | ⚠️ page.evaluate: Target page, context or browser has been closed |
| 18 | 328044–328046 | navigate | `{"path":"/leads/new"}` | - `-` → - `-` |  | ⚠️ RPC client is closed |
| 19 | 329812–329814 | observe | `{}` | - `-` → - `-` |  | ⚠️ page.evaluate: Target page, context or browser has been closed |
| 20 | 331542–331543 | navigate | `{"path":"/login"}` | - `-` → - `-` |  | ⚠️ RPC client is closed |
| 21 | 334430–334431 | navigate | `{"path":"/login"}` | - `-` → - `-` |  | ⚠️ RPC client is closed |
| 22 | 337373–337374 | observe | `{}` | - `-` → - `-` |  | ⚠️ page.evaluate: Target page, context or browser has been closed |
| 23 | 340303–340304 | navigate | `{"path":"/leads"}` | - `-` → - `-` |  | ⚠️ RPC client is closed |
| 24 | 343340–343341 | navigate | `{"path":"/leads"}` | - `-` → - `-` |  | ⚠️ RPC client is closed |
| 25 | 347156 | done | `{"success":false}` | | | Attempted to create a lead for Acme Corp (contact Jane Roe, owner Priya Shah). Filled in the form and clicked Save, but the session expired and required re-authentication. After re-entering credentials, the browser/RPC connection closed permanently (CDP connection closed, RPC client closed) and could not be recovered despite multiple retries. Unable to confirm whether the lead was created or obtain a lead ID. |
