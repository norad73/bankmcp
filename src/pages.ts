// The few HTML pages this server shows a human: the OAuth sign-in, the
// result of a bank connection, and a status page. No external assets.
import { config } from "./config.ts";
import type { FxRates } from "./fx.ts";
import { amountInUsd } from "./fx.ts";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Kind = "ok" | "error" | "neutral";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

export function shell(title: string, body: string, opts: { kind?: Kind; pill?: string } = {}): string {
  const name = config.appName;
  const tab = title === name ? name : `${title} · ${name}`;
  const pill = opts.pill ? `<div class="pill ${opts.kind ?? "neutral"}">${esc(opts.pill)}</div>` : "";
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><title>${esc(tab)}</title>
<style>
  :root{--bg:#f4f3ef;--card:#fff;--ink:#141414;--muted:#6f6e69;--line:#e6e4dd;--ok:#1f7a4d;--err:#b3261e}
  @media (prefers-color-scheme:dark){:root{--bg:#111110;--card:#1b1b1a;--ink:#f2f1ec;--muted:#9b9a94;--line:#2c2b29;--ok:#5cc08a;--err:#ff8a7a}}
  *{box-sizing:border-box}
  body{margin:0;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
  .wrap{max-width:460px;margin:0 auto;padding:12vh 20px 48px}
  .brand{display:flex;align-items:center;gap:10px;margin:0 0 22px;font-weight:800;font-size:20px;letter-spacing:-.02em}
  .brand .mark{width:28px;height:28px;border-radius:8px;background:var(--ink);color:var(--bg);display:grid;place-items:center;font-size:15px;font-weight:900}
  .card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:28px 28px 26px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
  .pill{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--muted);margin:0 0 12px}
  .pill::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--muted)}
  .pill.ok{color:var(--ok)}.pill.ok::before{background:var(--ok)}
  .pill.error{color:var(--err)}.pill.error::before{background:var(--err)}
  h1{font-size:26px;line-height:1.2;letter-spacing:-.02em;margin:0 0 12px}
  p{margin:0 0 12px}.muted{color:var(--muted)}.error{color:var(--err)}
  ul.rows{list-style:none;padding:0;margin:18px 0 6px}
  ul.rows li{display:flex;justify-content:space-between;gap:16px;padding:11px 0;border-top:1px solid var(--line)}
  ul.rows li:last-child{border-bottom:1px solid var(--line)}
  ul.rows .r{color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
  label{display:block;font-weight:600;font-size:14px;margin:18px 0 6px}
  input,textarea{width:100%;font:inherit;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink)}
  textarea{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:8px;resize:vertical}
  input[type=file]{padding:9px 12px;font-size:14px}
  input:focus,textarea:focus{outline:2px solid var(--ink);outline-offset:1px;border-color:transparent}
  button{width:100%;margin-top:14px;font:inherit;font-weight:700;padding:13px 16px;border:0;border-radius:10px;background:var(--ink);color:var(--bg);cursor:pointer}
  button:hover{opacity:.92}
  code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--bg);border:1px solid var(--line);padding:6px 10px;border-radius:8px;display:inline-block;word-break:break-all}
  .copy{margin:14px 0 0}.copy p{margin:0 0 4px}
  .copyrow{display:flex;gap:8px;align-items:flex-start}.copyrow code{flex:1}
  .copybtn{width:auto;margin:0;padding:6px 10px;font-size:13px;font-weight:600;border-radius:8px;background:transparent;color:var(--ink);border:1px solid var(--line);white-space:nowrap}
  .copybtn:hover{background:var(--bg);opacity:1}
  footer{margin-top:20px;font-size:12px;color:var(--muted)}
  footer a{color:inherit}
</style>
<body><div class="wrap">
  <div class="brand"><span class="mark">${esc(name.replace(/[™®]/g, "").trim().charAt(0).toUpperCase() || "B")}</span><span>${esc(name)}</span></div>
  <div class="card">${pill}<h1>${esc(title)}</h1>${body}</div>
  <footer>${esc(name)} · read-only · self-hosted · <a href="/privacy">privacy</a> · <a href="/terms">terms</a></footer>
