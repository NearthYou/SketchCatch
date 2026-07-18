import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReverseEngineeringScan } from "@sketchcatch/types";
import { ReverseEngineeringScanHistoryPanel } from "./ReverseEngineeringScanHistoryPanel";

test("scan history labels a preserved scan whose AWS connection was deleted", () => {
  const scan: ReverseEngineeringScan = {
    id: "scan-1",
    projectId: "project-1",
    awsConnectionId: null,
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["VPC"],
    status: "completed",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:01:00.000Z",
    startedAt: "2026-07-18T00:00:00.000Z",
    completedAt: "2026-07-18T00:01:00.000Z",
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  };

  const html = renderToStaticMarkup(
    <ReverseEngineeringScanHistoryPanel
      activeScanId={null}
      canRescan={false}
      isLoading={false}
      isStaleResult={false}
      onCancelScan={() => undefined}
      onDeleteScan={() => undefined}
      onOpenScan={() => undefined}
      onRescan={() => undefined}
      scans={[scan]}
    />
  );

  assert.match(html, /연결 삭제됨/);
});
