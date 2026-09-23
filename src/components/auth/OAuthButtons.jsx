import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { useAuth } from "./useAuth";
import { GoogleIcon, GitHubIcon } from "../icons/ProviderIcons";

const ICONS = { google: GoogleIcon, github: GitHubIcon };

/**
 * "Continue with Google" and "Continue with GitHub", above the email form on
 * both account pages.
 *
 * They are shown only when the deployment has a sign-in service that can
 * actually perform the round trip — with browser-local accounts the list is
 * empty and nothing renders, because a button that cannot work is worse than
 * no button. Clicking one leaves the site, so the click marks itself busy
 * and stays that way; the page is about to be replaced.
 */
const OAuthButtons = ({ next = "/home", remember = true, label = "Continue with" }) => {
  const { oauthProviders, signInWithOAuth } = useAuth();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  if (!oauthProviders.length) return null;

  const go = async (id) => {
    setError("");
    setBusy(id);
    try {
      await signInWithOAuth({ provider: id, next, remember });
    } catch (e) {
      setBusy("");
      setError(e?.message || "Could not start sign-in. Try again.");
    }
  };

  return (
    <div className="auth-oauth">
      {error && (
        <p className="auth-form-error" role="alert">
          <AlertCircle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
          {error}
        </p>
      )}

      {oauthProviders.map((provider) => {
        const Icon = ICONS[provider.id];
        return (
          <button
            key={provider.id}
            type="button"
            onClick={() => go(provider.id)}
            disabled={Boolean(busy)}
            className={`auth-oauth-btn is-${provider.id}`}
          >
            {busy === provider.id ? (
              <span className="auth-oauth-spin" aria-hidden="true" />
            ) : (
              Icon && <Icon size={18} />
            )}
            {busy === provider.id ? `Opening ${provider.label}…` : `${label} ${provider.label}`}
          </button>
        );
      })}

      <div className="auth-or">
        <span>or</span>
      </div>
    </div>
  );
};

export default OAuthButtons;
