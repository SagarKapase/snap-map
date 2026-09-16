import { useEffect, useRef } from "react";
import { Search, Menu, X } from "lucide-react";
import AccountMenu from "./AccountMenu";

/**
 * The compact header over a dashboard page: a search box that filters what
 * is on the page (Ctrl/⌘ K focuses it), page actions, the account, and —
 * on phones — the button that opens the navigation drawer.
 *
 * The box is deliberately a plain controlled input: when a global command
 * palette arrives, it can take over `value`/`onChange` without a redesign.
 * A page with nothing to filter passes no `onQueryChange` and gets no box.
 */
const TopBar = ({ query = "", onQueryChange, onOpenMenu, actions, placeholder = "Search your APIs and workspaces" }) => {
  // Phones get the short form; the label stays the same for assistive tech.
  const shortPlaceholder = "Search";
  const inputRef = useRef(null);

  useEffect(() => {
    if (!onQueryChange) return undefined;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onQueryChange]);

  return (
    <header className="hm-topbar">
      <button type="button" className="hm-icon-btn hm-menu-btn" onClick={onOpenMenu} aria-label="Open navigation">
        <Menu size={18} />
      </button>
      {onQueryChange ? (
        <div className="hm-search" role="search">
          <Search size={15} className="hm-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onQueryChange("")}
            placeholder={typeof window !== "undefined" && window.innerWidth < 480 ? shortPlaceholder : placeholder}
            aria-label={placeholder}
            autoComplete="off"
          />
          {query ? (
            <button type="button" className="hm-icon-btn hm-search-clear" style={{ width: 26, height: 26 }} onClick={() => onQueryChange("")} aria-label="Clear search">
              <X size={13} />
            </button>
          ) : (
            <span className="hm-kbd" aria-hidden="true"><span>Ctrl</span><span>K</span></span>
          )}
        </div>
      ) : (
        <div className="hm-search" aria-hidden="true" />
      )}
      <div className="hm-top-actions">
        {actions}
        <AccountMenu showName />
      </div>
    </header>
  );
};

export default TopBar;
