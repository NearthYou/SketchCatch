import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const clientSource = readFileSync(join(currentDir, "settings-dashboard-client.tsx"), "utf8");

test("Settings client passes one AWS connection ID into recovery navigation", () => {
  assert.match(
    clientSource,
    /const recoveryAwsConnectionId = getSingleSearchParam\([\s\S]*?searchParams\.getAll\("awsConnectionId"\)[\s\S]*?\);/
  );
  assert.match(clientSource, /awsConnectionId:\s*recoveryAwsConnectionId/);
});

test("Pending GitHub authorization identifies the exact AWS connection to update", () => {
  assert.match(
    clientSource,
    /getAwsCodeConnectionDisplayName\(connection\.codeConnection\.awsConnectionId\)/
  );
  assert.match(clientSource, /Pending 연결을 선택한 뒤/);
  assert.match(clientSource, /Update pending connection/);
});

test("Settings falls back to a saved CodeConnection without reporting a global AWS connection error", () => {
  const loadStart = clientSource.indexOf("void Promise.all(");
  const loadEnd = clientSource.indexOf("return () =>", loadStart);
  const loadSource = clientSource.slice(loadStart, loadEnd);
  const refreshStart = loadSource.indexOf("try {");
  const fallbackStart = loadSource.indexOf(
    "return [connection.id, savedConnection] as const",
    refreshStart
  );
  const refreshSource = loadSource.slice(refreshStart, fallbackStart);


  assert.ok(loadStart > -1);
  assert.ok(loadEnd > loadStart);
  assert.ok(refreshStart > -1);
  assert.ok(fallbackStart > refreshStart);
  assert.match(loadSource, /await getAwsCodeConnection\(connection\.id\)/);
  assert.match(loadSource, /await refreshAwsCodeConnection\(connection\.id\)/);
  assert.match(loadSource, /catch \{/);
  assert.match(loadSource, /return \[connection\.id, savedConnection\] as const/);
  assert.match(loadSource, /AWS 상태를 다시 확인하지 못해 저장된 연결 상태를 표시합니다/);
  assert.doesNotMatch(refreshSource, /setErrorMessage/);
});

test("Settings keeps Reverse return behind the selected connection import-access wizard", () => {
  assert.match(clientSource, /<AwsImportAccessWizard/);
  assert.match(clientSource, /connectionId=\{connection\.id\}/);
  assert.match(clientSource, /connectionStatus=\{connection\.status\}/);
  assert.match(clientSource, /recoveryAwsConnectionId === connection\.id/);
  assert.match(clientSource, /onContinue:\s*returnToReverseEngineeringAfterRecovery/);
  assert.doesNotMatch(
    clientSource,
    /connection\.status === "verified"\s*\?\s*\([\s\S]{0,200}<AwsImportAccessWizard/
  );

  for (const functionName of ["verifyCreatedRole", "retestConnection", "reverifyConnection"]) {
    const start = clientSource.indexOf(`async function ${functionName}`);
    const end = clientSource.indexOf("\n  }", start);
    const source = clientSource.slice(start, end);
    assert.ok(start > -1, functionName);
    assert.doesNotMatch(source, /returnToReverseEngineeringAfterRecovery/u, functionName);
  }
});
