import assert from "node:assert/strict";
import test from "node:test";

import {
  assertEcsFargateRuntimeInventory,
  createEcsFargateRuntimeCoordinatesFingerprint,
  EcsFargateOutputReconciliationError,
  reconcileEcsFargateRuntimeConfig,
  resolveEcsFargateApiBaseUrl,
  resolveEcsFargateRuntimeOutputs,
  type TerraformOutputForEcsReconciliation
} from "./ecs-fargate-output-reconciliation.js";
import { extractDeployedResourcesFromTerraformStateJson } from "./deployment-apply-results.js";

test("ECS runtime fingerprint ignores output URL but changes with runtime coordinates", () => {
  const base = {
    runtimeTargetKind: "ecs_fargate" as const,
    codeBuildProjectName: "app-build",
    ecrRepositoryName: "app",
    clusterName: "app-cluster",
    serviceName: "app-service",
    containerName: "web",
    outputUrl: null
  };

  const initial = createEcsFargateRuntimeCoordinatesFingerprint(base);
  const withOutput = createEcsFargateRuntimeCoordinatesFingerprint({
    ...base,
    outputUrl: "https://api.example.com"
  });
  const withDifferentService = createEcsFargateRuntimeCoordinatesFingerprint({
    ...base,
    serviceName: "other-service"
  });

  assert.match(initial, /^[0-9a-f]{64}$/);
  assert.equal(withOutput, initial);
  assert.notEqual(withDifferentService, initial);
});

test("ECS target reconciliation stores Terraform outputs and rejects prepared target drift", () => {
  const current = {
    runtimeTargetKind: "ecs_fargate" as const,
    codeBuildProjectName: "app-build",
    ecrRepositoryName: "app",
    clusterName: "app-cluster",
    serviceName: "app-service",
    containerName: "web",
    outputUrl: null
  };
  const expectedCoordinatesFingerprint = createEcsFargateRuntimeCoordinatesFingerprint(current);
  const outputs = resolveEcsFargateRuntimeOutputs(createTerraformOutputs());

  const first = reconcileEcsFargateRuntimeConfig(current, {
    expectedCoordinatesFingerprint,
    outputs
  });
  assert.equal(first.changed, true);
  assert.equal(first.runtimeConfig.outputUrl, outputs.outputUrl);
  assert.equal(first.runtimeConfig.frontendBucketName, "demo-web-assets");
  assert.equal(first.runtimeConfig.targetGroupArn?.includes("targetgroup"), true);
  assert.equal(first.runtimeConfig.taskDefinitionArn, outputs.taskDefinitionArn);

  const same = reconcileEcsFargateRuntimeConfig(first.runtimeConfig, {
    expectedCoordinatesFingerprint: createEcsFargateRuntimeCoordinatesFingerprint(
      first.runtimeConfig
    ),
    outputs
  });
  assert.equal(same.changed, false);
  assert.equal(same.runtimeConfig, first.runtimeConfig);

  assert.throws(
    () =>
      reconcileEcsFargateRuntimeConfig(
        { ...current, serviceName: "replacement-service" },
        { expectedCoordinatesFingerprint, outputs }
      ),
    (error: unknown) =>
      error instanceof EcsFargateOutputReconciliationError &&
      error.code === "DEPLOYMENT_OUTPUT_URL_CONFLICT"
  );
});

test("ECS target reconciliation accepts a new Terraform task definition revision", () => {
  const initial = {
    runtimeTargetKind: "ecs_fargate" as const,
    codeBuildProjectName: "app-build",
    ecrRepositoryName: "app",
    clusterName: "app-cluster",
    serviceName: "app-service",
    containerName: "web",
    outputUrl: null
  };
  const initialOutputs = resolveEcsFargateRuntimeOutputs(createTerraformOutputs());
  const current = reconcileEcsFargateRuntimeConfig(initial, {
    expectedCoordinatesFingerprint: createEcsFargateRuntimeCoordinatesFingerprint(initial),
    outputs: initialOutputs
  }).runtimeConfig;
  const nextTaskDefinitionArn =
    "arn:aws:ecs:ap-northeast-2:131404649047:task-definition/app-task:2";

  const result = reconcileEcsFargateRuntimeConfig(current, {
    expectedCoordinatesFingerprint: createEcsFargateRuntimeCoordinatesFingerprint(current),
    outputs: { ...initialOutputs, taskDefinitionArn: nextTaskDefinitionArn }
  });

  assert.equal(result.changed, true);
  assert.equal(result.runtimeConfig.taskDefinitionArn, nextTaskDefinitionArn);
});

