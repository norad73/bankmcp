# Eurobank USA Branch — investigation

## Symptom
`/balances` shows **Eurobank USA Branch** with status **Error** and message **No accounts returned by bank**.

## Known facts (from production logs)
- **2026-09-09 12:20:31 UTC** — OAuth completed successfully:
  ```
  bank connected: Eurobank USA Branch, 0 account(s) [] psu=business country=GR
  ```
- Consent is valid until **2027-03-08** (connected page confirmed).
- Connection used Greek Eurobank ASPSP (`country=GR`), not a separate US entity.
- Enable Banking returned **zero accounts** in both `createSession` and `getSession` after connect.

## Likely cause
The US branch account may not be exposed through Eurobank Greece open banking, even if selected in the bank consent UI. The session exists but has no account UIDs.

## Files in this folder
| File | Description |
|------|-------------|
| `render-app-2026-09-09.txt` | Render application logs (`[bank]` lines) |
| `render-2026-09-09.txt` | Broader Render log snapshot |
| `probe-*.json` | Output from `/debug/eb-investigation` (after running probe) |

## How to collect more logs

### 1. Run live probe (logged in)
Open while signed in to BankConnector:
```
https://bankconnector.onrender.com/debug/eb-investigation?label=Eurobank%20USA%20Branch
```
Save the JSON response as `probe-YYYY-MM-DD.json` in this folder.

### 2. Pull Render logs locally
```powershell
.\scripts\pull-eb-logs.ps1
```

### 3. On-server detailed log
After v0.4.8+, Enable Banking calls append to `/data/logs/eb-debug.jsonl` on Render (persistent disk).

## Next steps to try
1. Confirm with Eurobank whether US branch accounts are available via GR open banking API.
2. Reconnect and watch probe output for `getSession.accountUids`.
3. If UIDs appear but `getAccount`/`getBalances` fail, check error bodies in probe JSON.
