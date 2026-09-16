/**
 * Accounts and sessions.
 *
 * Two providers behind one interface:
 *
 *  – Supabase, when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set.
 *    Talks to the GoTrue REST API directly, so there is no SDK to ship.
 *  – Local, otherwise: accounts live in this browser only, with the
 *    password hashed by PBKDF2 through WebCrypto. It exists so the product
 *    works end to end without a backend — and says so on the page, because
 *    an account that cannot be used from another machine must never look
 *    like one that can.
 *
 * The session is a small object in localStorage — or in sessionStorage when
 * the person asked not to stay signed in, so it ends with the browser tab.
 * Consumers subscribe to changes rather than reading storage themselves.
 */

const SESSION_KEY = "vizroute_session";
const ACCOUNTS_KEY = "vizroute_local_accounts";
const listeners = new Set();

const storage = () => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};

const tabStorage = () => {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
};

const readJson = (key, fallback, store = storage()) => {
  try {
    const raw = store?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value, store = storage()) => {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked; the session then lives in memory only */
  }
};

let memorySession = null;

export const getSession = () => memorySession || readJson(SESSION_KEY, null) || readJson(SESSION_KEY, null, tabStorage());

/** `remember: false` keeps the session for this tab only. Signing out clears both places. */
const setSession = (session, { remember = true } = {}) => {
  memorySession = session;
  writeJson(SESSION_KEY, remember ? session : null);
  writeJson(SESSION_KEY, remember ? null : session, tabStorage());
  listeners.forEach((fn) => fn(session));
};

/** Subscribe to sign-in and sign-out. Returns an unsubscribe function. */
export const onAuthChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// ─── Validation ──────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Field-level messages for a sign-up form; empty object when it is fine. */
export const validateSignUp = ({ name = "", email = "", password = "", confirm } = {}) => {
  const errors = {};
  if (!String(name).trim()) errors.name = "Enter your name.";
  else if (String(name).trim().length > 80) errors.name = "That name is too long.";
  Object.assign(errors, validateSignIn({ email, password }, true));
  if (confirm !== undefined && confirm !== password) errors.confirm = "The two passwords do not match.";
  return errors;
};

/** Field-level messages for a sign-in form. `strict` applies the sign-up password rules. */
export const validateSignIn = ({ email = "", password = "" } = {}, strict = false) => {
  const errors = {};
  const mail = String(email).trim();
  if (!mail) errors.email = "Enter your email address.";
  else if (!EMAIL.test(mail) || mail.length > 254) errors.email = "That does not look like an email address.";
  const pass = String(password);
  if (!pass) errors.password = "Enter your password.";
  else if (strict) {
    if (pass.length < 8) errors.password = "Use at least 8 characters.";
    else if (pass.length > 128) errors.password = "Use at most 128 characters.";
    else if (!/[a-zA-Z]/.test(pass) || !/[0-9]/.test(pass)) errors.password = "Use at least one letter and one number.";
  }
  return errors;
};

export class AuthError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = "AuthError";
    this.field = field;
  }
}

// ─── Local provider ──────────────────────────

const subtle = () => (typeof crypto !== "undefined" && crypto.subtle ? crypto.subtle : null);

const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

const randomHex = (bytes) => {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr);
};

const hashPassword = async (password, saltHex) => {
  const api = subtle();
  if (!api) throw new AuthError("This browser cannot store a password securely.");
  const key = await api.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const bits = await api.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120000 }, key, 256);
  return toHex(bits);
};

const timingSafeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const localAccounts = () => readJson(ACCOUNTS_KEY, {});

