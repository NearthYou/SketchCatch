import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTemplateDiagramJson,
  type ConfirmedBuildConfig,
  type DiagramJson
} from "@sketchcatch/types";
import {
  DeploymentPreparationError,
  getDeploymentPreparationErrorMessage,
  getDeploymentRuntimeSecretPrerequisite,
  getDeploymentTargetPrerequisite
} from "./deployment-preparation-error";

test("deployment preparation exposes the failed stage instead of a generic message", () => {
  const error = new DeploymentPreparationError({
    cause: new Error("upload failed"),
    stage: "asset_upload"
  });

  assert.equal(
    getDeploymentPreparationErrorMessage(error, "프로젝트 저장과 배포 준비에 실패했습니다."),
    "Terraform 파일 업로드 단계에서 실패했습니다. 업로드 권한과 네트워크 연결을 확인한 뒤 다시 시도해 주세요."
  );
});

test("deployment preparation preserves a safe, specific draft-save message", () => {
  const error = new DeploymentPreparationError({
    cause: new Error("draft response was stale"),
    stage: "project_draft_save"
  });

  assert.equal(
    getDeploymentPreparationErrorMessage(error, "프로젝트 저장과 배포 준비에 실패했습니다."),
    "프로젝트 저장 단계에서 실패했습니다. 보드 변경사항을 다시 저장한 뒤 배포 준비를 실행해 주세요."
  );
});

