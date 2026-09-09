// Configuration comes from two places. Environment variables always win.
// Anything missing is read from the data directory, where the first-run
// setup page stores the application id, the key file and the password hash.
import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const env = process.env;
const port = Number(env.PORT ?? 8080);
const dataDir = env.DATA_DIR ?? "./data";

export interface Settings {
  app_id?: string;
  admin_password_hash?: string;
  country?: string;
  setup_completed?: string;
}

const settingsPath = join(dataDir, "settings.json");
const keyPath = join(dataDir, "enablebanking.pem");
let settings: Settings = readSettings();

function readSettings(): Settings {
  try {
    return existsSync(settingsPath) ? (JSON.parse(readFileSync(settingsPath, "utf8")) as Settings) : {};
  } catch {
    return {};
  }
}

export function saveSettings(patch: Settings): void {
  mkdirSync(dataDir, { recursive: true });
  settings = { ...settings, ...patch };
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), { mode: 0o600 });
}

export function saveKeyFile(pem: string): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(keyPath, pem.trim() + "\n", { mode: 0o600 });
}

/** Public URL guessed from the platform when BASE_URL is not set. */
function detectBaseUrl(): string {
  if (env.BASE_URL) return env.BASE_URL.replace(/\/+$/, "");
  if (env.RENDER_EXTERNAL_URL) return env.RENDER_EXTERNAL_URL.replace(/\/+$/, "");
  if (env.RAILWAY_PUBLIC_DOMAIN) return `https://${env.RAILWAY_PUBLIC_DOMAIN}`;
  if (env.FLY_APP_NAME) return `https://${env.FLY_APP_NAME}.fly.dev`;
  return `http://localhost:${port}`;
}

export const config = {
  get appId(): string {
    return env.EB_APP_ID ?? settings.app_id ?? "";
  },
  get privateKey(): string {
    return env.EB_PRIVATE_KEY ?? "";
  },
  get privateKeyPath(): string {
    if (env.EB_PRIVATE_KEY_PATH) return env.EB_PRIVATE_KEY_PATH;
    return existsSync(keyPath) ? keyPath : "";
  },
  apiBase: env.EB_API_BASE ?? "https://api.enablebanking.com",
  get country(): string {
    return (env.DEFAULT_COUNTRY ?? settings.country ?? "DK").toUpperCase();
  },
  port,
  baseUrl: detectBaseUrl(),
  dataDir,
  appName: env.APP_NAME ?? "BankConnector",
  get adminPasswordHash(): string {
    return env.ADMIN_PASSWORD_HASH ?? settings.admin_password_hash ?? "";
  },
  adminPassword: env.ADMIN_PASSWORD ?? "",
  notifyWebhookUrl: env.NOTIFY_WEBHOOK_URL ?? "",
  /** Shared secret for POST /cron/sync-balances (Render cron has no disk access). */
  cronSecret: env.CRON_SECRET ?? "",
  /** Google Apps Script web app URL that appends balance rows to a sheet. */
  googleSheetsWebhookUrl: env.GOOGLE_SHEETS_WEBHOOK_URL ?? "",
  /** Viva Wallet legacy API (Basic Auth). Use Merchant ID + API Key, or Account Transactions credentials. */
  vivaApiBase: (env.VIVA_API_BASE ?? "https://www.vivapayments.com").replace(/\/+$/, ""),
  vivaBasicUser: env.VIVA_MERCHANT_ID ?? env.VIVA_BASIC_USER ?? "",
  vivaBasicPassword: env.VIVA_API_KEY ?? env.VIVA_BASIC_PASSWORD ?? "",
  /** Airwallex API (scoped key). https://www.airwallex.com/docs/developer-tools/api/manage-api-keys */
  airwallexApiBase: (env.AIRWALLEX_API_BASE ?? "https://api.airwallex.com").replace(/\/+$/, ""),
  airwallexClientId: env.AIRWALLEX_CLIENT_ID ?? "",
  airwallexApiKey: env.AIRWALLEX_API_KEY ?? "",
  /** Optional account ID for scoped keys with multiple accounts (x-login-as). */
  airwallexAccountId: env.AIRWALLEX_ACCOUNT_ID ?? "",
  /** Stripe secret or restricted key with Balance read. https://docs.stripe.com/api/balance/balance_retrieve */
  stripeApiBase: (env.STRIPE_API_BASE ?? "https://api.stripe.com").replace(/\/+$/, ""),
  stripeSecretKey: env.STRIPE_SECRET_KEY ?? "",
  /** PayPal REST app (Live). Needs Transaction Search / List Balances on the app. */
  paypalApiBase: (env.PAYPAL_API_BASE ?? "https://api-m.paypal.com").replace(/\/+$/, ""),
  paypalClientId: env.PAYPAL_CLIENT_ID ?? "",
  paypalSecret: env.PAYPAL_SECRET ?? "",
  /** Wise personal API token (Read only). https://docs.wise.com/guides/developer/auth-and-security/personal-api-token */
  wiseApiBase: (env.WISE_API_BASE ?? "https://api.wise.com").replace(/\/+$/, ""),
  wiseApiToken: env.WISE_API_TOKEN ?? "",
  /** Optional Wise business profile id; auto-detected when omitted. */
  wiseProfileId: env.WISE_PROFILE_ID ?? "",
  wiseAccountLabel: env.WISE_ACCOUNT_LABEL ?? "",
  tlsCertPath: env.TLS_CERT_PATH ?? "",
  tlsKeyPath: env.TLS_KEY_PATH ?? "",
  /** True when every secret came from the environment, so the setup page has nothing to do. */
  get lockedByEnv(): boolean {
    return Boolean(env.EB_APP_ID && (env.EB_PRIVATE_KEY || env.EB_PRIVATE_KEY_PATH) && (env.ADMIN_PASSWORD_HASH || env.ADMIN_PASSWORD));
  },
};

