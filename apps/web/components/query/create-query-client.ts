import { QueryClient } from "@tanstack/react-query";

export const APP_QUERY_STALE_TIME_MS = 30_000;
export const APP_QUERY_GC_TIME_MS = 5 * 60_000;

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: APP_QUERY_GC_TIME_MS,
        refetchOnReconnect: true,
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: APP_QUERY_STALE_TIME_MS
      }
    }
  });
}

export function shouldClearQueryCache(
  previousUserId: string | null | undefined,
  nextUserId: string | null
): boolean {
  return previousUserId !== undefined && previousUserId !== nextUserId;
}
