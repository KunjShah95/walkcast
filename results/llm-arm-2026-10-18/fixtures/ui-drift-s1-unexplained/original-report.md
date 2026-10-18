# Run ui-drift-s1-sh-p0-mvdat6e46mz

- **Task:** Create a lead for Acme Corp (contact Jane Roe) assigned to Priya Shah, then report the lead ID.
- **Agent:** sh-p0 · **Fault:** ui-drift · **Seed:** 1 · **Timings:** {"ownersRefreshMs":864,"submitDelayMs":2469}
- **Verdict:** FAIL (expectation: task-success)
- **Agent claim:** failure — "Filled in the new lead form with Contact name "Jane Roe", Company "Acme Corp", and Owner "Priya Shah", but the browser/CDP connection closed unexpectedly right when clicking Create, and subsequent attempts to reconnect or navigate failed with "RPC client is closed" / "Target page, context or browser has been closed" errors. Unable to confirm whether the lead was actually created or retrieve its ID."
- **Duration:** 336400 ms · **Steps:** 18 · **Model calls:** 23

## Ground truth (application state)

| Check | Result | Expected | Actual |
|---|---|---|---|
| exactly-one-lead | ❌ | `1` | `0` |
| owner-correct | ❌ | `"Priya Shah"` | `null` |
| contact-correct | ❌ | `"Jane Roe"` | `null` |
| claim-matches-state | ✅ | `{"success":false,"leadIds":[]}` | `{"success":false,"leadId":null}` |

## Findings

- **wrong-outcome** (symptom, oracle) — Task outcome incorrect: exactly-one-lead (expected 1, got 0); owner-correct (expected "Priya Shah", got null); contact-correct (expected "Jane Roe", got null). _Steps: 19_
- **unexplained** (cause, needs-review) — The run failed but no deterministic rule explains why. Candidate for LLM-assisted or human review.

## Timeline

| Step | t (ms) | Tool | Args | Before → after | Network | Notes |
|---|---|---|---|---|---|---|
| 1 | 4242–4280 | navigate | `{"path":"/leads/new"}` | /blank.html `97aea528cd5e` → /login `46dbb23d2fc6` | GET /leads/new → 303<br>GET /login → 200 |  |
| 2 | 6359–6363 | observe | `{}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 3 | 8611–11256 | act | `{"instruction":"type demo into the Username field"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 4 | 11256–14000 | act | `{"instruction":"type {{secret:app_password}} into the Password field"}` | /login `46dbb23d2fc6` → /login `46dbb23d2fc6` |  |  |
| 5 | 16216–18686 | act | `{"instruction":"click the Sign in button"}` | /login `46dbb23d2fc6` → /leads/new `36e6a974a7d2` | POST /login → 303<br>GET /leads/new → 200 |  |
| 6 | 20405–20411 | observe | `{}` | /leads/new `36e6a974a7d2` → /leads/new `36e6a974a7d2` |  |  |
| 7 | 23132–26408 | act | `{"instruction":"type Jane Roe into the Contact name field"}` | /leads/new `36e6a974a7d2` → /leads/new `36e6a974a7d2` |  |  |
| 8 | 26408–29771 | act | `{"instruction":"type Acme Corp into the Company field"}` | /leads/new `36e6a974a7d2` → /leads/new `36e6a974a7d2` |  |  |
| 9 | 29771–32351 | act | `{"instruction":"select Priya Shah from the Owner dropdown"}` | /leads/new `36e6a974a7d2` → /leads/new `36e6a974a7d2` |  |  |
| 10 | 34665–36704 | act | `{"instruction":"click the Create button"}` | /leads/new `36e6a974a7d2` → - `-` |  | ⚠️ CDP connection closed (close code 1006) |
| 11 | 310207–310208 | observe | `{}` | - `-` → - `-` |  | ⚠️ page.evaluate: Target page, context or browser has been closed |
| 12 | 313089–313090 | navigate | `{"path":"/leads/new"}` | - `-` → - `-` |  | ⚠️ RPC client is closed |
| 13 | 314811–314812 | navigate | `{"path":"/leads/new"}` | - `-` → - `-` |  | ⚠️ RPC client is closed |
| 14 | 317833–317835 | observe | `{}` | - `-` → - `-` |  | ⚠️ page.evaluate: Target page, context or browser has been closed |
| 15 | 320554–320554 | navigate | `{"path":"/leads"}` | - `-` → - `-` |  | ⚠️ RPC client is closed |
| 16 | 323346–323348 | observe | `{}` | - `-` → - `-` |  | ⚠️ page.evaluate: Target page, context or browser has been closed |
| 17 | 327106–327107 | navigate | `{"path":"/leads"}` | - `-` → - `-` |  | ⚠️ RPC client is closed |
| 18 | 329716–329717 | observe | `{}` | - `-` → - `-` |  | ⚠️ page.evaluate: Target page, context or browser has been closed |
| 19 | 333423 | done | `{"success":false}` | | | Filled in the new lead form with Contact name "Jane Roe", Company "Acme Corp", and Owner "Priya Shah", but the browser/CDP connection closed unexpectedly right when clicking Create, and subsequent attempts to reconnect or navigate failed with "RPC client is closed" / "Target page, context or browser has been closed" errors. Unable to confirm whether the lead was actually created or retrieve its ID. |