export function tlsOptions(): { cert: string; key: string } | undefined {
  if (!config.tlsCertPath || !config.tlsKeyPath) return undefined;
  return { cert: readFileSync(config.tlsCertPath, "utf8"), key: readFileSync(config.tlsKeyPath, "utf8") };
}

export const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Human-readable list of what is still missing before the server can talk to banks. */
export function setupProblems(): string[] {
  const problems: string[] = [];
  if (!config.appId) problems.push("Enable Banking application id is not set");
  else if (!looksLikeUuid.test(config.appId)) problems.push("EB_APP_ID does not look like a UUID");
  if (!config.privateKey && !config.privateKeyPath) problems.push("Enable Banking private key is not set");
  else {
    try {
      const pem = readPrivateKey();
      if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(pem)) problems.push("The private key is not a PEM file (expected -----BEGIN PRIVATE KEY-----)");
    } catch (err) {
      problems.push(`Cannot read private key: ${(err as Error).message}`);
    }
  }
  if (!config.adminPasswordHash && !config.adminPassword) problems.push("Admin password is not set");
  if (!/^https?:\/\//.test(config.baseUrl)) problems.push("BASE_URL must start with http:// or https://");
  try {
    mkdirSync(config.dataDir, { recursive: true });
    accessSync(config.dataDir, constants.W_OK);
  } catch {
    problems.push(`DATA_DIR ${config.dataDir} is not writable by this process (check volume permissions)`);
  }
  return problems;
}

export function isConfigured(): boolean {
  return setupProblems().length === 0;
}

export function readPrivateKey(): string {
  if (config.privateKey) {
    const raw = config.privateKey.trim();
    if (raw.startsWith("-----")) return raw.replace(/\\n/g, "\n");
    return Buffer.from(raw, "base64").toString("utf8");
  }
  return readFileSync(config.privateKeyPath, "utf8");
}
