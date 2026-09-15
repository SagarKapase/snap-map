import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Play,
  Lock,
  X,
  ArrowUpRight,
  Layers,
  AlertTriangle,
} from "lucide-react";
import MethodBadge from "./MethodBadge";
import JsonView from "./JsonView";
import { displayPath, toJsonText } from "../../utils/format";
import {
  methodBreakdown,
  relatedEndpoints,
  resolveSchema,
} from "../../utils/analysis";
import { methodColor } from "../../utils/constants";
import { buildSnippets } from "../../utils/snippets";
import { resolveNode, findVariables } from "../../utils/variables";

const BASE_TABS = ["Endpoint", "Schema", "Code", "Examples", "Related"];

const statusTone = (status) => {
  const code = parseInt(status, 10);
  if (!code) return "text-vz-soft bg-white/6";
  if (code < 300) return "text-vz-green bg-vz-green/12";
  if (code < 400) return "text-vz-warn bg-vz-warn/12";
  return "text-vz-red bg-vz-red/12";
};

const authLabel = (a) => {
  const type = String(a.type || a.name || "").toLowerCase();
  if (type === "http" || type === "bearer")
    return a.scheme === "basic"
      ? "Basic authentication required"
      : "Bearer token required";
  if (type === "apikey")
    return `API key required${a.location ? ` in ${a.location}` : ""}${
      a.headerName ? ` (${a.headerName})` : ""
    }`;
  if (type === "oauth2")
    return `OAuth 2.0${a.scopes?.length ? ` — ${a.scopes.join(", ")}` : ""}`;
  if (type === "openidconnect") return "OpenID Connect";
  return `${a.name || "Authentication"} required`;
};

const Card = ({ title, children, action }) => (
  <section className="rounded-[10px] border border-vz-line bg-vz-panel-2 p-3.5">
    {title ? (
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-vz-text">{title}</h3>
        {action}
      </div>
    ) : null}
    {children}
  </section>
);

const Empty = ({ children }) => (
  <p className="text-[12px] text-vz-dim">{children}</p>
);

const CopyButton = ({ value, label = "Copy" }) => {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(t);
  }, [done]);

  return (
    <button
      type="button"
      title={label}
      onClick={() => {
        navigator.clipboard?.writeText(value ?? "");
        setDone(true);
      }}
      className="vz-t flex-shrink-0 rounded-md p-1.5 text-vz-dim hover:bg-white/6 hover:text-vz-text"
    >
      {done ? <Check size={13} className="text-vz-green" /> : <Copy size={13} />}
    </button>
  );
};

const ResponseBlock = ({ status, contentType, meta, value, note }) => (
  <div>
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span
        className={`rounded-md px-2 py-1 text-[11px] font-bold ${statusTone(status)}`}
      >
        {status || "—"}
      </span>
      {contentType ? (
        <span className="text-[11px] text-vz-soft">{contentType}</span>
      ) : null}
      {meta ? <span className="text-[11px] text-vz-dim">{meta}</span> : null}
      {value !== undefined && value !== null && value !== "" ? (
        <span className="ml-auto">
          <CopyButton value={toJsonText(value)} label="Copy response" />
        </span>
      ) : null}
    </div>
    {value !== undefined && value !== null && value !== "" ? (
      <div className="max-h-[320px] overflow-auto rounded-[10px] border border-vz-line bg-vz-bg p-3 vz-scroll">
        <JsonView value={value} />
      </div>
    ) : (
      <Empty>{note || "No response body recorded."}</Empty>
    )}
  </div>
);

