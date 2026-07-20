import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { keepPreviousData, QueryObserver } from "@tanstack/react-query";
import type { AwsConnection, AwsImportAccessState } from "@sketchcatch/types";
import { createAppQueryClient } from "../../components/query/create-query-client";
import { queryKeys } from "../../lib/query-keys";
import { toAwsImportAccessQueryState } from "./connection-queries";

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

test("AWS 가져오기 권한 query는 사용자와 연결별 cache를 사용한다", () => {
  assert.deepEqual(queryKeys.awsImportAccess("user-1", "connection-1"), [
    "user",
    "user-1",
    "connections",
    "aws",
    "connection-1",
    "import-access"
  ]);
  assert.notDeepEqual(
    queryKeys.awsImportAccess("user-1", "connection-1"),
    queryKeys.awsImportAccess("user-1", "connection-2")
  );
  assert.match(connectionQuerySource, /export function useAwsImportAccessQuery/);
  assert.match(connectionQuerySource, /getAwsImportAccessState\(connectionId\)/);
  assert.match(connectionQuerySource, /queryKeys\.awsImportAccess\(userId, connectionId\)/);
});

test("AWS 가져오기 권한 query cache에는 signed Console 링크를 저장하지 않는다", () => {
  const cached = toAwsImportAccessQueryState({
    connectionId: "connection-1",
    operationId: "operation-1",
    nextAction: "check_manager",
    state: {
      connectionId: "connection-1",
      status: "manager_approval_required",
      nextAction: "check_manager",
      cleanupAvailable: true,
      coreReady: false,
      limitedServiceLabels: [],
      lastCheckedAt: null,
      operationId: "operation-1",
      safeSummary: null,
      consoleUrl: "https://nested.example.invalid/?signature=nested-secret",
      providerError: "AccessDenied RequestId nested-provider-secret"
    } as AwsImportAccessState & {
      readonly consoleUrl: string;
      readonly providerError: string;
    },
    consoleUrl: "https://console.example.invalid/?signature=secret",
    managerTemplateUrl: "https://template.example.invalid/?signature=secret"
  });

  assert.deepEqual(Object.keys(cached).sort(), [
    "connectionId",
    "nextAction",
    "operationId",
    "state"
  ]);
  assert.equal(cached.state.cleanupAvailable, true);
  assert.doesNotMatch(
    JSON.stringify(cached),
    /signature|consoleUrl|managerTemplateUrl|providerError|AccessDenied|RequestId/u
  );
});
