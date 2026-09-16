import { Link } from "react-router-dom";
import { Layers, Network, ArrowRight } from "lucide-react";
import { timeAgo } from "../../utils/analysis";

const MAX_SHOWN = 6;

const WorkspaceCard = ({ workspace }) => {
  const n = workspace.services.length;
  return (
    <Link to={`/graph?ws=${encodeURIComponent(workspace.id)}`} className="hm-ws-card" aria-label={`${workspace.name}, ${n} service${n === 1 ? "" : "s"}`}>
      <span className="hm-ws-icon"><Network size={18} /></span>
      <span style={{ minWidth: 0 }}>
        <h4>{workspace.name}</h4>
        <p>
          {n} service{n === 1 ? "" : "s"}
          <br />
          Updated {timeAgo(workspace.updatedAt)}
        </p>
      </span>
      <span className="hm-arrow"><ArrowRight size={13} /></span>
    </Link>
  );
};

/**
 * The account's Contract Graph workspaces. A service in a workspace is one
 * API specification, so the count shown is the count that exists.
 */
const WorkspacePanel = ({ workspaces, query = "", signedIn }) => {
  const needle = query.trim().toLowerCase();
  const matched = needle ? workspaces.filter((w) => w.name.toLowerCase().includes(needle)) : workspaces;
  const shown = matched.slice(0, MAX_SHOWN);

  return (
    <section className="hm-panel" aria-labelledby="hm-workspaces">
      <div className="hm-panel-head">
        <h2 id="hm-workspaces" className="hm-panel-title"><Layers size={15} /> Your Workspaces</h2>
        <Link to="/graph" className="hm-view-all">View all <ArrowRight size={12} /></Link>
      </div>
      {workspaces.length === 0 ? (
        <p className="hm-empty">
          No estates mapped yet{signedIn ? "" : " in this browser"}. <Link to="/graph">Add your first services</Link>.
        </p>
      ) : shown.length === 0 ? (
        <p className="hm-empty">No workspace matches “{query.trim()}”.</p>
      ) : (
        <>
          <div className="hm-ws-grid">
            {shown.map((w) => <WorkspaceCard key={w.id} workspace={w} />)}
          </div>
          {matched.length > MAX_SHOWN && (
            <p className="hm-ws-more">{matched.length - MAX_SHOWN} more in <Link to="/graph" className="hm-view-all" style={{ display: "inline" }}>Contract Graph</Link>.</p>
          )}
        </>
      )}
    </section>
  );
};

export default WorkspacePanel;
