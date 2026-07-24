"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  AuthResponse,
  LoginRequest,
  SignupRequest,
  UpdateProfileRequest,
  UpdateProfileResponse,
  User
} from "@sketchcatch/types";
import {
  hasRefreshSessionHint,
  requestCurrentUser,
  requestLogin,
  requestLogout,
  requestProfileUpdate,
  requestRefreshSession,
  requestSignup
} from "../../lib/auth-api";
import {
  clearStoredAuthSession,
  readStoredAuthSession,
  writeStoredAuthSession
} from "../../lib/auth-storage";
import {
  getAuthReloadPhase,
  shouldClearAuthAfterReloadError
} from "./auth-reload-policy";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  canChangePassword: boolean | null;
  isRefreshing: boolean;
  login: (payload: LoginRequest) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
  signup: (payload: SignupRequest) => Promise<AuthResponse>;
  status: AuthStatus;
  updateProfile: (payload: UpdateProfileRequest) => Promise<UpdateProfileResponse>;
  user: User | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [canChangePassword, setCanChangePassword] = useState<boolean | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasResolvedInitialSessionRef = useRef(false);

  const reloadUser = useCallback(async () => {
    const phase = getAuthReloadPhase(hasResolvedInitialSessionRef.current);

    if (phase === "initial") {
      setStatus("loading");
    } else {
      setIsRefreshing(true);
    }

    try {
      const storedSession = readStoredAuthSession();
      const session =
        storedSession ?? (hasRefreshSessionHint() ? await requestRefreshSession() : null);

      if (!session) {
        setCanChangePassword(null);
        setUser(null);
        setStatus("unauthenticated");
        return;
      }

      const response = await requestCurrentUser();
      setCanChangePassword(response.canChangePassword);
      setUser(response.user);
      setStatus("authenticated");
    } catch (error) {
      if (shouldClearAuthAfterReloadError({ error, phase })) {
        clearStoredAuthSession();
        setCanChangePassword(null);
        setUser(null);
        setStatus("unauthenticated");
      }
    } finally {
      hasResolvedInitialSessionRef.current = true;
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void reloadUser();
  }, [reloadUser]);

  const login = useCallback(async (payload: LoginRequest) => {
    const response = await requestLogin(payload);
    writeStoredAuthSession(response.session);
    hasResolvedInitialSessionRef.current = true;
    setIsRefreshing(false);
    setCanChangePassword(true);
    setUser(response.user);
    setStatus("authenticated");

    return response;
  }, []);

  const signup = useCallback(async (payload: SignupRequest) => {
    const response = await requestSignup(payload);
    writeStoredAuthSession(response.session);
    hasResolvedInitialSessionRef.current = true;
    setIsRefreshing(false);
    setCanChangePassword(true);
    setUser(response.user);
    setStatus("authenticated");

    return response;
  }, []);

  const logout = useCallback(async () => {
    try {
      await requestLogout();
    } finally {
      clearStoredAuthSession();
      hasResolvedInitialSessionRef.current = true;
      setIsRefreshing(false);
      setCanChangePassword(null);
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const updateProfile = useCallback(async (payload: UpdateProfileRequest) => {
    const response = await requestProfileUpdate(payload);
    if (response.session) {
      writeStoredAuthSession(response.session);
    }
    setUser(response.user);

    return response;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      canChangePassword,
      isRefreshing,
      login,
      logout,
      reloadUser,
      signup,
      status,
      updateProfile,
      user
    }),
    [
      canChangePassword,
      isRefreshing,
      login,
      logout,
      reloadUser,
      signup,
      status,
      updateProfile,
      user
    ]
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
