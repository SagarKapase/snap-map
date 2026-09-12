import { useMemo, useState } from "react";
import { ChevronRight, Plus, Search, X, Folder } from "lucide-react";
import MethodBadge from "./MethodBadge";
import { ancestorsOf, timeAgo } from "../../utils/analysis";
import { displayPath } from "../../utils/format";

const matches = (node, query) => {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    String(node.name || "").toLowerCase().includes(q) ||
    String(node.path || "").toLowerCase().includes(q)
  );
};

// Keep a branch when the folder itself matches or any descendant does.
const filterTree = (tree, query) => {
  if (!query) return tree;
  return tree
    .map((entry) => {
      const children = filterTree(entry.children, query);
      if (matches(entry.node, query) || children.length)
        return { ...entry, children };
      return null;
    })
    .filter(Boolean);
};

const EndpointItem = ({ node, active, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(node)}
    title={`${node.name || ""}${node.path ? ` — ${node.path}` : ""}`}
    className={`vz-t group flex w-full items-center gap-2 rounded-lg py-[7px] pl-2 pr-2 text-left ${
      active
        ? "bg-vz-accent/16 text-vz-text shadow-[inset_3px_0_0_#b45cff]"
        : "text-vz-soft hover:bg-white/4 hover:text-vz-text"
    }`}
  >
    <MethodBadge method={node.method} size="xs" />
    <span className="vz-mono min-w-0 flex-1 truncate text-[12px]">
      {displayPath(node)}
    </span>
  </button>
);

const GroupRow = ({ entry, expanded, onToggle, selectedId, onSelect }) => (
  <div>
    <button
      type="button"
      onClick={() => onToggle(entry.node.id)}
      className="vz-t flex w-full items-center gap-2 rounded-lg px-2 py-[9px] text-left text-vz-text hover:bg-white/4"
    >
      <ChevronRight
        size={13}
        className={`flex-shrink-0 text-vz-dim transition-transform duration-150 ${
          expanded.has(entry.node.id) ? "rotate-90" : ""
        }`}
      />
      <span className="min-w-0 flex-1 truncate text-[13px]">
        {entry.node.name}
      </span>
      <span className="flex-shrink-0 rounded-full bg-vz-elev px-2 py-[2px] text-[11px] tabular-nums text-vz-soft">
        {entry.count}
      </span>
    </button>

    {expanded.has(entry.node.id) && (
      <div className="ml-3 border-l border-vz-line-soft pl-1.5">
        {entry.children.map((child) =>
          child.node.type === "folder" ? (
            <GroupRow
              key={child.node.id}
              entry={child}
              expanded={expanded}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ) : (
            <EndpointItem
              key={child.node.id}
              node={child.node}
              active={selectedId === child.node.id}
              onSelect={onSelect}
            />
          ),
        )}
      </div>
    )}
  </div>
);

