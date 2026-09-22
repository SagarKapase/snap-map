import { Link, useLocation } from "react-router-dom";
import { Lock, LogIn, UserPlus, Check } from "lucide-react";
import AppShell from "../shell/AppShell";
import { useAuth } from "./useAuth";

/**
 * A whole feature behind an account.
 *
 * The children render for a signed-in person and are not mounted at all
 * for anyone else — so a locked feature neither loads its data nor writes
 * any. A visitor gets the same application frame, so the products they
 * *can* use are still one click away, and both ways in (sign in, create
 * an account) come straight back here with the address they asked for.
 */
const AccountGate = ({ feature, reason, points = [], children }) => {
  const { user } = useAuth();
  const location = useLocation();
  if (user) return children;

  const next = `${location.pathname}${location.search}`;
  const query = `?next=${encodeURIComponent(next)}`;

  return (
    <AppShell>
      <section className="hm-panel" style={{ maxWidth: 640, margin: "6vh auto 0", padding: "32px 30px" }} aria-labelledby="gate-title">
        <span className="grid h-12 w-12 place-items-center rounded-xl border border-vz-accent/25 bg-vz-accent/10 text-vz-accent-2">
          <Lock size={22} />
        </span>
        <h1 id="gate-title" style={{ marginTop: 18, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", textWrap: "balance" }}>
          Sign in to use {feature}
        </h1>
        <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary)" }}>{reason}</p>

        {points.length > 0 && (
          <ul style={{ margin: "18px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {points.map((point) => (
              <li key={point} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)" }}>
                <Check size={15} style={{ flexShrink: 0, marginTop: 2, color: "var(--success)" }} />
                {point}
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 24 }}>
          <Link to={`/signup${query}`} className="hm-btn-primary" style={{ marginTop: 0 }}>
            <UserPlus size={14} /> Create an account
          </Link>
          <Link
            to={`/login${query}`}
            className="hm-btn-primary"
            style={{ marginTop: 0, background: "var(--surface-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)", boxShadow: "none" }}
          >
            <LogIn size={14} /> Sign in
          </Link>
        </div>
        <p style={{ marginTop: 14, fontSize: 12, color: "var(--text-muted)" }}>
          You come straight back here afterwards. The API Map works without an account, and anything you mapped in this browser before signing in moves into your account.
        </p>
      </section>
    </AppShell>
  );
};

export default AccountGate;
