import { Link } from "react-router-dom";
import { Lock, X } from "lucide-react";

/**
 * Shown when a signed-out visitor reaches a feature that needs an account.
 * `next` is where sign-in should return to — the same document and the same
 * tool, so nothing has to be redone afterwards.
 */
const AccountRequired = ({ feature, reason, next = "/home", onClose }) => {
  const query = `?next=${encodeURIComponent(next)}`;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="account-required-title" className="relative w-full max-w-[420px] rounded-2xl border border-vz-line bg-vz-panel p-6 shadow-[0_40px_80px_-16px_rgba(0,0,0,0.7)]">
        <button type="button" onClick={onClose} aria-label="Close" className="vz-t absolute right-3 top-3 rounded-lg p-2 text-vz-dim hover:bg-white/6 hover:text-vz-text">
          <X size={16} />
        </button>
        <span className="grid h-11 w-11 place-items-center rounded-xl border border-vz-accent/25 bg-vz-accent/10 text-vz-accent-2">
          <Lock size={20} />
        </span>
        <h2 id="account-required-title" className="mt-4 text-[18px] font-bold text-vz-text" style={{ textWrap: "balance" }}>
          Sign in to use the {feature}
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-vz-soft">{reason}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link to={`/login${query}`} className="vz-t flex h-10 flex-1 items-center justify-center rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c760ff] px-4 text-[13px] font-bold text-[#160a1d] hover:opacity-90">
            Sign in
          </Link>
          <Link to={`/signup${query}`} className="vz-t flex h-10 flex-1 items-center justify-center rounded-lg border border-vz-line bg-vz-panel-2 px-4 text-[13px] font-semibold text-vz-soft hover:text-vz-text">
            Create an account
          </Link>
        </div>
        <p className="mt-3 text-center text-[11.5px] text-vz-dim">You come straight back here afterwards, with this API still loaded.</p>
      </div>
    </div>
  );
};

export default AccountRequired;
