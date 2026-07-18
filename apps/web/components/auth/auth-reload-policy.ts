import { ApiClientError } from "../../lib/api-client";

export type AuthReloadPhase = "background" | "initial";

export function getAuthReloadPhase(hasResolvedInitialSession: boolean): AuthReloadPhase {
  return hasResolvedInitialSession ? "background" : "initial";
}

export function shouldClearAuthAfterReloadError({
  error,
  phase
}: {
  readonly error: unknown;
  readonly phase: AuthReloadPhase;
}): boolean {
  return phase === "initial" || (error instanceof ApiClientError && error.status === 401);
}
