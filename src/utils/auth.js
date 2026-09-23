/**
 * Accounts and sessions.
 *
 * Two providers behind one interface:
 *
 *  – Supabase, when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set.
 *    Talks to the GoTrue REST API directly, so there is no SDK to ship.
 *    Google and GitHub sign-in go through the same service, as a redirect
 *    out to the provider and back to the site root.
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

/**
 * Where to go after signing in. Only a path on this site: a full URL here
 * would turn the `next` parameter into an open redirect, and it arrives
 * from the address bar.
 */
export const safeNext = (path, fallback = "/home") => {
  const value = String(path || "");
  return value.startsWith("/") && !value.startsWith("//") ? value : fallback;
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
  // Accounts here live in this browser, so there is nobody to redirect to.
  // The buttons are not shown rather than shown and broken.
  oauth: [],
  async signInWithOAuth() {
    throw new AuthError("Google and GitHub sign-in need a connected sign-in service. This deployment keeps accounts in your browser.");
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
    oauth: OAUTH_PROVIDERS.map((entry) => entry.id),
    /**
     * Leave for the provider. Where the person was going is kept for this
     * tab, because the return address is the site root for everyone.
     */
    async signInWithOAuth({ provider, next = "/home", remember = true } = {}) {
      if (!OAUTH_PROVIDERS.some((entry) => entry.id === provider)) {
        throw new AuthError("That sign-in option is not available.");
      }
      if (typeof window === "undefined") throw new AuthError("Sign-in needs a browser.");
      const url = buildAuthorizeUrl(base, provider, oauthRedirectUrl(window.location.origin));
      // Ask first. A provider that is not switched on answers this with a
      // 400 and a JSON body; without the check the person would be sent to
      // that page and read it. A redirect comes back opaque, which is the
      // answer we want, and following it is the browser's job, not ours.
      try {
        const check = await fetch(url, { redirect: "manual" });
        if (check.status >= 400) {
          const body = await check.json().catch(() => null);
          throw new AuthError(oauthErrorMessage(body?.msg || body?.error_description || body?.error));
        }
      } catch (e) {
        // A refusal is worth reporting; a network hiccup is not worth
        // blocking a sign-in that might still work.
        if (e instanceof AuthError) throw e;
      }
      writeJson(OAUTH_RETURN_KEY, { next: safeNext(next), remember }, tabStorage());
      window.location.assign(url);
      return { redirecting: true };
    },
    /** Turn the tokens from the return leg into a session. */
    async completeOAuth({ accessToken, refreshToken, expiresAt }) {
      const res = await fetch(`${base}/user`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new AuthError("The sign-in service would not confirm the account. Try again.");
      const user = await res.json();
      const meta = user?.user_metadata || {};
      return {
        userId: user?.id,
        email: user?.email,
        name: meta.full_name || meta.name || meta.user_name || user?.email || "",
        provider: "supabase",
        identity: user?.app_metadata?.provider || "oauth",
        accessToken,
        refreshToken,
        expiresAt,
        createdAt: new Date().toISOString(),
      };
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

// ─── Google and GitHub ───────────────────────
//
// The browser leaves the site, comes back to the root with tokens in the
// URL fragment, and the session is built from them. The root is the return
// address on purpose: it is the one path every static host serves without a
// rewrite rule, and it is the sign-in service's own default, so nothing has
// to be added to a redirect allow-list for this to work.

/** The identity providers the account pages offer, in the order shown. */
export const OAUTH_PROVIDERS = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
];

const OAUTH_RETURN_KEY = "vizroute_oauth_return";
const OAUTH_ERROR_KEY = "vizroute_oauth_error";

// A failed round trip is reported on the sign-in page, which is a fresh page
// load away, so the message travels in this tab's storage rather than in
// memory. It is read once and then gone — kept here as well so that reading
// it twice in one page load (which React does in development) gives the same
// answer both times instead of an empty second one.
let consumedOAuthError = null;

export const stashOAuthError = (message) => writeJson(OAUTH_ERROR_KEY, String(message || ""), tabStorage());

export const takeOAuthError = () => {
  if (consumedOAuthError !== null) return consumedOAuthError;
  consumedOAuthError = readJson(OAUTH_ERROR_KEY, "", tabStorage()) || "";
  writeJson(OAUTH_ERROR_KEY, null, tabStorage());
  return consumedOAuthError;
};

/** For tests: forget that the message was already read. */
export const _resetOAuthErrorForTests = () => {
  consumedOAuthError = null;
};

/** The address the provider sends the browser back to. */
export const oauthRedirectUrl = (origin) => `${String(origin || "").replace(/\/+$/, "")}/`;

/** The URL that starts the round trip. Pure, so its shape can be tested. */
export const buildAuthorizeUrl = (base, provider, redirectTo) =>
  `${base}/authorize?${new URLSearchParams({ provider, redirect_to: redirectTo })}`;

/** A provider's own wording is not for reading; these are. */
const oauthErrorMessage = (raw) => {
  const text = String(raw || "").replace(/\+/g, " ");
  if (/unsupported provider|provider is not enabled|not enabled/i.test(text)) {
    return "That sign-in option is not switched on for this site yet.";
  }
  if (/access.?denied|denied|cancel/i.test(text)) return "Sign-in was cancelled.";
  if (/server_error|temporarily/i.test(text)) return "The sign-in service did not answer. Try again in a moment.";
  return text || "Sign-in did not complete. Try again.";
};

/**
 * What the sign-in service left in the address when it sent the browser
 * back: tokens in the fragment when it worked, an error in either the
 * fragment or the query when it did not, and nothing at all on an ordinary
 * visit.
 */
export const readOAuthRedirect = ({ hash = "", search = "" } = {}) => {
  const fragment = new URLSearchParams(String(hash).replace(/^#/, ""));
  const query = new URLSearchParams(String(search).replace(/^\?/, ""));
  const either = (key) => fragment.get(key) || query.get(key) || "";
  const failure = either("error_description") || either("error");
  if (failure) return { error: oauthErrorMessage(failure) };
  const accessToken = fragment.get("access_token");
  if (!accessToken) return null;
  const expiresIn = Number(fragment.get("expires_in"));
  return {
    accessToken,
    refreshToken: fragment.get("refresh_token") || null,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : null,
  };
};

/** True when this page load is the return leg, so the app can wait rather than flash. */
export const hasOAuthRedirect = (location = typeof window !== "undefined" ? window.location : null) =>
  Boolean(location && readOAuthRedirect({ hash: location.hash, search: location.search }));

/** Take the tokens out of the address bar without adding a history entry. */
const scrubUrl = () => {
  try {
    if (typeof window === "undefined" || !window.history?.replaceState) return;
    const { pathname, search } = window.location;
    const clean = search
      ? `${pathname}?${new URLSearchParams(
          [...new URLSearchParams(search)].filter(([key]) => !["error", "error_code", "error_description"].includes(key)),
        )}`.replace(/\?$/, "")
      : pathname;
    window.history.replaceState(null, "", clean);
  } catch {
    /* an address that cannot be rewritten is cosmetic, not fatal */
  }
};

/**
 * Finish a round trip that has just come back. Returns `null` on an ordinary
 * page load, `{ error }` when the provider refused, and `{ session, next }`
 * when there is now a session.
 */
export const completeOAuthRedirect = async (location = typeof window !== "undefined" ? window.location : null) => {
  if (!location) return null;
  const found = readOAuthRedirect({ hash: location.hash, search: location.search });
  if (!found) return null;

  const { next = "/home", remember = true } = readJson(OAUTH_RETURN_KEY, {}, tabStorage()) || {};
  writeJson(OAUTH_RETURN_KEY, null, tabStorage());
  scrubUrl();

  if (found.error) return { error: found.error };

  const active = getAuthProvider();
  if (!active.completeOAuth) return { error: "This deployment has no sign-in service connected." };
  try {
    const session = await active.completeOAuth(found);
    setSession(session, { remember });
    return { session, next: safeNext(next) };
  } catch (e) {
    return { error: e?.message || "Could not finish signing in. Try again." };
  }
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

/** The providers this deployment can actually offer; empty for local accounts. */
export const oauthProviders = () =>
  OAUTH_PROVIDERS.filter((entry) => (getAuthProvider().oauth || []).includes(entry.id));

export const signInWithOAuth = (options) => getAuthProvider().signInWithOAuth(options);
export const signUp = (fields) => getAuthProvider().signUp(fields);
export const signIn = (fields) => getAuthProvider().signIn(fields);
export const signOut = () => getAuthProvider().signOut();
export const isLocalAuth = () => getAuthProvider().name === "local";
