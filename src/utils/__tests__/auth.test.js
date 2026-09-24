import { describe, it, expect, beforeEach } from "vitest";
import {
  signUp, signIn, signOut, getSession, onAuthChange, validateSignUp, validateSignIn,
  _setAuthProviderForTests, isLocalAuth, safeNext, oauthRedirectUrl, buildAuthorizeUrl,
  readOAuthRedirect, hasOAuthRedirect, oauthProviders, signInWithOAuth, completeOAuthRedirect,
  stashOAuthError, takeOAuthError, _resetOAuthErrorForTests,
} from "../auth";

// A minimal Storage so the local provider has somewhere to keep accounts.
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
  clear: () => memory.clear(),
};

// sessionStorage is where a session goes when "keep me signed in" is off.
const tabMemory = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (tabMemory.has(k) ? tabMemory.get(k) : null),
  setItem: (k, v) => tabMemory.set(k, String(v)),
  removeItem: (k) => tabMemory.delete(k),
  clear: () => tabMemory.clear(),
};

const good = { name: "Ada", email: "ada@example.com", password: "correct1horse" };

// Unit tests never reach a network: the local provider is forced, and
// vite.config.js blanks the Supabase keys for the test environment as well.
beforeEach(() => {
  memory.clear();
  tabMemory.clear();
  _setAuthProviderForTests("local");
});

describe("validation", () => {
  it("accepts a well-formed sign-up", () => {
    expect(validateSignUp({ ...good, confirm: good.password })).toEqual({});
  });
  it("names every problem by field", () => {
    const errors = validateSignUp({ name: " ", email: "nope", password: "short", confirm: "other" });
    expect(Object.keys(errors).sort()).toEqual(["confirm", "email", "name", "password"]);
    expect(errors.password).toMatch(/8 characters/);
  });
  it("requires a letter and a number, and bounds the length", () => {
    expect(validateSignUp({ ...good, password: "12345678" }).password).toMatch(/letter and one number/);
    expect(validateSignUp({ ...good, password: "abcdefgh" }).password).toMatch(/letter and one number/);
    expect(validateSignUp({ ...good, password: "a1".repeat(70) }).password).toMatch(/at most/);
    expect(validateSignUp({ ...good, name: "x".repeat(81) }).name).toMatch(/too long/);
  });
  it("rejects odd emails and empty passwords on sign-in without judging password strength", () => {
    expect(validateSignIn({ email: "a@b", password: "x" }).email).toBeTruthy();
    expect(validateSignIn({ email: "a@b.co", password: "" }).password).toMatch(/Enter your password/);
    expect(validateSignIn({ email: "a@b.co", password: "x" })).toEqual({});
  });
});

describe("local provider", () => {
  it("is the provider when no Supabase keys are configured", () => {
    _setAuthProviderForTests(null);
    expect(import.meta.env.VITE_SUPABASE_URL || "").toBe("");
    expect(isLocalAuth()).toBe(true);
    _setAuthProviderForTests("local");
  });

  it("signs up, stores a hashed password, and starts a session", async () => {
    const events = [];
    const off = onAuthChange((s) => events.push(s));
    const session = await signUp(good);
    off();
    expect(session.email).toBe("ada@example.com");
    expect(session.name).toBe("Ada");
    expect(session.provider).toBe("local");
    expect(getSession().userId).toBe(session.userId);
    const stored = JSON.parse(memory.get("vizroute_local_accounts"));
    const account = stored["ada@example.com"];
    expect(account.hash).toHaveLength(64);
    expect(account.hash).not.toContain(good.password);
    expect(JSON.stringify(stored)).not.toContain(good.password);
    expect(events).toHaveLength(1);
  });

  it("signs in with the right password and refuses the wrong one with the same message as an unknown email", async () => {
    await signUp(good);
    await signOut();
    expect(getSession()).toBeNull();
    const session = await signIn({ email: "ADA@example.com ", password: good.password });
    expect(session.userId).toBeTruthy();
    await signOut();
    let wrong;
    try { await signIn({ email: good.email, password: "wrong1wrong" }); } catch (e) { wrong = e; }
    let unknown;
    try { await signIn({ email: "nobody@example.com", password: "wrong1wrong" }); } catch (e) { unknown = e; }
    expect(wrong.message).toBe("Email or password is incorrect.");
    expect(unknown.message).toBe(wrong.message);
    expect(getSession()).toBeNull();
  });

  it("refuses a duplicate sign-up, case-insensitively", async () => {
    await signUp(good);
    await signOut();
    await expect(signUp({ ...good, email: "Ada@Example.com" })).rejects.toThrow(/already exists/);
  });

  it("refuses invalid fields before touching storage", async () => {
    await expect(signUp({ name: "", email: "x", password: "" })).rejects.toThrow(/Enter your name/);
    expect(memory.has("vizroute_local_accounts")).toBe(false);
    await expect(signIn({ email: "", password: "" })).rejects.toThrow(/email/);
  });

  it("survives corrupted storage", async () => {
    memory.set("vizroute_local_accounts", "{not json");
    memory.set("vizroute_session", "[[[");
    expect(getSession()).toBeNull();
    const session = await signUp(good);
    expect(session.userId).toBeTruthy();
  });

  it("does not let a sign-in through with a truncated hash in storage", async () => {
    await signUp(good);
    await signOut();
    const stored = JSON.parse(memory.get("vizroute_local_accounts"));
    stored["ada@example.com"].hash = stored["ada@example.com"].hash.slice(0, 10);
    memory.set("vizroute_local_accounts", JSON.stringify(stored));
    await expect(signIn({ email: good.email, password: good.password })).rejects.toThrow(/incorrect/);
  });
});

