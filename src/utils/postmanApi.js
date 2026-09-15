/**
 * A direct client for the Postman API.
 *
 * `api.getpostman.com` answers pre-flight with `Access-Control-Allow-Origin: *`
 * and allows the `X-Api-Key` header, so the browser can call it without a
 * proxy. That matters: the key never leaves the user's machine except to go
 * to Postman itself, which is the same arrangement as the playground, where
 * every request goes straight from their browser to their own API.
 *
 * The key is an account-wide credential. Nothing here calls a write endpoint
 * unless the caller explicitly asks for one, and the UI confirms before any
 * write reaches a workspace.
 */

const BASE = "https://api.getpostman.com";
const KEY_STORAGE = "vizroute_postman_key";

// ─── Key storage ─────────────────────────────

export const loadApiKey = () => {
  try {
    return localStorage.getItem(KEY_STORAGE) || "";
  } catch {
    return "";
  }
};

export const saveApiKey = (key) => {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
    return true;
  } catch {
    return false;
  }
};

export const forgetApiKey = () => saveApiKey("");

/** Postman keys are printed as `PMAK-…`; anything else is very likely a typo. */
export const looksLikeApiKey = (key) => /^PMAK-[A-Za-z0-9]{24,}/.test(String(key || "").trim());

// ─── Transport ───────────────────────────────

class PostmanApiError extends Error {
  constructor(message, status, retryAfter) {
    super(message);
    this.name = "PostmanApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const describe = async (response) => {
  let detail = "";
  try {
    const body = await response.json();
    detail = body?.error?.message || body?.error?.name || body?.message || "";
  } catch {
    /* a non-JSON error body tells us nothing useful */
  }

  switch (response.status) {
    case 401:
      return "Postman rejected that API key. Check it has not been revoked.";
    case 403:
      return detail || "That key does not have access to this resource.";
    case 404:
      return detail || "Postman could not find that collection or workspace.";
    case 429: {
      const wait = response.headers.get("retry-after");
      return wait
        ? `Postman is rate limiting this key. Try again in ${wait}s.`
        : "Postman is rate limiting this key. Try again shortly.";
    }
    default:
      return detail || `Postman replied ${response.status}.`;
  }
};

const request = async (key, path, { method = "GET", body, signal } = {}) => {
  if (!key) throw new PostmanApiError("No Postman API key is connected.", 0);

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      signal,
      headers: {
        "X-Api-Key": key,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new PostmanApiError(
      "Could not reach api.getpostman.com. Check your connection.",
      0,
    );
  }

  if (!response.ok) {
    throw new PostmanApiError(
      await describe(response),
      response.status,
      response.headers.get("retry-after"),
    );
  }
  return response.json();
};

// ─── Reads ───────────────────────────────────

/** Confirms the key works and says whose account it belongs to. */
export const getMe = async (key, signal) => {
  const data = await request(key, "/me", { signal });
  const user = data?.user || {};
  return {
    id: user.id,
    username: user.username || "",
    email: user.email || "",
    fullName: user.fullName || "",
  };
};

export const listWorkspaces = async (key, signal) => {
  const data = await request(key, "/workspaces", { signal });
  return (data?.workspaces || []).map((w) => ({
    id: w.id,
    name: w.name || "Workspace",
    type: w.type || "",
    visibility: w.visibility || "",
  }));
};

/** A workspace listing is the only call that names its collections. */
export const getWorkspace = async (key, id, signal) => {
  const data = await request(key, `/workspaces/${encodeURIComponent(id)}`, { signal });
  const workspace = data?.workspace || {};
  return {
    id: workspace.id,
    name: workspace.name || "Workspace",
    type: workspace.type || "",
    collections: (workspace.collections || []).map((c) => ({
      uid: c.uid || c.id,
      id: c.id,
      name: c.name || "Collection",
    })),
    environments: (workspace.environments || []).map((e) => ({
      uid: e.uid || e.id,
      id: e.id,
      name: e.name || "Environment",
    })),
  };
};

export const listCollections = async (key, signal) => {
  const data = await request(key, "/collections", { signal });
  return (data?.collections || []).map((c) => ({
    uid: c.uid || c.id,
    id: c.id,
    name: c.name || "Collection",
    owner: c.owner || "",
    updatedAt: c.updatedAt || "",
  }));
};

/** The full collection document, in the same shape as a file export. */
export const getCollection = async (key, uid, signal) => {
  const data = await request(key, `/collections/${encodeURIComponent(uid)}`, { signal });
  return data?.collection || null;
};

export const listEnvironments = async (key, signal) => {
  const data = await request(key, "/environments", { signal });
  return (data?.environments || []).map((e) => ({
    uid: e.uid || e.id,
    id: e.id,
    name: e.name || "Environment",
  }));
};

export const getEnvironment = async (key, uid, signal) => {
  const data = await request(key, `/environments/${encodeURIComponent(uid)}`, { signal });
  const environment = data?.environment || {};
  return {
    id: environment.id,
    name: environment.name || "Environment",
    variables: (environment.values || [])
      .filter((v) => v && v.key)
      .map((v) => ({
        key: v.key,
        value: String(v.value ?? ""),
        enabled: v.enabled !== false,
        secret: v.type === "secret",
      })),
  };
};

// ─── Writes ──────────────────────────────────

/**
 * Create a new collection in a workspace.
 *
 * Callers must have shown the user what is about to be written; nothing in
 * this module asks for confirmation on their behalf.
 */
export const createCollection = async (key, workspaceId, collection, signal) => {
  const query = workspaceId ? `?workspace=${encodeURIComponent(workspaceId)}` : "";
  const data = await request(key, `/collections${query}`, {
    method: "POST",
    body: { collection },
    signal,
  });
  return data?.collection || null;
};

/** Replace an existing collection. This overwrites whatever is there. */
export const updateCollection = async (key, uid, collection, signal) => {
  const data = await request(key, `/collections/${encodeURIComponent(uid)}`, {
    method: "PUT",
    body: { collection },
    signal,
  });
  return data?.collection || null;
};

export { PostmanApiError };
