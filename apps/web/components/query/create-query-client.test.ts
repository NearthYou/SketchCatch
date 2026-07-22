import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_QUERY_GC_TIME_MS,
  APP_QUERY_STALE_TIME_MS,
  createAppQueryClient,
  shouldClearQueryCache
} from "./create-query-client";
import { queryKeys } from "../../lib/query-keys";
import {
  invalidateAwsConnectionQueries,
  invalidateProjectQueries
} from "./dashboard-query-invalidation";

test("app query defaults keep recent data without refetching on window focus", () => {
  const queryClient = createAppQueryClient();
  const queries = queryClient.getDefaultOptions().queries;

  assert.equal(queries?.staleTime, APP_QUERY_STALE_TIME_MS);
  assert.equal(queries?.gcTime, APP_QUERY_GC_TIME_MS);
  assert.equal(queries?.refetchOnWindowFocus, false);
  assert.equal(queries?.refetchOnReconnect, true);
  assert.equal(queries?.retry, 1);
  queryClient.clear();
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
  assert.notDeepEqual(
    queryKeys.costEstimates("user-1", "month", 1000),
    queryKeys.costEstimates("user-1", "week", 1000)
  );
  assert.notDeepEqual(
    queryKeys.costUsage("user-1", "30d", "connection-1"),
    queryKeys.costUsage("user-1", "30d", "connection-2")
  );
});

test("project invalidation stays inside the active user cache", async () => {
  const queryClient = createAppQueryClient();
  const userOneProjectsKey = queryKeys.projects("user-1");
  const userOneCostsKey = queryKeys.costEstimates("user-1", "month", 1000);
  const userTwoProjectsKey = queryKeys.projects("user-2");

  queryClient.setQueryData(userOneProjectsKey, []);
  queryClient.setQueryData(userOneCostsKey, {});
  queryClient.setQueryData(userTwoProjectsKey, []);

  await invalidateProjectQueries(queryClient, "user-1");

  assert.equal(queryClient.getQueryState(userOneProjectsKey)?.isInvalidated, true);
  assert.equal(queryClient.getQueryState(userOneCostsKey)?.isInvalidated, true);
  assert.equal(queryClient.getQueryState(userTwoProjectsKey)?.isInvalidated, false);
  queryClient.clear();
});

test("AWS connection invalidation refreshes verified and recovery connection caches without crossing users", async () => {
  const queryClient = createAppQueryClient();
  const verifiedConnectionKey = queryKeys.awsConnections("user-1");
  const recoveryConnectionKey = queryKeys.awsConnections("user-1", true);
  const dashboardKey = queryKeys.dashboardOverview("user-1");
  const costKey = queryKeys.costUsage("user-1", "30d", "connection-1");

  assert.notDeepEqual(verifiedConnectionKey, recoveryConnectionKey);

  queryClient.setQueryData(verifiedConnectionKey, []);
  queryClient.setQueryData(recoveryConnectionKey, []);
  queryClient.setQueryData(dashboardKey, {});
  queryClient.setQueryData(costKey, {});

  await invalidateAwsConnectionQueries(queryClient, "user-1");

  assert.equal(queryClient.getQueryState(verifiedConnectionKey)?.isInvalidated, true);
  assert.equal(queryClient.getQueryState(recoveryConnectionKey)?.isInvalidated, true);
  assert.equal(queryClient.getQueryState(dashboardKey)?.isInvalidated, true);
  assert.equal(queryClient.getQueryState(costKey)?.isInvalidated, true);
  queryClient.clear();
});
