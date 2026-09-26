import { useMemo, useRef, useState } from "react";
import { Check, Copy, ListTree, ShieldCheck, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { parseJson, formatJson, minifyJson, formatBytes } from "../../utils/tools/json";

/**
 * The editor beside the headline.
 *
 * It is not an illustration of a tool — it is the tool, running. The text is
 * editable, it is read by the same parser every page here uses, and the
 * figures on the right are counted rather than written down. Break the JSON
 * and it says which line and column, because that is the thing worth showing
 * about this product in the two seconds somebody looks at the page.
 *
 * Which also means none of the four buttons is decoration: Format rewrites
 * the text, Tree is another way to read it, Copy copies, and Validate is the
 * parser's strict mode — where a comment or a trailing comma stops being
 * something we quietly fix and becomes the error it is.
 */

const SAMPLE = `{
  "user": {
    "id": 123,
    "name": "John",
    "roles": ["admin", "user"]
  },
  "active": true,
  "meta": {
    "lastLogin": "2026-09-24T10:30Z"
  }
}`;

// One pass per line: a string (and whether a colon follows, which makes it a
// key), a number, or a word. Everything between matches is punctuation.
const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

const highlight = (line) => {
  const parts = [];
  let last = 0;
  let match;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(line)) !== null) {
    if (match.index > last) parts.push(<span key={`p${last}`}>{line.slice(last, match.index)}</span>);
    if (match[1]) {
      const isKey = Boolean(match[2]);
      parts.push(
        <span key={`s${match.index}`} className={isKey ? "ed-key" : "ed-string"}>
          {match[1]}
        </span>,
      );
      if (isKey) parts.push(<span key={`c${match.index}`}>{match[2]}</span>);
    } else if (match[3]) {
      parts.push(
        <span key={`n${match.index}`} className="ed-number">
          {match[3]}
        </span>,
      );
    } else {
      parts.push(
        <span key={`b${match.index}`} className="ed-word">
          {match[4]}
        </span>,
      );
    }
    last = TOKEN.lastIndex;
  }
  if (last < line.length) parts.push(<span key={`t${last}`}>{line.slice(last)}</span>);
  return parts;
};

/** The document as an indented outline, which is the other way people read JSON. */
const treeRows = (node, name = null, depth = 0, rows = []) => {
  if (!node) return rows;
  if (node.kind === "object") {
    rows.push({ depth, name, kind: "object", note: `${node.members.length} ${node.members.length === 1 ? "key" : "keys"}` });
    node.members.forEach((member) => treeRows(member.value, member.key.value, depth + 1, rows));
    return rows;
  }
  if (node.kind === "array") {
    rows.push({ depth, name, kind: "array", note: `${node.items.length} ${node.items.length === 1 ? "item" : "items"}` });
    node.items.forEach((item, index) => treeRows(item, `[${index}]`, depth + 1, rows));
    return rows;
  }
  rows.push({ depth, name, kind: node.kind, note: node.out });
  return rows;
};

const count = (node, totals = { keys: 0, objects: 0, arrays: 0 }) => {
  if (!node) return totals;
  if (node.kind === "object") {
    totals.objects += 1;
    totals.keys += node.members.length;
    node.members.forEach((member) => count(member.value, totals));
  } else if (node.kind === "array") {
    totals.arrays += 1;
    node.items.forEach((item) => count(item, totals));
  }
  return totals;
};

