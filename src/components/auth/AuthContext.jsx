import { useEffect, useMemo, useState } from "react";
import { AuthContext } from "./useAuth";
import { getSession, onAuthChange, signIn, signOut, signUp, isLocalAuth } from "../../utils/auth";

/** Session state for the whole app; one subscription to the auth module. */
export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(() => getSession());

  useEffect(() => onAuthChange(setSession), []);

  const value = useMemo(
    () => ({
      session,
      user: session ? { id: session.userId, email: session.email, name: session.name } : null,
      isLocal: isLocalAuth(),
      signIn,
      signUp,
      signOut,
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
