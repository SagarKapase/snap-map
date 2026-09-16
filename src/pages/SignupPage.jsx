import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { MailCheck, Mail, UserRound, ArrowRight } from "lucide-react";
import { useAuth } from "../components/auth/useAuth";
import { AuthShell, Field, FormError, Input, LocalNotice, PasswordInput, SubmitButton } from "../components/auth/AuthShell";
import { validateSignUp } from "../utils/auth";

const nextFrom = (search) => {
  const next = new URLSearchParams(search).get("next") || "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/home";
};

/** Which of the sign-up rules the typed password already meets. */
const passwordChecks = (password) => [
  { label: "At least 8 characters", ok: password.length >= 8 },
  { label: "A letter", ok: /[a-zA-Z]/.test(password) },
  { label: "A number", ok: /[0-9]/.test(password) },
];

const SignupPage = () => {
  const { user, signUp, isLocal } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);

  if (user) return <Navigate to={nextFrom(location.search)} replace />;

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setFormError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validateSignUp(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const result = await signUp({ name: form.name, email: form.email, password: form.password });
      if (result?.pendingConfirmation) {
        setPending(result.email);
        return;
      }
      navigate(nextFrom(location.search), { replace: true });
    } catch (err) {
      if (err?.field) setErrors({ [err.field]: err.message });
      else setFormError(err?.message || "Could not create the account. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const checks = passwordChecks(form.password);

  return (
    <AuthShell
      title={
        <>
          Map your whole
          <br />
          API estate, not
          <br />
          <span className="auth-grad">one spec at a time.</span>
        </>
      }
      lede="An account keeps your Contract Graph workspaces — the services, the shared entities, the duplicated endpoints and the naming you have reviewed — so the map is still there tomorrow."
      alternate={{ label: "Sign in", to: `/login${location.search}` }}
      footer={
        <>
          Already have an account?{" "}
          <Link to={`/login${location.search}`} className="auth-link">
            Sign in
          </Link>
        </>
      }
    >
      {pending ? (
        <div className="text-center" role="status" style={{ marginTop: 22 }}>
          <span className="auth-mail">
            <MailCheck size={22} />
          </span>
          <h2 className="auth-h2" style={{ marginTop: 16, fontSize: 24 }}>Check your email</h2>
          <p className="auth-muted" style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.6 }}>
            A confirmation link was sent to <span className="auth-text" style={{ fontWeight: 600 }}>{pending}</span>. Open it, then sign in.
          </p>
        </div>
      ) : (
        <>
          <h2 className="auth-h2">Create your account</h2>
          <p className="auth-sub">Your workspaces, kept for next time</p>
          {isLocal && <LocalNotice />}
          <form onSubmit={submit} noValidate className="space-y-4">
            <FormError message={formError} />
            <Field id="signup-name" label="Name" error={errors.name}>
              <Input
                id="signup-name"
                icon={UserRound}
                type="text"
                value={form.name}
                onChange={set("name")}
                autoComplete="name"
                autoFocus
                placeholder="Ada Lovelace"
                invalid={Boolean(errors.name)}
              />
            </Field>
            <Field id="signup-email" label="Email" error={errors.email}>
              <Input
                id="signup-email"
                icon={Mail}
                type="email"
                value={form.email}
                onChange={set("email")}
                autoComplete="email"
                placeholder="you@company.com"
                invalid={Boolean(errors.email)}
              />
            </Field>
            <Field id="signup-password" label="Password" error={errors.password}>
              <PasswordInput id="signup-password" value={form.password} onChange={set("password")} invalid={Boolean(errors.password)} autoComplete="new-password" placeholder="Choose a password" />
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]" aria-label="Password requirements">
                {checks.map((c) => (
                  <li key={c.label} className={c.ok ? "auth-ok" : "auth-dim"}>
                    {c.ok ? "✓" : "○"} {c.label}
                  </li>
                ))}
              </ul>
            </Field>
            <Field id="signup-confirm" label="Confirm password" error={errors.confirm}>
              <PasswordInput id="signup-confirm" value={form.confirm} onChange={set("confirm")} invalid={Boolean(errors.confirm)} autoComplete="new-password" placeholder="Type it again" />
            </Field>
            <SubmitButton busy={busy}>
              {busy ? "Creating account…" : "Create account"}
              {!busy && <ArrowRight size={16} aria-hidden="true" />}
            </SubmitButton>
          </form>
        </>
      )}
    </AuthShell>
  );
};

export default SignupPage;
