import { useEffect, useRef, useState } from "react";
import {
  Search,
  Settings,
  Sparkles,
  History as HistoryIcon,
  Github,
  BookOpen,
  FolderOpen,
  LayoutGrid,
  PanelLeft,
  PanelRight,
  Trash2,
  Check,
} from "lucide-react";
import { timeAgo } from "../../utils/analysis";
import BrandMark from "../BrandMark";

const NavButton = ({ active, icon: Icon, children, ...rest }) => (
  <button
    type="button"
    className={`vz-t flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium ${
      active
        ? "bg-vz-accent/12 text-[#e9ccff] shadow-[inset_0_-2px_0_#b45cff]"
        : "text-vz-soft hover:bg-white/4 hover:text-vz-text"
    }`}
    {...rest}
  >
    {Icon ? <Icon size={14} /> : null}
    {children}
  </button>
);

const ToggleRow = ({ label, hint, checked, onChange }) => (
  <button
    type="button"
    onClick={onChange}
    className="vz-t flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/4"
  >
    <span
      className={`vz-t flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
        checked
          ? "border-vz-accent bg-vz-accent text-[#160a1d]"
          : "border-vz-line bg-vz-panel-2"
      }`}
    >
      {checked ? <Check size={11} strokeWidth={3} /> : null}
    </span>
    <span className="min-w-0">
      <span className="block text-[13px] text-vz-text">{label}</span>
      {hint ? (
        <span className="block text-[11px] text-vz-dim">{hint}</span>
      ) : null}
    </span>
  </button>
);