const EditorPreview = () => {
  const [text, setText] = useState(SAMPLE);
  const [view, setView] = useState("code");
  const [strict, setStrict] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);
  const paintRef = useRef(null);

  // The coloured copy is a separate element from the box being typed in, so
  // it has to be told to scroll when that box does. Without this the two
  // agree only while everything fits — which is to say, until it matters.
  const sync = () => {
    if (!inputRef.current || !paintRef.current) return;
    paintRef.current.scrollTop = inputRef.current.scrollTop;
    paintRef.current.scrollLeft = inputRef.current.scrollLeft;
  };

  const result = useMemo(() => parseJson(text, { tolerant: !strict }), [text, strict]);
  const lines = useMemo(() => text.split("\n"), [text]);
  const tree = useMemo(() => (result.ok ? treeRows(result.ast) : []), [result]);
  const totals = useMemo(() => (result.ok ? count(result.ast) : null), [result]);
  const minified = useMemo(() => (result.ok ? minifyJson(result.ast) : ""), [result]);

  const problem = result.errors[0] || null;
  const repairs = result.repairs.length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* a blocked clipboard is not worth an error; the text is selectable */
    }
  };

  return (
    <div className="ed" aria-label="JSON editor preview">
      <div className="ed-top">
        <span className="ed-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <div className="ed-actions">
          <button
            type="button"
            className="ed-btn"
            onClick={() => result.ok && setText(formatJson(result.ast, { indent: 2 }))}
            disabled={!result.ok}
            title="Rewrite it with two-space indentation"
          >
            <Wand2 size={12} aria-hidden="true" />
            Format
          </button>
          <button
            type="button"
            className={`ed-btn${view === "tree" ? " is-on" : ""}`}
            onClick={() => setView(view === "tree" ? "code" : "tree")}
            aria-pressed={view === "tree"}
            title="Read it as an outline instead"
          >
            <ListTree size={12} aria-hidden="true" />
            Tree
          </button>
          <button type="button" className="ed-btn" onClick={copy} title="Copy the document">
            {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            className={`ed-btn${strict ? " is-on" : ""}`}
            onClick={() => setStrict((v) => !v)}
            aria-pressed={strict}
            title="Check it as strict JSON — comments and trailing commas become errors"
          >
            <ShieldCheck size={12} aria-hidden="true" />
            Validate
          </button>
        </div>
      </div>

      <div className="ed-body">
        <div className="ed-pane">
          {view === "code" ? (
            <div className="ed-code">
              <div className="ed-paint" ref={paintRef} aria-hidden="true">
              <div className="ed-gutter">
                {lines.map((_, index) => (
                  <span key={index} className={problem && problem.line === index + 1 ? "is-bad" : ""}>
                    {index + 1}
                  </span>
                ))}
              </div>
              <div className="ed-lines">
                {lines.map((line, index) => (
                  <div key={index} className={problem && problem.line === index + 1 ? "ed-line is-bad" : "ed-line"}>
                    {line ? highlight(line) : " "}
                  </div>
                ))}
              </div>
              </div>
              {/* Editable, and invisible: the highlighted copy underneath is
                  what is seen, so typing works without a syntax engine. */}
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onScroll={sync}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-label="Edit the example JSON"
                className="ed-input"
              />
            </div>
          ) : (
            <ol className="ed-tree">
              {tree.map((row, index) => (
                <li key={index} style={{ paddingLeft: 10 + row.depth * 16 }}>
                  {row.name !== null && <span className="ed-tree-name">{row.name}</span>}
                  <span className={`ed-tree-kind is-${row.kind}`}>{row.kind}</span>
                  <span className="ed-tree-note">{row.note}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="ed-rail" aria-live="polite">
          {result.ok ? (
            <>
              <p className="ed-verdict is-ok">
                <ShieldCheck size={15} aria-hidden="true" />
                <span>
                  <strong>Valid JSON</strong>
                  <em>{repairs ? `${repairs} thing${repairs === 1 ? "" : "s"} tidied` : "No issues found"}</em>
                </span>
              </p>
              <dl className="ed-stats">
                <div>
                  <dt>keys</dt>
                  <dd>{totals.keys}</dd>
                </div>
                <div>
                  <dt>objects</dt>
                  <dd>{totals.objects}</dd>
                </div>
                <div>
                  <dt>arrays</dt>
                  <dd>{totals.arrays}</dd>
                </div>
                <div>
                  <dt>minified</dt>
                  <dd>{formatBytes(new TextEncoder().encode(minified).length)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="ed-verdict is-bad">
              <TriangleAlert size={15} aria-hidden="true" />
              <span>
                <strong>
                  Line {problem?.line}, column {problem?.column}
                </strong>
                <em>{problem?.message}</em>
              </span>
            </p>
          )}

          <p className="ed-foot">
            <Sparkles size={11} aria-hidden="true" />
            Type in it — this is the real parser.
          </p>
        </aside>
      </div>
    </div>
  );
};

export default EditorPreview;
