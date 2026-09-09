// Bank and provider logos for the balances table.
import { config } from "./config.ts";
import { eb } from "./enablebanking.ts";

const PROVIDER_DOMAINS: Record<string, string> = {
  wise: "wise.com",
  viva: "vivawallet.com",
  stripe: "stripe.com",
  paypal: "paypal.com",
  airwallex: "airwallex.com",
  enablebanking: "enablebanking.com",
};

const EUROBANK_LOGO = "/assets/logos/eurobank.png";

const BRAND_LOGOS: Record<string, string> = {
  eurobank: EUROBANK_LOGO,
  "eurobank ike": EUROBANK_LOGO,
  "eurobank usa branch": EUROBANK_LOGO,
  "eurobank us branch": EUROBANK_LOGO,
};

const DOMAIN_ALIASES: Record<string, string> = {
  wise: "wise.com",
};

function favicon(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

let aspspLogosCache: { at: number; logos: Map<string, string> } | undefined;
const CACHE_MS = 24 * 60 * 60 * 1000;

export async function loadAspspLogos(): Promise<Map<string, string>> {
  if (aspspLogosCache && Date.now() - aspspLogosCache.at < CACHE_MS) return aspspLogosCache.logos;
  const logos = new Map<string, string>();
  for (const country of new Set([config.country, "GR", "GB", "US"])) {
    try {
      for (const aspsp of await eb.listAspsps(country)) {
        if (aspsp.logo) logos.set(aspsp.name.toLowerCase(), aspsp.logo);
      }
    } catch {
      /* country may have no ASPSPs */
    }
  }
  aspspLogosCache = { at: Date.now(), logos };
  return logos;
}

export function resolveLogo(displaySource: string, rawSource: string, aspspLogos: Map<string, string>): string {
  const raw = rawSource.toLowerCase();
  const bankName = displaySource.replace(/\s+(IKE|US(?:A)?\s*Branch)$/i, "").trim().toLowerCase();

  const brand = BRAND_LOGOS[bankName] ?? BRAND_LOGOS[displaySource.toLowerCase()];
  if (brand) return brand;

  if (raw !== "enablebanking" && PROVIDER_DOMAINS[raw]) return favicon(PROVIDER_DOMAINS[raw]);

  const fromEb = aspspLogos.get(bankName) ?? aspspLogos.get(displaySource.toLowerCase());
  if (fromEb) return fromEb;

  const domain = DOMAIN_ALIASES[bankName] ?? DOMAIN_ALIASES[displaySource.toLowerCase()];
  if (domain) return favicon(domain);

  return favicon("enablebanking.com");
}
