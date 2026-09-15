import { useEffect, useMemo, useRef, useState } from "react";
import { Search, CornerDownLeft } from "lucide-react";
import MethodBadge from "./MethodBadge";
import { displayPath } from "../../utils/format";

const MAX_ENDPOINTS = 8;

// Mounted only while open, so its state starts fresh on every invocation.
const CommandPalette = ({ onClose, commands = [], endpoints = [], onSelectEndpoint }) => {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, []);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();

    const cmds = commands
      .filter(
        (c) =>
          !q ||
          c.label.toLowerCase().includes(q) ||
          (c.keywords || "").toLowerCase().includes(q),
      )
      .map((c) => ({ kind: "command", key: c.id, data: c }));

    const eps = !q
      ? []
      : endpoints
          .filter(
            (n) =>
              n.type === "request" &&
              (String(n.name || "").toLowerCase().includes(q) ||
                String(n.path || "").toLowerCase().includes(q)),
          )
          .slice(0, MAX_ENDPOINTS)
          .map((n) => ({ kind: "endpoint", key: n.id, data: n }));

    return [...cmds, ...eps];
  }, [query, commands, endpoints]);

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor, items]);

  const run = (item) => {
    if (!item) return;
    onClose();
    if (item.kind === "command") item.data.run?.();
    else onSelectEndpoint?.(item.data);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setCursor((c) => (items.length ? (c + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setCursor((c) => (items.length ? (c - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(items[cursor]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-[620px] overflow-hidden rounded-2xl border border-vz-line bg-vz-panel shadow-2xl shadow-black/60">
        <div className="flex items-center gap-2.5 border-b border-vz-line-soft px-4 py-3">
          <Search size={16} className="flex-shrink-0 text-vz-dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search endpoints or run a command..."
            className="min-w-0 flex-1 bg-transparent text-[14px] text-vz-text placeholder:text-vz-dim"
          />
          <kbd className="vz-mono flex-shrink-0 rounded border border-vz-line bg-vz-elev px-1.5 py-0.5 text-[10px] text-vz-dim">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="vz-scroll max-h-[52vh] overflow-auto py-1.5">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-vz-dim">
              Nothing matches "{query}"
            </p>
          ) : (
            items.map((item, i) => {
              const group =
                item.kind === "endpoint" ? "Endpoints" : item.data.group || "Actions";
              const header = group !== lastGroup ? group : null;
              lastGroup = group;
              const active = i === cursor;
              const Icon = item.kind === "command" ? item.data.icon : null;

              return (
                <div key={`${item.kind}-${item.key}`}>
                  {header && (
                    <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-vz-dim">
                      {header}
                    </p>
                  )}
                  <button
                    type="button"
                    data-active={active}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => run(item)}
                    className={`vz-t flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                      active ? "bg-vz-accent/12" : "hover:bg-white/4"
                    }`}
                  >
                    {item.kind === "endpoint" ? (
                      <MethodBadge method={item.data.method} size="xs" />
                    ) : (
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-vz-dim">
                        {Icon ? <Icon size={14} /> : null}
                      </span>
                    )}

                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-[13px] ${
                          item.kind === "endpoint"
                            ? "vz-mono text-vz-soft"
                            : "text-vz-text"
                        }`}
                      >
                        {item.kind === "endpoint"
                          ? displayPath(item.data)
                          : item.data.label}
                      </span>
                      {item.kind === "endpoint" && item.data.name ? (
                        <span className="block truncate text-[11px] text-vz-dim">
                          {item.data.name}
                        </span>
                      ) : null}
                      {item.kind === "command" && item.data.hint ? (
                        <span className="block truncate text-[11px] text-vz-dim">
                          {item.data.hint}
                        </span>
                      ) : null}
                    </span>

                    {active && (
                      <CornerDownLeft
                        size={13}
                        className="flex-shrink-0 text-vz-dim"
                      />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
