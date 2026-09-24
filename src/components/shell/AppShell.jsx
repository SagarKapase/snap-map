import { useEffect, useMemo, useState } from "react";
import AppSidebar from "./AppSidebar";
import TopBar from "./TopBar";
import { useAuth } from "../auth/useAuth";
import { listWorkspaces } from "../../utils/contractWorkspace";
import "../../home.css";

/**
 * The application frame shared by the dashboard pages: the sidebar (a rail
 * on tablets, a drawer on phones), the top bar, and a content column.
 *
 * `query`/`onQueryChange` wire the top-bar search to whatever the page can
 * filter; `topActions` is a slot beside the account for page-level buttons.
 */
const COLLAPSE_KEY = "vizroute_sidebar_collapsed";

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
};

const AppShell = ({ query = "", onQueryChange, searchPlaceholder, topActions, children }) => {
  const { user } = useAuth();
  const workspaces = useMemo(() => listWorkspaces(user?.id || null), [user]);
  const [menuOpen, setMenuOpen] = useState(false);
  // The sidebar is a rail on tablets, or on desktop when the person folds
  // it; the choice is remembered in this browser.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 1199px)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1199px)");
    const onChange = (e) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      } catch {
        /* preference just does not persist */
      }
      return !v;
    });
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className={`hm${narrow || collapsed ? " is-rail" : ""}`}>
      <AppSidebar workspaces={workspaces} collapsed={collapsed} onToggleCollapse={toggleCollapsed} />

      {menuOpen && (
        <div className="hm-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="hm-drawer-backdrop" onClick={() => setMenuOpen(false)} />
          <AppSidebar workspaces={workspaces} drawer onNavigate={() => setMenuOpen(false)} onClose={() => setMenuOpen(false)} />
        </div>
      )}

      <div className="hm-main">
        <TopBar
          query={query}
          onQueryChange={onQueryChange}
          placeholder={searchPlaceholder}
          onOpenMenu={() => setMenuOpen(true)}
          actions={topActions}
        />
        <main className="hm-content">{children}</main>
      </div>
    </div>
  );
};

export default AppShell;
