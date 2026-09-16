import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogIn, LogOut, Home, UserRound, ChevronDown } from "lucide-react";
import { useAuth } from "../auth/useAuth";

const initials = (name, email) => {
  const source = String(name || email || "").trim();
  if (!source) return "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase();
};

/**
 * The account control every app page carries on the right: a sign-in link
 * for a visitor, an avatar menu for an account. Signing out returns to the
 * landing page so nothing account-scoped is left on screen.
 */
const AccountMenu = ({ showName = false }) => {
  const { user, signOut, isLocal } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

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

  if (!user) {
    return (
      <Link
        to={`/login?next=${encodeURIComponent(pathname)}`}
        className="vz-t flex h-9 flex-shrink-0 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel px-3 text-[12.5px] font-semibold text-vz-soft hover:text-vz-text"
      >
        <LogIn size={14} />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  const leave = async () => {
    setOpen(false);
    await signOut();
    navigate("/");
  };

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title={user.email}
        className={`vz-t flex h-9 items-center gap-2 rounded-full border text-[11.5px] font-bold ${showName ? "pl-1 pr-2.5" : "w-9 justify-center"} ${open ? "border-vz-accent/50 bg-vz-accent/20 text-[#e6c4ff]" : "border-vz-line bg-vz-panel text-vz-soft hover:border-vz-accent/40 hover:text-vz-text"}`}
      >
        <span className={`grid h-7 w-7 place-items-center rounded-full ${showName ? "bg-gradient-to-br from-[#a855f7] to-[#60a5fa] text-white" : ""}`}>
          {initials(user.name, user.email)}
        </span>
        {showName && (
          <>
            <span className="hidden max-w-[140px] truncate text-[12.5px] font-semibold sm:inline">{(user.name || user.email || "").split(" ")[0]}</span>
            <ChevronDown size={13} className={`hidden text-vz-dim transition-transform duration-150 sm:inline ${open ? "rotate-180" : ""}`} />
          </>
        )}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-[60] mt-2 w-64 overflow-hidden rounded-xl border border-vz-line bg-vz-panel shadow-2xl shadow-black/60">
          <div className="border-b border-vz-line-soft px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-vz-accent/15 text-[11px] font-bold text-[#e6c4ff]"><UserRound size={14} /></span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-vz-text">{user.name || "Account"}</span>
                <span className="block truncate text-[11.5px] text-vz-dim">{user.email}</span>
              </span>
            </div>
            {isLocal && <p className="mt-2 text-[11px] leading-snug text-vz-dim">Local account — stored in this browser only.</p>}
          </div>
          <Link to="/home" role="menuitem" onClick={() => setOpen(false)} className="vz-t flex items-center gap-2 px-3.5 py-2.5 text-[13px] text-vz-soft hover:bg-white/5 hover:text-vz-text">
            <Home size={14} /> Home
          </Link>
          <button type="button" role="menuitem" onClick={leave} className="vz-t flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] text-vz-soft hover:bg-white/5 hover:text-vz-text">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
};

export default AccountMenu;
