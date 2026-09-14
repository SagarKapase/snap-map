import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../components/auth/useAuth";
import { AuthShell, Field, FormError, PasswordInput, SubmitButton } from "../components/auth/AuthShell";
import { inputClass } from "../components/auth/authStyles";
import { validateSignIn } from "../utils/auth";

/** Where to go after signing in: the `next` query parameter, else the graph. */
const nextFrom = (search) => {
  const next = new URLSearchParams(search).get("next") || "";
  // Only same-site paths; a full URL here would be an open redirect.
  return next.startsWith("/") && !next.startsWith("//") ? next : "/home";
};

const LoginPage = () => {
  const { user, signIn, isLocal } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={nextFrom(location.search)} replace />;

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setFormError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validateSignIn(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await signIn(form);
      navigate(nextFrom(location.search), { replace: true });
    } catch (err) {
      if (err?.field) setErrors({ [err.field]: err.message });
      else setFormError(err?.message || "Could not sign in. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      isLocal={isLocal}
      title="Sign in to your API estate"
      lede="Pick up the workspaces you mapped last time: every service, every finding, every concept you confirmed."
      footer={
        <>
          New here?{" "}
          <Link to={`/signup${location.search}`} className="font-semibold text-vz-accent-2 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <h2 className="text-[20px] font-bold text-vz-text">Sign in</h2>
      <form onSubmit={submit} noValidate className="mt-5 space-y-4">
        <FormError message={formError} />
        <Field id="login-email" label="Email" error={errors.email}>
          <input
            id="login-email"
            type="email"
            value={form.email}
            onChange={set("email")}
            autoComplete="email"
            autoFocus
            placeholder="you@company.com"
            aria-invalid={Boolean(errors.email) || undefined}
            aria-describedby={errors.email ? "login-email-error" : undefined}
            className={inputClass(Boolean(errors.email))}
          />
        </Field>
        <Field id="login-password" label="Password" error={errors.password}>
          <PasswordInput id="login-password" value={form.password} onChange={set("password")} invalid={Boolean(errors.password)} autoComplete="current-password" />
        </Field>
        <SubmitButton busy={busy}>{busy ? "Signing in…" : "Sign in"}</SubmitButton>
      </form>
      <p className="mt-4 text-center text-[12px] text-vz-dim">
        <Link to="/home" className="hover:text-vz-text">Continue without an account</Link>
      </p>
    </AuthShell>
  );
};

export default LoginPage;
