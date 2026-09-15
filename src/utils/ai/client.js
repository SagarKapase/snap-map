/**
 * A direct client for OpenRouter's chat completions endpoint.
 *
 * Same arrangement as the Postman client: the browser talks to OpenRouter
 * itself, with no proxy in between, so the spec only ever travels from the
 * user's machine to the provider they chose.
 *
 * The key comes from one of two places. A key saved in this browser wins;
 * otherwise `VITE_OPENROUTER_API_KEY` from `.env.local` is used. Vite inlines
 * `VITE_*` variables into the bundle at build time, so the env route is for
 * local development — a deployed build should leave it unset and let each
 * user bring their own key.
 */

// Overridable for tests and for anyone fronting OpenRouter with their own proxy.
const BASE = String(import.meta.env.VITE_OPENROUTER_BASE || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
export const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";

const KEY_STORAGE = "vizroute_openrouter_key";
const MODEL_STORAGE = "vizroute_openrouter_model";

// ─── Key and model storage ───────────────────

const envKey = () => String(import.meta.env.VITE_OPENROUTER_API_KEY || "").trim();
const envModel = () => String(import.meta.env.VITE_OPENROUTER_MODEL || "").trim();

const readStorage = (key) => {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

const writeStorage = (key, value) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

export const loadApiKey = () => readStorage(KEY_STORAGE) || envKey();
export const saveApiKey = (key) => writeStorage(KEY_STORAGE, String(key || "").trim());
export const forgetApiKey = () => saveApiKey("");
export const hasApiKey = () => Boolean(loadApiKey());

/** Where the active key came from, for the settings UI. */
export const keySource = () => {
  if (readStorage(KEY_STORAGE)) return "browser";
  if (envKey()) return "env";
  return "none";
};

/** OpenRouter keys are printed as `sk-or-v1-…`; anything else is very likely a typo. */
export const looksLikeApiKey = (key) => /^sk-or-v1-[a-f0-9]{16,}/i.test(String(key || "").trim());

export const getModel = () => readStorage(MODEL_STORAGE) || envModel() || DEFAULT_MODEL;
export const saveModel = (model) => writeStorage(MODEL_STORAGE, String(model || "").trim());

// ─── Errors ──────────────────────────────────

export class AiError extends Error {
  constructor(message, { status = 0, code = "" } = {}) {
    super(message);
    this.name = "AiError";
    this.status = status;
    this.code = code;
  }
}

const describeStatus = (status, message) => {
  if (status === 401) return "OpenRouter rejected the API key. Check VITE_OPENROUTER_API_KEY in .env.local, or save a key in the assistant settings.";
  if (status === 402) return "The OpenRouter account has no credits left for this model.";
  if (status === 404) return `The model is not available on OpenRouter: ${message || getModel()}`;
  if (status === 429) return "OpenRouter is rate limiting this key — wait a moment and try again.";
  if (status >= 500) return `OpenRouter had a problem upstream (${status}). Try again shortly.`;
  return message || `OpenRouter returned ${status}`;
};

// ─── Transport ───────────────────────────────

/** Some models write their reasoning inline; the UI never needs to see it. */
const stripThink = (text) => String(text || "").replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim();

const parseArgs = (raw) => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

/**
 * One streamed chat completion.
 *
 * Always streams — a long answer over a large spec would otherwise sit behind
 * a single request that the browser or a proxy is happy to cut off. Text is
 * reported through `onToken(delta, fullText)` as it arrives; tool calls are
 * assembled from their chunks and returned whole.
 */
export const chat = async ({
  messages,
  tools,
  toolChoice,
  responseFormat,
  temperature = 0.2,
  maxTokens = 4000,
  reasoning = { effort: "low" },
  model = getModel(),
  signal,
  onToken,
  onReasoning,
} = {}) => {
  const key = loadApiKey();
  if (!key) throw new AiError("No OpenRouter API key is configured.", { code: "no_key" });

  const body = {
    model,
    messages,
    stream: true,
    temperature,
    max_tokens: maxTokens,
    usage: { include: true },
  };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = toolChoice || "auto";
  }
  if (responseFormat) body.response_format = responseFormat;
  if (reasoning) body.reasoning = reasoning;

  let res;
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // Attribution headers OpenRouter asks browser apps to send.
        "HTTP-Referer": typeof location !== "undefined" ? location.origin : "",
        "X-Title": "Vizroute",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new AiError("Could not reach OpenRouter — check the network connection.", { code: "network" });
  }

  if (!res.ok) {
    let message = "";
    let code = "";
    try {
      const json = await res.json();
      message = json?.error?.message || json?.message || "";
      code = json?.error?.code || "";
    } catch {
      // Not JSON; the status is all we have.
    }
    throw new AiError(describeStatus(res.status, message), { status: res.status, code: String(code || res.status) });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoningText = "";
  let finishReason = "";
  let usage = null;
  let responseModel = model;
  const toolCalls = [];

  const handleLine = (line) => {
    // OpenRouter emits ": OPENROUTER PROCESSING" comments while it waits.
    if (!line || line.startsWith(":")) return false;
    if (!line.startsWith("data:")) return false;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") return true;

    let json;
    try {
      json = JSON.parse(payload);
    } catch {
      return false;
    }
    if (json.error) {
      throw new AiError(json.error.message || "The model returned an error mid-stream.", {
        status: res.status,
        code: String(json.error.code || "stream"),
      });
    }
    if (json.model) responseModel = json.model;
    if (json.usage) usage = json.usage;

    const choice = json.choices?.[0];
    if (!choice) return false;
    const delta = choice.delta || {};

    if (typeof delta.content === "string" && delta.content) {
      content += delta.content;
      onToken?.(delta.content, content);
    }
    if (typeof delta.reasoning === "string" && delta.reasoning) {
      reasoningText += delta.reasoning;
      onReasoning?.(delta.reasoning, reasoningText);
    }
    if (Array.isArray(delta.tool_calls)) {
      delta.tool_calls.forEach((part, i) => {
        const index = typeof part.index === "number" ? part.index : i;
        if (!toolCalls[index]) toolCalls[index] = { id: "", name: "", arguments: "" };
        const slot = toolCalls[index];
        if (part.id) slot.id = part.id;
        if (part.function?.name) slot.name = part.function.name;
        if (typeof part.function?.arguments === "string") slot.arguments += part.function.arguments;
      });
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
    return false;
  };

  let done = false;
  while (!done) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (handleLine(line)) {
        done = true;
        break;
      }
      newline = buffer.indexOf("\n");
    }
  }
  if (!done && buffer.trim()) handleLine(buffer.trim());

  return {
    content: stripThink(content),
    reasoning: reasoningText,
    toolCalls: toolCalls
      .filter(Boolean)
      .map((tc, i) => ({
        id: tc.id || `call_${i}`,
        name: tc.name,
        args: parseArgs(tc.arguments),
        rawArguments: tc.arguments,
      })),
    finishReason,
    usage,
    model: responseModel,
  };
};