test("ECS target reconciliation accepts state-verified Terraform resource replacements", () => {
  const initial = {
    runtimeTargetKind: "ecs_fargate" as const,
    codeBuildProjectName: "app-build",
    ecrRepositoryName: "app",
    clusterName: "app-cluster",
    serviceName: "app-service",
    containerName: "web",
    outputUrl: null
  };
  const initialOutputs = resolveEcsFargateRuntimeOutputs(createTerraformOutputs());
  const current = reconcileEcsFargateRuntimeConfig(initial, {
    expectedCoordinatesFingerprint: createEcsFargateRuntimeCoordinatesFingerprint(initial),
    outputs: initialOutputs
  }).runtimeConfig;
  const replacementOutputs = resolveEcsFargateRuntimeOutputs(
    createTerraformOutputs({
      static_bucket_name: { value: "replacement-web-assets" },
      cloudfront_distribution_id: { value: "E0987654321" },
      cloudfront_domain_name: { value: "d222222abcdef8.cloudfront.net" },
      cloudfront_url: { value: "https://d222222abcdef8.cloudfront.net" },
      alb_arn: {
        value:
          "arn:aws:elasticloadbalancing:ap-northeast-2:131404649047:loadbalancer/app/replacement/2"
      },
      alb_dns_name: { value: "replacement.ap-northeast-2.elb.amazonaws.com" },
      target_group_arn: {
        value: "arn:aws:elasticloadbalancing:ap-northeast-2:131404649047:targetgroup/replacement/2"
      },
      api_origin_url: { value: "http://replacement.ap-northeast-2.elb.amazonaws.com" }
    })
  );

  assert.doesNotThrow(() =>
    assertEcsFargateRuntimeInventory(
      replacementOutputs,
      createTerraformResources(replacementOutputs),
      { accountId: "131404649047", region: "ap-northeast-2" }
    )
  );

  const result = reconcileEcsFargateRuntimeConfig(current, {
    expectedCoordinatesFingerprint: createEcsFargateRuntimeCoordinatesFingerprint(current),
    outputs: replacementOutputs
  });

  assert.equal(result.changed, true);
  assert.equal(result.runtimeConfig.outputUrl, replacementOutputs.outputUrl);
  assert.equal(result.runtimeConfig.targetGroupArn, replacementOutputs.targetGroupArn);
  assert.equal(result.runtimeConfig.loadBalancerArn, replacementOutputs.loadBalancerArn);
  assert.equal(result.runtimeConfig.frontendBucketName, replacementOutputs.frontendBucketName);
  assert.equal(
    result.runtimeConfig.cloudFrontDistributionId,
    replacementOutputs.cloudFrontDistributionId
  );
});

test("ECS target reconciliation identifies the conflicting Terraform output field", () => {
  const current = {
    runtimeTargetKind: "ecs_fargate" as const,
    codeBuildProjectName: "app-build",
    ecrRepositoryName: "app",
    clusterName: "app-cluster",
    serviceName: "app-service",
    containerName: "web",
    outputUrl: null
  };
  const outputs = resolveEcsFargateRuntimeOutputs(createTerraformOutputs());

  assert.throws(
    () =>
      reconcileEcsFargateRuntimeConfig(current, {
        expectedCoordinatesFingerprint: createEcsFargateRuntimeCoordinatesFingerprint(current),
        outputs: { ...outputs, serviceName: "other-service" }
      }),
    (error: unknown) =>
      error instanceof EcsFargateOutputReconciliationError &&
      error.code === "DEPLOYMENT_OUTPUT_URL_CONFLICT" &&
      /serviceName/u.test(error.message)
  );
});

