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

// gg: mutation 뒤 선택한 연결의 safe 상태만 다시 읽고 다른 연결의 wizard는 건드리지 않습니다.
export async function invalidateAwsImportAccessQueries(
  queryClient: QueryClient,
  userId: string | null | undefined,
  connectionId: string
): Promise<void> {
  if (!userId || !connectionId) {
    return;
  }

  await queryClient.invalidateQueries({
    exact: true,
    queryKey: queryKeys.awsImportAccess(userId, connectionId)
  });
}