test("full-stack preparation requires a confirmed target while infrastructure does not", () => {
  const diagramJson: DiagramJson = {
    nodes: [
      {
        id: "ecs-service",
        kind: "resource",
        type: "ECS_SERVICE",
        label: "ECS Service",
        position: { x: 0, y: 0 },
        size: { width: 200, height: 120 },
        locked: false,
        zIndex: 0,
        parameters: {
          resourceType: "ECS_SERVICE",
          resourceName: "app",
          fileName: "main.tf",
          values: {}
        }
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  assert.deepEqual(
    getDeploymentTargetPrerequisite({
      awsConnectionId: "connection-1",
      diagramJson,
      scope: "full_stack",
      target: null
    }),
    {
      message:
        "전체 스택 배포 전에 Source Repository와 프로젝트 배포 타깃을 연결하고 ECS 빌드 설정을 저장해 주세요.",
      title: "전체 스택 선행 설정 필요"
    }
  );
  assert.deepEqual(
    getDeploymentTargetPrerequisite({
      awsConnectionId: "connection-1",
      diagramJson,
      scope: "auto",
      target: null
    }),
    {
      message:
        "전체 스택 배포 전에 Source Repository와 프로젝트 배포 타깃을 연결하고 ECS 빌드 설정을 저장해 주세요.",
      title: "전체 스택 선행 설정 필요"
    }
  );
  assert.equal(
    getDeploymentTargetPrerequisite({
      awsConnectionId: "connection-1",
      diagramJson,
      scope: "infrastructure",
      target: null
    }),
    null
  );
});

test("application preparation requires the target to use the selected AWS connection", () => {
  const issue = getDeploymentTargetPrerequisite({
    awsConnectionId: "new-connection",
    diagramJson: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    scope: "application",
    target: {
      connectionId: "old-connection",
      confirmedBuildConfig: createConfirmedBuildConfig()
    }
  });

  assert.deepEqual(issue, {
    message:
      "프로젝트 배포 타깃이 다른 AWS 연결을 사용하고 있습니다. 현재 AWS 연결로 배포 타깃을 다시 저장해 주세요.",
    title: "AWS 연결과 배포 타깃 불일치"
  });
});

test("full-stack preparation sends an incomplete required runtime Secret back to Terraform editing", () => {
  const issue = getDeploymentRuntimeSecretPrerequisite({
    diagramJson: createIncompleteRuntimeSecretDiagram(),
    terraformFiles: [],
    scope: "full_stack",
    target: createRequiredRuntimeSecretTarget()
  });

  assert.deepEqual(issue, {
    action: "terraform_edit",
    message:
      "Repository가 요구하는 CHECK_IN_SIGNING_SECRET의 생성, Secrets Manager 저장, ECS 실행 역할 권한, Task 주입 연결이 현재 Terraform 초안에 완성되지 않았습니다. 현재 Terraform 코드를 수정·저장한 뒤 다시 검증해 주세요.",
    title: "Repository와 Terraform 시크릿 연결 불일치"
  });
});

test("full-stack preparation rejects a partial runtime Secret contract", () => {
  const issue = getDeploymentRuntimeSecretPrerequisite({
    diagramJson: createIncompleteRuntimeSecretDiagram(true),
    terraformFiles: [],
    scope: "full_stack",
    target: createRequiredRuntimeSecretTarget()
  });

  assert.equal(issue?.action, "terraform_edit");
  assert.equal(issue?.title, "Repository와 Terraform 시크릿 연결 불일치");
});

test("full-stack preparation accepts the complete AI Fixed Template runtime Secret contract", () => {
  const issue = getDeploymentRuntimeSecretPrerequisite({
    diagramJson: buildTemplateDiagramJson("ecs-fargate-container-app", {
      projectSlug: "audience-live-check",
      shortId: "ai-fixed-template",
      requiredRuntimeSecrets: ["CHECK_IN_SIGNING_SECRET"]
    }),
    terraformFiles: [],
    scope: "full_stack",
    target: createRequiredRuntimeSecretTarget()
  });

  assert.equal(issue, null);
});

test("full-stack preparation accepts complete authored Terraform when utility blocks are absent from the Board", () => {
  const issue = getDeploymentRuntimeSecretPrerequisite({
    diagramJson: createIncompleteRuntimeSecretDiagram(),
    terraformFiles: [{ fileName: "main.tf", terraformCode: createCompleteRuntimeSecretTerraform() }],
    scope: "full_stack",
    target: createRequiredRuntimeSecretTarget()
  });

  assert.equal(issue, null);
});

test("full-stack preparation treats prepared Terraform as authoritative over a complete Board", () => {
  const issue = getDeploymentRuntimeSecretPrerequisite({
    diagramJson: buildTemplateDiagramJson("ecs-fargate-container-app", {
      projectSlug: "audience-live-check",
      shortId: "stale-board",
      requiredRuntimeSecrets: ["CHECK_IN_SIGNING_SECRET"]
    }),
    terraformFiles: [
      {
        fileName: "main.tf",
        terraformCode: 'resource "aws_ecs_service" "app" {}'
      }
    ],
    scope: "full_stack",
    target: createRequiredRuntimeSecretTarget()
  });

  assert.equal(issue?.action, "terraform_edit");
});

test("full-stack preparation rejects incomplete or cross-wired authored Terraform Secret chains", () => {
  const completeTerraform = createCompleteRuntimeSecretTerraform();
  const cases = [
    completeTerraform.replace(
      "secret_string = random_password.check_in_signing.result",
      'secret_string = "not-generated"'
    ),
    completeTerraform.replace(
      "aws_secretsmanager_secret.check_in_signing.arn",
      "aws_secretsmanager_secret.unrelated.arn"
    ),
    completeTerraform.replace(
      "execution_role_arn    = aws_iam_role.execution.arn",
      "execution_role_arn    = aws_iam_role.unrelated.arn"
    ),
    completeTerraform.replace(
      "task_definition = aws_ecs_task_definition.task.arn",
      "task_definition = aws_ecs_task_definition.unrelated.arn"
    )
  ];

  for (const [index, terraformCode] of cases.entries()) {
    const issue = getDeploymentRuntimeSecretPrerequisite({
      diagramJson: createIncompleteRuntimeSecretDiagram(),
      terraformFiles: [{ fileName: "main.tf", terraformCode }],
      scope: "full_stack",
      target: createRequiredRuntimeSecretTarget()
    });

    assert.equal(issue?.action, "terraform_edit", String(index));
  }
});

test("full-stack preparation rejects cross-wired runtime Secret resources", () => {
  const mutations: ReadonlyArray<{
    label: string;
    mutate: (diagramJson: DiagramJson) => void;
  }> = [
    {
      label: "generated material",
      mutate: (diagramJson) => {
        const secretVersion = findResourceNode(
          diagramJson,
          "aws_secretsmanager_secret_version"
        );
        secretVersion.parameters!.values.secretString = "random_password.unrelated.result";
      }
    },
    {
      label: "execution role policy",
      mutate: (diagramJson) => {
        const policyNode = findResourceNode(diagramJson, "aws_iam_role_policy");
        const policy = JSON.parse(String(policyNode.parameters!.values.policy)) as {
          Statement: Array<Record<string, unknown>>;
        };
        policy.Statement[0]!.Resource =
          "${aws_secretsmanager_secret.unrelated.arn}";
        policyNode.parameters!.values.policy = JSON.stringify(policy);
      }
    },
    {
      label: "task execution role",
      mutate: (diagramJson) => {
        const task = findResourceNode(diagramJson, "aws_ecs_task_definition");
        task.parameters!.values.executionRoleArn = "aws_iam_role.unrelated.arn";
      }
    },
    {
      label: "service task definition",
      mutate: (diagramJson) => {
        const service = findResourceNode(diagramJson, "aws_ecs_service");
        service.parameters!.values.taskDefinition =
          "aws_ecs_task_definition.unrelated.arn";
      }
    }
  ];

  for (const { label, mutate } of mutations) {
    const diagramJson = buildTemplateDiagramJson("ecs-fargate-container-app", {
      projectSlug: "audience-live-check",
      shortId: `cross-wired-${label}`,
      requiredRuntimeSecrets: ["CHECK_IN_SIGNING_SECRET"]
    });
    mutate(diagramJson);

    const issue = getDeploymentRuntimeSecretPrerequisite({
      diagramJson,
      terraformFiles: [],
      scope: "full_stack",
      target: createRequiredRuntimeSecretTarget()
    });

    assert.equal(issue?.action, "terraform_edit", label);
  }
});

function createIncompleteRuntimeSecretDiagram(includeSecret = false): DiagramJson {
  const taskNode: DiagramJson["nodes"][number] = {
    id: "ecs-task",
    kind: "resource",
    type: "aws_ecs_task_definition",
    label: "ECS Task",
    position: { x: 240, y: 0 },
    size: { width: 200, height: 120 },
    locked: false,
    zIndex: 0,
    parameters: {
      resourceType: "aws_ecs_task_definition",
      resourceName: "app",
      fileName: "main.tf",
      values: {
        containerDefinitions: JSON.stringify([{ name: "api", environment: [] }])
      }
    }
  };
  const secretNode: DiagramJson["nodes"][number] = {
    id: "signing-secret",
    kind: "resource",
    type: "aws_secretsmanager_secret",
    label: "Signing Secret",
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    locked: false,
    zIndex: 0,
    parameters: {
      resourceType: "aws_secretsmanager_secret",
      resourceName: "check_in_signing",
      fileName: "main.tf",
      values: {}
    }
  };

  return {
    nodes: includeSecret ? [secretNode, taskNode] : [taskNode],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function createRequiredRuntimeSecretTarget() {
  return {
    connectionId: "connection-1",
    confirmedBuildConfig: createConfirmedBuildConfig(["CHECK_IN_SIGNING_SECRET"])
  };
}

function createCompleteRuntimeSecretTerraform(): string {
  return `resource "random_password" "check_in_signing" {
  length  = 48
  special = false
}
resource "aws_secretsmanager_secret" "check_in_signing" {}
resource "aws_secretsmanager_secret_version" "check_in_signing" {
  secret_id     = aws_secretsmanager_secret.check_in_signing.id
  secret_string = random_password.check_in_signing.result
}
resource "aws_iam_role" "execution" {}
resource "aws_iam_role_policy" "check_in_signing_read" {
  name   = "runtime-secret-read"
  role   = aws_iam_role.execution.id
  policy = "{\\"Version\\":\\"2012-10-17\\",\\"Statement\\":[{\\"Sid\\":\\"ReadCheckInSigningSecret\\",\\"Effect\\":\\"Allow\\",\\"Action\\":[\\"secretsmanager:GetSecretValue\\"],\\"Resource\\":\\"\${aws_secretsmanager_secret.check_in_signing.arn}\\"}]}"
}
resource "aws_ecs_task_definition" "task" {
  execution_role_arn    = aws_iam_role.execution.arn
  container_definitions = "[{\\"name\\":\\"web\\",\\"secrets\\":[{\\"name\\":\\"CHECK_IN_SIGNING_SECRET\\",\\"valueFrom\\":\\"\${aws_secretsmanager_secret.check_in_signing.arn}\\"}]}]"
}
resource "aws_ecs_service" "app" {
  task_definition = aws_ecs_task_definition.task.arn
}`;
}

function createConfirmedBuildConfig(
  requiredRuntimeSecrets: readonly string[] = []
): ConfirmedBuildConfig {
  return {
    sourceRoot: ".",
    evidence: [],
    installPreset: "none",
    buildPreset: "docker_build",
    artifactOutputPath: null,
    runtimeEntrypoint: null,
    healthCheckPath: "/health",
    dockerfilePath: "apps/api/Dockerfile",
    packageManifestPath: null,
    samTemplatePath: null,
    appSpecPath: null,
    staticOutputPath: null,
    exactSemVerTag: null,
    manifestVersion: null,
    confirmedCommitSha: "515d1fcaaa24a2a0fe922f10dfdd756caabe3f17",
    confirmedAt: "2026-07-20T00:00:00.000Z",
    ecsWeb: {
      api: {
        sourceRoot: ".",
        dockerfilePath: "apps/api/Dockerfile",
        containerPort: 8080,
        healthCheckPath: "/health",
        requiredRuntimeSecrets
      },
      frontend: {
        sourceRoot: "apps/web",
        packageManifestPath: "apps/web/package.json",
        lockfilePath: "package-lock.json",
        packageManager: "npm",
        packageManagerVersion: "10.9.2",
        installPreset: "npm_ci",
        buildPreset: "npm_build",
        outputPath: "apps/web/dist"
      }
    }
  };
}

function findResourceNode(diagramJson: DiagramJson, resourceType: string) {
  const node = diagramJson.nodes.find(
    (candidate) =>
      candidate.kind === "resource" && candidate.parameters?.resourceType === resourceType
  );
  assert.ok(node, resourceType);
  return node;
}
