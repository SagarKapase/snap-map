import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";
import BrandMark from "../BrandMark";
import { useAuth } from "../auth/useAuth";
import AccountMenu from "../shell/AccountMenu";
import { POSTS } from "../../utils/blog";

// Only routes and sections that actually exist are linked. The anchors carry
// "/" so they also work from a blog post, where the section is on another page.
const LINKS = [
  { label: "Features", href: "/#features" },
  { label: "Use Cases", href: "/#use-cases" },
  { label: "Questions", href: "/#faq" },
  { label: "Contract Graph", to: "/graph" },
  ...(POSTS.length > 0 ? [{ label: "Blog", to: "/blog" }] : []),
];

const NavLink = ({ link, onClick, className }) =>
  link.to ? (
    <Link to={link.to} onClick={onClick} className={className}>
      {link.label}
    </Link>
  ) : (
    <a href={link.href} onClick={onClick} className={className}>
      {link.label}
    </a>
  );

const LandingNav = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Every link in the sheet closes it; Escape does too.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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
            <span className="hidden min-[380px]:inline">Vizroute</span>
          </Link>

          <ul className="hidden items-center gap-7 md:flex">
            {LINKS.map((link) => (
              <li key={link.label}>
                {/* 32px tall, so the target is reachable rather than just visible. */}
                <NavLink
                  link={link}
                  className="vz-t inline-flex min-h-[32px] items-center text-[13px] text-vz-soft hover:text-vz-text"
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-shrink-0 items-center gap-3">
          <AccountMenu />
          <Link
            to={user ? "/home" : "/workspace"}
            className="lp-cta vz-t hidden h-[42px] flex-shrink-0 items-center gap-2 rounded-[10px] bg-gradient-to-r from-[#a855f7] to-[#c760ff] px-5 text-[13px] font-bold text-[#190b20] shadow-[0_0_30px_rgba(168,85,247,0.12)] md:flex"
          >
            Get Started
            <ArrowRight size={15} className="lp-cta-arrow" aria-hidden="true" />
          </Link>

          {/* Below the breakpoint the links have nowhere to go, so they get a sheet. */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="vz-t grid h-[42px] w-[42px] place-items-center rounded-[10px] border border-vz-line bg-vz-panel/70 text-vz-soft hover:text-vz-text md:hidden"
          >
            {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </button>
        </div>
      </nav>

      {open && (
        <div
          id="landing-menu"
          data-open="true"
          className="lp-sheet border-t border-white/5 bg-vz-bg/95 px-5 pb-5 pt-2 backdrop-blur-xl md:hidden"
        >
          <ul className="flex flex-col">
            {LINKS.map((link) => (
              <li key={link.label} className="border-b border-vz-line-soft last:border-b-0">
                <NavLink
                  link={link}
                  onClick={() => setOpen(false)}
                  className="vz-t flex min-h-[52px] items-center text-[15px] font-medium text-vz-soft hover:text-vz-text"
                />
              </li>
            ))}
          </ul>
          <Link
            to={user ? "/home" : "/workspace"}
            onClick={() => setOpen(false)}
            className="vz-t mt-4 flex h-[48px] items-center justify-center gap-2 rounded-[10px] bg-gradient-to-r from-[#a855f7] to-[#cb68ff] text-[14px] font-bold text-[#150a1b]"
          >
            Get Started
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <Link
            to="/workspace?demo=openapi"
            onClick={() => setOpen(false)}
            className="vz-t mt-2.5 flex h-[46px] items-center justify-center gap-2 rounded-[10px] border border-[#30384a] bg-vz-panel/70 text-[14px] font-semibold text-[#e5e8ee]"
          >
            Open a live sample
          </Link>
        </div>
      )}
    </header>
  );
};

export default LandingNav;