</div></body></html>`;
}

const linkedAccountLabel = (a: { uid: string; name?: string; product?: string; currency: string }) => {
  const base = [a.name, a.product].map((s) => s?.trim()).filter(Boolean).join(" · ") || a.uid;
  return base.toUpperCase().includes(a.currency) ? base : `${base} · ${a.currency}`;
};

export function connectedPage(session: { aspsp: { name: string }; access: { valid_until: string }; accounts: Array<{ uid: string; name?: string; product?: string; currency: string }> }, label?: string): string {
  const n = session.accounts.length;
  const name = label?.trim() || session.aspsp.name;
  return shell(
    `${name} is linked`,
    `<p>${n} account${n === 1 ? "" : "s"} connected for balance sync.</p>
     ${n ? `<ul class="rows">${session.accounts.map((a) => `<li><span>${esc(linkedAccountLabel(a))}</span><span class="r">${esc(a.currency)}</span></li>`).join("")}</ul>` : `<p class="muted">The bank accepted consent but returned no accounts yet. Check <a href="/balances">balances</a> in a minute, or reconnect if it stays empty.</p>`}
     <p class="muted">Consent valid until ${esc(fmtDate(session.access.valid_until))}. <a href="/balances">View balances</a></p>`,
    { kind: "ok", pill: "Connected" },
  );
}

export function failedPage(message: string): string {
  return shell("Bank not connected", `<p class="error">${esc(message)}</p><p class="muted">Visit <code>/connect?bank=YourBank</code> to try again.</p>`, { kind: "error", pill: "Not connected" });
}

export function statusPage(input: { problems: string[]; callbackUrl: string }): string {
  if (input.problems.length) {
    return shell(
      "Not configured yet",
      `<ul class="rows">${input.problems.map((p) => `<li><span>${esc(p)}</span></li>`).join("")}</ul><p class="muted">Set the environment variables and restart. The README has the list.</p>`,
      { kind: "error", pill: "Setup incomplete" },
    );
  }
  return shell(
    config.appName,
    `<p>Running.</p>
     <p class="muted" style="margin-bottom:4px">Enable Banking redirect URL</p><p><code>${esc(input.callbackUrl)}</code></p>
     <p><a href="/balances">View balances</a> · connect banks via <code>/connect?bank=Eurobank</code></p>`,
    { kind: "ok", pill: "Running" },
  );
}

export const CONSENT_DESCRIPTION = `${config.appName} syncs daily account balances to a spreadsheet. It reads balances only — no payment tools. You can revoke access at your bank at any time.`;

export function setupPage(opts: { error?: string; values?: { app_id?: string; country?: string }; baseUrl?: string } = {}): string {
  const v = opts.values ?? {};
  const base = (opts.baseUrl ?? config.baseUrl).replace(/\/+$/, "");
  const row = (label: string, value: string) =>
    `<div class="copy"><p class="muted">${esc(label)}</p><div class="copyrow"><code>${esc(value)}</code><button type="button" class="copybtn" data-copy="${esc(value)}">Copy</button></div></div>`;
  return shell(
    `Set up ${config.appName}`,
    `<p>First register an application at <a href="https://enablebanking.com/cp/applications" target="_blank" rel="noopener">Enable Banking</a>. Its form asks for these values:</p>
     ${row("Allowed redirect URL", `${base}/callback`)}
     ${row("Application description", CONSENT_DESCRIPTION)}
     ${row("Privacy URL", `${base}/privacy`)}
     ${row("Terms URL", `${base}/terms`)}
     <p class="muted" style="margin-top:18px">Environment: <b>Production</b> for your real accounts, <b>Sandbox</b> to try with test data. Keep <b>generate private key</b> selected; a <code style="padding:1px 6px">.pem</code> file downloads once when you save. That file and the application id shown after saving go here:</p>
     ${opts.error ? `<p class="error">${esc(opts.error)}</p>` : ""}
     <form method="post" action="/setup" id="setup">
       <label for="app_id">Application id</label>
       <input id="app_id" name="app_id" required autocomplete="off" spellcheck="false" placeholder="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" value="${esc(v.app_id ?? "")}">
       <label for="pemfile">Private key file (the .pem that downloaded when you registered)</label>
       <input id="pemfile" type="file" accept=".pem,.key,.txt,application/x-pem-file">
       <textarea id="pem" name="pem" rows="3" placeholder="…or paste the contents of the .pem file here" spellcheck="false"></textarea>
       <label for="country">Country of your banks</label>
       <input id="country" name="country" maxlength="2" placeholder="DK" value="${esc(v.country ?? "")}" style="width:6em;text-transform:uppercase">
       <label for="password">Password (12+ characters, for /balances login)</label>
       <input id="password" type="password" name="password" required minlength="12" autocomplete="new-password">
       <label for="password2">Repeat password</label>
       <input id="password2" type="password" name="password2" required minlength="12" autocomplete="new-password">
       <button type="submit">Finish setup</button>
     </form>
     <script>
       for (const b of document.querySelectorAll(".copybtn")) b.addEventListener("click", async () => {
         try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1500); }
         catch { b.textContent = "Select and copy"; }
       });
       document.getElementById("pemfile").addEventListener("change", (e) => {
         const f = e.target.files[0]; if (!f) return;
         const r = new FileReader(); r.onload = () => { document.getElementById("pem").value = r.result; }; r.readAsText(f);
       });
     </script>`,
    { kind: "neutral", pill: "First run" },
  );
}

export const privacyPage = () =>
  shell(
    "Privacy",
    `<p>This server is operated by the person who deployed it, to access their own bank accounts. It is not offered as a service to anyone else.</p>
     <p>Account identifiers and consent references from Enable Banking are stored on the server so daily balance sync can run. Balances themselves are not stored on disk. No data is shared with third parties and nothing is collected about visitors.</p>
     <p>The software is open source. Its authors do not operate this server, receive no data from it, and are not affiliated with Enable Banking or any bank.</p>`,
  );

export const termsPage = () =>
  shell(
    "Terms",
    `<p>Personal software run by the person who deployed it, for their own non-commercial use, under Enable Banking's terms for individual use of their production environment. The operator is solely responsible for this instance.</p>
     <p>Use at your own risk. The software is provided as is, without warranty of any kind, under the MIT licence. Its authors accept no liability for its use and are not a party to the operator's agreements with Enable Banking or any bank.</p>`,
  );

