import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const handoffPanelSource = readFileSync(
  new URL("./CicdHandoffPanel.tsx", import.meta.url),
  "utf8"
);
const consoleSource = readFileSync(
  new URL("./CicdConsoleScreen.tsx", import.meta.url),
  "utf8"
);

test("shows the server-derived handoff configuration in the existing flat PR review", () => {
  const reviewStart = handoffPanelSource.indexOf("CI/CD 설정 및 PR 검토");
  const reviewEnd = handoffPanelSource.indexOf("</dl>", reviewStart);
  const reviewPanelEnd = handoffPanelSource.indexOf("{handoffs.length", reviewEnd);
  assert.ok(reviewStart >= 0 && reviewEnd > reviewStart);
  assert.ok(reviewPanelEnd > reviewEnd);
  const reviewFactsSource = handoffPanelSource.slice(reviewStart, reviewEnd);
  const reviewPanelSource = handoffPanelSource.slice(reviewStart, reviewPanelEnd);

  assert.match(handoffPanelSource, /GitCicdHandoffConfigurationPreview/);
  assert.match(reviewFactsSource, /<dt>RDS<\/dt>/);
  assert.match(reviewFactsSource, /<dt>Static Site URL<\/dt>/);
  assert.match(reviewFactsSource, /<dt>API Base URL<\/dt>/);
  assert.match(reviewFactsSource, /"사용"/);
  assert.match(reviewFactsSource, /"사용 안 함"/);
  assert.match(reviewFactsSource, /"생성하지 않음"/);
  assert.doesNotMatch(reviewFactsSource, /<section|<article|CicdAccordionSection/);
  assert.equal((reviewPanelSource.match(/deploymentPrimaryButton/g) ?? []).length, 1);
});

test("wires create and persisted draft resume through one setup action", () => {
  const creationStart = consoleSource.indexOf("const runHandoffSetup = useCallback");
  const creationEnd = consoleSource.indexOf("useEffect(() =>", creationStart);
  assert.ok(creationStart >= 0 && creationEnd > creationStart);
  const creationSource = consoleSource.slice(creationStart, creationEnd);
  const catchStart = creationSource.indexOf("} catch (error) {");
  const catchEnd = creationSource.indexOf("} finally {", catchStart);
  assert.ok(catchStart >= 0 && catchEnd > catchStart);
  const catchSource = creationSource.slice(catchStart, catchEnd);

  assert.match(consoleSource, /hasConfigurationPreview:\s*configurationPreview !== null/);
  assert.match(creationSource, /configurationPreview,/);
  assert.match(creationSource, /existingHandoff\s*\?\s*await setupGitCicdHandoff/);
  assert.match(creationSource, /: await createGitCicdHandoff/);
  assert.match(consoleSource, /configurationPreview=\{configurationPreview\}/);
  assert.match(catchSource, /await refreshHandoffs\(\)/);
  assert.match(catchSource, /await handleGitCicdHandoffCreationError\(/);
  assert.match(catchSource, /onRefreshDeliveryProfile/);
  assert.doesNotMatch(catchSource, /setIsHandoffReviewOpen\(false\)/);
  assert.doesNotMatch(catchSource, /createGitCicdHandoff\(/);
  assert.equal((consoleSource.match(/createGitCicdHandoff\(\{/g) ?? []).length, 1);
  assert.equal(
    (consoleSource.match(/setupGitCicdHandoff\(existingHandoff\.id\)/g) ?? []).length,
    1
  );
});

test("wires the failed Pipeline retry CTA to the existing setup action", () => {
  const activationStart = consoleSource.indexOf("function activateCurrentTask(): void");
  const activationEnd = consoleSource.indexOf("const isCurrentTaskUnavailable", activationStart);
  assert.ok(activationStart >= 0 && activationEnd > activationStart);
  const activationSource = consoleSource.slice(activationStart, activationEnd);

  assert.match(
    activationSource,
    /if \(action\.kind === "retry_setup"\) \{\s*void runHandoffSetup\(\);\s*return;/
  );
  assert.match(
    consoleSource,
    /presentation\.currentTask\.action\.kind === "retry_setup" && !canCreateHandoff/
  );
});

test("shows build verification and deployment URLs as Phase 3 evidence", () => {
  assert.match(handoffPanelSource, /title="Repository 빌드 검증"/);
  assert.match(handoffPanelSource, /title="Static Site URL"/);
  assert.match(handoffPanelSource, /title="API Base URL"/);
  assert.match(handoffPanelSource, /getCicdBuildVerificationPresentation/);
  assert.match(handoffPanelSource, /getCicdDeploymentOutputPresentation/);
  assert.match(consoleSource, /buildVerification=\{deliveryProfile\.buildVerification\}/);
  assert.match(consoleSource, /deploymentTarget=\{target\}/);
  assert.match(consoleSource, /deploymentSucceeded=/);
  assert.match(handoffPanelSource, /배포에서 Plan 검토하기/);
});