const ApiExplorer = ({
  collection,
  detectedFormat,
  nodes,
  groups = [],
  endpointCount,
  searchQuery,
  onSearchChange,
  onSearchKeyDown,
  searchInputRef,
  matchCount,
  matchIndex,
  selectedNodeId,
  onSelectNode,
  onImport,
  recents = [],
  onOpenRecent,
  onSeeAllRecents,
}) => {
  // Open the first group on mount so the rail is never empty. The parent
  // remounts this panel per import, so a lazy initial value is enough.
  const [expanded, setExpanded] = useState(() => {
    const first = groups.find((g) => g.node.type === "folder");
    return new Set(first ? [first.node.id] : []);
  });

  const rootName =
    collection?.info?.name ||
    collection?.info?.title ||
    collection?.name ||
    nodes.find((n) => n.type === "root")?.name ||
    "API Collection";

  const version =
    collection?.info?.version || nodes.find((n) => n.type === "root")?.version;

  const tree = useMemo(
    () => filterTree(groups, searchQuery),
    [groups, searchQuery],
  );

  /**
   * What actually reads as open.
   *
   * Two things force a branch open besides the user clicking it: a search,
   * where everything that survived the filter should be visible, and a
   * selection made elsewhere — on the graph, in the table, from the palette.
   *
   * Both used to be written into state, the selection through an effect that
   * set state on every selection change. Deriving them instead means the
   * explorer never re-renders itself a second time to catch up, and a branch
   * the user collapsed by hand is still remembered underneath.
   */
  const effectiveExpanded = useMemo(() => {
    const forced = [];

    if (searchQuery) {
      const walk = (entries) =>
        entries.forEach((entry) => {
          if (entry.node.type === "folder") {
            forced.push(entry.node.id);
            walk(entry.children);
          }
        });
      walk(tree);
    }

    if (selectedNodeId) forced.push(...ancestorsOf(nodes, selectedNodeId));

    return forced.length ? new Set([...expanded, ...forced]) : expanded;
  }, [expanded, searchQuery, tree, selectedNodeId, nodes]);

  const toggleGroup = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Loaded API */}
      <div className="flex-shrink-0 border-b border-vz-line-soft p-3.5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[11px] bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-[17px] font-bold text-white">
            {rootName.trim().charAt(0).toUpperCase() || "A"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-vz-text">
              {rootName}
            </p>
            <p
              className="truncate text-[11px] text-vz-soft"
              title={version ? `Version ${version}` : undefined}
            >
              {detectedFormat || "Spec"} · {endpointCount} endpoints
            </p>
          </div>
          <span className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-vz-green/12 px-2 py-1 text-[11px] font-medium text-vz-green">
            <span className="h-1.5 w-1.5 rounded-full bg-vz-green" />
            Loaded
          </span>
        </div>

        <div className="vz-t mt-3 flex h-9 items-center gap-2 rounded-lg border border-vz-line bg-vz-bg px-2.5 focus-within:border-vz-accent/50">
          <Search size={14} className="flex-shrink-0 text-vz-dim" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search endpoints..."
            className="min-w-0 flex-1 bg-transparent text-[13px] text-vz-text placeholder:text-vz-dim"
          />
          {searchQuery ? (
            <>
              <span className="vz-mono flex-shrink-0 text-[10px] tabular-nums text-vz-dim">
                {matchCount > 0 ? (
                  <>
                    <span className="text-vz-accent">
                      {Math.min(matchIndex + 1, matchCount)}
                    </span>
                    /{matchCount}
                  </>
                ) : (
                  <span className="text-vz-red">0</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="vz-t flex-shrink-0 text-vz-dim hover:text-vz-text"
              >
                <X size={12} />
              </button>
            </>
          ) : (
            <kbd className="vz-mono flex-shrink-0 rounded border border-vz-line px-1.5 py-0.5 text-[10px] text-vz-dim">
              Ctrl /
            </kbd>
          )}
        </div>
      </div>

      {/* Groups + endpoints */}
      <div className="vz-scroll min-h-0 flex-1 overflow-auto p-2">
        {tree.length === 0 ? (
          <p className="px-2 py-8 text-center text-[12px] text-vz-dim">
            No endpoint matches "{searchQuery}"
          </p>
        ) : (
          tree.map((entry) =>
            entry.node.type === "folder" ? (
              <GroupRow
                key={entry.node.id}
                entry={entry}
                expanded={effectiveExpanded}
                onToggle={toggleGroup}
                selectedId={selectedNodeId}
                onSelect={onSelectNode}
              />
            ) : (
              <EndpointItem
                key={entry.node.id}
                node={entry.node}
                active={selectedNodeId === entry.node.id}
                onSelect={onSelectNode}
              />
            ),
          )
        )}
      </div>

      {/* Import + recents */}
      <div className="flex-shrink-0 border-t border-vz-line-soft p-3">
        <button
          type="button"
          onClick={onImport}
          className="vz-t flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c45cff] text-[13px] font-semibold text-[#160a1d] hover:opacity-90"
        >
          <Plus size={15} /> Import API
        </button>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-vz-dim">
            Recent APIs
          </span>
          {recents.length > 0 && (
            <button
              type="button"
              onClick={onSeeAllRecents}
              className="vz-t text-[11px] text-vz-blue hover:text-vz-text"
            >
              See all
            </button>
          )}
        </div>

        {recents.length === 0 ? (
          <p className="mt-2 text-[11px] leading-relaxed text-vz-dim">
            Specs you import show up here.
          </p>
        ) : (
          <div className="mt-1.5 space-y-0.5">
            {recents.slice(0, 3).map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={!r.data}
                onClick={() => onOpenRecent?.(r)}
                className="vz-t flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-white/4 disabled:opacity-40"
              >
                <Folder size={13} className="flex-shrink-0 text-vz-dim" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-vz-soft">
                  {r.name}
                </span>
                <span className="flex-shrink-0 text-[11px] text-vz-dim">
                  {timeAgo(r.openedAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiExplorer;
