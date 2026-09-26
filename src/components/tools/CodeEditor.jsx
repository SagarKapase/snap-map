import { useMemo, useRef } from "react";

/**
 * A text box that behaves like an editor.
 *
 * Three things separate the two, and all three are here:
 *
 *  – **Line numbers that stay with the line.** The gutter is a separate
 *    element, so it has to be told to scroll when the text does. Skip that
 *    and the numbers look right until somebody pastes something taller than
 *    the box, which is exactly when they are needed.
 *  – **A fixed frame.** No drag handle: the panel is the size it is, and
 *    content that does not fit scrolls inside it. A box a person can pull out
 *    of shape is a box that will end up out of shape.
 *  – **Somewhere to look for the caret.** "Line 6, column 5" from the parser
 *    is only useful next to a line and column you can see.
 */
const caretAt = (element) => {
  if (!element) return { line: 1, column: 1 };
  const upto = element.value.slice(0, element.selectionStart ?? 0);
  const lines = upto.split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
};

const CodeEditor = ({
  id,
  value,
  onChange,
  placeholder,
  textareaRef,
  readOnly = false,
  ariaLabel,
  onCaretChange,
}) => {
  const fallback = useRef(null);
  const ref = textareaRef || fallback;
  const gutter = useRef(null);

  // Derived, not stored: the number of lines is a fact about the text.
  const numbers = useMemo(() => {
    const rows = Math.max(1, String(value ?? "").split("\n").length);
    return Array.from({ length: rows }, (_, i) => i + 1);
  }, [value]);

  // The one line that keeps the numbers beside their lines.
  const sync = () => {
    if (gutter.current && ref.current) gutter.current.scrollTop = ref.current.scrollTop;
  };

  const report = () => onCaretChange?.(caretAt(ref.current));

  return (
    <div className="ce">
      <div className="ce-gutter" ref={gutter} aria-hidden="true">
        {numbers.map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <textarea
        id={id}
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange?.(e.target.value);
          report();
        }}
        onScroll={sync}
        onSelect={report}
        onKeyUp={report}
        onClick={report}
        onFocus={report}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-label={ariaLabel}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        className="ce-input"
      />
    </div>
  );
};

export default CodeEditor;
