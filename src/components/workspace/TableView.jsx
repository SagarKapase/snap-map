import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Map as MapIcon } from "lucide-react";
import MethodBadge from "./MethodBadge";
import { displayPath } from "../../utils/format";

const COLUMNS = [
  { key: "method", label: "Method", className: "w-[92px]" },
  { key: "name", label: "Endpoint", className: "" },
  { key: "path", label: "Path", className: "" },
  { key: "group", label: "Group", className: "w-[160px]" },
];

// Rows are a fixed height, which is what makes windowing this simple: two
// spacer rows stand in for everything above and below the visible slice, so a
// two-thousand-endpoint spec mounts about thirty <tr> elements instead of all
// of them.
const ROW_H = 37;
const OVERSCAN = 8;
const WINDOW_ABOVE = 120;

const TableView = ({ nodes, selectedNodeId, onSelectNode, onShowInMap }) => {
  const [sort, setSort] = useState({ key: "group", dir: "asc" });
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);
  const scrollRef = useRef(null);

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

  const windowed = rows.length > WINDOW_ABOVE;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !windowed) return undefined;

    let frame = 0;
    const read = () => {
      frame = 0;
      setScrollTop(el.scrollTop);
      setHeight(el.clientHeight);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    read();
    el.addEventListener("scroll", schedule, { passive: true });
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    observer?.observe(el);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("scroll", schedule);
      observer?.disconnect();
    };
  }, [windowed]);

  const { start, end } = useMemo(() => {
    if (!windowed || !height) return { start: 0, end: rows.length };
    const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
    const count = Math.ceil(height / ROW_H) + OVERSCAN * 2;
    return { start: first, end: Math.min(rows.length, first + count) };
  }, [windowed, height, scrollTop, rows.length]);

  const visible = useMemo(() => rows.slice(start, end), [rows, start, end]);
  const padTop = start * ROW_H;
  const padBottom = Math.max(0, (rows.length - end) * ROW_H);

  const toggleSort = useCallback(
    (key) =>
      setSort((s) =>
        s.key === key
          ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
          : { key, dir: "asc" },
      ),
    [],
  );

  return (
    <div ref={scrollRef} className="vz-scroll h-full overflow-auto">
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
            <th className="w-[52px] px-4 py-2.5">
              <span className="text-[11px] font-normal normal-case tracking-normal text-vz-line">
                {rows.length.toLocaleString()}
              </span>
            </th>
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
            <>
              {padTop > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={5} style={{ height: padTop, padding: 0 }} />
                </tr>
              )}
              {visible.map(({ node, group }) => (
                <tr
                  key={node.id}
                  onClick={() => onSelectNode(node)}
                  style={{ height: ROW_H }}
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
              ))}
              {padBottom > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={5} style={{ height: padBottom, padding: 0 }} />
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default TableView;
