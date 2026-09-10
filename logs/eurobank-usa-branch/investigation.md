# Eurobank USA Branch — investigation

## Symptom
`/balances` shows **Eurobank USA Branch** with status **Error** and message **No accounts returned by bank**.

## Root finding (from production logs)
OAuth succeeded, but Enable Banking returned **zero accounts** immediately after connect:

```
2026-09-09 12:20:31 UTC — bank connected: Eurobank USA Branch, 0 account(s) [] psu=business country=GR
```

Same ASPSP as IKE (`Eurobank`, `country=GR`), but IKE returned 2 accounts with personal credentials. USA Branch used `psu_type=business`.

## Reconnect attempt (2026-09-09 13:08 UTC)
User selected account **GR4602602810000730201203690** (€1,494.30) and business debit card in Eurobank consent UI. BankConnector still logged:

```
bank connected: Eurobank USA Branch, 0 account(s) [] psu=business country=GR
```

Consent UI shows the account; Enable Banking API returns empty `accounts[]`.

## Confirmed (probe 2026-09-09)
Session `cc435054-3f1b-488e-9725-ac9ebf799f92` is **AUTHORIZED** until 2027-03-08, but Enable Banking returns **zero accounts**:

- `getSession.accounts`: `[]`
- `getSession.access.accounts`: `null` (balances/transactions scopes granted, but no account list)
- Reconnect or refresh will not help until the bank exposes account UIDs via the API.

See `probe-2026-09-09.json`.

## Likely cause
The US branch account is **not exposed** through Eurobank Greece open banking, even though consent succeeded in the bank UI.

## Logs

All banks share one log file: **`logs/render-YYYY-MM-DD.txt`**

Refresh:
```powershell
.\scripts\pull-eb-logs.ps1
```

On-server detailed EB API log (after v0.4.8+): `/data/logs/eb-debug.jsonl` on Render disk (all banks, one file).

## Files in this folder

| File | Description |
|------|-------------|
| `connect-event-2026-09-09.json` | Structured summary of the failed connect |
| `probe-2026-09-09.json` | Live probe — confirms empty `accounts[]` on authorized session |

## Options
1. **Contact Enable Banking / Eurobank** — ask whether US branch accounts are supported on Eurobank GR API; cite session `cc435054-3f1b-488e-9725-ac9ebf799f92`.
2. **Manual balance entry** in BankConnector (if auto-sync is not possible).
3. **Remove the connection** from `/connected` if it will never return data.
