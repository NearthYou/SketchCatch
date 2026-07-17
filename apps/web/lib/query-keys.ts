const userRoot = (userId: string) => ["user", userId] as const;
const awsConnectionsRoot = (userId: string) =>
  [...userRoot(userId), "connections", "aws"] as const;

export const queryKeys = {
  connections: (userId: string) => [...userRoot(userId), "connections"] as const,
  awsConnectionsRoot,
  awsConnections: (userId: string, includeUnverified = false) =>
    [...awsConnectionsRoot(userId), includeUnverified ? "all-statuses" : "verified-only"] as const,
  costs: (userId: string) => [...userRoot(userId), "costs"] as const,
  costEstimates: (userId: string, period: string, expectedUserCount: number) =>
    [...userRoot(userId), "costs", "estimate", period, expectedUserCount] as const,
  costUsage: (userId: string, range: string, connectionId: string) =>
    [...userRoot(userId), "costs", "usage", range, connectionId] as const,
  dashboard: (userId: string) => [...userRoot(userId), "dashboard"] as const,
  dashboardOverview: (userId: string) => [...userRoot(userId), "dashboard", "overview"] as const,
  githubInstallations: (userId: string) =>
    [...userRoot(userId), "connections", "github"] as const,
  projects: (userId: string) => [...userRoot(userId), "projects", "list"] as const,
  user: (userId: string) => userRoot(userId)
} as const;
