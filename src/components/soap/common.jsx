import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { MIGRATION_STATUSES } from "../../utils/soap/design";

export const Method = ({ m }) => <span className={`sw-method ${m}`}>{m}</span>;

export const StatusBadge = ({ status }) => {
  const s = MIGRATION_STATUSES.find((x) => x.id === status) || MIGRATION_STATUSES[0];
  return <span className={`sw-status ${s.id}`} title={s.hint}>{s.label}</span>;
};

export const Confidence = ({ value }) => (
  <span className={`sw-conf${value < 0.7 ? " is-low" : ""}`} title={`Confidence ${Math.round(value * 100)}%`}>
    <i style={{ "--w": `${Math.round(value * 100)}%` }} />
    <span className="sw-muted">{Math.round(value * 100)}%</span>
  </span>
);

export const CopyButton = ({ text, label = "Copy", small = true }) => {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch {
      /* clipboard refused; nothing to say that the button did not already */
    }
  };
  return (
    <button type="button" className={`sw-btn${small ? " is-small" : ""}`} onClick={copy} aria-label={label}>
      {done ? <Check size={13} /> : <Copy size={13} />} {done ? "Copied" : label}
    </button>
  );
};
