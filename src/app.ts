// HTTP server: balance sync, bank connections, and status pages.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import express from "express";
import { config, isConfigured, setupProblems } from "./config.ts";
import { eb, EnableBankingError } from "./enablebanking.ts";
import { store } from "./store.ts";
import { verifyPassword } from "./auth.ts";
import { balancesLoginPage, balancesPage, connectedPage, failedPage, privacyPage, setupPage, statusPage, termsPage } from "./pages.ts";
import { applySetup, setupAvailable } from "./setup.ts";
import { fetchRatesToUsd } from "./fx.ts";
import { fetchAllBalances, syncBalancesToSheet } from "./sync-sheets.ts";
import { isoDate } from "./data.ts";
import { VERSION } from "./version.ts";

export function createApp() {
  const log = (msg: string, extra?: unknown) => console.log(`[bank ${new Date().toISOString()}] ${msg}`, extra ?? "");

  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    });
    next();
  });

  const callbackUrl = new URL("/callback", config.baseUrl).href;
  const setupCsp = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

  app.get("/", (_req, res) => {
    if (setupAvailable()) return void res.set("Content-Security-Policy", setupCsp).type("html").send(setupPage({ baseUrl: config.baseUrl }));
    res.type("html").send(statusPage({ problems: setupProblems(), callbackUrl }));
  });

  app.post("/setup", express.urlencoded({ extended: false, limit: "64kb" }), (req, res) => {
    if (!setupAvailable()) return void res.status(404).type("html").send(failedPage("Setup is already complete."));
    const body = req.body as Record<string, string | undefined>;
    const error = applySetup(body);
    if (error) return void res.status(400).set("Content-Security-Policy", setupCsp).type("html").send(setupPage({ error, values: { app_id: body.app_id, country: body.country }, baseUrl: config.baseUrl }));
    log("setup completed via the setup page");
    res.redirect(303, "/");
  });

  app.get("/healthz", (_req, res) => void res.json({ ok: true, version: VERSION, configured: isConfigured() }));

  const BALANCES_COOKIE = "bankconnector_balances";
  const BALANCES_TTL = 24 * 60 * 60;
  const balancesSecret = () => config.adminPasswordHash || config.adminPassword || config.cronSecret || "";

  const signBalancesCookie = () => {
    const exp = Math.floor(Date.now() / 1000) + BALANCES_TTL;
    const sig = createHmac("sha256", balancesSecret()).update(String(exp)).digest("base64url");
    return `${exp}.${sig}`;
  };

  const verifyBalancesCookie = (value: string | undefined) => {
    if (!value || !balancesSecret()) return false;
    const [expStr, sig] = value.split(".");
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expected = createHmac("sha256", balancesSecret()).update(String(exp)).digest("base64url");
    const a = Buffer.from(sig ?? "");
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  const readCookie = (req: express.Request, name: string) => {
    const header = req.headers.cookie;
    if (!header) return undefined;
    for (const part of header.split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      if (part.slice(0, eq).trim() !== name) continue;
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
    return undefined;
  };

  const balancesAuthed = (req: express.Request) => verifyBalancesCookie(readCookie(req, BALANCES_COOKIE));

  app.get("/balances", async (req, res) => {
    if (!balancesAuthed(req)) return void res.type("html").send(balancesLoginPage());
    if (!isConfigured()) return void res.type("html").send(balancesPage({ asOf: isoDate(), fetchedAt: new Date().toISOString(), rows: [], error: "BankConnector is not configured yet." }));
    try {
      const [result, fx] = await Promise.all([
        fetchAllBalances(),
        fetchRatesToUsd(["EUR", "USD", "GBP"]),
      ]);
      const rows = result.rows.map((r) => ({
        source: r.source,
        account: r.account,
        currency: r.currency,
        booked: r.booked,
        available: r.available,
        error: r.error,
      }));
      res.type("html").send(balancesPage({
        asOf: isoDate(),
        fetchedAt: new Date().toISOString(),
        rows,
        fx,
      }));
    } catch (err) {
      log("balances page failed", (err as Error).message);
      res.type("html").send(balancesPage({ asOf: isoDate(), fetchedAt: new Date().toISOString(), rows: [], error: (err as Error).message }));
    }
  });

  app.post("/balances/login", express.urlencoded({ extended: false }), (req, res) => {
    const password = String((req.body as Record<string, string | undefined>).password ?? "");
    if (!verifyPassword(password)) return void res.status(401).type("html").send(balancesLoginPage({ error: "Wrong password." }));
    res.cookie(BALANCES_COOKIE, signBalancesCookie(), { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: BALANCES_TTL * 1000, path: "/" });
    res.redirect(303, "/balances");
  });

  if (config.cronSecret) {
    const cronAuth = (req: express.Request, res: express.Response) => {
      if (req.headers.authorization !== `Bearer ${config.cronSecret}`) {
        res.status(401).json({ error: "unauthorized" });
        return false;
      }
      return true;
    };

    app.get("/cron/balances", async (req, res) => {
      if (!cronAuth(req, res)) return;
      try {
        const result = await fetchAllBalances();
        res.json({ ok: true, as_of: isoDate(), accounts: result.rows });
      } catch (err) {
        log("balances failed", (err as Error).message);
        res.status(500).json({ error: (err as Error).message });
      }
    });

    app.post("/cron/sync-balances", async (req, res) => {
      if (!cronAuth(req, res)) return;
      try {
        const result = await syncBalancesToSheet();
        log(`sync-balances: ${result.rows.length} row(s) sent to Google Sheets`);
        res.json({ ok: true, count: result.rows.length });
      } catch (err) {
        log("sync-balances failed", (err as Error).message);
        res.status(500).json({ error: (err as Error).message });
      }
    });
  }

  app.get("/connect", async (req, res) => {
    if (!isConfigured()) return void res.status(503).type("html").send(failedPage("Finish setup first."));
    const bank = String(req.query.bank ?? "Eurobank");
    const country = String(req.query.country ?? config.country).toUpperCase();
    const psuType = String(req.query.psu_type ?? req.query.customer_type ?? "personal").toLowerCase() === "business" ? "business" : "personal";
    try {
      const banks = await eb.listAspsps(country);
      const aspsp = banks.find((b) => b.name === bank) ?? banks.find((b) => b.name.toLowerCase() === bank.toLowerCase());
      if (!aspsp) return void res.status(404).type("html").send(failedPage(`Bank "${bank}" not found in ${country}.`));
      const maxSeconds = Math.min(aspsp.maximum_consent_validity ?? 180 * 86_400, 180 * 86_400);
      const validUntil = new Date(Date.now() + maxSeconds * 1000 - 60_000);
      const state = randomUUID();
      store().addPendingAuth({ state, bank: { name: aspsp.name, country: aspsp.country }, started: new Date().toISOString() });
      const auth = await eb.startAuthorization({ aspsp, state, redirectUrl: `${config.baseUrl}/callback`, validUntil, psuType });
      res.redirect(302, auth.url);
    } catch (err) {
      log("connect failed", (err as Error).message);
      res.status(500).type("html").send(failedPage(err instanceof EnableBankingError ? `${err.status}: ${err.body.slice(0, 300)}` : (err as Error).message));
    }
  });

  app.get("/privacy", (_req, res) => void res.type("html").send(privacyPage()));
  app.get("/terms", (_req, res) => void res.type("html").send(termsPage()));

  app.get("/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query as Record<string, string | undefined>;
    const pending = state ? store().takePendingAuth(state) : undefined;
    const failed = (msg: string) => res.status(400).type("html").send(failedPage(msg));

    if (error || !code) return void failed(error_description || error || "The bank did not return an authorization code.");
    if (!pending) return void failed("Unknown or expired authorization. Visit /connect?bank=YourBank to start again.");

    try {
      const session = await eb.createSession(code);
      store().addSession(session);
      log(`bank connected: ${session.aspsp.name}, ${session.accounts.length} account(s)`);
      res.type("html").send(connectedPage(session));
    } catch (err) {
      const msg = err instanceof EnableBankingError ? `Enable Banking returned ${err.status}: ${err.body.slice(0, 300)}` : (err as Error).message;
      log("callback failed", msg);
      failed(msg);
    }
  });

  return app;
}
