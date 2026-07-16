import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_QUERY_GC_TIME_MS,
  APP_QUERY_STALE_TIME_MS,
  createAppQueryClient,
  shouldClearQueryCache
} from "./create-query-client";
import { queryKeys } from "../../lib/query-keys";

test("app query defaults keep recent data without refetching on window focus", () => {
  const queryClient = createAppQueryClient();
  const queries = queryClient.getDefaultOptions().queries;

  assert.equal(queries?.staleTime, APP_QUERY_STALE_TIME_MS);
  assert.equal(queries?.gcTime, APP_QUERY_GC_TIME_MS);
  assert.equal(queries?.refetchOnWindowFocus, false);
  assert.equal(queries?.refetchOnReconnect, true);
  assert.equal(queries?.retry, 1);
});

test("query cache is cleared only after a resolved user identity changes", () => {
  assert.equal(shouldClearQueryCache(undefined, null), false);
  assert.equal(shouldClearQueryCache(undefined, "user-1"), false);
  assert.equal(shouldClearQueryCache(null, "user-1"), true);
  assert.equal(shouldClearQueryCache("user-1", "user-1"), false);
  assert.equal(shouldClearQueryCache("user-1", "user-2"), true);
  assert.equal(shouldClearQueryCache("user-1", null), true);
});

test("server-state query keys are isolated by user", () => {
  assert.notDeepEqual(queryKeys.projects("user-1"), queryKeys.projects("user-2"));
  assert.deepEqual(queryKeys.dashboardOverview("user-1"), [
    "user",
    "user-1",
    "dashboard",
    "overview"
  ]);
});
