import { useEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "./useAuth";
import {
  getSession,
  onAuthChange,
  signIn,
  signOut,
  signUp,
  isLocalAuth,
  oauthProviders,
  signInWithOAuth,
  completeOAuthRedirect,
  hasOAuthRedirect,
  stashOAuthError,
  takeOAuthError,
} from "../../utils/auth";

/** While the Google or GitHub round trip is being finished, on the app's own ground. */
const Finishing = () => (
  <div className="flex h-screen w-full items-center justify-center bg-vz-bg">
    <div className="text-center">
      <div className="mb-3 text-2xl font-extrabold tracking-tight text-vz-accent-2">Vizroute</div>
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-vz-accent/30 border-t-vz-accent" />
      <p className="mt-4 text-[13px] text-vz-soft">Signing you in…</p>
    </div>
  </div>
);

/**
 * Session state for the whole app; one subscription to the auth module.
 *
 * It also owns the return leg of a Google or GitHub sign-in. The provider
 * sends the browser back to the site root with tokens in the fragment, so
 * this checks for them during the very first render — before any page can
 * try to read that fragment as its own — and holds a splash until there is
 * somewhere to send the person.
 *
 * That last step is a real navigation rather than a router one. The address
 * they came back to is the root, and the root sends a signed-in visitor to
 * Home; routing away from it in the same breath as revealing the app is a
 * race this does not need to win. A full load lands on the right page with
 * the session already in storage.
 */
export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(() => getSession());
  // Decided on the first render, so the landing page never flashes behind
  // a sign-in that is already half done.
  const [finishing, setFinishing] = useState(() => hasOAuthRedirect());
  // A failure from the previous page load, on its way to the sign-in form.
  const [oauthError, setOauthError] = useState(() => takeOAuthError());
  const started = useRef(false);

  useEffect(() => onAuthChange(setSession), []);

  // The ref is the whole guard, and deliberately so: a round trip that has
  // begun has to finish. Abandoning it on an effect teardown — which React
  // does on every mount in development — would leave the splash up forever
  // with a session already in hand.
  useEffect(() => {
    if (!finishing || started.current) return;
    started.current = true;
    completeOAuthRedirect()
      .catch((e) => ({ error: e?.message || "Could not finish signing in. Try again." }))
      .then((result) => {
        if (result?.error) {
          // The message belongs on the sign-in page, where the alternative is.
          stashOAuthError(result.error);
          window.location.replace("/login");
          return;
        }
        if (result?.session) {
          window.location.replace(result.next || "/home");
          return;
        }
        // Nothing to finish after all; show the app.
        setFinishing(false);
      });
  }, [finishing]);

  const value = useMemo(
    () => ({
      session,
      user: session ? { id: session.userId, email: session.email, name: session.name } : null,
      isLocal: isLocalAuth(),
      oauthProviders: oauthProviders(),
      oauthError,
      clearOauthError: () => setOauthError(""),
      signIn,
      signUp,
      signInWithOAuth,
      signOut,
    }),
    [session, oauthError],
  );

  return <AuthContext.Provider value={value}>{finishing ? <Finishing /> : children}</AuthContext.Provider>;
};