const GroupOverview = ({ node, nodes, onSelectNode }) => {
  const children = nodes.filter((n) => n.parentId === node.id);
  const requests = children.filter((n) => n.type === "request");
  const breakdown = methodBreakdown(
    nodes.filter((n) => n.type === "request" && n.parentId === node.id),
  );

  return (
    <div className="space-y-3 p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-vz-accent/12 text-vz-accent">
          <Layers size={15} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-vz-text">
            {node.name}
          </p>
          <p className="text-[11px] text-vz-dim">
            {node.type === "root" ? "API root" : "Group"} · {requests.length}{" "}
            endpoints
          </p>
        </div>
      </div>

      {node.description ? (
        <p className="text-[12px] leading-relaxed text-vz-soft">
          {node.description}
        </p>
      ) : null}

      {Object.keys(breakdown).length > 0 && (
        <Card title="Methods">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(breakdown).map(([method, count]) => (
              <span
                key={method}
                className="flex items-center gap-1.5 rounded-md bg-vz-elev px-2 py-1 text-[11px] text-vz-soft"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: methodColor(method).dot }}
                />
                {method}
                <span className="tabular-nums text-vz-dim">{count}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {children.length > 0 && (
        <Card title="Contents">
          <div className="space-y-0.5">
            {children.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => onSelectNode(child)}
                className="vz-t flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-white/4"
              >
                {child.type === "request" ? (
                  <MethodBadge method={child.method} size="xs" />
                ) : (
                  <Layers size={13} className="text-vz-dim" />
                )}
                <span className="vz-mono min-w-0 flex-1 truncate text-[12px] text-vz-soft">
                  {child.type === "request" ? displayPath(child) : child.name}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

const EndpointInspector = ({
  node,
  nodes,
  spec,
  liveResponse,
  onTest,
  onSelectNode,
  onClose,
  variables = null,
  variableFlow = null,
}) => {
  // Remounted by the parent whenever the selection changes, so the tab
  // always starts on Endpoint for a newly picked node.
  const [tab, setTab] = useState("Endpoint");
  const [language, setLanguage] = useState("curl");

  const specResponse = useMemo(() => {
    const list = node?.responses || [];
    return list.find((r) => r.example !== undefined) || list[0] || null;
  }, [node]);

  const related = useMemo(
    () => (node ? relatedEndpoints(nodes, node) : []),
    [nodes, node],
  );

  const snippets = useMemo(() => buildSnippets(node), [node]);

  // What the request actually points at once the environment is applied.
  const resolved = useMemo(
    () => (node && variables ? resolveNode(node, variables) : null),
    [node, variables],
  );

  const hasScripts = Boolean(
    node?.scripts && (node.scripts.prerequest || node.scripts.test),
  );

  // Which variables this request reads, and which request writes each one.
  const varsUsed = useMemo(() => {
    if (!node || !variableFlow) return [];
    const names = new Set();
    findVariables(node.path || "").forEach((n) => names.add(n));
    (node.headers || []).forEach((h) => findVariables(String(h.value ?? "")).forEach((n) => names.add(n)));
    (node.auth || []).forEach((a) => (a.values || []).forEach((v) => findVariables(v.value).forEach((n) => names.add(n))));
    if (typeof node.rawBody === "string") findVariables(node.rawBody).forEach((n) => names.add(n));
    return [...names]
      .filter((name) => !name.startsWith("$"))
      .map((name) => ({
        name,
        value: variables?.get(name)?.value ?? null,
        source: variables?.get(name)?.source ?? null,
        producers: (variableFlow.producers.get(name) || [])
          .map((id) => nodes.find((n) => n.id === id))
          .filter(Boolean),
      }));
  }, [node, variables, variableFlow, nodes]);

  const setsVariables = useMemo(() => {
    if (!node || !variableFlow) return [];
    const out = [];
    variableFlow.producers.forEach((ids, name) => {
      if (ids.includes(node.id)) {
        out.push({
          name,
          consumers: (variableFlow.consumers.get(name) || [])
            .filter((id) => id !== node.id)
            .map((id) => nodes.find((n) => n.id === id))
            .filter(Boolean),
        });
      }
    });
    return out;
  }, [node, variableFlow, nodes]);

  const TABS = useMemo(
    () => (hasScripts ? [...BASE_TABS.slice(0, 3), "Scripts", ...BASE_TABS.slice(3)] : BASE_TABS),
    [hasScripts],
  );

  const requestSchema = useMemo(
    () => (node?.requestBodySchema ? resolveSchema(spec, node.requestBodySchema) : null),
    [node, spec],
  );

  const responseSchema = useMemo(() => {
    const withSchema = (node?.responses || []).find((r) => r.schema);
    return withSchema ? resolveSchema(spec, withSchema.schema) : null;
  }, [node, spec]);

  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl border border-vz-line bg-vz-panel-2 text-vz-dim">
          <Layers size={20} />
        </div>
        <p className="text-[13px] text-vz-soft">No endpoint selected</p>
        <p className="text-[12px] leading-relaxed text-vz-dim">
          Pick a node on the map or an endpoint in the explorer to inspect it.
        </p>
      </div>
    );
  }

  if (node.type !== "request") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-vz-line-soft px-3.5 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-vz-dim">
            Group
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="vz-t rounded-md p-1 text-vz-dim hover:text-vz-text xl:hidden"
            >
              <X size={15} />
            </button>
          )}
        </div>
        <div className="vz-scroll min-h-0 flex-1 overflow-auto">
          <GroupOverview node={node} nodes={nodes} onSelectNode={onSelectNode} />
        </div>
      </div>
    );
  }

  const params = node.params || [];
  const headers = node.headers || [];
  const auth = node.auth || [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Tabs */}
      <div className="vz-scroll flex flex-shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-vz-line-soft px-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`vz-t relative whitespace-nowrap px-2 py-[18px] text-[11.5px] ${
              tab === t
                ? "text-[#e6c4ff] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-vz-accent-2"
                : "text-vz-soft hover:text-vz-text"
            }`}
          >
            {t}
          </button>
        ))}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="vz-t ml-auto self-center rounded-md p-1 text-vz-dim hover:text-vz-text xl:hidden"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="vz-scroll min-h-0 flex-1 space-y-3 overflow-auto p-3.5">
        {/* Identity — always visible */}
        <div className="flex items-center gap-2.5">
          <MethodBadge method={node.method} size="lg" short={false} />
          <span
            className="vz-mono min-w-0 flex-1 truncate text-[13px] font-medium text-vz-text"
            title={node.path}
          >
            {displayPath(node)}
          </span>
          <CopyButton value={resolved?.path || node.path} label="Copy URL" />
        </div>

        {/* Once an environment is applied the raw template is no longer what
            the request points at, so the real target is shown beneath it. */}
        {resolved && resolved.path !== node.path && (
          <p className="vz-mono break-all rounded-md bg-vz-green/[0.07] px-2 py-1.5 text-[11px] leading-relaxed text-vz-green">
            {resolved.path}
          </p>
        )}

        {resolved?.unresolved?.length > 0 && (
          <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-vz-warn">
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
            {resolved.unresolved.map((n) => `{{${n}}}`).join(", ")}{" "}
            {resolved.unresolved.length === 1 ? "has" : "have"} no value in the
            active environment.
          </p>
        )}

        {node.deprecated ? (
          <p className="flex items-center gap-1.5 text-[12px] text-vz-warn">
            <AlertTriangle size={13} /> Marked deprecated in the spec
          </p>
        ) : null}

        {tab === "Endpoint" && (
          <>
            {node.description ? (
              <p className="text-[12px] leading-relaxed text-vz-soft">
                {node.description}
              </p>
            ) : (
              <Empty>No description in the spec.</Empty>
            )}

            {(varsUsed.length > 0 || setsVariables.length > 0) && (
              <Card title="Variables">
                {setsVariables.map((entry) => (
                  <p key={`sets-${entry.name}`} className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
                    <ArrowUpRight size={12} className="flex-shrink-0 text-vz-green" />
                    <span className="vz-mono text-vz-green">{entry.name}</span>
                    <span className="text-vz-dim">
                      set here
                      {entry.consumers.length
                        ? ` · read by ${entry.consumers.length} request${entry.consumers.length === 1 ? "" : "s"}`
                        : " · nothing reads it"}
                    </span>
                  </p>
                ))}

                {varsUsed.map((entry) => (
                  <div key={`uses-${entry.name}`} className="mb-1.5 last:mb-0">
                    <p className="flex flex-wrap items-baseline gap-1.5 text-[12px]">
                      <span className="vz-mono text-vz-text">{`{{${entry.name}}}`}</span>
                      {entry.value !== null ? (
                        <span className="vz-mono min-w-0 truncate text-vz-soft" title={entry.value}>
                          = {entry.value || "(empty)"}
                        </span>
                      ) : entry.producers.length ? (
                        <span className="text-vz-dim">set at run time</span>
                      ) : (
                        <span className="text-vz-warn">no value anywhere</span>
                      )}
                    </p>
                    {entry.source && (
                      <p className="text-[10.5px] text-vz-dim">from the {entry.source}</p>
                    )}
                    {entry.producers.map((producer) => (
                      <button
                        key={producer.id}
                        type="button"
                        onClick={() => onSelectNode?.(producer)}
                        className="vz-t mt-0.5 flex items-center gap-1 text-[10.5px] text-vz-accent-2 hover:underline"
                      >
                        <ArrowUpRight size={10} />
                        set by {producer.name}
                      </button>
                    ))}
                  </div>
                ))}
              </Card>
            )}

            <Card title="Authentication">
              {auth.length ? (
                <div className="space-y-1.5">
                  {auth.map((a, i) => (
                    <p
                      key={`${a.name}-${i}`}
                      className="flex items-center gap-2 text-[12px] text-[#d6a8ff]"
                    >
                      <Lock size={13} className="flex-shrink-0" />
                      {authLabel(a)}
                    </p>
                  ))}
                </div>
              ) : (
                <Empty>No authentication declared for this operation.</Empty>
              )}
            </Card>

            <Card title="Parameters">
              {params.length ? (
                <div className="space-y-2">
                  {params.map((p, i) => (
                    <div
                      key={`${p.in}-${p.name}-${i}`}
                      className="border-b border-vz-line-soft pb-2 last:border-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="vz-mono text-[12px] text-vz-text">
                          {p.name}
                        </span>
                        <span className="rounded bg-vz-elev px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-vz-dim">
                          {p.in}
                        </span>
                        {p.type ? (
                          <span className="text-[11px] text-vz-blue">
                            {p.type}
                          </span>
                        ) : null}
                        {p.required ? (
                          <span className="text-[11px] text-vz-red">
                            required
                          </span>
                        ) : null}
                      </div>
                      {p.description ? (
                        <p className="mt-1 text-[11px] leading-relaxed text-vz-dim">
                          {p.description}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>No parameters</Empty>
              )}
            </Card>

            {headers.length > 0 && (
              <Card title="Headers">
                <div className="space-y-1.5">
                  {headers.map((h, i) => (
                    <div key={`${h.key}-${i}`} className="flex gap-2 text-[11px]">
                      <span className="vz-mono flex-shrink-0 text-vz-soft">
                        {h.key}
                      </span>
                      <span className="vz-mono min-w-0 flex-1 truncate text-right text-vz-dim">
                        {h.value}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <button
              type="button"
              onClick={onTest}
              className="vz-t flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c45cff] text-[13px] font-semibold text-[#160a1d] hover:opacity-90"
            >
              <Play size={15} /> Try Request
            </button>

            <div>
              <h3 className="mb-2 text-[13px] font-semibold text-vz-text">
                Response
              </h3>
              {liveResponse ? (
                <ResponseBlock
                  status={liveResponse.status}
                  contentType={liveResponse.isJson ? "application/json" : "text"}
                  meta={`live · ${liveResponse.elapsed}ms`}
                  value={liveResponse.data}
                />
              ) : specResponse ? (
                <ResponseBlock
                  status={specResponse.status}
                  contentType={specResponse.contentType}
                  meta={specResponse.description || "from spec"}
                  value={specResponse.example}
                  note="The spec declares this response but carries no example body. Run Try Request to capture a real one."
                />
              ) : (
                <Empty>
                  No response declared in the spec. Run Try Request to capture a
                  live one.
                </Empty>
              )}
            </div>
          </>
        )}

        {tab === "Schema" && (
          <>
            <Card
              title="Request body schema"
              action={
                requestSchema ? (
                  <CopyButton value={toJsonText(requestSchema)} />
                ) : null
              }
            >
              {requestSchema ? (
                <div className="max-h-[300px] overflow-auto rounded-[10px] border border-vz-line bg-vz-bg p-3 vz-scroll">
                  <JsonView value={requestSchema} />
                </div>
              ) : (
                <Empty>No request body schema in the spec.</Empty>
              )}
            </Card>

            <Card
              title="Response schema"
              action={
                responseSchema ? (
                  <CopyButton value={toJsonText(responseSchema)} />
                ) : null
              }
            >
              {responseSchema ? (
                <div className="max-h-[300px] overflow-auto rounded-[10px] border border-vz-line bg-vz-bg p-3 vz-scroll">
                  <JsonView value={responseSchema} />
                </div>
              ) : (
                <Empty>No response schema in the spec.</Empty>
              )}
            </Card>
          </>
        )}

        {tab === "Code" && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {snippets.map((snippet) => (
                <button
                  key={snippet.id}
                  type="button"
                  onClick={() => setLanguage(snippet.id)}
                  className={`vz-t rounded-md px-2 py-1 text-[11.5px] ${
                    language === snippet.id
                      ? "bg-vz-accent/18 text-vz-text"
                      : "text-vz-soft hover:bg-white/5 hover:text-vz-text"
                  }`}
                >
                  {snippet.label}
                </button>
              ))}
            </div>

            {snippets
              .filter((snippet) => snippet.id === language)
              .map((snippet) => (
                <div key={snippet.id}>
                  <div className="mb-1.5 flex items-center justify-end">
                    <CopyButton value={snippet.code} label={`Copy ${snippet.label}`} />
                  </div>
                  <pre className="vz-mono vz-scroll max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-[10px] border border-vz-line bg-vz-bg p-3 text-[11px] leading-[1.65] text-vz-soft">
                    {snippet.code}
                  </pre>
                </div>
              ))}
          </div>
        )}

        {tab === "Examples" && (
          <>
            <Card
              title="Request body"
              action={node.body ? <CopyButton value={toJsonText(node.body)} /> : null}
            >
              {node.body ? (
                <div className="max-h-[300px] overflow-auto rounded-[10px] border border-vz-line bg-vz-bg p-3 vz-scroll">
                  <JsonView value={node.body} />
                </div>
              ) : (
                <Empty>No request body example.</Empty>
              )}
            </Card>

            {liveResponse && (
              <Card title="Last live response">
                <ResponseBlock
                  status={liveResponse.status}
                  contentType={liveResponse.isJson ? "application/json" : "text"}
                  meta={`${liveResponse.elapsed}ms`}
                  value={liveResponse.data}
                />
              </Card>
            )}

            <Card title="Responses in spec">
              {node.responses?.length ? (
                <div className="space-y-3">
                  {node.responses.map((r, i) => (
                    <ResponseBlock
                      key={`${r.status}-${i}`}
                      status={r.status}
                      contentType={r.contentType}
                      meta={r.description}
                      value={r.example}
                      note="No example body for this status."
                    />
                  ))}
                </div>
              ) : (
                <Empty>The spec declares no responses for this operation.</Empty>
              )}
            </Card>
          </>
        )}

        {tab === "Scripts" && (
          <>
            <p className="text-[11.5px] leading-relaxed text-vz-dim">
              Scripts are shown as written in the collection. Vizroute does not
              run them — this is what Postman will execute around the request.
            </p>

            {node.scripts?.prerequest ? (
              <Card title="Pre-request">
                <pre className="vz-mono vz-scroll max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-vz-soft">
                  {node.scripts.prerequest}
                </pre>
              </Card>
            ) : (
              <Empty>No pre-request script.</Empty>
            )}

            {node.scripts?.test ? (
              <Card title="Tests">
                <pre className="vz-mono vz-scroll max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-vz-soft">
                  {node.scripts.test}
                </pre>
              </Card>
            ) : (
              <Empty>No test script.</Empty>
            )}
          </>
        )}

        {tab === "Related" && (
          <Card title={`Related endpoints (${related.length})`}>
            {related.length ? (
              <div className="space-y-0.5">
                {related.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onSelectNode(r)}
                    className="vz-t group flex w-full items-center gap-2 rounded-lg px-1.5 py-2 text-left hover:bg-white/4"
                    title={r.path}
                  >
                    <MethodBadge method={r.method} size="xs" />
                    <span className="vz-mono min-w-0 flex-1 truncate text-[12px] text-vz-soft">
                      {displayPath(r)}
                    </span>
                    <ArrowUpRight
                      size={13}
                      className="flex-shrink-0 text-vz-dim opacity-0 group-hover:opacity-100"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <Empty>Nothing shares this group or path prefix.</Empty>
            )}
          </Card>
        )}
      </div>
    </div>
  );
};

export default EndpointInspector;
