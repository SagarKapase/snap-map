import { Link, useLocation } from "react-router-dom";
import { Network, Plus, LogOut, LogIn, X } from "lucide-react";
import BrandMark from "../BrandMark";
import { PRODUCTS, productFor } from "./products";
import { useAuth } from "../auth/useAuth";

const initials = (name, email) => {
  const source = String(name || email || "").trim();
  if (!source) return "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase();
};

const MAX_LISTED = 5;

/**
 * The left rail: the products, the user's own Contract Graph workspaces,
 * and the account. Every entry is a real destination — nothing here is a
 * placeholder for a page that does not exist yet.
 *
 * `drawer` is the phone variant, rendered inside an overlay with a close
 * button; `onNavigate` lets the overlay close itself after a click.
 */
const AppSidebar = ({ workspaces = [], drawer = false, onNavigate, onClose }) => {
  const { pathname } = useLocation();
  const { user, signOut, isLocal } = useAuth();
  const current = productFor(pathname);
  const listed = workspaces.slice(0, MAX_LISTED);

  return (
    <aside className={`hm-sidebar${drawer ? " is-drawer" : ""}`} aria-label="Main navigation">
      {drawer && (
        <button type="button" className="hm-icon-btn hm-drawer-close" onClick={onClose} aria-label="Close navigation">
          <X size={16} />
        </button>
      )}
      <Link to="/home" className="hm-brand" onClick={onNavigate}>
        <BrandMark size={24} />
        <span>Vizroute</span>
      </Link>

      <nav className="hm-nav-group">
        <div className="hm-nav-label">PRODUCTS</div>
        <div className="hm-nav">
          {PRODUCTS.map((p) => {
            const Icon = p.icon;
            const active = current?.id === p.id;
            return (
              <Link
                key={p.id}
                to={p.to}
                onClick={onNavigate}
                title={p.hint}
                aria-label={p.label}
                aria-current={active ? "page" : undefined}
                className={`hm-nav-item${active ? " is-active" : ""}`}
              >
                <span className="hm-nav-icon"><Icon size={16} /></span>
                <span className="hm-nav-text">{p.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <nav className="hm-nav-group" aria-label="Workspaces">
        <div className="hm-nav-label">WORKSPACES</div>
        <div className="hm-nav">
          {listed.map((w) => (
            <Link key={w.id} to={`/graph?ws=${encodeURIComponent(w.id)}`} onClick={onNavigate} title={w.name} aria-label={`${w.name}, ${w.services.length} service${w.services.length === 1 ? "" : "s"}`} className="hm-nav-item">
              <span className="hm-nav-icon"><Network size={15} /></span>
              <span className="hm-nav-text">{w.name}</span>
              <span className="hm-nav-count">{w.services.length}</span>
            </Link>
          ))}
          {workspaces.length === 0 && <p className="hm-nav-empty">No estates mapped yet.</p>}
          <Link to="/graph" onClick={onNavigate} title="New workspace" aria-label="New workspace" className="hm-nav-item">
            <span className="hm-nav-icon"><Plus size={15} /></span>
            <span className="hm-nav-text">New workspace</span>
          </Link>
        </div>
      </nav>

      <div className="hm-side-foot">
        {user ? (
          <div className="hm-account">
            <span className="hm-avatar" aria-hidden="true">{initials(user.name, user.email)}</span>
            <span style={{ minWidth: 0 }}>
              <span className="hm-account-name">{user.name || "Account"}</span>
              <span className="hm-account-mail">{isLocal ? "Local account" : user.email}</span>
            </span>
            <button type="button" className="hm-icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <div className="hm-side-cta">
            <h3>Keep your estates</h3>
            <p>An account keeps Contract Graph workspaces for next time.</p>
            <Link to={`/login?next=${encodeURIComponent(pathname)}`} onClick={onNavigate} className="hm-btn-primary" style={{ marginTop: 4, height: 34 }}>
              <LogIn size={14} /> Sign in
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
};

export default AppSidebar;
