import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const settingsSource = readFileSync(
  fileURLToPath(
    new URL("../../app/dashboard/settings/settings-dashboard-client.tsx", import.meta.url)
  ),
  "utf8"
);

test("pending AWS connections can resume Role verification after a page reload", () => {
  assert.match(
    settingsSource,
    /async function resumeConnectionSetup\(connection: AwsConnection\): Promise<void>/
  );
  assert.match(
    settingsSource,
    /getAwsConnectionCloudFormationTemplate\(\{\s*connectionId: connection\.id\s*\}\)/s
  );
  assert.match(settingsSource, /setSetupConnection\(connection\)/);
  assert.match(
    settingsSource,
    /onClick=\{\(\) => void resumeConnectionSetup\(connection\)\}[^>]*>\s*설정 계속\s*<\/button>/s
  );
});
