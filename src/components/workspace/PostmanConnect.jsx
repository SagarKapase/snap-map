import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Loader2,
  KeyRound,
  Folder,
  ChevronRight,
  AlertCircle,
  ArrowUpRight,
  ShieldAlert,
  Upload,
  Check,
  RefreshCw,
  LogOut,
  Layers,
} from "lucide-react";
import { PostmanIcon } from "../icons/BrandIcons";
import {
  loadApiKey,
  saveApiKey,
  forgetApiKey,
  looksLikeApiKey,
  getMe,
  listWorkspaces,
  getWorkspace,
  getCollection,
  getEnvironment,
  createCollection,
  updateCollection,
} from "../../utils/postmanApi";

/**
 * Connect a Postman account and move collections in both directions.
 *
 * The whole point of this panel is that it is not a migration: a collection
 * is pulled in to be looked at, and whatever comes back goes to the same
 * workspace it came from. Nothing is written without the user pressing the
 * button on a screen that says exactly what will change.
 */

const PANEL =
  "w-full max-w-[680px] overflow-hidden rounded-2xl border border-vz-line bg-vz-panel shadow-2xl shadow-black/60";

const rowClass =
  "vz-t flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-vz-soft hover:bg-white/4 hover:text-vz-text disabled:opacity-50";