const TopNav = ({
  onNavigateHome,
  onOpenPalette,
  onOpenCollections,
  onOpenDocs,
  onOpenGithubImport,
  onOpenWorkspaceManager,
  onOpenEnvManager,
  onResetView,
  onGoWorkspace,
  recents = [],
  onOpenRecent,
  onClearRecents,
  showParticles,
  onToggleParticles,
  showMinimap,
  onToggleMinimap,
  showGrid,
  onToggleGrid,
  onToggleSidebar,
  onToggleInspector,
}) => {
  const [openMenu, setOpenMenu] = useState(null); // "history" | "settings"
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target))
        setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenu]);

  return (
    <header
      ref={wrapRef}
      className="relative z-[45] flex h-[60px] flex-shrink-0 items-center justify-between gap-4 border-b border-vz-line-soft bg-vz-bg px-3 sm:px-4"
    >
      <div className="flex min-w-0 items-center gap-2 sm:gap-6">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="vz-t rounded-lg border border-vz-line bg-vz-panel p-2 text-vz-soft hover:text-vz-text lg:hidden"
          title="Toggle API explorer"
        >
          <PanelLeft size={15} />
        </button>

        <button
          type="button"
          onClick={onNavigateHome}
          title="Back to the Vizroute home page"
          className="vz-t flex flex-shrink-0 items-center gap-2 rounded-lg px-1 py-0.5 hover:opacity-80"
        >
          <BrandMark size={24} />
          <span className="text-[17px] font-bold tracking-tight text-vz-text">
            Vizroute
          </span>
        </button>

        <nav className="hidden min-w-0 items-center gap-1 overflow-hidden lg:flex">
          <NavButton active icon={LayoutGrid} onClick={onGoWorkspace}>
            Workspace
          </NavButton>
          <NavButton icon={FolderOpen} onClick={onOpenCollections}>
            Collections
          </NavButton>
          <div className="relative">
            <NavButton
              icon={HistoryIcon}
              active={openMenu === "history"}
              onClick={() =>
                setOpenMenu((m) => (m === "history" ? null : "history"))
              }
            >
              History
            </NavButton>
            {openMenu === "history" && (
              <div className="absolute left-0 top-full mt-2 w-80 overflow-hidden rounded-xl border border-vz-line bg-vz-panel shadow-2xl shadow-black/50">
                <div className="flex items-center justify-between border-b border-vz-line-soft px-3 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-vz-dim">
                    Recently imported
                  </span>
                  {recents.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onClearRecents?.();
                        setOpenMenu(null);
                      }}
                      className="vz-t flex items-center gap-1 text-[11px] text-vz-dim hover:text-vz-red"
                    >
                      <Trash2 size={11} /> Clear
                    </button>
                  )}
                </div>
                {recents.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[12px] text-vz-dim">
                    Imports you open are listed here.
                  </p>
                ) : (
                  <div className="max-h-80 overflow-auto vz-scroll py-1">
                    {recents.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        disabled={!r.data}
                        onClick={() => {
                          onOpenRecent?.(r);
                          setOpenMenu(null);
                        }}
                        className="vz-t flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/4 disabled:opacity-40"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-vz-text">
                            {r.name}
                          </span>
                          <span className="block text-[11px] text-vz-dim">
                            {r.format} · {r.endpoints} endpoints
                          </span>
                        </span>
                        <span className="flex-shrink-0 text-[11px] text-vz-dim">
                          {timeAgo(r.openedAt)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <NavButton icon={BookOpen} onClick={onOpenDocs}>
            Docs
          </NavButton>
          <NavButton icon={Github} onClick={onOpenGithubImport}>
            GitHub
          </NavButton>
        </nav>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenPalette}
          className="vz-t hidden h-9 w-[180px] items-center gap-2 rounded-lg border border-vz-line bg-vz-panel px-2.5 text-[13px] text-vz-dim hover:border-vz-line/80 hover:text-vz-soft sm:flex lg:w-[210px] xl:w-[290px]"
        >
          <Search size={14} />
          <span className="truncate">Search or run a command...</span>
          <kbd className="vz-mono ml-auto flex-shrink-0 rounded border border-vz-line bg-vz-elev px-1.5 py-0.5 text-[10px] text-vz-dim">
            Ctrl K
          </kbd>
        </button>

        <button
          type="button"
          onClick={onOpenPalette}
          className="vz-t rounded-lg border border-vz-line bg-vz-panel p-2 text-vz-soft hover:text-vz-text sm:hidden"
          title="Search or run a command"
        >
          <Search size={15} />
        </button>

        <button
          type="button"
          onClick={onToggleParticles}
          className={`vz-t rounded-lg border p-2 ${
            showParticles
              ? "border-vz-accent/40 bg-vz-accent/12 text-vz-accent"
              : "border-vz-line bg-vz-panel text-vz-soft hover:text-vz-text"
          }`}
          title={showParticles ? "Disable traffic animation" : "Enable traffic animation"}
        >
          <Sparkles size={15} />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() =>
              setOpenMenu((m) => (m === "settings" ? null : "settings"))
            }
            className={`vz-t rounded-lg border p-2 ${
              openMenu === "settings"
                ? "border-vz-line bg-vz-elev text-vz-text"
                : "border-vz-line bg-vz-panel text-vz-soft hover:text-vz-text"
            }`}
            title="Settings"
          >
            <Settings size={15} />
          </button>

          {openMenu === "settings" && (
            <div className="absolute right-0 top-full mt-2 w-72 overflow-hidden rounded-xl border border-vz-line bg-vz-panel shadow-2xl shadow-black/50">
              <p className="border-b border-vz-line-soft px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-vz-dim">
                Canvas
              </p>
              <ToggleRow
                label="Traffic animation"
                hint="Particles flowing along connections"
                checked={showParticles}
                onChange={onToggleParticles}
              />
              <ToggleRow
                label="Minimap"
                hint="Shown when the graph has 8+ nodes"
                checked={showMinimap}
                onChange={onToggleMinimap}
              />
              <ToggleRow
                label="Dot grid"
                checked={showGrid}
                onChange={onToggleGrid}
              />
              <div className="border-t border-vz-line-soft" />
              <button
                type="button"
                onClick={() => {
                  onResetView?.();
                  setOpenMenu(null);
                }}
                className="vz-t w-full px-3 py-2.5 text-left text-[13px] text-vz-soft hover:bg-white/4 hover:text-vz-text"
              >
                Reset view
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenEnvManager?.();
                  setOpenMenu(null);
                }}
                className="vz-t w-full px-3 py-2.5 text-left text-[13px] text-vz-soft hover:bg-white/4 hover:text-vz-text"
              >
                Environments
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenWorkspaceManager?.();
                  setOpenMenu(null);
                }}
                className="vz-t w-full px-3 py-2.5 text-left text-[13px] text-vz-soft hover:bg-white/4 hover:text-vz-text"
              >
                Workspaces
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleInspector}
          className="vz-t rounded-lg border border-vz-line bg-vz-panel p-2 text-vz-soft hover:text-vz-text xl:hidden"
          title="Toggle inspector"
        >
          <PanelRight size={15} />
        </button>

        <div
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#7c3aed] to-[#a855f7] text-[13px] font-semibold text-white"
          title="Local session — specs stay in this browser"
        >
          V
        </div>
      </div>
    </header>
  );
};

export default TopNav;
