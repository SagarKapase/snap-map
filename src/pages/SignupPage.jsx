import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { useAuth } from "../components/auth/useAuth";
import { AuthShell, Field, FormError, PasswordInput, SubmitButton } from "../components/auth/AuthShell";
import { inputClass } from "../components/auth/authStyles";
import { validateSignUp } from "../utils/auth";

const nextFrom = (search) => {
  const next = new URLSearchParams(search).get("next") || "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/graph";
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
      isLocal={isLocal}
      title="Map your whole API estate, not one spec at a time"
      lede="An account keeps your Contract Graph workspaces — the services, the shared entities, the duplicated endpoints and the naming you have reviewed — so the map is still there tomorrow."
      footer={
        <>
          Already have an account?{" "}
          <Link to={`/login${location.search}`} className="font-semibold text-vz-accent-2 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {pending ? (
        <div className="text-center" role="status">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-vz-green/30 bg-vz-green/10 text-vz-green">
            <MailCheck size={22} />
          </span>
          <h2 className="mt-4 text-[20px] font-bold text-vz-text">Check your email</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-vz-soft">
            A confirmation link was sent to <span className="font-semibold text-vz-text">{pending}</span>. Open it, then sign in.
          </p>
        </div>
      ) : (
        <>
          <h2 className="text-[20px] font-bold text-vz-text">Create your account</h2>
          <form onSubmit={submit} noValidate className="mt-5 space-y-4">
            <FormError message={formError} />
            <Field id="signup-name" label="Name" error={errors.name}>
              <input
                id="signup-name"
                type="text"
                value={form.name}
                onChange={set("name")}
                autoComplete="name"
                autoFocus
                placeholder="Ada Lovelace"
                aria-invalid={Boolean(errors.name) || undefined}
                aria-describedby={errors.name ? "signup-name-error" : undefined}
                className={inputClass(Boolean(errors.name))}
              />
            </Field>
            <Field id="signup-email" label="Email" error={errors.email}>
              <input
                id="signup-email"
                type="email"
                value={form.email}
                onChange={set("email")}
                autoComplete="email"
                placeholder="you@company.com"
                aria-invalid={Boolean(errors.email) || undefined}
                aria-describedby={errors.email ? "signup-email-error" : undefined}
                className={inputClass(Boolean(errors.email))}
              />
            </Field>
            <Field id="signup-password" label="Password" error={errors.password}>
              <PasswordInput id="signup-password" value={form.password} onChange={set("password")} invalid={Boolean(errors.password)} autoComplete="new-password" />
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]" aria-label="Password requirements">
                {checks.map((c) => (
                  <li key={c.label} className={c.ok ? "text-vz-green" : "text-vz-dim"}>
                    {c.ok ? "✓" : "○"} {c.label}
                  </li>
                ))}
              </ul>
            </Field>
            <Field id="signup-confirm" label="Confirm password" error={errors.confirm}>
              <PasswordInput id="signup-confirm" value={form.confirm} onChange={set("confirm")} invalid={Boolean(errors.confirm)} autoComplete="new-password" />
            </Field>
            <SubmitButton busy={busy}>{busy ? "Creating account…" : "Create account"}</SubmitButton>
          </form>
        </>
      )}
    </AuthShell>
  );
};

export default SignupPage;