test("ECS output resolver returns the safe non-sensitive api_base_url", () => {
  const outputUrl = resolveEcsFargateApiBaseUrl(createTerraformOutputs());

  assert.equal(outputUrl, "https://d111111abcdef8.cloudfront.net");
});

test("ECS output resolver rejects missing, sensitive, non-string, and unsafe api_base_url values", () => {
  const cases: Array<{
    name: string;
    outputs: TerraformOutputForEcsReconciliation[];
  }> = [
    {
      name: "missing cloudfront URL",
      outputs: createTerraformOutputs().filter((output) => output.name !== "cloudfront_url")
    },
    {
      name: "sensitive",
      outputs: createTerraformOutputs({ cloudfront_url: { sensitive: true } })
    },
    {
      name: "non-string",
      outputs: createTerraformOutputs({ cloudfront_url: { value: 42 } })
    },
    {
      name: "http",
      outputs: createTerraformOutputs({ cloudfront_url: { value: "http://example.com" } })
    },
    {
      name: "credential",
      outputs: createTerraformOutputs({
        cloudfront_url: { value: "https://user:pass@example.com" }
      })
    },
    {
      name: "query",
      outputs: createTerraformOutputs({ cloudfront_url: { value: "https://example.com?token=x" } })
    },
    {
      name: "fragment",
      outputs: createTerraformOutputs({ cloudfront_url: { value: "https://example.com#secret" } })
    },
    {
      name: "longer than 2048 characters",
      outputs: createTerraformOutputs({
        cloudfront_url: { value: `https://example.com/${"a".repeat(2049)}` }
      })
    }
  ];

  for (const candidate of cases) {
    assert.throws(
      () => resolveEcsFargateApiBaseUrl(candidate.outputs),
      (error: unknown) =>
        error instanceof EcsFargateOutputReconciliationError &&
        error.code === "DEPLOYMENT_OUTPUT_URL_REQUIRED",
      candidate.name
    );
  }
});

test("ECS inventory must contain the output resources in the approved account and region", () => {
  const outputs = resolveEcsFargateRuntimeOutputs(createTerraformOutputs());
  const resources = createTerraformResources(outputs);

  assert.doesNotThrow(() =>
    assertEcsFargateRuntimeInventory(outputs, resources, {
      accountId: "131404649047",
      region: "ap-northeast-2"
    })
  );

  assert.throws(
    () =>
      assertEcsFargateRuntimeInventory(
        outputs,
        resources.filter((resource) => resource.terraformType !== "aws_cloudfront_distribution"),
        { accountId: "131404649047", region: "ap-northeast-2" }
      ),
    (error: unknown) =>
      error instanceof EcsFargateOutputReconciliationError &&
      error.code === "DEPLOYMENT_OUTPUT_URL_CONFLICT"
  );

  assert.throws(
    () =>
      assertEcsFargateRuntimeInventory(outputs, resources, {
        accountId: "000000000000",
        region: "ap-northeast-2"
      }),
    (error: unknown) =>
      error instanceof EcsFargateOutputReconciliationError &&
      error.code === "DEPLOYMENT_OUTPUT_URL_CONFLICT"
  );
});

test("ECS inventory accepts the task definition ARN stored separately from Terraform state id", () => {
  const outputs = resolveEcsFargateRuntimeOutputs(createTerraformOutputs());
  const parsedTaskDefinition = extractDeployedResourcesFromTerraformStateJson(
    JSON.stringify({
      values: {
        root_module: {
          resources: [
            {
              address: "aws_ecs_task_definition.api",
              mode: "managed",
              type: "aws_ecs_task_definition",
              provider_name: "registry.terraform.io/hashicorp/aws",
              values: {
                id: "app-task",
                arn: outputs.taskDefinitionArn,
                family: "app-task"
              }
            }
          ]
        }
      }
    }),
    "ap-northeast-2"
  );
  const resources = createTerraformResources(outputs).filter(
    (resource) => resource.terraformType !== "aws_ecs_task_definition"
  );

  assert.doesNotThrow(() =>
    assertEcsFargateRuntimeInventory(outputs, [...resources, ...parsedTaskDefinition], {
      accountId: "131404649047",
      region: "ap-northeast-2"
    })
  );
});

