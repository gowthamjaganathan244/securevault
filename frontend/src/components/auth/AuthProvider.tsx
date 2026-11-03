"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Amplify } from "aws-amplify";
import { fetchAuthSession, signOut as amplifySignOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { amplifyConfig } from "@/lib/authConfig";

// Configure once per page load. Amplify keeps tokens in localStorage, so the
// session survives refreshes and refreshes its own access/ID tokens.
Amplify.configure(amplifyConfig);

export type AuthStatus = "loading" | "signedIn" | "signedOut";

export interface SessionClaims {
  [claim: string]: unknown;
}

interface AuthState {
  status: AuthStatus;
  /** ID-token claims issued by Cognito (email, cognito:groups, auth_time…). */
  claims: SessionClaims | null;
  /** ID-token expiry, epoch seconds. */
  expiresAt: number | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  status: "loading",
  claims: null,
  expiresAt: null,
  refresh: async () => {},
  signOut: async () => {},
});

export const useAuthState = () => useContext(AuthContext);

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [claims, setClaims] = useState<SessionClaims | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      if (!idToken) throw new Error("no session");
      setClaims(idToken.payload as SessionClaims);
      setExpiresAt(typeof idToken.payload.exp === "number" ? idToken.payload.exp : null);
      setStatus("signedIn");
    } catch {
      setClaims(null);
      setExpiresAt(null);
      setStatus("signedOut");
    }
  }, []);

  useEffect(() => {
    // Restore any session Amplify persisted (survives page refresh).
    queueMicrotask(() => void refresh());
    return Hub.listen("auth", ({ payload }) => {
      if (["signedIn", "signedOut", "tokenRefresh", "tokenRefresh_failure"].includes(payload.event)) void refresh();
    });
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      // Revokes this device's refresh token in Cognito and clears local tokens.
      await amplifySignOut();
    } finally {
      setClaims(null);
      setExpiresAt(null);
      setStatus("signedOut");
      window.location.replace("/login");
    }
  }, []);

  const value = useMemo(() => ({ status, claims, expiresAt, refresh, signOut }), [status, claims, expiresAt, refresh, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
