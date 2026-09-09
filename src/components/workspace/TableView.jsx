import { useMemo, useState } from "react";
import { ArrowUpDown, Map as MapIcon } from "lucide-react";
import MethodBadge from "./MethodBadge";
import { displayPath } from "../../utils/format";

const COLUMNS = [
  { key: "method", label: "Method", className: "w-[92px]" },
  { key: "name", label: "Endpoint", className: "" },
  { key: "path", label: "Path", className: "" },
  { key: "group", label: "Group", className: "w-[160px]" },
];

const TableView = ({ nodes, selectedNodeId, onSelectNode, onShowInMap }) => {
  const [sort, setSort] = useState({ key: "group", dir: "asc" });

  const rows = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const list = nodes
      .filter((n) => n.type === "request")
      .map((n) => ({
        node: n,
        method: n.method || "",
        name: n.name || "",
        path: n.path || "",
        group: byId.get(n.parentId)?.name || "",
      }));

    const dir = sort.dir === "asc" ? 1 : -1;
    return list.sort(
      (a, b) => String(a[sort.key]).localeCompare(String(b[sort.key])) * dir,
    );
  }, [nodes, sort]);

  const toggleSort = (key) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );

  return (
    <div className="vz-scroll h-full overflow-auto">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-vz-panel">
          <tr className="border-b border-vz-line">
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-vz-dim ${c.className}`}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(c.key)}
                  className="vz-t flex items-center gap-1.5 hover:text-vz-text"
                >
                  {c.label}
                  <ArrowUpDown
                    size={11}
                    className={sort.key === c.key ? "text-vz-accent" : "opacity-40"}
                  />
                </button>
              </th>
            ))}
            <th className="w-[52px] px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-16 text-center text-[13px] text-vz-dim">
                No endpoints match the current filters.
              </td>
            </tr>
          ) : (
            rows.map(({ node, group }) => (
              <tr
                key={node.id}
                onClick={() => onSelectNode(node)}
                className={`vz-t cursor-pointer border-b border-vz-line-soft ${
                  selectedNodeId === node.id
                    ? "bg-vz-accent/12"
                    : "hover:bg-white/3"
                }`}
              >
                <td className="px-4 py-2.5">
                  <MethodBadge method={node.method} size="sm" />
                </td>
                <td className="max-w-[280px] truncate px-4 py-2.5 text-[13px] text-vz-text">
                  {node.name}
                </td>
                <td
                  className="vz-mono max-w-[360px] truncate px-4 py-2.5 text-[12px] text-vz-soft"
                  title={node.path}
                >
                  {displayPath(node)}
                </td>
                <td className="truncate px-4 py-2.5 text-[12px] text-vz-dim">
                  {group}
                </td>
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    title="Show in map"
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowInMap(node);
                    }}
                    className="vz-t rounded-md p-1.5 text-vz-dim hover:bg-white/6 hover:text-vz-text"
                  >
                    <MapIcon size={13} />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default TableView;