describe("keep me signed in", () => {
  it("keeps the session in localStorage by default", async () => {
    await signUp(good);
    await signOut();
    await signIn({ email: good.email, password: good.password });
    expect(memory.has("vizroute_session")).toBe(true);
    expect(tabMemory.has("vizroute_session")).toBe(false);
  });
  it("keeps the session for the tab only when asked not to remember", async () => {
    await signUp(good);
    await signOut();
    await signIn({ email: good.email, password: good.password, remember: false });
    expect(memory.has("vizroute_session")).toBe(false);
    expect(tabMemory.has("vizroute_session")).toBe(true);
    // a fresh read (no memory copy) still finds it
    _setAuthProviderForTests("local");
    expect(getSession()?.email).toBe(good.email);
    await signOut();
    expect(tabMemory.has("vizroute_session")).toBe(false);
    expect(getSession()).toBeNull();
  });
});

describe("a custom provider", () => {
  it("is used for every call once set", async () => {
    const calls = [];
    _setAuthProviderForTests({
      name: "fake",
      signUp: async (f) => { calls.push(["up", f.email]); return { userId: "1" }; },
      signIn: async (f) => { calls.push(["in", f.email]); return { userId: "1" }; },
      signOut: async () => { calls.push(["out"]); },
    });
    await signUp(good);
    await signIn(good);
    await signOut();
    expect(calls).toEqual([["up", good.email], ["in", good.email], ["out"]]);
    expect(isLocalAuth()).toBe(false);
  });
});

