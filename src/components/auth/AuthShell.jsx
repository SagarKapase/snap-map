import { Link } from "react-router-dom";
import { Eye, EyeOff, AlertCircle, Info } from "lucide-react";
import { useState } from "react";
import BrandMark from "../BrandMark";
import { inputClass } from "./authStyles";

/**
 * The frame both account pages share: brand on the left, the form on the
 * right, and — when accounts are local to this browser — a plain notice
 * saying so, because a "sign up" that cannot be used elsewhere must not
 * look like one that can.
 */
export const AuthShell = ({ title, lede, children, footer, isLocal }) => (
  <div className="relative flex min-h-screen bg-vz-bg text-vz-text">
    <div aria-hidden="true" className="landing-glow" />
    <div className="relative mx-auto grid w-full max-w-[1100px] grid-cols-1 gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-16">
      <section className="max-w-[46ch]">
        <Link to="/" className="flex items-center gap-2.5 text-[19px] font-extrabold tracking-tight text-vz-text">
          <BrandMark size={26} />
          Vizroute
        </Link>
        <h1 className="mt-10 text-[34px] font-extrabold leading-[1.08] tracking-tight text-vz-text sm:text-[40px]" style={{ textWrap: "balance" }}>
          {title}
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-vz-soft">{lede}</p>
        <ul className="mt-8 space-y-3 text-[13.5px] text-vz-soft">
          <li className="flex gap-3"><span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-vz-accent" />Contract Graph workspaces are kept per account, so an estate you map on one day is there the next.</li>
          <li className="flex gap-3"><span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-vz-accent" />Specifications stay in your browser. Signing in does not upload them anywhere.</li>
          <li className="flex gap-3"><span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-vz-accent" />Everything in the single-spec workspace keeps working without an account.</li>
        </ul>
      </section>

      <section className="w-full max-w-[440px] justify-self-center rounded-2xl border border-vz-line bg-vz-panel p-7 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.7)] sm:p-8 lg:justify-self-end">
        {isLocal && (
          <p className="mb-5 flex items-start gap-2 rounded-lg border border-vz-blue/25 bg-vz-blue/[0.07] px-3 py-2.5 text-[12px] leading-relaxed text-vz-soft">
            <Info size={14} className="mt-0.5 flex-shrink-0 text-vz-blue" />
            <span>
              Accounts on this deployment are stored in this browser only. Use them to keep workspaces separate on this machine; they cannot be used from another device until a sign-in service is connected.
            </span>
          </p>
        )}
        {children}
        {footer && <div className="mt-6 border-t border-vz-line-soft pt-5 text-center text-[13px] text-vz-soft">{footer}</div>}
      </section>
    </div>
  </div>
);

export const Field = ({ id, label, error, hint, children }) => (
  <div>
    <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-semibold text-vz-soft">
      {label}
    </label>
    {children}
    {error ? (
      <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-[12px] text-[#fda4af]" role="alert">
        <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
        {error}
      </p>
    ) : hint ? (
      <p className="mt-1.5 text-[12px] text-vz-dim">{hint}</p>
    ) : null}
  </div>
);

/** A password box with a show/hide toggle that does not steal the tab order. */
export const PasswordInput = ({ id, value, onChange, invalid, autoComplete, placeholder }) => {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={shown ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className={`${inputClass(invalid)} pr-11`}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        tabIndex={-1}
        aria-label={shown ? "Hide password" : "Show password"}
        className="vz-t absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-vz-dim hover:text-vz-text"
      >
        {shown ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
};

export const SubmitButton = ({ busy, children }) => (
  <button
    type="submit"
    disabled={busy}
    className="vz-t flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c760ff] text-[14px] font-bold text-[#160a1d] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
  >
    {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#160a1d]/30 border-t-[#160a1d]" />}
    {children}
  </button>
);

export const FormError = ({ message }) =>
  message ? (
    <p className="flex items-start gap-2 rounded-lg border border-vz-red/25 bg-vz-red/[0.08] px-3 py-2.5 text-[12.5px] text-[#fda4af]" role="alert">
      <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
      {message}
    </p>
  ) : null;
