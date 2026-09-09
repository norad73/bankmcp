// HTTP entry point: the MCP endpoint behind OAuth, the OAuth server itself,
// the Enable Banking redirect target, and a status page.
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import express from "express";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config, isConfigured, setupProblems } from "./config.ts";
import { eb, EnableBankingError } from "./enablebanking.ts";
import { store } from "./store.ts";
import { SingleUserProvider, verifyPassword } from "./auth.ts";
import { balancesLoginPage, balancesPage, connectedPage, failedPage, loginPage, privacyPage, setupPage, signInFailedPage, statusPage, termsPage } from "./pages.ts";
import { applySetup, setupAvailable } from "./setup.ts";
import { createServer, VERSION } from "./mcp.ts";
import { startWatcher } from "./watcher.ts";
import { fetchRatesToUsd } from "./fx.ts";
import { fetchAllBalances, syncBalancesToSheet } from "./sync-sheets.ts";
import { isoDate } from "./data.ts";

export interface AppOptions {
  /** Mount the OAuth server and the /mcp endpoint. Off in local (stdio) mode. */
  remote: boolean;
}

export function createApp(opts: AppOptions) {
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

  const baseUrl = new URL(config.baseUrl);
  const mcpUrl = new URL("/mcp", baseUrl);
  const provider = new SingleUserProvider(store(), {
    onLogin: (e) => {
      const who = e.clientName ? ` for ${e.clientName}` : "";
      if (e.ok) {
        log(`sign-in from ${e.ip}${who}`);
        notify(`${config.appName}: new sign-in from ${e.ip}${who}. If this was not you, change ADMIN_PASSWORD now; that logs every client out.`);
      } else {
        log(`failed sign-in from ${e.ip}${who} (${e.reason})`);
      }
    },
  });

  // Changing the admin password logs every client out.
  function rememberPasswordFingerprint(): void {
    const secret = config.adminPasswordHash || config.adminPassword;
    if (!secret) return;
    const fingerprint = createHash("sha256").update(secret).digest("hex");
    if (store().data.oauth.password_fingerprint && store().data.oauth.password_fingerprint !== fingerprint) {
      provider.revokeAll();
      log("admin password changed: all tokens revoked");
    }
    if (store().data.oauth.password_fingerprint !== fingerprint) store().update((d) => void (d.oauth.password_fingerprint = fingerprint));
  }
  if (opts.remote) rememberPasswordFingerprint();

  let watcherStarted = false;
  function startWatcherOnce(): void {
    if (watcherStarted || !isConfigured()) return;
    watcherStarted = true;
    startWatcher();
  }

  function notify(text: string): void {
    if (!config.notifyWebhookUrl) return;
    const slack = /hooks\.slack\.com/.test(config.notifyWebhookUrl);
    fetch(config.notifyWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slack ? { text } : { source: config.appName, type: "sign_in", text }),
    }).catch((err) => log("notify failed", (err as Error).message));
  }

  // --- Status page, health, legal ---

  const callbackUrl = new URL("/callback", baseUrl).href;
  // The setup page reads the chosen key file in the browser, which needs one inline script.
  const setupCsp = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

  app.get("/", (_req, res) => {
    if (setupAvailable()) return void res.set("Content-Security-Policy", setupCsp).type("html").send(setupPage({ baseUrl: config.baseUrl }));
    res.type("html").send(statusPage({ problems: setupProblems(), mcpUrl: mcpUrl.href, callbackUrl }));
  });

  app.post("/setup", express.urlencoded({ extended: false, limit: "64kb" }), (req, res) => {
    if (!setupAvailable()) return void res.status(404).type("html").send(failedPage("Setup is already complete."));
    const body = req.body as Record<string, string | undefined>;
    const error = applySetup(body);
    if (error) return void res.status(400).set("Content-Security-Policy", setupCsp).type("html").send(setupPage({ error, values: { app_id: body.app_id, country: body.country }, baseUrl: config.baseUrl }));
    log("setup completed via the setup page");
    if (opts.remote) rememberPasswordFingerprint();
    startWatcherOnce();
    res.redirect(303, "/");
  });

  app.get("/healthz", (_req, res) => void res.json({ ok: true, version: VERSION, configured: isConfigured() }));

  const BALANCES_COOKIE = "bankmcp_balances";
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
    if (!isConfigured()) return void res.type("html").send(balancesPage({ asOf: isoDate(), fetchedAt: new Date().toISOString(), rows: [], error: "BankMCP is not configured yet." }));
    try {
      const result = await fetchAllBalances();
      const rows = result.rows.map((r) => ({
        source: r.source,
        account: r.account,
        currency: r.currency,
        booked: r.booked,
        available: r.available,
        error: r.error,
      }));
      const fx = await fetchRatesToUsd(rows.map((r) => r.currency));
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

  if (opts.remote && config.cronSecret) {
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

  // --- OAuth server for the MCP connector (single user) ---

  if (opts.remote) app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: baseUrl,
      resourceServerUrl: mcpUrl,
      resourceName: "bank-mcp",
      scopesSupported: ["bank:read"],
      clientRegistrationOptions: { clientSecretExpirySeconds: 0 },
    }),
  );

  if (opts.remote) app.post("/login", express.urlencoded({ extended: false }), (req, res) => {
    const { request, password } = req.body as Record<string, string | undefined>;
    const result = provider.completeLogin(String(request ?? ""), String(password ?? ""), req.ip ?? "unknown");
    if ("redirect" in result) return void res.redirect(302, result.redirect);
    if (result.requestId) return void res.status(401).type("html").send(loginPage({ requestId: result.requestId, error: result.error }));
    res.status(400).type("html").send(signInFailedPage(result.error));
  });

  // --- MCP endpoint (stateless: one transport per request) ---

  const bearer = requireBearerAuth({ verifier: provider, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl) });

  if (opts.remote) app.post("/mcp", bearer, express.json({ limit: "1mb" }), async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      log("mcp request failed", err);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  });

  if (opts.remote) app.get("/mcp", bearer, (_req, res) => void res.status(405).set("Allow", "POST").json({ error: "This server is stateless; use POST." }));
  if (opts.remote) app.delete("/mcp", bearer, (_req, res) => void res.status(405).set("Allow", "POST").json({ error: "This server is stateless; use POST." }));

  // --- Enable Banking redirect target ---

  app.get("/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query as Record<string, string | undefined>;
    const pending = state ? store().takePendingAuth(state) : undefined;
    const failed = (msg: string) => res.status(400).type("html").send(failedPage(msg));

    if (error || !code) return void failed(error_description || error || "The bank did not return an authorization code.");
    if (!pending) return void failed("Unknown or expired authorization. Start again from your assistant.");

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

  return Object.assign(app, { startWatcherOnce });
}
