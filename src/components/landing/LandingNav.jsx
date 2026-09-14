import { Link } from "react-router-dom";
import { ArrowRight, Github, LogOut } from "lucide-react";
import BrandMark from "../BrandMark";
import { useAuth } from "../auth/useAuth";

export const GITHUB_URL = "https://github.com/SagarKapase/snap-map";

// Only routes and sections that actually exist are linked.
const LINKS = [
  { label: "Features", href: "#features" },
  { label: "Use Cases", href: "#use-cases" },
];

const LandingNav = () => {
  const { user, signOut } = useAuth();
  return (
  <header className="sticky top-0 z-50 border-b border-white/5 bg-vz-bg/85 backdrop-blur-xl">
    <nav
      aria-label="Main"
      className="mx-auto flex min-h-[68px] max-w-[1500px] items-center justify-between gap-6 px-5 sm:px-8"
    >
      <div className="flex min-w-0 items-center gap-8 lg:gap-12">
        <Link
          to="/"
          className="flex flex-shrink-0 items-center gap-2.5 text-[19px] font-extrabold tracking-tight text-vz-text"
        >
          <BrandMark size={26} />
          Vizroute
        </Link>

        <ul className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                className="vz-t text-[13px] text-vz-soft hover:text-vz-text"
              >
                {link.label}
              </a>
            </li>
          ))}
          <li>
            <Link to="/graph" className="vz-t text-[13px] text-vz-soft hover:text-vz-text">
              Contract Graph
            </Link>
          </li>
          <li>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="vz-t flex items-center gap-1.5 text-[13px] text-vz-soft hover:text-vz-text"
            >
              <Github size={14} aria-hidden="true" />
              GitHub
            </a>
          </li>
        </ul>
      </div>

      <div className="flex flex-shrink-0 items-center gap-3">
        {user ? (
          <>
            <span className="hidden text-[13px] text-vz-soft sm:inline" title={user.email}>{user.name || user.email}</span>
            <button type="button" onClick={() => signOut()} className="vz-t flex items-center gap-1.5 text-[13px] text-vz-soft hover:text-vz-text" title="Sign out">
              <LogOut size={14} aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </>
        ) : (
          <Link to="/login" className="vz-t text-[13px] text-vz-soft hover:text-vz-text">
            Sign in
          </Link>
        )}
        <Link
          to="/workspace"
          className="vz-t flex h-[42px] flex-shrink-0 items-center gap-2 rounded-[10px] bg-gradient-to-r from-[#a855f7] to-[#c760ff] px-5 text-[13px] font-bold text-[#190b20] shadow-[0_0_30px_rgba(168,85,247,0.12)] hover:-translate-y-px hover:shadow-[0_8px_32px_rgba(168,85,247,0.18)]"
        >
          Get Started
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </nav>
  </header>
  );
};

export default LandingNav;
