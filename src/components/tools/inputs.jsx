import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Eraser, FileWarning, Upload } from "lucide-react";

/**
 * The parts every Explore Tool is built from.
 *
 * Forty-five pages share these, so anything that starts being copied between
 * tools belongs here instead. They are deliberately plain: a text box, a
 * result, a copy button and an error line that points at a place in the
 * text — the same four things nearly every one of these tools needs.
 */

/** Copy some text, and say so for a moment. */
export const CopyButton = ({ text, label = "Copy", className = "" }) => {
  const [done, setDone] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // A blocked clipboard is not worth an error message; the text is on
      // screen and selectable either way.
      return;
    }
    setDone(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1600);
  };

  return (
    <button type="button" onClick={copy} disabled={!text} className={`tl-btn ${className}`}>
      {done ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {done ? "Copied" : label}
    </button>
  );
};

/** Save the result as a file. */
export const DownloadButton = ({ text, filename, type = "application/json" }) => {
  const save = () => {
    const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button type="button" onClick={save} disabled={!text} className="tl-btn">
      <Download size={14} aria-hidden="true" />
      Download
    </button>
  );
};

/**
 * The box people paste into. It also takes a dropped file, because the other
 * half of "paste your JSON" is "drag the file here", and a tool that only
 * does one of them sends people back to their editor.
 */
export const PasteArea = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  textareaRef,
  actions = null,
  hint = "",
  accept = ".json,.txt,application/json,text/plain",
  spellCheck = false,
}) => {
  const [over, setOver] = useState(false);
  const [tooBig, setTooBig] = useState("");
  const fileRef = useRef(null);

  const take = async (file) => {
    setTooBig("");
    if (!file) return;
    // Past this the browser is doing more harm than the tool is doing good.
    if (file.size > 12 * 1024 * 1024) {
      setTooBig(`${file.name} is larger than 12 MB — too big to read in a tab.`);
      return;
    }
    onChange(await file.text());
  };

  return (
    <div className="tl-pane">
      <div className="tl-pane-head">
        <label htmlFor={id} className="tl-pane-label">
          {label}
        </label>
        <div className="tl-pane-actions">
          <button type="button" onClick={() => fileRef.current?.click()} className="tl-btn">
            <Upload size={14} aria-hidden="true" />
            Open file
          </button>
          <button type="button" onClick={() => onChange("")} disabled={!value} className="tl-btn">
            <Eraser size={14} aria-hidden="true" />
            Clear
          </button>
          {actions}
        </div>
      </div>

      <div
        className={`tl-drop${over ? " is-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files?.[0]);
        }}
      >
        <textarea
          id={id}
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={spellCheck}
          autoCapitalize="off"
          autoCorrect="off"
          className="tl-textarea"
        />
        {over && <div className="tl-drop-note">Drop the file to read it</div>}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {tooBig ? (
        <p className="tl-pane-foot tl-warn">
          <FileWarning size={13} aria-hidden="true" />
          {tooBig}
        </p>
      ) : hint ? (
        <p className="tl-pane-foot">{hint}</p>
      ) : null}
    </div>
  );
};

/** The read-only side. */
export const ResultPanel = ({ label, value, actions = null, foot = "", empty = "Nothing yet." }) => (
  <div className="tl-pane">
    <div className="tl-pane-head">
      <span className="tl-pane-label">{label}</span>
      <div className="tl-pane-actions">{actions}</div>
    </div>
    <pre className="tl-result" tabIndex={0} aria-label={label}>
      {value || <span className="tl-dim">{empty}</span>}
    </pre>
    {foot && <p className="tl-pane-foot">{foot}</p>}
  </div>
);

/**
 * One problem, at a place in the text. Clicking it puts the cursor there —
 * which is the entire reason to report a line and a column rather than a
 * character offset nobody can count to.
 */
export const ErrorLine = ({ error, onGoTo, tone = "error" }) => {
  if (!error) return null;
  const place = `Line ${error.line}, column ${error.column}`;
  return (
    <button
      type="button"
      className={`tl-note is-${tone}`}
      onClick={() => onGoTo?.(error)}
      disabled={!onGoTo}
      title={onGoTo ? "Go to this place in the text" : undefined}
    >
      <span className="tl-note-place">{place}</span>
      <span className="tl-note-text">{error.message}</span>
    </button>
  );
};

/** Load one of the examples, so the page does something before anything is typed. */
export const SampleMenu = ({ samples, onPick }) => (
  <div className="tl-samples">
    <span className="tl-dim">Try one:</span>
    {samples.map((sample) => (
      <button key={sample.label} type="button" onClick={() => onPick(sample.text)} className="tl-chip">
        {sample.label}
      </button>
    ))}
  </div>
);
