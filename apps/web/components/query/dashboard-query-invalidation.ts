import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";

export async function invalidateProjectQueries(
  queryClient: QueryClient,
  userId: string | null | undefined
): Promise<void> {
  if (!userId) {
    return;
  }

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.projects(userId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(userId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.costs(userId) })
  ]);
}

export async function invalidateAwsConnectionQueries(
  queryClient: QueryClient,
  userId: string | null | undefined
): Promise<void> {
  if (!userId) {
    return;
  }

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.awsConnectionsRoot(userId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(userId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.costs(userId) })
  ]);
}
