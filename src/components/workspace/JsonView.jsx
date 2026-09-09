import { useMemo } from "react";
import { toJsonText } from "../../utils/format";

const TOKEN_SOURCE =
  '("(?:\\\\.|[^"\\\\])*")(\\s*:)?|\\b(true|false|null)\\b|(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)';

const COLORS = {
  key: "#93c5fd",
  string: "#fca5a5",
  literal: "#5eead4",
  number: "#fbbf24",
};

const MAX_CHARS = 200_000;

/**
 * Lightweight JSON syntax highlighter — no extra dependency, no innerHTML.
 * Falls back to plain text for anything that is not JSON-shaped.
 */
const JsonView = ({ value, className = "", style }) => {
  const parts = useMemo(() => {
    const raw = toJsonText(value);
    const text =
      raw.length > MAX_CHARS
        ? `${raw.slice(0, MAX_CHARS)}\n… truncated (${raw.length.toLocaleString()} characters)`
        : raw;

    const out = [];
    const token = new RegExp(TOKEN_SOURCE, "g");
    let last = 0;
    let match;

    while ((match = token.exec(text)) !== null) {
      if (match.index > last) out.push({ text: text.slice(last, match.index) });

      if (match[1] !== undefined) {
        const isKey = Boolean(match[2]);
        out.push({ text: match[1], color: isKey ? COLORS.key : COLORS.string });
        if (isKey) out.push({ text: match[2] });
      } else if (match[3] !== undefined) {
        out.push({ text: match[3], color: COLORS.literal });
      } else if (match[4] !== undefined) {
        out.push({ text: match[4], color: COLORS.number });
      }

      last = token.lastIndex;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
  }, [value]);

  return (
    <pre
      className={`vz-mono vz-scroll whitespace-pre-wrap break-words text-[11px] leading-[1.65] text-vz-soft ${className}`}
      style={style}
    >
      {parts.map((part, i) =>
        part.color ? (
          <span key={i} style={{ color: part.color }}>
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </pre>
  );
};

export default JsonView;
