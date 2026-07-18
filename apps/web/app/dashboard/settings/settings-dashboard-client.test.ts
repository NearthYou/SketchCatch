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
