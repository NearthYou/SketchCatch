import type { AuthSession } from "@sketchcatch/types";

let currentAuthSession: AuthSession | null = null;

export function readStoredAuthSession(): AuthSession | null {
  return currentAuthSession;
}

export function writeStoredAuthSession(session: AuthSession): void {
  currentAuthSession = session;
}

export function clearStoredAuthSession(): void {
  currentAuthSession = null;
}
