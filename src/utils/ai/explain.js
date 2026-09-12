import { chat } from "./client";
import { describeEndpoint, scrub } from "./context";
import { validateExample } from "../validateSchema";
import { toJsonText } from "../format";

/**
 * Explain what came back from the playground.
 *
 * The model sees the request as sent, the response as received, and what
 * the spec declared for this endpoint — including any places where the
 * response body disagrees with its declared schema, which `validateExample`
 * works out locally before anything is sent.
 */

const BODY_CHARS = 4000;

const RULES = `You are helping a developer debug a call they just made from an API tool. You are given the endpoint as the specification declares it, the request that was sent, and the response that came back.

Explain in plain language, in at most eight short sentences or bullets:
- For a 4xx or 5xx: the most likely cause, judged against the declared parameters, auth and responses, and the specific change to make to the request. If the body carries an error message, quote the useful part.
- For a 2xx: what the response contains in one or two sentences, then anything that deviates from the declared schema (a list of mismatches may be provided — trust it).
- For a 3xx: where it redirects and whether the client should follow.
Only state what the request, response or spec supports. If the spec declares nothing for this status, say so. Use fenced code only for a corrected request line or a short JSON excerpt. No headings, no preamble.`;

const clipText = (value, max) => {
  const text = toJsonText(value);
  return text.length > max ? `${text.slice(0, max)}\n… (truncated, ${text.length.toLocaleString()} chars)` : text;
};

const declaredSchemaFor = (node, status) => {
  const responses = node?.responses || [];
  const exact = responses.find((r) => String(r.status) === String(status));
  const range = responses.find((r) => /^\dXX$/i.test(String(r.status)) && String(r.status)[0] === String(status)[0]);
  return (exact || range || (status >= 200 && status < 300 ? responses.find((r) => r.status === "default") : null))?.schema || null;
};

export const explainResponse = async ({ node, spec, request, response, signal, onToken } = {}) => {
  const schema = response?.isJson ? declaredSchemaFor(node, response.status) : null;
  let mismatches = [];
  if (schema && response?.data !== undefined) {
    const { checked, issues } = validateExample(response.data, schema, spec);
    if (checked) mismatches = issues.slice(0, 10).map((i) => `${i.path || "$"}: ${i.message}`);
  }

  const parts = [
    `Endpoint as declared:\n${describeEndpoint(node, spec, { maxChars: 4500 })}`,
    `Request sent:\n${scrub(
      toJsonText({
        method: request?.method,
        url: request?.url,
        headers: request?.headers,
        body: request?.body ? clipText(request.body, 1500) : undefined,
      }),
    )}`,
    `Response received:\n${scrub(
      toJsonText({
        status: response?.status,
        statusText: response?.statusText,
        elapsedMs: response?.elapsed,
        headers: (response?.headers || []).slice(0, 25),
        body: clipText(response?.data, BODY_CHARS),
      }),
    )}`,
    mismatches.length
      ? `Response body vs declared ${response.status} schema — mismatches found locally:\n- ${mismatches.join("\n- ")}`
      : schema
        ? `The response body matches the declared ${response.status} schema.`
        : "",
  ].filter(Boolean);

  const res = await chat({
    messages: [
      { role: "system", content: RULES },
      { role: "user", content: parts.join("\n\n") },
    ],
    maxTokens: 1200,
    signal,
    onToken: (delta, full) => onToken?.(full),
  });
  return { content: res.content, mismatches, usage: res.usage };
};
