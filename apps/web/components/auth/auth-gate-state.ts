type AuthGateStatus = "authenticated" | "loading" | "unauthenticated";

export function shouldShowAuthenticatedShellFallback(
  status: AuthGateStatus,
  hasUser: boolean
): boolean {
  return status !== "authenticated" && !hasUser;
}
