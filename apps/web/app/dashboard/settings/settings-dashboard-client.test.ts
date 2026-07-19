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
    /awsConnectionId:\s*getSingleSearchParam\(searchParams\.getAll\("awsConnectionId"\)\)/
  );
});

test("Pending GitHub authorization identifies the exact AWS connection to update", () => {
  assert.match(
    clientSource,
    /getAwsCodeConnectionDisplayName\(connection\.codeConnection\.awsConnectionId\)/
  );
  assert.match(clientSource, /Pending 연결을 선택한 뒤/);
  assert.match(clientSource, /Update pending connection/);
});

test("Settings refreshes an existing CodeConnection from AWS before presenting its status", () => {
  const loadStart = clientSource.indexOf("void Promise.all(");
  const loadEnd = clientSource.indexOf("return () =>", loadStart);
  const loadSource = clientSource.slice(loadStart, loadEnd);

  assert.ok(loadStart > -1);
  assert.ok(loadEnd > loadStart);
  assert.match(loadSource, /await getAwsCodeConnection\(connection\.id\)/);
  assert.match(loadSource, /await refreshAwsCodeConnection\(connection\.id\)/);
  assert.match(loadSource, /catch \(error\) \{/);
  assert.match(loadSource, /return \[connection\.id, savedConnection\] as const/);
  assert.match(loadSource, /AWS 상태를 다시 확인하지 못해 저장된 연결 상태를 표시합니다/);
});
