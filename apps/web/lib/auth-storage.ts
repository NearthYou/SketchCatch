import type { AuthSession } from "@sketchcatch/types";

let currentAuthSession: AuthSession | null = null;

export function readStoredAuthSession(): AuthSession | null {
  if (!canUseBrowserSessionMemory()) {
    return null;
  }

  return currentAuthSession;
}

export function writeStoredAuthSession(session: AuthSession): void {
  if (!canUseBrowserSessionMemory()) {
    return;
  }

  currentAuthSession = session;
}

export function clearStoredAuthSession(): void {
  if (!canUseBrowserSessionMemory()) {
    return;
  }

  currentAuthSession = null;
}

function canUseBrowserSessionMemory(): boolean {
  return typeof window !== "undefined";
}
