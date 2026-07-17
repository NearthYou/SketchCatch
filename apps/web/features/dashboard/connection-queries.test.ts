import assert from "node:assert/strict";
import test from "node:test";
import { QueryObserver } from "@tanstack/react-query";
import type { AwsConnection } from "@sketchcatch/types";
import { createAppQueryClient } from "../../components/query/create-query-client";
import { queryKeys } from "../../lib/query-keys";
import { getAwsConnectionsQueryPlaceholderData } from "./connection-queries";

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
  const observer = new QueryObserver(queryClient, {
    placeholderData: getAwsConnectionsQueryPlaceholderData(true),
    queryFn: async () => recoveryRows,
    queryKey: recoveryKey,
    staleTime: Infinity
  });
  const unsubscribe = observer.subscribe(() => undefined);

  queryClient.setQueryData(recoveryKey, recoveryRows);
  assert.deepEqual(observer.getCurrentResult().data, recoveryRows);

  observer.setOptions({
    placeholderData: getAwsConnectionsQueryPlaceholderData(false),
    queryFn: () => new Promise<AwsConnection[]>(() => undefined),
    queryKey: verifiedOnlyKey
  });

  const result = observer.getCurrentResult();
  assert.equal(result.data, undefined);
  assert.equal(result.isPlaceholderData, false);

  unsubscribe();
  queryClient.clear();
});
