// Persistent state: bank sessions, account ids, and pending authorizations.
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "./config.ts";

export interface StoredSession {
  id: string;
  bank: { name: string; country: string };
  /** User label when the same bank is linked more than once (e.g. Eurobank IKE). */
  label?: string;
  psu_type: string;
  valid_until: string;
  created: string;
  status?: string;
  expiry_notified?: boolean;
}

export interface StoredAccount {
  uid: string;
  session_id: string;
  name?: string;
  product?: string;
  iban?: string;
  other_id?: string;
  currency: string;
  cash_account_type?: string;
  identification_hash: string;
  label?: string;
  last_polled?: string;
}

export interface PendingAuth {
  state: string;
  bank: { name: string; country: string };
  label?: string;
  started: string;
}

export interface StoreData {
  version: 1;
  sessions: Record<string, StoredSession>;
  accounts: Record<string, StoredAccount>;
  pending_auth: Record<string, PendingAuth>;
}

const empty = (): StoreData => ({
  version: 1,
  sessions: {},
  accounts: {},
  pending_auth: {},
});

export class Store {
  readonly path: string;
  data: StoreData;

  constructor(path = join(config.dataDir, "bank.json")) {
    this.path = path;
    this.data = empty();
    for (const old of ["openbanking.json", "openbank.json"]) {
      const legacy = join(dirname(path), old);
      if (!existsSync(path) && existsSync(legacy)) renameSync(legacy, path);
    }
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<StoreData>;
      this.data = {
        version: 1,
        sessions: parsed.sessions ?? {},
        accounts: parsed.accounts ?? {},
        pending_auth: parsed.pending_auth ?? {},
      };
    }
  }

  save(): void {
    try {
      mkdirSync(join(this.path, ".."), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
      renameSync(tmp, this.path);
    } catch (err) {
      console.error(`[bank] cannot write state file ${this.path}: ${(err as Error).message}`);
      throw err;
    }
  }

  update<T>(fn: (d: StoreData) => T): T {
    const result = fn(this.data);
    this.save();
    return result;
  }

  addSession(session: { session_id: string; aspsp: { name: string; country: string }; psu_type: string; access: { valid_until: string }; accounts: Array<{ uid: string; name?: string; product?: string; currency: string; cash_account_type?: string; identification_hash: string; account_id?: { iban?: string; other?: { identification?: string } } }> }, opts: { label?: string } = {}): void {
    const sessionLabel = opts.label?.trim() || undefined;
    this.update((d) => {
      d.sessions[session.session_id] = {
        id: session.session_id,
        bank: { name: session.aspsp.name, country: session.aspsp.country },
        label: sessionLabel,
        psu_type: session.psu_type,
        valid_until: session.access.valid_until,
        created: new Date().toISOString(),
        status: "AUTHORIZED",
      };
      for (const a of session.accounts) {
        const previous = Object.values(d.accounts).find((x) => x.identification_hash === a.identification_hash && x.uid !== a.uid);
        if (previous) delete d.accounts[previous.uid];
        d.accounts[a.uid] = {
          uid: a.uid,
          session_id: session.session_id,
          name: a.name,
          product: a.product,
          iban: a.account_id?.iban,
          other_id: a.account_id?.other?.identification,
          currency: a.currency,
          cash_account_type: a.cash_account_type,
          identification_hash: a.identification_hash,
          label: previous?.label,
          last_polled: previous?.last_polled,
        };
      }
      for (const s of Object.values(d.sessions)) {
        if (s.id !== session.session_id && !Object.values(d.accounts).some((a) => a.session_id === s.id)) delete d.sessions[s.id];
      }
    });
  }

  removeSession(sessionId: string): void {
    this.update((d) => {
      delete d.sessions[sessionId];
      for (const a of Object.values(d.accounts)) if (a.session_id === sessionId) delete d.accounts[a.uid];
    });
  }

  accounts(): StoredAccount[] {
    return Object.values(this.data.accounts);
  }

  account(uid: string): StoredAccount | undefined {
    return this.data.accounts[uid];
  }

  sessions(): StoredSession[] {
    return Object.values(this.data.sessions);
  }

  addPendingAuth(p: PendingAuth): void {
    this.update((d) => {
      const cutoff = Date.now() - 60 * 60 * 1000;
      for (const [k, v] of Object.entries(d.pending_auth)) if (Date.parse(v.started) < cutoff) delete d.pending_auth[k];
      d.pending_auth[p.state] = p;
    });
  }

  takePendingAuth(state: string): PendingAuth | undefined {
    return this.update((d) => {
      const p = d.pending_auth[state];
      delete d.pending_auth[state];
      return p;
    });
  }
}

let shared: Store | undefined;
export function store(): Store {
  return (shared ??= new Store());
}
