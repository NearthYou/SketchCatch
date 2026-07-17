type DashboardAuthStatus = "authenticated" | "loading" | "unauthenticated";

export function shouldShowDashboardSessionState(
  status: DashboardAuthStatus,
  hasUser: boolean
): boolean {
  return status !== "authenticated" && !hasUser;
}
