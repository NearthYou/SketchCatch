"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { AuthResponse, LoginRequest, SignupRequest, User } from "@sketchcatch/types";
import {
  hasRefreshSessionHint,
  requestCurrentUser,
  requestLogin,
  requestLogout,
  requestRefreshSession,
  requestSignup
} from "../../lib/auth-api";
import {
  clearStoredAuthSession,
  readStoredAuthSession,
  writeStoredAuthSession
} from "../../lib/auth-storage";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  login: (payload: LoginRequest) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
  signup: (payload: SignupRequest) => Promise<AuthResponse>;
  status: AuthStatus;
  user: User | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);

  const reloadUser = useCallback(async () => {
    setStatus("loading");

    try {
      const storedSession = readStoredAuthSession();
      const session =
        storedSession ?? (hasRefreshSessionHint() ? await requestRefreshSession() : null);

      if (!session) {
        setUser(null);
        setStatus("unauthenticated");
        return;
      }

      const response = await requestCurrentUser();
      setUser(response.user);
      setStatus("authenticated");
    } catch {
      clearStoredAuthSession();
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void reloadUser();
  }, [reloadUser]);

  const login = useCallback(async (payload: LoginRequest) => {
    const response = await requestLogin(payload);
    writeStoredAuthSession(response.session);
    setUser(response.user);
    setStatus("authenticated");

    return response;
  }, []);

  const signup = useCallback(async (payload: SignupRequest) => {
    const response = await requestSignup(payload);
    writeStoredAuthSession(response.session);
    setUser(response.user);
    setStatus("authenticated");

    return response;
  }, []);

  const logout = useCallback(async () => {
    try {
      await requestLogout();
    } finally {
      clearStoredAuthSession();
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      login,
      logout,
      reloadUser,
      signup,
      status,
      user
    }),
    [login, logout, reloadUser, signup, status, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