// ─── Structured output ───────────────────────

/** Pull the first JSON object or array out of prose or a code fence. */
export const extractJson = (text) => {
  const raw = stripThink(text).replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    // Fall through to the bracket scan.
  }
  const start = raw.search(/[[{]/);
  if (start === -1) return null;
  const open = raw[start];
  const close = open === "{" ? "}" : "]";
  const end = raw.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

/**
 * A completion that must come back as JSON matching `schema`.
 *
 * The first attempt asks the provider to enforce the schema. Not every
 * model route honours `response_format` (the free Nemotron variant does
 * not), so a failure there is retried as a plain request with the schema
 * spelled out in the instructions and the answer parsed leniently.
 */
export const chatJson = async ({ schema, name = "result", messages, signal, ...rest }) => {
  const instruction = {
    role: "system",
    content: `Respond with a single JSON document and nothing else. It must match this JSON schema exactly:\n${JSON.stringify(schema)}`,
  };

  const attempt = async (useFormat) => {
    const res = await chat({
      ...rest,
      signal,
      messages: useFormat ? messages : [...messages, instruction],
      responseFormat: useFormat
        ? { type: "json_schema", json_schema: { name, strict: true, schema } }
        : undefined,
    });
    return { parsed: extractJson(res.content), res };
  };

  let first;
  try {
    first = await attempt(true);
    if (first.parsed) return { data: first.parsed, usage: first.res.usage };
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    // A 400 here almost always means the route rejected response_format.
    if (!(err instanceof AiError) || (err.status && err.status !== 400)) throw err;
  }

  const second = await attempt(false);
  if (!second.parsed) {
    throw new AiError("The model did not return valid JSON.", { code: "bad_json" });
  }
  return { data: second.parsed, usage: second.res.usage };
};
