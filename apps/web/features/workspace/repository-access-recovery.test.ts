import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("Direct Deployment shows exact Repository evidence and recovery actions after checkout failure", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./DirectDeploymentScreen.tsx", import.meta.url)),
    "utf8"
  );

  assert.match(source, /repositoryVerificationStatus === "failed"/);
  assert.match(source, /repositoryVerificationRequestedCommitSha/);
  assert.match(source, /repositoryVerificationResolvedCommitSha/);
  assert.match(source, /GitHub Repository 권한 확인/);
  assert.match(source, /AWS GitHub 권한 다시 연결/);
  assert.match(source, /Repository 빌드 권한 다시 확인/);
  assert.match(source, /runDeploymentPlan\(selectedDeployment\.id\)/);
  assert.doesNotMatch(source, /verifyRepositoryAccessForPlan/);
  assert.match(
    source,
    /finally\s*{\s*actionInFlightRef\.current = false;\s*setActiveProgress\(null\)/
  );
});
