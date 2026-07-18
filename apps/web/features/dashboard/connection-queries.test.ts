import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { keepPreviousData, QueryObserver } from "@tanstack/react-query";
import type { AwsConnection } from "@sketchcatch/types";
import { createAppQueryClient } from "../../components/query/create-query-client";
import { queryKeys } from "../../lib/query-keys";

const currentDir = dirname(fileURLToPath(import.meta.url));
const connectionQuerySource = readFileSync(join(currentDir, "connection-queries.ts"), "utf8");

function createConnection(overrides: Partial<AwsConnection> = {}): AwsConnection {
  return {
    id: "connection-1",
    userId: "user-1",
    accountId: null,
    roleArn: null,
    externalId: "external-id",
    region: "ap-northeast-2",
    status: "pending",
    lastVerifiedAt: null,
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    ...overrides
  };
}

test("recovery Settings에서 기본 Settings로 전환할 때 미검증 연결을 placeholder로 남기지 않는다", () => {
  const queryClient = createAppQueryClient();
  const recoveryKey = queryKeys.awsConnections("user-1", true);
  const verifiedOnlyKey = queryKeys.awsConnections("user-1");
  const recoveryRows = [
    createConnection(),
    createConnection({
      id: "verified-connection",
      accountId: "123456789012",
      roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
      status: "verified"
    })
  ];
  queryClient.setQueryData(recoveryKey, recoveryRows);
  let recoveryQueryCalls = 0;
  const observer = new QueryObserver<AwsConnection[]>(queryClient, {
    placeholderData: keepPreviousData,
    queryFn: async () => {
      recoveryQueryCalls += 1;
      return recoveryRows;
    },
    queryKey: recoveryKey,
    staleTime: Infinity
  });
  const unsubscribe = observer.subscribe(() => undefined);

  try {
    assert.deepEqual(observer.getCurrentResult().data, recoveryRows);
    assert.equal(recoveryQueryCalls, 0);

    observer.setOptions({
      enabled: false,
      queryFn: async () => [],
      queryKey: verifiedOnlyKey
    });

    const result = observer.getCurrentResult();
    assert.equal(result.data, undefined);
    assert.equal(result.isPlaceholderData, false);
  } finally {
    unsubscribe();
    queryClient.clear();
  }
});

test("AWS 연결 query는 복구 화면에서만 이전 목록을 유지한다", () => {
  const awsConnectionsQuerySource = connectionQuerySource.slice(
    connectionQuerySource.indexOf("export function useAwsConnectionsQuery"),
    connectionQuerySource.indexOf("export function useGitHubInstallationsQuery")
  );

  assert.match(
    awsConnectionsQuerySource,
    /\.\.\.\(includeUnverified\s*\?\s*\{\s*placeholderData:\s*keepPreviousData\s*\}\s*:\s*\{\s*\}\)/
  );
});