const localProvider = {
  name: "local",
  label: "Local account",
  async signUp({ name, email, password }) {
    const errors = validateSignUp({ name, email, password });
    const firstField = Object.keys(errors)[0];
    if (firstField) throw new AuthError(errors[firstField], firstField);
    const key = String(email).trim().toLowerCase();
    const accounts = localAccounts();
    if (accounts[key]) throw new AuthError("An account with this email already exists. Sign in instead.", "email");
    const salt = randomHex(16);
    const hash = await hashPassword(password, salt);
    const account = { id: `usr_${randomHex(8)}`, name: String(name).trim(), email: key, salt, hash, createdAt: new Date().toISOString() };
    accounts[key] = account;
    writeJson(ACCOUNTS_KEY, accounts);
    const session = { userId: account.id, email: key, name: account.name, provider: "local", createdAt: new Date().toISOString() };
    setSession(session);
    return session;
  },
  async signIn({ email, password, remember = true }) {
    const errors = validateSignIn({ email, password });
    const firstField = Object.keys(errors)[0];
    if (firstField) throw new AuthError(errors[firstField], firstField);
    const key = String(email).trim().toLowerCase();
    const account = localAccounts()[key];
    // The same message for an unknown email and a wrong password, so the
    // form cannot be used to find out which addresses have accounts.
    const failure = new AuthError("Email or password is incorrect.");
    if (!account) {
      await hashPassword(password, randomHex(16)); // keep timing similar
      throw failure;
    }
    const hash = await hashPassword(password, account.salt);
    if (!timingSafeEqual(hash, account.hash)) throw failure;
    const session = { userId: account.id, email: key, name: account.name, provider: "local", createdAt: new Date().toISOString() };
    setSession(session, { remember });
    return session;
  },
  async signOut() {
    setSession(null);
  },
};

// ─── Supabase provider (GoTrue REST) ─────────

const env = (key) => {
  try {
    return import.meta.env?.[key] || "";
  } catch {
    return "";
  }
};

const supabaseProvider = (url, anonKey) => {
  const base = `${url.replace(/\/+$/, "")}/auth/v1`;
  const call = async (path, body, token) => {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* logout returns no body */
    }
    if (!res.ok) {
      const message = data?.msg || data?.error_description || data?.message || `Sign-in service returned ${res.status}.`;
      if (res.status === 429 || /rate limit/i.test(message)) {
        throw new AuthError("Too many attempts for now. Wait a few minutes and try again.");
      }
      throw new AuthError(/already registered|already exists/i.test(message) ? "An account with this email already exists. Sign in instead." : message);
    }
    return data;
  };
  const toSession = (data, fallbackName) => ({
    userId: data.user?.id,
    email: data.user?.email,
    name: data.user?.user_metadata?.name || fallbackName || data.user?.email || "",
    provider: "supabase",
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at ? data.expires_at * 1000 : null,
    createdAt: new Date().toISOString(),
  });
  return {
    name: "supabase",
    label: "Account",
    async signUp({ name, email, password }) {
      const errors = validateSignUp({ name, email, password });
      const firstField = Object.keys(errors)[0];
      if (firstField) throw new AuthError(errors[firstField], firstField);
      const data = await call("/signup", { email: String(email).trim(), password, data: { name: String(name).trim() } });
      if (!data.access_token) {
        // Email confirmation is on: no session until the link is clicked.
        return { pendingConfirmation: true, email: String(email).trim() };
      }
      const session = toSession(data, name);
      setSession(session);
      return session;
    },
    async signIn({ email, password, remember = true }) {
      const errors = validateSignIn({ email, password });
      const firstField = Object.keys(errors)[0];
      if (firstField) throw new AuthError(errors[firstField], firstField);
      let data;
      try {
        data = await call("/token?grant_type=password", { email: String(email).trim(), password });
      } catch (e) {
        if (/invalid login credentials/i.test(e.message)) throw new AuthError("Email or password is incorrect.");
        throw e;
      }
      const session = toSession(data);
      setSession(session, { remember });
      return session;
    },
    async signOut() {
      const current = getSession();
      try {
        if (current?.accessToken) await call("/logout", undefined, current.accessToken);
      } catch {
        /* the local session is cleared regardless */
      }
      setSession(null);
    },
  };
};

// ─── Provider selection ──────────────────────

let provider = null;

/** The configured provider; Supabase when its keys are present, local otherwise. */
export const getAuthProvider = () => {
  if (provider) return provider;
  const url = env("VITE_SUPABASE_URL");
  const key = env("VITE_SUPABASE_ANON_KEY");
  provider = url && key ? supabaseProvider(url, key) : localProvider;
  return provider;
};

/** For tests: force a provider (`"local"` for the built-in one) and clear the cached session. */
export const _setAuthProviderForTests = (next) => {
  provider = next === "local" ? localProvider : next;
  memorySession = null;
};

export const signUp = (fields) => getAuthProvider().signUp(fields);
export const signIn = (fields) => getAuthProvider().signIn(fields);
export const signOut = () => getAuthProvider().signOut();
export const isLocalAuth = () => getAuthProvider().name === "local";