function createTerraformOutputs(
  overrides: Record<string, Partial<TerraformOutputForEcsReconciliation>> = {}
): TerraformOutputForEcsReconciliation[] {
  const values: Record<string, unknown> = {
    static_bucket_name: "demo-web-assets",
    cloudfront_distribution_id: "E1234567890",
    cloudfront_domain_name: "d111111abcdef8.cloudfront.net",
    cloudfront_url: "https://d111111abcdef8.cloudfront.net",
    ecr_repository_name: "app",
    ecr_repository_arn: "arn:aws:ecr:ap-northeast-2:131404649047:repository/app",
    ecr_repository_url: "131404649047.dkr.ecr.ap-northeast-2.amazonaws.com/app",
    ecs_cluster_name: "app-cluster",
    ecs_service_name: "app-service",
    ecs_task_definition_family: "app-task",
    ecs_task_definition_arn: "arn:aws:ecs:ap-northeast-2:131404649047:task-definition/app-task:1",
    ecs_task_role_arn: "arn:aws:iam::131404649047:role/app-task-role",
    ecs_execution_role_arn: "arn:aws:iam::131404649047:role/app-execution-role",
    ecs_container_name: "web",
    ecs_container_port: 3000,
    alb_arn: "arn:aws:elasticloadbalancing:ap-northeast-2:131404649047:loadbalancer/app/demo/1",
    alb_dns_name: "demo.ap-northeast-2.elb.amazonaws.com",
    target_group_arn: "arn:aws:elasticloadbalancing:ap-northeast-2:131404649047:targetgroup/demo/1",
    api_origin_url: "http://demo.ap-northeast-2.elb.amazonaws.com",
    log_group_names: ["/ecs/demo"]
  };
  return Object.entries(values).map(([name, value]) => ({
    name,
    value: overrides[name]?.value ?? value,
    sensitive: overrides[name]?.sensitive ?? false
  }));
}

function createTerraformResources(outputs: ReturnType<typeof resolveEcsFargateRuntimeOutputs>) {
  const region = "ap-northeast-2";
  return [
    { terraformType: "aws_s3_bucket", resourceId: outputs.frontendBucketName, region },
    {
      terraformType: "aws_cloudfront_distribution",
      resourceId: outputs.cloudFrontDistributionId,
      region
    },
    { terraformType: "aws_ecr_repository", resourceId: outputs.ecrRepositoryName, region },
    {
      terraformType: "aws_ecs_cluster",
      resourceId: `arn:aws:ecs:${region}:131404649047:cluster/${outputs.clusterName}`,
      region
    },
    {
      terraformType: "aws_ecs_service",
      resourceId: `arn:aws:ecs:${region}:131404649047:service/${outputs.clusterName}/${outputs.serviceName}`,
      region
    },
    {
      terraformType: "aws_ecs_task_definition",
      resourceId: outputs.taskDefinitionArn,
      region
    },
    { terraformType: "aws_iam_role", resourceId: outputs.taskRoleArn, region },
    { terraformType: "aws_iam_role", resourceId: outputs.executionRoleArn, region },
    { terraformType: "aws_lb", resourceId: outputs.loadBalancerArn, region },
    { terraformType: "aws_lb_target_group", resourceId: outputs.targetGroupArn, region },
    ...outputs.logGroupNames.map((resourceId) => ({
      terraformType: "aws_cloudwatch_log_group",
      resourceId,
      region
    }))
  ];
}
