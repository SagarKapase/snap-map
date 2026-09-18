import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, ArrowRight, MoreVertical, ExternalLink, Trash2, Braces, Send, Code2, Globe, Terminal, FileCode2 } from "lucide-react";
import { timeAgo } from "../../utils/analysis";

/** Icon and accent by the format the parser reported. */
const typeFor = (format = "") => {
  const f = format.toLowerCase();
  if (/postman/.test(f)) return { icon: Send, accent: "#fb923c" };
  if (/openapi|swagger/.test(f)) return { icon: Braces, accent: "#34d399" };
  if (/har/.test(f)) return { icon: Globe, accent: "#60a5fa" };
  if (/curl/.test(f)) return { icon: Terminal, accent: "#fbbf24" };
  if (/wsdl|soap/.test(f)) return { icon: FileCode2, accent: "#c084fc" };
  return { icon: Code2, accent: "#60a5fa" };
};

const RowMenu = ({ entry, onRemove }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="hm-row-menu">
      <button
        type="button"
        className="hm-icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${entry.name}`}
        title="More"
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div role="menu" className="hm-menu">
          <Link role="menuitem" to={`/workspace?recent=${encodeURIComponent(entry.id)}`} onClick={() => setOpen(false)}>
            <ExternalLink size={13} /> Open in API Map
          </Link>
          <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); onRemove(entry.id); }}>
            <Trash2 size={13} /> Remove from recent
          </button>
        </div>
      )}
    </div>
  );
};

const RecentApiRow = ({ entry, onRemove }) => {
  const { icon: Icon, accent } = typeFor(entry.format);
  return (
    <li className="hm-row">
      <Link to={`/workspace?recent=${encodeURIComponent(entry.id)}`} className="hm-row-main">
        <span className="hm-type" style={{ "--qa": accent }}><Icon size={15} /></span>
        <span style={{ minWidth: 0 }}>
          <h4>{entry.name}</h4>
          <span className="hm-row-meta">{entry.format} · {entry.endpoints} endpoint{entry.endpoints === 1 ? "" : "s"}</span>
        </span>
        <span className="hm-row-time">{timeAgo(entry.openedAt)}</span>
      </Link>
      <RowMenu entry={entry} onRemove={onRemove} />
    </li>
  );
};

/**
 * The APIs this browser has parsed, newest first. `query` narrows the list
 * by name; `onRemove` forgets an entry (and the spec stored behind it).
 */
const RecentApis = ({ recents, query = "", onRemove }) => {
  const needle = query.trim().toLowerCase();
  const shown = needle ? recents.filter((r) => `${r.name} ${r.format}`.toLowerCase().includes(needle)) : recents;

  return (
    <section className="hm-panel" aria-labelledby="hm-recent">
      <div className="hm-panel-head">
        <h2 id="hm-recent" className="hm-panel-title"><Clock size={15} /> Recent APIs</h2>
        <Link to="/workspace" className="hm-view-all">View all <ArrowRight size={12} /></Link>
      </div>
      {recents.length === 0 ? (
        <p className="hm-empty">APIs you import appear here. They stay in this browser. <Link to="/workspace">Import one</Link>.</p>
      ) : shown.length === 0 ? (
        <p className="hm-empty">No recent API matches “{query.trim()}”.</p>
      ) : (
        <ul className="hm-rows">
          {shown.map((r) => <RecentApiRow key={r.id} entry={r} onRemove={onRemove} />)}
        </ul>
      )}
    </section>
  );
};

export default RecentApis;