export interface BalanceDisplayRow {
  uid: string;
  source: string;
  logo?: string;
  account: string;
  currency: string;
  booked?: number;
  available?: number;
  error?: string;
  cached?: boolean;
  fetchedAt?: string;
}

const fmtMoney = (amount: number | undefined, currency: string) => {
  if (amount === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

function wideShell(title: string, body: string, opts: { kind?: Kind; pill?: string } = {}): string {
  const page = shell(title, body, opts);
  return page.replace(
    ".wrap{max-width:460px",
    ".wrap{max-width:960px",
  ).replace(
    "</style>",
    `table.bal{width:100%;border-collapse:collapse;margin:16px 0 8px;font-size:14px}
table.bal th,table.bal td{padding:10px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
table.bal th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:600}
table.bal td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
table.bal th.logo,table.bal td.logo{width:36px;padding-right:4px;text-align:center}
table.bal td.logo img{width:24px;height:24px;border-radius:6px;object-fit:contain;background:var(--bg);vertical-align:middle;display:block}
table.bal tr.err td{color:var(--err)}
table.bal .status-ok{color:var(--ok);font-weight:600}
table.bal .status-err{color:var(--err)}
table.bal .status-muted{color:var(--muted)}
table.bal tfoot tr.total td{border-top:2px solid var(--ink);padding-top:12px;font-weight:700}
table.bal td.refresh{width:44px;text-align:center;padding-left:4px;padding-right:4px}
table.bal .refreshbtn{margin:0;padding:4px 8px;width:auto;font-size:12px;font-weight:600;border-radius:8px;background:transparent;color:var(--ink);border:1px solid var(--line);cursor:pointer;line-height:1.2}
table.bal .refreshbtn:hover{background:var(--bg);opacity:1}
table.bal .status-cell{cursor:help;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.actions{margin-top:16px}
.actions .muted{font-size:14px;color:var(--muted)}
</style>`,
  );
}

export function siteLoginPage(opts: { returnTo?: string; error?: string } = {}): string {
  const next = opts.returnTo && opts.returnTo.startsWith("/") ? opts.returnTo : "/";
  return shell(
    "Sign in",
    `${opts.error ? `<p class="error">${esc(opts.error)}</p>` : ""}
     <p class="muted">Enter the admin password to continue.</p>
     <form method="post" action="/login">
       <input type="hidden" name="next" value="${esc(next)}">
       <label for="pw">Password</label>
       <input id="pw" type="password" name="password" autofocus autocomplete="current-password" required>
       <button type="submit">Sign in</button>
     </form>`,
    { kind: "neutral", pill: "Sign in" },
  );
}

function rowAmount(r: BalanceDisplayRow) {
  return r.available ?? r.booked;
}

function fmtFetchedAt(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" });
}

function rowStatus(r: BalanceDisplayRow): { short: string; detail: string; cls: string } {
  if (r.error) {
    return { short: "Error", detail: r.error, cls: "status-err" };
  }
  const amount = rowAmount(r);
  if (amount === undefined) {
    return { short: "Empty", detail: "No balance returned", cls: "status-muted" };
  }
  if (amount === 0) {
    const detail = r.cached ? `Zero balance · cached ${fmtFetchedAt(r.fetchedAt)}` : "Zero balance";
    return { short: r.cached ? "Cached" : "Zero", detail, cls: "status-muted" };
  }
  if (r.cached) {
    return { short: "Cached", detail: `Cached ${fmtFetchedAt(r.fetchedAt)} · ${fmtMoney(amount, r.currency)}`, cls: "status-ok" };
  }
  return { short: "Live", detail: `Fetched ${fmtFetchedAt(r.fetchedAt)} · ${fmtMoney(amount, r.currency)}`, cls: "status-ok" };
}

function refreshable(uid: string) {
  return uid && !uid.includes(":error") && !uid.includes(":timeout") && !uid.startsWith("session:");
}

function totalsByCurrency(rows: BalanceDisplayRow[]) {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.currency, (totals.get(r.currency) ?? 0) + (rowAmount(r) ?? 0));
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function balancesPage(input: { asOf: string; fetchedAt: string; rows: BalanceDisplayRow[]; fx?: FxRates; error?: string }): string {
  const rows = input.rows;
  const failed = rows.filter((r) => r.error);
  const withBalance = rows.filter((r) => !r.error && (rowAmount(r) ?? 0) !== 0);
  const totals = totalsByCurrency(withBalance);
  const usd = (amount: number | undefined, currency: string) => amountInUsd(amount, currency, input.fx);
  const fmtUsd = (amount: number | undefined) => (amount === undefined ? "—" : fmtMoney(amount, "USD"));
  const totalUsd = withBalance.reduce((sum, r) => sum + (usd(rowAmount(r), r.currency) ?? 0), 0);
  const fxNote = input.fx?.date ? ` · FX ${esc(input.fx.date)} (ECB)` : "";
  const pillParts = [`${rows.length} account${rows.length === 1 ? "" : "s"}`];
  if (failed.length) pillParts.push(`${failed.length} failed`);
  const table = rows.length
    ? `<table class="bal"><thead><tr><th class="logo"></th><th>Source</th><th>Account</th><th>Currency</th><th>Status</th><th class="num">Available</th><th class="num">USD equiv</th><th class="refresh"></th></tr></thead><tbody>${rows
        .map((r) => {
          const status = rowStatus(r);
          const amount = rowAmount(r);
          const cls = r.error ? " class=\"err\"" : "";
          const available = r.error ? "—" : fmtMoney(amount, r.currency);
          const usdEquiv = r.error ? "—" : fmtUsd(usd(amount, r.currency));
          const logo = r.logo ? `<td class="logo"><img src="${esc(r.logo)}" alt="" width="24" height="24" loading="lazy"></td>` : `<td class="logo"></td>`;
          const refresh = refreshable(r.uid)
            ? `<td class="refresh"><form method="post" action="/balances/refresh"><input type="hidden" name="uid" value="${esc(r.uid)}"><button type="submit" class="refreshbtn" title="Fetch fresh balance">↻</button></form></td>`
            : `<td class="refresh"></td>`;
          return `<tr${cls}>${logo}<td>${esc(r.source)}</td><td>${esc(r.account)}</td><td>${esc(r.currency)}</td><td class="${status.cls} status-cell" title="${esc(status.detail)}">${esc(status.short)}</td><td class="num">${available}</td><td class="num">${usdEquiv}</td>${refresh}</tr>`;
        })
        .join("")}</tbody>${totals.length ? `<tfoot>${totals
        .map(([currency, amount]) => `<tr class="total"><td></td><td colspan="2">Total</td><td>${esc(currency)}</td><td></td><td class="num">${fmtMoney(amount, currency)}</td><td class="num">${fmtUsd(usd(amount, currency))}</td><td></td></tr>`)
        .join("")}${input.fx ? `<tr class="total"><td></td><td colspan="2">Grand total</td><td>USD</td><td></td><td class="num">—</td><td class="num">${fmtMoney(totalUsd, "USD")}</td><td></td></tr>` : ""}</tfoot>` : ""}</table>`
    : `<p class="muted">No accounts linked yet.</p>`;
  return wideShell(
    "Balances",
    `${input.error ? `<p class="error">${esc(input.error)}</p>` : ""}
     <p class="muted">As of ${esc(fmtDate(input.asOf))} · fetched ${esc(new Date(input.fetchedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }))}${fxNote}</p>
     ${table}
     <p class="actions"><span class="muted">Balances are cached for the day · fresh pull daily at 19:00 Athens · hover status for details · use ↻ to refresh one row</span></p>`,
    { kind: failed.length && !withBalance.length ? "error" : failed.length ? "neutral" : "ok", pill: pillParts.join(" · ") },
  );
}
