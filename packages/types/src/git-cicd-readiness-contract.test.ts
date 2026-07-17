import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type {
  GitCicdDeploymentTargetReadinessKey,
  GitCicdReadinessAction,
  GitCicdReadinessItemKey,
  GitCicdReadinessSnapshot,
  GitCicdReadinessStatus
} from "./index.js";

type IsExactUnion<Actual, Expected> = [Actual] extends [Expected]
  ? [Expected] extends [Actual]
    ? true
    : false
  : false;

const exactUnionAssertions: [
  IsExactUnion<
    GitCicdReadinessItemKey,
    | "approved_apply_plan"
    | "source_repository"
    | "monitoring_config"
    | "deployment_target"
  >,
  IsExactUnion<
    GitCicdDeploymentTargetReadinessKey,
    "aws_connection" | "build_config" | "runtime_config" | "output_url"
  >,
  IsExactUnion<GitCicdReadinessStatus, "ready" | "action_required">,
  IsExactUnion<
    GitCicdReadinessAction,
    | "approve_apply_plan"
    | "select_repository"
    | "confirm_monitoring_config"
    | "select_aws_connection"
    | "confirm_build_config"
    | "inspect_runtime_outputs"
    | "inspect_output_url"
  >
] = [true, true, true, true];

const readinessItemKeys = [
  "approved_apply_plan",
  "source_repository",
  "monitoring_config",
  "deployment_target"
] as const satisfies readonly GitCicdReadinessItemKey[];

const deploymentTargetKeys = [
  "aws_connection",
  "build_config",
  "runtime_config",
  "output_url"
] as const satisfies readonly GitCicdDeploymentTargetReadinessKey[];

// @ts-expect-error readiness item keys are a closed union
const invalidReadinessItemKey: GitCicdReadinessItemKey = "other_item";
// @ts-expect-error deployment target keys are a closed union
const invalidDeploymentTargetKey: GitCicdDeploymentTargetReadinessKey = "provider";
// @ts-expect-error refreshing is Web request state, not server readiness state
const invalidRefreshingStatus: GitCicdReadinessStatus = "refreshing";
// @ts-expect-error error is Web request state, not server readiness state
const invalidErrorStatus: GitCicdReadinessStatus = "error";
// @ts-expect-error readiness actions are a closed union
const invalidReadinessAction: GitCicdReadinessAction = "refresh_readiness";

const snapshot: GitCicdReadinessSnapshot = {
  projectId: "project-1",
  checkedAt: "2026-07-17T00:00:00.000Z",
  ready: false,
  requiredActionCount: 1,
  sourceDeploymentId: "deployment-1",
  approvedApplyPlanArtifactId: "apply-plan-1",
  items: [
    {
      key: "deployment_target",
      label: "배포 타깃",
      status: "action_required",
      completedCount: 3,
      totalCount: 4,
      missingKeys: ["aws_connection"],
      action: "select_aws_connection"
    }
  ]
};

test("defines the Git/CI/CD readiness snapshot contract", () => {
  const packageDirectory = fileURLToPath(new URL("..", import.meta.url));
  const typecheck = spawnSync(
    "pnpm",
    [
      "exec",
      "tsc",
      "--noEmit",
      "--ignoreConfig",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--allowImportingTsExtensions",
      "--strict",
      "--skipLibCheck",
      "--types",
      "node",
      "src/git-cicd-readiness-contract.test.ts"
    ],
    { cwd: packageDirectory, encoding: "utf8" }
  );

  assert.equal(typecheck.status, 0, `${typecheck.stdout}${typecheck.stderr}`);
  assert.deepEqual(exactUnionAssertions, [true, true, true, true]);
  assert.deepEqual(readinessItemKeys, [
    "approved_apply_plan",
    "source_repository",
    "monitoring_config",
    "deployment_target"
  ]);
  assert.deepEqual(deploymentTargetKeys, [
    "aws_connection",
    "build_config",
    "runtime_config",
    "output_url"
  ]);
  assert.equal(snapshot.ready, false);
  assert.deepEqual(snapshot.items[0]?.missingKeys, ["aws_connection"]);
  assert.deepEqual(
    [
      invalidReadinessItemKey,
      invalidDeploymentTargetKey,
      invalidRefreshingStatus,
      invalidErrorStatus,
      invalidReadinessAction
    ],
    ["other_item", "provider", "refreshing", "error", "refresh_readiness"]
  );
});
