import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Check } from "lucide-react";
import BrandMark from "../BrandMark";
import { PRODUCTS, productFor } from "./products";

const ProductSwitcher = ({ compact = false }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { pathname } = useLocation();
  const current = productFor(pathname);

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
    <div ref={ref} className="relative flex flex-shrink-0 items-center">
      <Link to="/home" className="flex items-center gap-2 rounded-lg px-1 py-0.5 hover:opacity-80" title="Home">
        <BrandMark size={compact ? 22 : 24} />
        {!compact && <span className="text-[17px] font-bold tracking-tight text-vz-text">Vizroute</span>}
      </Link>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch product"
        className={`vz-t ml-1 flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold ${open ? "bg-white/6 text-vz-text" : "text-vz-soft hover:bg-white/5 hover:text-vz-text"}`}
      >
        {current ? current.label : "Products"}
        <ChevronDown size={13} className={`text-vz-dim transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-[60] mt-2 w-[300px] overflow-hidden rounded-xl border border-vz-line bg-vz-panel p-1.5 shadow-2xl shadow-black/60">
          {PRODUCTS.map((p) => {
            const Icon = p.icon;
            const active = current?.id === p.id;
            return (
              <Link
                key={p.id}
                to={p.to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`vz-t flex items-start gap-3 rounded-lg px-3 py-2.5 ${active ? "bg-vz-accent/12" : "hover:bg-white/5"}`}
              >
                <span className={`mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg ${active ? "bg-vz-accent/20 text-[#e6c4ff]" : "bg-white/6 text-vz-soft"}`}>
                  <Icon size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] font-semibold ${active ? "text-[#e6c4ff]" : "text-vz-text"}`}>{p.label}</span>
                  <span className="block text-[11.5px] leading-snug text-vz-dim">{p.hint}</span>
                </span>
                {active && <Check size={14} className="mt-1 flex-shrink-0 text-[#e6c4ff]" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProductSwitcher;
