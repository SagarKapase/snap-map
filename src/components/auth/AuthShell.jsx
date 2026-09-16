import { useState } from "react";
import { Eye, EyeOff, AlertCircle, Lock, Info } from "lucide-react";
import BrandPanel from "./BrandPanel";
import AuthPanel from "./AuthPanel";
import "../../auth.css";

/**
 * The frame both account pages share: the product on the left, the form on
 * the right, and — when accounts are local to this browser — a plain notice
 * saying so, because a "sign up" that cannot be used elsewhere must not
 * look like one that can.
 */
export const AuthShell = ({ title, lede, alternate, children, footer }) => (
  <div className="auth">
    <BrandPanel title={title} lede={lede} />
    <AuthPanel alternate={alternate} footer={footer}>
      {children}
    </AuthPanel>
  </div>
);

/** Shown when accounts live in this browser only, so nobody mistakes one for a cloud account. */
export const LocalNotice = () => (
  <p className="auth-notice">
    <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
    <span>
      Accounts on this deployment are stored in this browser only. Use them to keep workspaces separate on this machine; they cannot be used from another device until a sign-in service is connected.
    </span>
  </p>
);

export const Field = ({ id, label, error, hint, children }) => (
  <div>
    <label htmlFor={id} className="auth-label">
      {label}
    </label>
    {children}
    {error ? (
      <p id={`${id}-error`} className="auth-error" role="alert">
        <AlertCircle size={12} style={{ marginTop: 2, flexShrink: 0 }} />
        {error}
      </p>
    ) : hint ? (
      <p className="auth-dim" style={{ marginTop: 6, fontSize: 12 }}>{hint}</p>
    ) : null}
  </div>
);

/** A text box with a leading icon; the icon is decoration, the label does the naming. */
export const Input = ({ id, icon: Icon, invalid, trailing = false, ...rest }) => (
  <div className="auth-input-wrap">
    {Icon && <span className="auth-input-icon" aria-hidden="true"><Icon size={16} /></span>}
    <input
      id={id}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-error` : undefined}
      className={`auth-input${invalid ? " is-invalid" : ""}${trailing ? " has-trailing" : ""}`}
      style={Icon ? undefined : { paddingLeft: 14 }}
      {...rest}
    />
  </div>
);

/** A password box with a show/hide toggle that does not steal the tab order. */
export const PasswordInput = ({ id, value, onChange, invalid, autoComplete, placeholder = "Enter your password" }) => {
  const [shown, setShown] = useState(false);
  return (
    <div className="auth-input-wrap">
      <span className="auth-input-icon" aria-hidden="true"><Lock size={16} /></span>
      <input
        id={id}
        type={shown ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className={`auth-input has-trailing${invalid ? " is-invalid" : ""}`}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        tabIndex={-1}
        aria-label={shown ? "Hide password" : "Show password"}
        className="auth-eye"
      >
        {shown ? <EyeOff key="off" size={16} /> : <Eye key="on" size={16} />}
      </button>
    </div>
  );
};

export const SubmitButton = ({ busy, children }) => (
  <button type="submit" disabled={busy} className="auth-submit">
    {busy && <span className="spin" aria-hidden="true" />}
    {children}
  </button>
);

export const FormError = ({ message }) =>
  message ? (
    <p className="auth-form-error" role="alert">
      <AlertCircle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
      {message}
    </p>
  ) : null;
