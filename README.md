# BankConnector

Daily bank balance sync to Google Sheets.

Pulls balances from Enable Banking (PSD2), Viva, Airwallex, Stripe, and PayPal, then pushes rows to a Google Apps Script webhook on a schedule.

## Deploy (Render)

1. Push to GitHub and connect the repo on [Render](https://render.com).
2. Apply `render.yaml` (web service `bankconnector` + daily cron).
3. Set env vars for each payment provider you use.
4. Deploy `scripts/google-sheets-webhook.gs` on the spreadsheet (Extensions → Apps Script). Set script properties `BANKCONNECTOR_URL` and `CRON_SECRET`, deploy as web app, paste the URL into `GOOGLE_SHEETS_WEBHOOK_URL`. Use **BankConnector → Fill balances sheet** or insert a button assigned to `fillBalancesSheet`.
5. Connect banks via `/connect?bank=Eurobank` (or Wise, etc.).

## Local

```bash
npm install
cp .env.example .env   # fill in credentials
npm run dev
```

- Status: http://localhost:8080
- Balances: http://localhost:8080/balances
- Manual sync: `npm run sync-sheets`

## Enable Banking

Register an application at https://enablebanking.com/cp/applications with redirect URL:

```
https://bankconnector.onrender.com/callback
```

(or your local/ngrok URL for dev)

## CLI

```bash
npm run check           # verify config + Enable Banking app
npm run hash-password   # generate ADMIN_PASSWORD_HASH
```
