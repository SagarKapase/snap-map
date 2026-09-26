import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

/**
 * The document as a structure you can fold.
 *
 * This is the view a formatter is missing: on a large response the useful
 * question is "what is in here", and eight hundred lines of correctly
 * indented text does not answer it. Collapse the noise and the shape is
 * visible in a screen.
 *
 * It renders from the syntax tree rather than from re-parsed values, so a
 * number keeps the text it was written with — the promise the parser makes
 * everywhere else here.
 */

/** Past this, a single container is drawn in pieces; a 50,000-row array should not freeze a tab. */
const PAGE = 200;

const previewOf = (node) => {
  if (node.kind === "object") return `{${node.members.length}}`;
  if (node.kind === "array") return `[${node.items.length}]`;
  if (node.kind === "string") return node.out.length > 48 ? `${node.out.slice(0, 47)}…"` : node.out;
  return node.out;
};

const childrenOf = (node) => {
  if (node.kind === "object") return node.members.map((m) => ({ key: m.key.value, node: m.value }));
  if (node.kind === "array") return node.items.map((item, i) => ({ key: i, node: item, index: true }));
  return [];
};

const Row = ({ label, node, path, depth, open, toggle, index }) => {
  const container = node.kind === "object" || node.kind === "array";
  const isOpen = open.has(path);
  const kids = container ? childrenOf(node) : [];
  const shown = kids.slice(0, PAGE);

  return (
    <>
      <div
        className={`jt-row${container ? " is-container" : ""}`}
        style={{ paddingLeft: 8 + depth * 15 }}
        role="treeitem"
        aria-expanded={container ? isOpen : undefined}
        aria-level={depth + 1}
      >
        {container ? (
          <button type="button" className="jt-twist" onClick={() => toggle(path)} aria-label={isOpen ? "Collapse" : "Expand"}>
            <ChevronRight size={12} aria-hidden="true" className={isOpen ? "is-open" : ""} />
          </button>
        ) : (
          <span className="jt-twist" aria-hidden="true" />
        )}

        {label !== null && <span className={index ? "jt-index" : "jt-key"}>{index ? `${label}` : label}</span>}

        {container ? (
          <span className="jt-count">
            {node.kind === "object"
              ? `${node.members.length} ${node.members.length === 1 ? "key" : "keys"}`
              : `${node.items.length} ${node.items.length === 1 ? "item" : "items"}`}
          </span>
        ) : (
          <span className={`jt-value is-${node.kind}`}>{previewOf(node)}</span>
        )}
      </div>

      {container &&
        isOpen &&
        shown.map((child) => (
          <Row
            key={`${path}/${child.key}`}
            label={child.key}
            index={child.index}
            node={child.node}
            path={`${path}/${child.key}`}
            depth={depth + 1}
            open={open}
            toggle={toggle}
          />
        ))}

      {container && isOpen && kids.length > PAGE && (
        <div className="jt-more" style={{ paddingLeft: 23 + depth * 15 }}>
          …and {kids.length - PAGE} more, not drawn
        </div>
      )}
    </>
  );
};

const JsonTree = ({ node, label = "Document" }) => {
  // The root and its children open by default: enough to see the shape
  // without a click, not so much that a big document arrives unfolded.
  const initial = useMemo(() => {
    const paths = new Set(["$"]);
    childrenOf(node || {}).forEach((child) => paths.add(`$/${child.key}`));
    return paths;
  }, [node]);

  const [open, setOpen] = useState(initial);

  const toggle = (path) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  if (!node) return <p className="jt-empty">Nothing to show yet.</p>;

  return (
    <div className="jt" role="tree" aria-label={label}>
      <Row label={null} node={node} path="$" depth={0} open={open} toggle={toggle} />
    </div>
  );
};

export default JsonTree;
