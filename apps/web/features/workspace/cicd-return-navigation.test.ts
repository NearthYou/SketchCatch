import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getSafeCicdReturnPath } from "./cicd-return-navigation";

const settingsPageSource = readFileSync(
  new URL("../../app/dashboard/projects/[projectId]/settings/page.tsx", import.meta.url),
  "utf8"
);
const repositoryPageSource = readFileSync(
  new URL("../../app/dashboard/projects/[projectId]/repository/page.tsx", import.meta.url),
  "utf8"
);
const deploymentTargetClientSource = readFileSync(
  new URL("./delivery/ProjectDeploymentTargetEditor.tsx", import.meta.url),
  "utf8"
);
const monitoringClientSource = readFileSync(
  new URL(
    "../../app/projects/[projectId]/settings/project-cicd-monitoring-settings-client.tsx",
    import.meta.url
  ),
  "utf8"
);
const repositoryClientSource = readFileSync(
  new URL(
    "../../app/projects/[projectId]/repository/project-source-repository-client.tsx",
    import.meta.url
  ),
  "utf8"
);

test("accepts the current project's workspace CI/CD return path", () => {
  const returnTo =
    "/workspace?projectId=project-1&projectName=demo&deploymentView=cicd&readinessKey=deployment_target";

  assert.equal(getSafeCicdReturnPath({ rawReturnTo: returnTo, projectId: "project-1" }), returnTo);
});

test("rejects external, non-workspace, and cross-project return paths", () => {
  const rejectedReturnPaths = [
    "https://evil.example/workspace?projectId=project-1",
    "//evil.example/workspace",
    "javascript:alert(1)",
    "/dashboard",
    "/workspace?projectId=another-project"
  ];

  for (const rawReturnTo of rejectedReturnPaths) {
    assert.equal(getSafeCicdReturnPath({ rawReturnTo, projectId: "project-1" }), null, rawReturnTo);
  }
});

test("returns only the workspace pathname and search", () => {
  assert.equal(
    getSafeCicdReturnPath({
      rawReturnTo: "/workspace?projectId=project-1&deploymentView=cicd#ignored",
      projectId: "project-1"
    }),
    "/workspace?projectId=project-1&deploymentView=cicd"
  );
});

test("legacy settings route opens the Workspace Delivery panel", () => {
  assert.match(settingsPageSource, /startMode:\s*"delivery"/);
  assert.match(settingsPageSource, /redirect\(`\/workspace\?\$\{query\.toString\(\)\}`\)/);
  assert.doesNotMatch(settingsPageSource, /getSafeCicdReturnPath|safeReturnTo|readinessKey/);
});

test("repository page sanitizes returnTo for source repository readiness only", () => {
  assert.match(repositoryPageSource, /getSafeCicdReturnPath/);
  assert.match(
    repositoryPageSource,
    /safeReturnTo=\{readinessKey === "source_repository" \? safeReturnTo : null\}/
  );
});

test("shared target editor and monitoring client replace the route only after successful updates", () => {
  for (const source of [deploymentTargetClientSource, monitoringClientSource]) {
    assert.match(source, /useRouter/);
    assert.match(source, /safeReturnTo/);
    assert.match(source, /router\.replace\(safeReturnTo\)/);
  }

  assert.ok(
    deploymentTargetClientSource.indexOf("setTarget(saved)") <
      deploymentTargetClientSource.indexOf('setMessage("배포 타깃을 저장했습니다.")')
  );
  assert.ok(
    deploymentTargetClientSource.indexOf('setMessage("배포 타깃을 저장했습니다.")') <
      deploymentTargetClientSource.indexOf("router.replace(safeReturnTo)")
  );
  assert.ok(
    monitoringClientSource.indexOf("setConfig(saved)") <
      monitoringClientSource.indexOf('setMessage("CI/CD branch와 경로를 저장했습니다.")')
  );
  assert.ok(
    monitoringClientSource.indexOf('setMessage("CI/CD branch와 경로를 저장했습니다.")') <
      monitoringClientSource.indexOf("router.replace(safeReturnTo)")
  );
});

test("repository connections return after first connect or confirmed change, but analysis does not", () => {
  assert.match(repositoryClientSource, /useRouter/);
  assert.match(repositoryClientSource, /safeReturnTo/);
  assert.match(repositoryClientSource, /setStatusMessage/);
  assert.match(
    repositoryClientSource,
    /connectRepository\(repository, activeRepository === null\)/
  );
  assert.match(repositoryClientSource, /connectRepository\(pendingRepository, true\)/);

  const statusIndex = repositoryClientSource.indexOf(
    'setStatusMessage("GitHub repository를 프로젝트에 연결했습니다.")'
  );
  const replaceIndex = repositoryClientSource.indexOf("router.replace(safeReturnTo)");
  assert.ok(statusIndex >= 0 && statusIndex < replaceIndex);

  const analysisFunction = repositoryClientSource.match(
    /async function runRepositoryAnalysis\(\): Promise<void> \{[\s\S]*?\n {2}\}/
  );
  assert.ok(analysisFunction);
  assert.doesNotMatch(analysisFunction[0], /router\.replace/);
});

test("repository selection waits for the server repository load before deciding it is a first connection", () => {
  assert.match(
    repositoryClientSource,
    /function requestRepositoryConnection[\s\S]*?if \(loadState !== "idle"\) return;/
  );
  assert.match(
    repositoryClientSource,
    /hasGitHubAccountConnection &&\s*loadState === "idle" &&\s*\(!activeRepository/
  );
});
