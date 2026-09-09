// Fetches booked balances for every linked account and POSTs them to a Google
// Apps Script web app. Invoked by POST /cron/sync-balances or `npm run sync-sheets`.
import { config, isConfigured } from "./config.ts";
import { accountDisplayName, daysLeft, isoDate, sessionName, simplifyBalances } from "./data.ts";
import type { StoredAccount } from "./store.ts";
import { eb, EnableBankingError } from "./enablebanking.ts";
import { store } from "./store.ts";
import { isAirwallexConfigured, listAirwallexBalances, AirwallexError } from "./airwallex.ts";
import { isPayPalConfigured, listPayPalBalances, PayPalError } from "./paypal.ts";
import { isStripeConfigured, listStripeBalances, StripeError } from "./stripe.ts";
import { isVivaConfigured, listVivaWallets, VivaError } from "./viva.ts";

export interface BalanceRow {
  date: string;
  source: "enablebanking" | "viva" | "airwallex" | "stripe" | "paypal";
  /** Bank name for Enable Banking rows (Eurobank, Wise, …). */
  bank?: string;
  account: string;
  uid: string;
  iban?: string;
  currency: string;
  booked?: number;
  available?: number;
  error?: string;
}

const SOURCE_TIMEOUT_MS = 20_000;

async function withTimeout<T>(label: string, work: Promise<T>, ms = SOURCE_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

function ebErrorMessage(err: unknown): string {
  if (err instanceof EnableBankingError) {
    const detail = err.body.slice(0, 120).replace(/\s+/g, " ").trim();
    return `${err.status}${err.consentGone ? " (consent expired)" : ""}${detail ? `: ${detail}` : ""}`;
  }
  return (err as Error).message;
}

async function ensureStoredAccount(accountUid: string, sessionId: string): Promise<StoredAccount | undefined> {
  const s = store();
  let stored = s.account(accountUid);
  if (stored && accountDisplayName(stored) !== accountUid) return stored;

  try {
    const details = await eb.getAccount(accountUid);
    s.update((d) => {
      const existing = d.accounts[accountUid];
      d.accounts[accountUid] = {
        uid: accountUid,
        session_id: sessionId,
        name: details.name ?? existing?.name,
        product: details.product ?? existing?.product,
        iban: details.account_id?.iban ?? existing?.iban,
        other_id: details.account_id?.other?.identification ?? existing?.other_id,
        currency: details.currency ?? existing?.currency ?? "EUR",
        cash_account_type: details.cash_account_type ?? existing?.cash_account_type,
        identification_hash: details.identification_hash ?? existing?.identification_hash ?? accountUid,
        label: existing?.label,
        last_polled: existing?.last_polled,
      };
    });
    stored = s.account(accountUid);
  } catch {
    return stored;
  }
  return stored;
}

async function fetchEnableBankingAccountRow(date: string, accountUid: string, bank: string, sessionId: string): Promise<BalanceRow> {
  const s = store();
  const stored = await ensureStoredAccount(accountUid, sessionId);
  const session = s.data.sessions[sessionId];
  const account = stored ? accountDisplayName(stored) : accountUid;
  const consentExpired = session && daysLeft(session.valid_until) < 0;

  if (consentExpired) {
    return {
      date,
      source: "enablebanking",
      bank,
      account,
      uid: accountUid,
      iban: stored?.iban,
      currency: stored?.currency ?? "EUR",
      error: "Consent expired — reconnect via /connect",
    };
  }

  try {
    const balances = simplifyBalances(await withTimeout(`Enable Banking ${bank} ${account}`, eb.getBalances(accountUid), 15_000));
    return {
      date,
      source: "enablebanking",
      bank,
      account,
      uid: accountUid,
      iban: stored?.iban,
      currency: stored?.currency ?? balances.currency ?? "EUR",
      booked: balances.booked,
      available: balances.available,
    };
  } catch (err) {
    return {
      date,
      source: "enablebanking",
      bank,
      account,
      uid: accountUid,
      iban: stored?.iban,
      currency: stored?.currency ?? "EUR",
      error: ebErrorMessage(err),
    };
  }
}

async function fetchEnableBankingBalances(date: string): Promise<BalanceRow[]> {
  const s = store();
  const sessions = s.sessions();
  if (!sessions.length) return [];

  const rows: BalanceRow[] = [];
  const seenUids = new Set<string>();

  for (const session of sessions) {
    const bank = sessionName(session);

    if (daysLeft(session.valid_until) < 0) {
      rows.push({
        date,
        source: "enablebanking",
        bank,
        account: bank,
        uid: `session:${session.id}`,
        currency: "EUR",
        error: "Consent expired — reconnect via /connect",
      });
      continue;
    }

    let accountUids: string[] = [];
    try {
      const status = await withTimeout(`Enable Banking ${bank} session`, eb.getSession(session.id), 15_000);
      accountUids = status.accounts ?? [];
    } catch (err) {
      rows.push({
        date,
        source: "enablebanking",
        bank,
        account: bank,
        uid: `session:${session.id}`,
        currency: "EUR",
        error: ebErrorMessage(err),
      });
      continue;
    }

    if (!accountUids.length) {
      rows.push({
        date,
        source: "enablebanking",
        bank,
        account: bank,
        uid: `session:${session.id}:empty`,
        currency: "EUR",
        error: "No accounts returned by bank",
      });
      continue;
    }

    for (const uid of accountUids) {
      seenUids.add(uid);
      rows.push(await fetchEnableBankingAccountRow(date, uid, bank, session.id));
    }
  }

  for (const account of s.accounts()) {
    if (seenUids.has(account.uid)) continue;
    const session = s.data.sessions[account.session_id];
    rows.push(await fetchEnableBankingAccountRow(date, account.uid, session ? sessionName(session) : "Enable Banking", account.session_id));
  }

  return rows;
}

async function fetchVivaBalances(date: string): Promise<BalanceRow[]> {
  if (!isVivaConfigured()) return [];
  try {
    const wallets = await listVivaWallets();
    return wallets.map((wallet) => ({
      date,
      source: "viva" as const,
      account: wallet.friendlyName ?? `Viva wallet ${wallet.walletId}`,
      uid: `viva:${wallet.walletId}`,
      iban: wallet.iban,
      currency: wallet.currency,
      booked: wallet.available,
      available: wallet.available,
    }));
  } catch (err) {
    const msg = err instanceof VivaError ? `${err.status}` : (err as Error).message;
    return [{ date, source: "viva", account: "Viva", uid: "viva:error", currency: "EUR", error: msg }];
  }
}

async function fetchAirwallexBalances(date: string): Promise<BalanceRow[]> {
  if (!isAirwallexConfigured()) return [];
  try {
    const balances = await listAirwallexBalances();
    return balances.map((b) => ({
      date,
      source: "airwallex" as const,
      account: `Airwallex ${b.accountType}`,
      uid: `airwallex:${b.accountType}:${b.currency}`,
      currency: b.currency,
      booked: b.available,
      available: b.available,
    }));
  } catch (err) {
    const msg =
      err instanceof AirwallexError
        ? `${err.status}: ${(() => { try { return JSON.parse(err.body).code ?? err.body.slice(0, 120); } catch { return err.body.slice(0, 120); } })()}`
        : (err as Error).message;
    return [{ date, source: "airwallex", account: "Airwallex", uid: "airwallex:error", currency: "USD", error: msg }];
  }
}

async function fetchStripeBalances(date: string): Promise<BalanceRow[]> {
  if (!isStripeConfigured()) return [];
  try {
    const balances = await listStripeBalances();
    return balances.flatMap((b) => {
      const rows: BalanceRow[] = [{
        date,
        source: "stripe",
        account: "Stripe available",
        uid: `stripe:available:${b.currency}`,
        currency: b.currency,
        booked: b.available,
        available: b.available,
      }];
      if (b.pending !== 0) {
        rows.push({
          date,
          source: "stripe",
          account: "Stripe pending",
          uid: `stripe:pending:${b.currency}`,
          currency: b.currency,
          booked: b.pending,
          available: b.pending,
        });
      }
      return rows;
    });
  } catch (err) {
    const msg =
      err instanceof StripeError
        ? `${err.status}: ${(() => { try { return JSON.parse(err.body).error?.message ?? err.body.slice(0, 120); } catch { return err.body.slice(0, 120); } })()}`
        : (err as Error).message;
    return [{ date, source: "stripe", account: "Stripe", uid: "stripe:error", currency: "USD", error: msg }];
  }
}

async function fetchPayPalBalances(date: string): Promise<BalanceRow[]> {
  if (!isPayPalConfigured()) return [];
  try {
    const balances = await listPayPalBalances();
    return balances.map((b) => ({
      date,
      source: "paypal" as const,
      account: "PayPal available",
      uid: `paypal:available:${b.currency}`,
      currency: b.currency,
      booked: b.available,
      available: b.available,
    }));
  } catch (err) {
    const msg =
      err instanceof PayPalError
        ? `${err.status}: ${(() => { try { return JSON.parse(err.body).message ?? err.body.slice(0, 120); } catch { return err.body.slice(0, 120); } })()}`
        : (err as Error).message;
    return [{ date, source: "paypal", account: "PayPal", uid: "paypal:error", currency: "USD", error: msg }];
  }
}

async function fetchSource(label: string, source: BalanceRow["source"], currency: string, work: Promise<BalanceRow[]>): Promise<BalanceRow[]> {
  try {
    return await withTimeout(label, work);
  } catch (err) {
    return [{ date: isoDate(), source, account: label, uid: `${source}:timeout`, currency, error: (err as Error).message }];
  }
}

export async function fetchAllBalances(): Promise<{ rows: BalanceRow[] }> {
  if (!isConfigured()) throw new Error("BankConnector is not configured yet.");

  const date = isoDate();
  const [ebRows, vivaRows, airwallexRows, stripeRows, paypalRows] = await Promise.all([
    fetchSource("Enable Banking", "enablebanking", "EUR", fetchEnableBankingBalances(date)),
    fetchSource("Viva", "viva", "EUR", fetchVivaBalances(date)),
    fetchSource("Airwallex", "airwallex", "USD", fetchAirwallexBalances(date)),
    fetchSource("Stripe", "stripe", "USD", fetchStripeBalances(date)),
    fetchSource("PayPal", "paypal", "USD", fetchPayPalBalances(date)),
  ]);
  const rows = [...ebRows, ...vivaRows, ...airwallexRows, ...stripeRows, ...paypalRows];

  if (!rows.length) {
    throw new Error("No accounts linked yet. Connect a bank or configure Viva/Airwallex/Stripe/PayPal API credentials.");
  }

  return { rows };
}

export async function syncBalancesToSheet(): Promise<{ rows: BalanceRow[] }> {
  const url = config.googleSheetsWebhookUrl;
  if (!url) throw new Error("Set GOOGLE_SHEETS_WEBHOOK_URL to your Google Apps Script web app URL.");

  const { rows } = await fetchAllBalances();

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "bankconnector", synced_at: new Date().toISOString(), rows }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google Sheets webhook ${res.status}: ${text.slice(0, 300)}`);
  return { rows };
}
