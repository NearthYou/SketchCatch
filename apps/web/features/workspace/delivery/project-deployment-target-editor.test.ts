import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createDeploymentTargetDraft,
  createManualEcsWebDraft
} from "./project-deployment-target-state.js";

const editorSource = readFileSync(
  new URL("./ProjectDeploymentTargetEditor.tsx", import.meta.url),
  "utf8"
);
const editorStyles = readFileSync(
  new URL("./project-deployment-target-editor.module.css", import.meta.url),
  "utf8"
);
const targetStateSource = readFileSync(
  new URL("./project-deployment-target-state.ts", import.meta.url),
  "utf8"
);

test("client-side target state imports the ECS helper without a generated JavaScript suffix", () => {
  assert.match(targetStateSource, /from "\.\/ecs-web-build-config-state"/);
  assert.doesNotMatch(targetStateSource, /ecs-web-build-config-state\.js/);
});

test("ECS alone renders one accessible Advanced Settings surface for API and frontend build data", () => {
  assert.match(editorSource, /draft\.runtimeTargetKind === "ecs_fargate" \?/);
  assert.match(editorSource, /<EcsWebAdvancedSettings/);
  assert.match(editorSource, /: \(\s*<ProjectDeploymentTargetAdvancedSettings/);
  assert.match(editorSource, /<strong>Advanced Settings<\/strong>/);

  for (const label of [
    "API source root",
    "Dockerfile path",
    "Container port",
    "Health check path",
    "Frontend source root",
    "Package manifest path",
    "Lockfile path",
    "Package manager",
    "Package manager version",
    "Frontend output path"
  ]) {
    assert.match(editorSource, new RegExp(label));
  }

  assert.match(editorSource, /getEcsWebBuildConfigIssueKeys/);
  assert.match(editorSource, /aria-invalid=/);
  assert.match(editorSource, /updateDeploymentTargetDraftField/);
  assert.match(editorSource, /replaceDeploymentTargetEcsWeb/);
  assert.match(editorSource, /updateEcsWebPackageManager/);
  assert.doesNotMatch(editorSource, />Required runtime secrets</);

  assert.match(editorStyles, /\[aria-invalid="true"\]/);
  assert.match(editorStyles, /var\(--color-error\)/);
  assert.match(editorStyles, /var\(--color-error-surface\)/);
});

test("manual ECS setup reuses API evidence and secrets without guessing frontend paths", () => {
  const original = {
    ...createDeploymentTargetDraft(null, [], null, {
      projectName: "Manual ECS",
      repositoryRevision: "a".repeat(40),
      sourceRoot: "services/api",
      dockerfilePath: "services/api/Dockerfile"
    }),
    healthCheckPath: "/ready",
    ecsRequiredRuntimeSecrets: ["SESSION_SECRET", "API_TOKEN", "SESSION_SECRET"]
  };

  const next = createManualEcsWebDraft(original, "pnpm");

  assert.equal(original.ecsWeb, null);
  assert.equal(next.sourceRoot, "services/api");
  assert.equal(next.evidencePath, "services/api/Dockerfile");
  assert.equal(next.healthCheckPath, "/ready");
  assert.deepEqual(next.ecsWeb?.api, {
    sourceRoot: "services/api",
    dockerfilePath: "services/api/Dockerfile",
    containerPort: 8080,
    healthCheckPath: "/ready",
    requiredRuntimeSecrets: ["API_TOKEN", "SESSION_SECRET"]
  });
  assert.deepEqual(next.ecsWeb?.frontend, {
    sourceRoot: "",
    packageManifestPath: "",
    lockfilePath: "",
    packageManager: "pnpm",
    packageManagerVersion: "11.8.0",
    installPreset: "pnpm_frozen_lockfile",
    buildPreset: "pnpm_build",
    outputPath: ""
  });
});