describe("signing in with Google or GitHub", () => {
  it("only ever comes back to a path on this site", () => {
    expect(safeNext("/graph")).toBe("/graph");
    expect(safeNext("/graph?id=1#map")).toBe("/graph?id=1#map");
    // An address bar is not to be trusted with where to send someone next.
    expect(safeNext("//evil.example.com")).toBe("/home");
    expect(safeNext("https://evil.example.com")).toBe("/home");
    expect(safeNext("javascript:alert(1)")).toBe("/home");
    expect(safeNext("")).toBe("/home");
    expect(safeNext(null, "/login")).toBe("/login");
  });

  it("returns to the site root, which every host serves", () => {
    expect(oauthRedirectUrl("https://vizroute.app")).toBe("https://vizroute.app/");
    expect(oauthRedirectUrl("https://vizroute.app/")).toBe("https://vizroute.app/");
    expect(oauthRedirectUrl("http://localhost:5173")).toBe("http://localhost:5173/");
  });

  it("builds an authorize URL the service will accept", () => {
    const url = new URL(buildAuthorizeUrl("https://p.supabase.co/auth/v1", "github", "https://vizroute.app/"));
    expect(url.pathname).toBe("/auth/v1/authorize");
    expect(url.searchParams.get("provider")).toBe("github");
    expect(url.searchParams.get("redirect_to")).toBe("https://vizroute.app/");
  });

  it("reads the tokens out of the fragment it comes back with", () => {
    const found = readOAuthRedirect({
      hash: "#access_token=abc.def&refresh_token=r1&expires_in=3600&token_type=bearer",
    });
    expect(found.accessToken).toBe("abc.def");
    expect(found.refreshToken).toBe("r1");
    expect(found.expiresAt).toBeGreaterThan(Date.now());
  });

  it("says nothing happened on an ordinary page load", () => {
    expect(readOAuthRedirect({ hash: "", search: "" })).toBeNull();
    expect(readOAuthRedirect({ hash: "#features" })).toBeNull();
    expect(readOAuthRedirect({ search: "?next=/graph" })).toBeNull();
    expect(hasOAuthRedirect({ hash: "#faq", search: "" })).toBe(false);
    expect(hasOAuthRedirect({ hash: "#access_token=x", search: "" })).toBe(true);
  });

  it("turns the service's wording into something worth reading", () => {
    expect(readOAuthRedirect({ hash: "#error=server_error&error_description=Unsupported+provider" }).error).toMatch(
      /not switched on/i,
    );
    expect(readOAuthRedirect({ search: "?error=access_denied" }).error).toMatch(/cancelled/i);
    expect(readOAuthRedirect({ hash: "#error_description=The+user+denied+the+request" }).error).toMatch(/cancelled/i);
    // An error in either place is still an error, and never a session.
    expect(readOAuthRedirect({ hash: "#error=access_denied&access_token=x" }).accessToken).toBeUndefined();
  });

  it("offers nothing it cannot do when accounts are local to this browser", async () => {
    _setAuthProviderForTests("local");
    expect(oauthProviders()).toEqual([]);
    await expect(signInWithOAuth({ provider: "google" })).rejects.toThrow(/sign-in service/i);
  });

  it("offers Google and GitHub when a service is connected", async () => {
    const started = [];
    _setAuthProviderForTests({
      name: "fake",
      oauth: ["google", "github"],
      signInWithOAuth: async ({ provider, next }) => {
        started.push([provider, next]);
        return { redirecting: true };
      },
    });
    expect(oauthProviders().map((p) => p.id)).toEqual(["google", "github"]);
    expect(oauthProviders().map((p) => p.label)).toEqual(["Google", "GitHub"]);
    await signInWithOAuth({ provider: "github", next: "/graph" });
    expect(started).toEqual([["github", "/graph"]]);
  });

  it("declines to finish a round trip nobody started", async () => {
    _setAuthProviderForTests("local");
    expect(await completeOAuthRedirect({ hash: "", search: "" })).toBeNull();
    expect(await completeOAuthRedirect(null)).toBeNull();
  });

  it("builds a session from the tokens, and goes where the person was going", async () => {
    tabMemory.set("vizroute_oauth_return", JSON.stringify({ next: "/graph", remember: true }));
    _setAuthProviderForTests({
      name: "fake",
      oauth: ["google"],
      completeOAuth: async ({ accessToken }) => ({ userId: "u7", email: "ada@example.com", name: "Ada", accessToken }),
    });
    const result = await completeOAuthRedirect({ hash: "#access_token=tok&expires_in=3600", search: "" });
    expect(result.next).toBe("/graph");
    expect(result.session.userId).toBe("u7");
    expect(getSession()?.email).toBe("ada@example.com");
    // The round trip is over, so what it left behind is cleared.
    expect(tabMemory.has("vizroute_oauth_return")).toBe(false);
  });

  it("reports a refusal instead of half a session", async () => {
    _setAuthProviderForTests({ name: "fake", oauth: ["google"], completeOAuth: async () => { throw new Error("no"); } });
    const result = await completeOAuthRedirect({ hash: "#access_token=tok", search: "" });
    expect(result.error).toBe("no");
    expect(getSession()).toBeNull();
  });
});

describe("a message that has to survive a page load", () => {
  beforeEach(() => _resetOAuthErrorForTests());

  it("is handed to the sign-in page once, and is gone after that", () => {
    stashOAuthError("That sign-in option is not switched on for this site yet.");
    expect(takeOAuthError()).toMatch(/not switched on/);
    // Read twice in one page load — which React does in development — the
    // answer is the same, and the next load starts clean.
    expect(takeOAuthError()).toMatch(/not switched on/);
    expect(tabMemory.has("vizroute_oauth_error")).toBe(false);
    _resetOAuthErrorForTests();
    expect(takeOAuthError()).toBe("");
  });

  it("is empty when nothing went wrong", () => {
    expect(takeOAuthError()).toBe("");
  });
});
