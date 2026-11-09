/**
 * Dev-only auth, for working on the app without Clerk or Supabase.
 *
 * Enabled by `NEXT_PUBLIC_DEV_AUTH=1` in `.env.local`. The `NODE_ENV` check means
 * this stays inert in a production build even if the variable is ever set there.
 *
 * It models a real session with a real identity: signing in as a different email
 * gives you a different user id, and all local data is keyed on that id, so users
 * never see each other's history.
 */
export const IS_DEV_AUTH =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_AUTH === "1";

export type DevSession = {
  userId: string;
  email: string;
  name: string;
  initials: string;
};

const STORAGE_KEY = "git-swole-dev-auth";
const ACCOUNTS_KEY = "git-swole-dev-users";

export type DevAccount = DevSession & { passwordHash: string };

export type AuthResult = { ok: true } | { ok: false; error: string };

/** Dev-only. Enough to make a wrong password actually fail, not real security. */
async function hashPassword(password: string) {
  const data = new TextEncoder().encode(`git-swole-dev:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readAccounts(): Record<string, DevAccount> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(ACCOUNTS_KEY) ?? "{}") as Record<string, DevAccount>;
  } catch {
    return {};
  }
}

function writeAccounts(accounts: Record<string, DevAccount>) {
  try {
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // Non-persistent is still usable for this page.
  }
}

export function devAccountExists(email: string) {
  return !!readAccounts()[email.trim().toLowerCase()];
}

function idFor(email: string) {
  return `dev_${email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

function nameFor(email: string) {
  const handle = email.split("@")[0] ?? "lifter";
  return handle
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Lifter";
}

export function buildDevSession(email: string): DevSession {
  const name = nameFor(email);
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return { userId: idFor(email), email: email.trim().toLowerCase(), name, initials };
}

function readStored(): DevSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DevSession;
    return parsed?.userId ? parsed : null;
  } catch {
    return null;
  }
}

let session: DevSession | null = readStored();
const listeners = new Set<() => void>();

export function subscribeDevAuth(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Cached so useSyncExternalStore sees a stable reference between changes. */
export function getDevSession(): DevSession | null {
  return session;
}

function commit(next: DevSession | null) {
  session = next;
  try {
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Non-persistent is still usable for this page.
  }
  for (const notify of listeners) {
    notify();
  }
}

/** Creates the account and signs in. Fails if the email is already registered. */
export async function signUpDev(email: string, password: string): Promise<AuthResult> {
  const key = email.trim().toLowerCase();
  const accounts = readAccounts();
  if (accounts[key]) {
    return { ok: false, error: "An account with that email already exists. Sign in instead." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  const session = buildDevSession(key);
  accounts[key] = { ...session, passwordHash: await hashPassword(password) };
  writeAccounts(accounts);
  commit(session);
  return { ok: true };
}

/** Verifies the password before establishing a session. */
export async function signInDev(email: string, password: string): Promise<AuthResult> {
  const key = email.trim().toLowerCase();
  const account = readAccounts()[key];
  if (!account) {
    return { ok: false, error: "No account found with that email." };
  }
  if (account.passwordHash !== (await hashPassword(password))) {
    return { ok: false, error: "Incorrect password." };
  }
  const session: DevSession = {
    userId: account.userId,
    email: account.email,
    name: account.name,
    initials: account.initials,
  };
  commit(session);
  return { ok: true };
}

export function signOutDev() {
  commit(null);
}
