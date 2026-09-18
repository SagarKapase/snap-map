import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Mail } from "lucide-react";
import { useAuth } from "../components/auth/useAuth";
import { AuthShell, Field, FormError, Input, LocalNotice, PasswordInput, SubmitButton } from "../components/auth/AuthShell";
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
  // Off means the session ends with the browser tab.
  const [remember, setRemember] = useState(true);
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
      await signIn({ ...form, remember });
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
      title={
        <>
          Your entire
          <br />
          API estate,
          <br />
          <span className="auth-grad">clearly mapped.</span>
        </>
      }
      lede="Pick up the workspaces you mapped last time — every service, every finding, every concept you confirmed."
      alternate={{ label: "Create an account", to: `/signup${location.search}` }}
      footer={
        <>
          New here?{" "}
          <Link to={`/signup${location.search}`} className="auth-link">
            Create an account
          </Link>
        </>
      }
    >
      <h2 className="auth-h2">Welcome back</h2>
      <p className="auth-sub">Sign in to continue to your API estate</p>
      {isLocal && <LocalNotice />}
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <Field id="login-email" label="Email" error={errors.email}>
          <Input
            id="login-email"
            icon={Mail}
            type="email"
            value={form.email}
            onChange={set("email")}
            autoComplete="email"
            autoFocus
            placeholder="you@company.com"
            invalid={Boolean(errors.email)}
          />
        </Field>
        <Field id="login-password" label="Password" error={errors.password}>
          <PasswordInput id="login-password" value={form.password} onChange={set("password")} invalid={Boolean(errors.password)} autoComplete="current-password" />
        </Field>
        <div className="auth-options">
          <label className="auth-check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Keep me signed in</span>
          </label>
        </div>
        <SubmitButton busy={busy}>
          {busy ? "Signing in…" : "Sign in"}
          {!busy && <ArrowRight size={16} aria-hidden="true" />}
        </SubmitButton>
      </form>
      <p className="auth-guest">
        <Link to="/home">Continue without an account</Link>
      </p>
    </AuthShell>
  );
};

export default LoginPage;