const PostmanConnect = ({
  onClose,
  onLoadCollection,
  onLoadEnvironment,
  pushPayload = null,
  pushLabel = "",
}) => {
  const [key, setKey] = useState(() => loadApiKey());
  const [draftKey, setDraftKey] = useState("");
  const [account, setAccount] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [openWorkspace, setOpenWorkspace] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pushTarget, setPushTarget] = useState(null); // {mode, workspace, collection}
  const [pushed, setPushed] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (label, task) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(label);
    setError("");
    try {
      return await task(controller.signal);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message || "That did not work.");
      return null;
    } finally {
      setBusy("");
    }
  }, []);

  const connect = useCallback(
    async (candidate) => {
      const who = await run("connect", (signal) => getMe(candidate, signal));
      if (!who) return;
      saveApiKey(candidate);
      setKey(candidate);
      setAccount(who);
      const list = await run("workspaces", (signal) => listWorkspaces(candidate, signal));
      if (list) setWorkspaces(list);
    },
    [run],
  );

  // A key already in storage is verified on open rather than trusted.
  useEffect(() => {
    if (key && !account) connect(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnect = () => {
    forgetApiKey();
    setKey("");
    setDraftKey("");
    setAccount(null);
    setWorkspaces([]);
    setOpenWorkspace(null);
    setPushTarget(null);
  };

  const expand = async (workspace) => {
    if (openWorkspace?.id === workspace.id) {
      setOpenWorkspace(null);
      return;
    }
    const full = await run(`ws:${workspace.id}`, (signal) =>
      getWorkspace(key, workspace.id, signal),
    );
    if (full) setOpenWorkspace(full);
  };

  const pull = async (collection) => {
    const document = await run(`col:${collection.uid}`, (signal) =>
      getCollection(key, collection.uid, signal),
    );
    if (document) {
      onLoadCollection(document, collection.name);
      onClose();
    }
  };

  const pullEnvironment = async (environment) => {
    const document = await run(`env:${environment.uid}`, (signal) =>
      getEnvironment(key, environment.uid, signal),
    );
    if (document) onLoadEnvironment(document);
  };

  const push = async () => {
    if (!pushTarget || !pushPayload) return;
    const result = await run("push", (signal) =>
      pushTarget.mode === "update"
        ? updateCollection(key, pushTarget.collection.uid, pushPayload, signal)
        : createCollection(key, pushTarget.workspace.id, pushPayload, signal),
    );
    if (result) {
      setPushed({
        name: result.name || pushPayload?.info?.name || "Collection",
        mode: pushTarget.mode,
      });
      setPushTarget(null);
    }
  };

  const requestCount = (() => {
    const count = (items) =>
      (items || []).reduce(
        (n, item) => n + (Array.isArray(item.item) ? count(item.item) : 1),
        0,
      );
    return pushPayload ? count(pushPayload.item) : 0;
  })();

  // ── Not connected ──
  if (!key || !account) {
    return (
      <Shell onClose={onClose}>
        <div className="px-5 py-5">
          <p className="text-[13px] leading-relaxed text-vz-soft">
            Connect a Postman API key to open your collections here without
            exporting a file, and to send changes back to the same workspace.
          </p>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-vz-warn/25 bg-vz-warn/[0.07] px-3.5 py-3">
            <ShieldAlert size={14} className="mt-0.5 flex-shrink-0 text-vz-warn" />
            <p className="text-[12px] leading-relaxed text-vz-soft">
              A Postman API key grants access to your whole account. It is kept
              in this browser and sent only to api.getpostman.com — never to
              Vizroute, which has no server. Nothing is written to a workspace
              until you confirm it on screen. Revoke it any time from your
              Postman account settings.
            </p>
          </div>

          <label
            className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.14em] text-vz-dim"
            htmlFor="pm-key"
          >
            API key
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="pm-key"
              type="password"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draftKey.trim()) connect(draftKey.trim());
              }}
              placeholder="PMAK-..."
              autoComplete="off"
              spellCheck={false}
              className="vz-mono h-10 min-w-0 flex-1 rounded-lg border border-vz-line bg-vz-bg px-3 text-[13px] text-vz-text outline-none focus:border-vz-accent/60"
            />
            <button
              type="button"
              disabled={!draftKey.trim() || !!busy}
              onClick={() => connect(draftKey.trim())}
              className="vz-t flex h-10 items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c45cff] px-4 text-[13px] font-semibold text-[#160a1d] disabled:opacity-40"
            >
              {busy === "connect" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <KeyRound size={14} />
              )}
              Connect
            </button>
          </div>

          {draftKey.trim() && !looksLikeApiKey(draftKey.trim()) && (
            <p className="mt-2 text-[11.5px] text-vz-dim">
              Postman keys begin with <span className="vz-mono">PMAK-</span>. This
              will still be tried as entered.
            </p>
          )}

          <a
            href="https://postman.co/settings/me/api-keys"
            target="_blank"
            rel="noreferrer noopener"
            className="vz-t mt-4 inline-flex items-center gap-1 text-[12px] text-vz-accent-2 hover:underline"
          >
            Create a key in Postman
            <ArrowUpRight size={12} />
          </a>

          {error && <ErrorStrip>{error}</ErrorStrip>}
        </div>
      </Shell>
    );
  }

  // ── Confirming a push ──
  if (pushTarget) {
    return (
      <Shell onClose={onClose}>
        <div className="px-5 py-5">
          <h3 className="text-[14px] font-semibold text-vz-text">
            {pushTarget.mode === "update"
              ? `Overwrite "${pushTarget.collection.name}"`
              : `Create a collection in ${pushTarget.workspace.name}`}
          </h3>

          <div className="mt-3 rounded-xl border border-vz-line bg-vz-panel-2 px-3.5 py-3">
            <p className="text-[12.5px] text-vz-soft">
              <span className="font-semibold text-vz-text">
                {pushPayload?.info?.name || "Collection"}
              </span>{" "}
              · {requestCount} request{requestCount === 1 ? "" : "s"}
              {pushLabel ? ` · ${pushLabel}` : ""}
            </p>
            {pushTarget.mode === "update" && (
              <p className="mt-2 flex items-start gap-2 text-[12px] leading-relaxed text-[#fda4af]">
                <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                This replaces the collection in Postman entirely. Anything added
                there since you pulled it will be lost. Postman keeps its own
                history, but check before you send.
              </p>
            )}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPushTarget(null)}
              className="vz-t rounded-lg border border-vz-line px-3.5 py-2 text-[13px] text-vz-soft hover:text-vz-text"
            >
              Back
            </button>
            <button
              type="button"
              disabled={busy === "push"}
              onClick={push}
              className="vz-t flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c45cff] px-4 py-2 text-[13px] font-semibold text-[#160a1d] disabled:opacity-50"
            >
              {busy === "push" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {pushTarget.mode === "update" ? "Overwrite in Postman" : "Create in Postman"}
            </button>
          </div>

          {error && <ErrorStrip>{error}</ErrorStrip>}
        </div>
      </Shell>
    );
  }

  // ── Connected ──
  return (
    <Shell onClose={onClose}>
      <div className="flex items-center gap-2.5 border-b border-vz-line-soft px-5 py-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#ff6c37]/15 text-[#ff6c37]">
          <PostmanIcon size={14} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] font-semibold text-vz-text">
            {account.fullName || account.username || "Postman account"}
          </span>
          <span className="block truncate text-[11px] text-vz-dim">{account.email}</span>
        </span>
        <button
          type="button"
          onClick={disconnect}
          className="vz-t ml-auto flex items-center gap-1.5 rounded-lg border border-vz-line px-2.5 py-1.5 text-[11.5px] text-vz-soft hover:text-vz-text"
        >
          <LogOut size={12} />
          Disconnect
        </button>
      </div>

      {pushed && (
        <p className="flex items-center gap-2 border-b border-vz-line-soft bg-vz-green/[0.08] px-5 py-2.5 text-[12.5px] text-vz-green">
          <Check size={13} />
          {pushed.name} was {pushed.mode === "update" ? "updated" : "created"} in Postman.
        </p>
      )}

      {pushPayload && (
        <p className="border-b border-vz-line-soft bg-vz-accent/[0.07] px-5 py-2.5 text-[12px] leading-relaxed text-vz-soft">
          Pick a workspace to create{" "}
          <span className="font-semibold text-vz-text">
            {pushPayload?.info?.name || "this collection"}
          </span>{" "}
          in, or a collection to overwrite.
        </p>
      )}

      <div className="vz-scroll max-h-[54vh] overflow-y-auto py-1">
        {workspaces.length === 0 && !busy && (
          <p className="px-5 py-6 text-center text-[13px] text-vz-dim">
            This key can see no workspaces.
          </p>
        )}

        {workspaces.map((workspace) => {
          const open = openWorkspace?.id === workspace.id;
          return (
            <div key={workspace.id}>
              <button type="button" onClick={() => expand(workspace)} className={rowClass}>
                {busy === `ws:${workspace.id}` ? (
                  <Loader2 size={14} className="animate-spin text-vz-accent" />
                ) : (
                  <ChevronRight
                    size={14}
                    className={`vz-t text-vz-dim ${open ? "rotate-90" : ""}`}
                  />
                )}
                <Folder size={14} className="text-vz-blue" />
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                <span className="text-[11px] text-vz-dim">{workspace.type}</span>
                {pushPayload && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPushTarget({ mode: "create", workspace });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        setPushTarget({ mode: "create", workspace });
                      }
                    }}
                    className="vz-t rounded-md border border-vz-line bg-vz-panel-2 px-2 py-0.5 text-[11px] text-vz-soft hover:text-vz-text"
                  >
                    Create here
                  </span>
                )}
              </button>

              {open && (
                <div className="border-l border-vz-line-soft pb-1 pl-6 ml-5">
                  {openWorkspace.collections.length === 0 &&
                    openWorkspace.environments.length === 0 && (
                      <p className="px-3 py-2 text-[12px] text-vz-dim">Empty workspace.</p>
                    )}

                  {openWorkspace.collections.map((collection) => (
                    <div key={collection.uid} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => pull(collection)}
                        disabled={!!busy}
                        className={`${rowClass} flex-1`}
                      >
                        {busy === `col:${collection.uid}` ? (
                          <Loader2 size={13} className="animate-spin text-vz-accent" />
                        ) : (
                          <PostmanIcon size={13} className="text-[#ff6c37]" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                      </button>
                      {pushPayload && (
                        <button
                          type="button"
                          onClick={() =>
                            setPushTarget({ mode: "update", workspace, collection })
                          }
                          className="vz-t mr-3 flex-shrink-0 rounded-md border border-vz-line bg-vz-panel-2 px-2 py-0.5 text-[11px] text-vz-soft hover:text-vz-text"
                        >
                          Overwrite
                        </button>
                      )}
                    </div>
                  ))}

                  {openWorkspace.environments.map((environment) => (
                    <button
                      key={environment.uid}
                      type="button"
                      onClick={() => pullEnvironment(environment)}
                      disabled={!!busy}
                      className={rowClass}
                    >
                      {busy === `env:${environment.uid}` ? (
                        <Loader2 size={13} className="animate-spin text-vz-accent" />
                      ) : (
                        <Layers size={13} className="text-vz-green" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{environment.name}</span>
                      <span className="text-[11px] text-vz-dim">environment</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-vz-line-soft px-5 py-2.5">
        <button
          type="button"
          disabled={!!busy}
          onClick={async () => {
            const list = await run("workspaces", (signal) => listWorkspaces(key, signal));
            if (list) setWorkspaces(list);
            setOpenWorkspace(null);
          }}
          className="vz-t flex items-center gap-1.5 text-[12px] text-vz-soft hover:text-vz-text"
        >
          <RefreshCw size={12} className={busy === "workspaces" ? "animate-spin" : ""} />
          Refresh
        </button>
        <span className="ml-auto text-[11px] text-vz-dim">
          Requests go straight from this browser to Postman.
        </span>
      </div>

      {error && <ErrorStrip>{error}</ErrorStrip>}
    </Shell>
  );
};

const ErrorStrip = ({ children }) => (
  <p className="flex items-start gap-2 border-t border-vz-line-soft bg-vz-red/[0.07] px-5 py-2.5 text-[12px] leading-relaxed text-[#fda4af]">
    <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
    {children}
  </p>
);

const Shell = ({ children, onClose }) => (
  <div
    className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/65 px-4 py-[8vh] backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-label="Postman"
    onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
    <div className={PANEL}>
      <div className="flex items-center gap-2 border-b border-vz-line-soft px-5 py-3">
        <PostmanIcon size={16} className="text-[#ff6c37]" />
        <h2 className="text-[14px] font-semibold text-vz-text">Postman</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="vz-t ml-auto rounded-lg p-1 text-vz-dim hover:bg-white/6 hover:text-vz-text"
        >
          <X size={16} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

export default PostmanConnect;
