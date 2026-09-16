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
const AppShell = ({ query = "", onQueryChange, searchPlaceholder, topActions, children }) => {
  const { user } = useAuth();
  const workspaces = useMemo(() => listWorkspaces(user?.id || null), [user]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="hm">
      <AppSidebar workspaces={workspaces} />

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
