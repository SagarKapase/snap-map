/**
 * JSON, coloured.
 *
 * One pass per line, no library, and React nodes rather than a string of
 * markup — so text a person pasted can never be read back as HTML, which is
 * the one way a tool like this could hurt somebody.
 */

const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

const highlightLine = (line) => {
  const parts = [];
  let last = 0;
  let match;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(line)) !== null) {
    if (match.index > last) parts.push(<span key={`p${last}`}>{line.slice(last, match.index)}</span>);
    if (match[1]) {
      const isKey = Boolean(match[2]);
      parts.push(
        <span key={`s${match.index}`} className={isKey ? "cv-key" : "cv-string"}>
          {match[1]}
        </span>,
      );
      if (isKey) parts.push(<span key={`c${match.index}`}>{match[2]}</span>);
    } else if (match[3]) {
      parts.push(
        <span key={`n${match.index}`} className="cv-number">
          {match[3]}
        </span>,
      );
    } else {
      parts.push(
        <span key={`b${match.index}`} className="cv-word">
          {match[4]}
        </span>,
      );
    }
    last = TOKEN.lastIndex;
  }
  if (last < line.length) parts.push(<span key={`t${last}`}>{line.slice(last)}</span>);
  return parts;
};

/** Past this many lines the numbers are dropped; nobody counts to 5,000 anyway. */
const GUTTER_LIMIT = 5000;

const CodeView = ({ text, empty = "Nothing yet." }) => {
  if (!text) return <p className="jt-empty">{empty}</p>;
  const lines = text.split("\n");
  const numbered = lines.length <= GUTTER_LIMIT;

  return (
    <div className="cv">
      {numbered && (
        <div className="cv-gutter" aria-hidden="true">
          {lines.map((_, index) => (
            <span key={index}>{index + 1}</span>
          ))}
        </div>
      )}
      <pre className="cv-code">
        {lines.map((line, index) => (
          <div key={index}>{line ? highlightLine(line) : " "}</div>
        ))}
      </pre>
    </div>
  );
};

export default CodeView;
