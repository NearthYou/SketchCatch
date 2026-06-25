import type { AuthSession } from "@sketchcatch/types";

const AUTH_SESSION_STORAGE_KEY = "sketchcatch.auth.session";

export function readStoredAuthSession(): AuthSession | null {
  if (!canUseStorage()) {
    return null;
  }

  const rawSession = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(rawSession) as Partial<AuthSession>;

    if (
      typeof parsedSession.accessToken !== "string" ||
      typeof parsedSession.refreshToken !== "string" ||
      typeof parsedSession.expiresInSeconds !== "number"
    ) {
      clearStoredAuthSession();
      return null;
    }

    return {
      accessToken: parsedSession.accessToken,
      refreshToken: parsedSession.refreshToken,
      expiresInSeconds: parsedSession.expiresInSeconds
    };
  } catch {
    clearStoredAuthSession();
    return null;
  }
}

export function writeStoredAuthSession(session: AuthSession): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredAuthSession(): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}
