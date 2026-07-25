import assert from "node:assert/strict";
import test from "node:test";
import {
  DescribeScalableTargetsCommand,
  DescribeScalingPoliciesCommand,
  ListTagsForResourceCommand as ListApplicationAutoScalingTagsForResourceCommand
} from "@aws-sdk/client-application-auto-scaling";
import {
  GetOriginAccessControlCommand,
  ListOriginAccessControlsCommand
} from "@aws-sdk/client-cloudfront";
import {
  DescribeRepositoriesCommand,
  ListTagsForResourceCommand as ListEcrTagsForResourceCommand
} from "@aws-sdk/client-ecr";
import { DescribeSecretCommand, ListSecretsCommand } from "@aws-sdk/client-secrets-manager";
import type { TerraformAwsCredentialEnv } from "../aws-connections/aws-connection-runtime-credentials.js";
import {
  readAwsDeploymentSupportReverseEngineeringResources,
  type AwsDeploymentSupportReaderDependencies
} from "./aws-deployment-support-reverse-engineering-reader.js";
import { createAwsProviderAdapter } from "./aws-provider-adapter.js";

const CREDENTIALS: TerraformAwsCredentialEnv = {
  AWS_ACCESS_KEY_ID: "fixture-access-key",
  AWS_SECRET_ACCESS_KEY: "fixture-secret-key",
  AWS_SESSION_TOKEN: "fixture-session-token",
  AWS_REGION: "ap-northeast-2"
};

test("배포 지원 reader는 ECS 확장, ECR, Secret metadata, CloudFront OAC를 정식 리소스로 읽는다", async () => {
  const commands: string[] = [];
  const result = await readAwsDeploymentSupportReverseEngineeringResources(
    { provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] },
    CREDENTIALS,
    createDependencies(commands)
  );

  assert.deepEqual(result.scanErrors, []);
  assert.deepEqual(result.records.map((record) => record.providerResourceType).sort(), [
    "AWS::ApplicationAutoScaling::ScalableTarget",
    "AWS::ApplicationAutoScaling::ScalingPolicy",
    "AWS::CloudFront::OriginAccessControl",
    "AWS::ECR::Repository",
    "AWS::SecretsManager::Secret"
  ]);

  const target = result.records.find(
    (record) => record.providerResourceType === "AWS::ApplicationAutoScaling::ScalableTarget"
  );
  assert.equal(target?.displayName, "api 자동 확장");
  assert.equal(target?.config["resourceId"], "service/demo/api");
  assert.equal(target?.config["tagsReadComplete"], true);
  assert.equal(
    target?.serverOnly?.terraformImportId,
    "ecs/service/demo/api/ecs:service:DesiredCount"
  );
  assert.equal(
    target?.serverOnly?.config?.["roleArn"],
    "arn:aws:iam::123456789012:role/custom-app-autoscaling"
  );
  assert.equal(target?.config["roleArn"], undefined);
  assert.equal(target?.config["hasRoleArn"], true);

  const policy = result.records.find(
    (record) => record.providerResourceType === "AWS::ApplicationAutoScaling::ScalingPolicy"
  );
  assert.equal(policy?.displayName, "api 요청 자동 확장");
  assert.deepEqual(policy?.relationships, [
    {
      type: "depends_on",
      targetProviderResourceId:
        "arn:aws:application-autoscaling:ap-northeast-2:123456789012:scalable-target/target-1"
    }
  ]);
  assert.equal(
    policy?.serverOnly?.terraformImportId,
    "ecs/service/demo/api/ecs:service:DesiredCount/api-request-scaling"
  );

  const repository = result.records.find(
    (record) => record.providerResourceType === "AWS::ECR::Repository"
  );
  assert.equal(repository?.displayName, "audience-live-check-api");
  assert.equal(repository?.serverOnly?.terraformImportId, "audience-live-check-api");

  const secret = result.records.find(
    (record) => record.providerResourceType === "AWS::SecretsManager::Secret"
  );
  assert.equal(secret?.displayName, "check-in-signing");
  assert.equal(secret?.config["valueRead"], false);
  assert.equal(
    secret?.serverOnly?.terraformImportId,
    "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:check-in-signing-AbCdEf"
  );

  const originAccessControl = result.records.find(
    (record) => record.providerResourceType === "AWS::CloudFront::OriginAccessControl"
  );
  assert.equal(originAccessControl?.displayName, "audience-live-check-web-oac");
  assert.equal(originAccessControl?.serverOnly?.terraformImportId, "E123OAC");

  assert.doesNotMatch(commands.join("\n"), /GetSecretValue/u);
});

test("선택하지 않은 배포 지원 service는 AWS 요청을 만들지 않는다", async () => {
  const commands: string[] = [];
  const result = await readAwsDeploymentSupportReverseEngineeringResources(
    { provider: "aws", region: "ap-northeast-2", resourceTypes: ["ECR_REPOSITORY"] },
    CREDENTIALS,
    createDependencies(commands)
  );

  assert.deepEqual(commands, ["DescribeRepositoriesCommand", "ListTagsForResourceCommand"]);
  assert.deepEqual(
    result.records.map((record) => record.providerResourceType),
    ["AWS::ECR::Repository"]
  );
});

test("ECR Repository URI의 AWS 계정 ID는 공개 Reverse Engineering 결과에 노출하지 않는다", async () => {
  const rawResult = await readAwsDeploymentSupportReverseEngineeringResources(
    { provider: "aws", region: "ap-northeast-2", resourceTypes: ["ECR_REPOSITORY"] },
    CREDENTIALS,
    createDependencies([])
  );
  const privateRepository = rawResult.records[0];
  assert.equal(
    privateRepository?.serverOnly?.config?.["repositoryUri"],
    "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/audience-live-check-api"
  );

  const publicResult = await createAwsProviderAdapter({
    async discoverResources() {
      return rawResult;
    }
  }).scan({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["ECR_REPOSITORY"]
  });

  assert.equal(publicResult.discoveredResources[0]?.config["repositoryUri"], undefined);
  assert.doesNotMatch(JSON.stringify(publicResult), /123456789012|repositoryUri/u);
});

test("계정 ID가 포함된 ECR 이름은 공개에서 숨기고 private Terraform 관리에는 보존한다", async () => {
  const repositoryName = "repo-123456789012";
  const rawResult = await readAwsDeploymentSupportReverseEngineeringResources(
    { provider: "aws", region: "ap-northeast-2", resourceTypes: ["ECR_REPOSITORY"] },
    CREDENTIALS,
    {
      createEcrClient: () => ({
        async send(command: object): Promise<unknown> {
          if (command instanceof DescribeRepositoriesCommand) {
            return {
              repositories: [
                {
                  repositoryArn: `arn:aws:ecr:ap-northeast-2:123456789012:repository/${repositoryName}`,
                  repositoryName,
                  imageTagMutability: "IMMUTABLE",
                  imageScanningConfiguration: { scanOnPush: true },
                  encryptionConfiguration: { encryptionType: "AES256" }
                }
              ]
            };
          }
          assert.ok(command instanceof ListEcrTagsForResourceCommand);
          return { tags: [{ Key: "Environment", Value: "demo" }] };
        }
      })
    }
  );
  const gateway = {
    async discoverResources() {
      return rawResult;
    }
  };

  const publicResult = await createAwsProviderAdapter(gateway).scan({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["ECR_REPOSITORY"]
  });
  const privateResult = await createAwsProviderAdapter(gateway, {
    resultVisibility: "private"
  }).scan({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["ECR_REPOSITORY"]
  });

  assert.doesNotMatch(JSON.stringify(publicResult), /123456789012/u);
  assert.equal(publicResult.importSuggestions[0]?.status, "manual_review");
  assert.equal(privateResult.discoveredResources[0]?.config["repositoryName"], repositoryName);
  assert.equal(privateResult.importSuggestions[0]?.status, "ready");
  assert.equal(
    privateResult.architectureJson.nodes[0]?.config["name"],
    repositoryName
  );
});

test("배포 지원 pagination 반복은 앞 page를 보존하고 safe 오류를 함께 남긴다", async () => {
  let page = 0;
  const result = await readAwsDeploymentSupportReverseEngineeringResources(
    { provider: "aws", region: "ap-northeast-2", resourceTypes: ["ECR_REPOSITORY"] },
    CREDENTIALS,
    {
      createEcrClient: () => ({
        async send(command: object): Promise<unknown> {
          if (command instanceof DescribeRepositoriesCommand) {
            page += 1;
            return {
              repositories: [
                {
                  repositoryArn: `arn:aws:ecr:ap-northeast-2:123456789012:repository/repo-${page}`,
                  repositoryName: `repo-${page}`,
                  imageTagMutability: "MUTABLE",
                  imageScanningConfiguration: { scanOnPush: false },
                  encryptionConfiguration: { encryptionType: "AES256" }
                }
              ],
              nextToken: "repeated-token"
            };
          }
          assert.ok(command instanceof ListEcrTagsForResourceCommand);
          return { tags: [] };
        }
      })
    }
  );

  assert.deepEqual(
    result.records.map((record) => record.displayName),
    ["repo-1", "repo-2"]
  );
  assert.equal(result.scanErrors.length, 1);
  assert.equal(result.scanErrors[0]?.reason, "provider_error");
  assert.doesNotMatch(JSON.stringify(result.scanErrors), /repeated-token|arn:aws/u);
});

test("OAC 한 건 상세 조회 실패는 성공한 OAC와 safe 오류를 함께 보존한다", async () => {
  const result = await readAwsDeploymentSupportReverseEngineeringResources(
    { provider: "aws", region: "ap-northeast-2", resourceTypes: ["CLOUDFRONT"] },
    CREDENTIALS,
    {
      createCloudFrontClient: () => ({
        async send(command: object): Promise<unknown> {
          if (command instanceof ListOriginAccessControlsCommand) {
            return {
              OriginAccessControlList: {
                Items: [
                  {
                    Id: "GOOD",
                    Name: "web-oac",
                    Description: "web origin",
                    OriginAccessControlOriginType: "s3",
                    SigningBehavior: "always",
                    SigningProtocol: "sigv4"
                  },
                  {
                    Id: "DENIED",
                    Name: "media-oac",
                    Description: "media origin",
                    OriginAccessControlOriginType: "s3",
                    SigningBehavior: "always",
                    SigningProtocol: "sigv4"
                  }
                ]
              }
            };
          }
          assert.ok(command instanceof GetOriginAccessControlCommand);
          if (command.input.Id === "DENIED") {
            throw Object.assign(new Error("private request id"), {
              name: "AccessDeniedException"
            });
          }
          return {
            OriginAccessControl: {
              Id: "GOOD",
              OriginAccessControlConfig: {
                Name: "web-oac",
                OriginAccessControlOriginType: "s3",
                SigningBehavior: "always",
                SigningProtocol: "sigv4"
              }
            }
          };
        }
      })
    }
  );

  assert.deepEqual(
    result.records.map((record) => record.providerResourceId),
    ["GOOD", "DENIED"]
  );
  assert.equal(result.records[1]?.displayName, "media-oac");
  assert.equal(result.scanErrors.length, 1);
  assert.equal(result.scanErrors[0]?.reason, "permission_denied");
  assert.doesNotMatch(JSON.stringify(result.scanErrors), /private request id|DENIED/u);
});

test("ECR tag 조회는 작은 고정 동시성으로 제한한다", async () => {
  let active = 0;
  let peak = 0;
  const repositories = Array.from({ length: 12 }, (_, index) => ({
    repositoryArn: `arn:aws:ecr:ap-northeast-2:123456789012:repository/repo-${index}`,
    repositoryName: `repo-${index}`
  }));

  const result = await readAwsDeploymentSupportReverseEngineeringResources(
    { provider: "aws", region: "ap-northeast-2", resourceTypes: ["ECR_REPOSITORY"] },
    CREDENTIALS,
    {
      createEcrClient: () => ({
        async send(command: object): Promise<unknown> {
          if (command instanceof DescribeRepositoriesCommand) {
            return { repositories };
          }
          assert.ok(command instanceof ListEcrTagsForResourceCommand);
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 2));
          active -= 1;
          return { tags: [] };
        }
      })
    }
  );

  assert.equal(result.records.length, repositories.length);
  assert.ok(peak > 1);
  assert.ok(peak <= 5, `peak ECR tag requests: ${peak}`);
});

test("Secret 상세 조회는 작은 고정 동시성으로 제한한다", async () => {
  let active = 0;
  let peak = 0;
  const secrets = Array.from({ length: 12 }, (_, index) => ({
    ARN: `arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:secret-${index}`,
    Name: `secret-${index}`
  }));

  const result = await readAwsDeploymentSupportReverseEngineeringResources(
    { provider: "aws", region: "ap-northeast-2", resourceTypes: ["SECRETS_MANAGER_SECRET"] },
    CREDENTIALS,
    {
      createSecretsManagerClient: () => ({
        async send(command: object): Promise<unknown> {
          if (command instanceof ListSecretsCommand) {
            return { SecretList: secrets };
          }
          assert.ok(command instanceof DescribeSecretCommand);
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 2));
          active -= 1;
          return {
            ARN: command.input.SecretId,
            Name: String(command.input.SecretId).split(":").at(-1)
          };
        }
      })
    }
  );

  assert.equal(result.records.length, secrets.length);
  assert.ok(peak > 1);
  assert.ok(peak <= 5, `peak Secret detail requests: ${peak}`);
});

test("다른 Region에서 복제된 Secret은 원본 Region을 private에 보존하고 자동 관리하지 않는다", async () => {
  const result = await readAwsDeploymentSupportReverseEngineeringResources(
    { provider: "aws", region: "ap-northeast-2", resourceTypes: ["SECRETS_MANAGER_SECRET"] },
    CREDENTIALS,
    {
      createSecretsManagerClient: () => ({
        async send(command: object): Promise<unknown> {
          if (command instanceof ListSecretsCommand) {
            return {
              SecretList: [
                {
                  ARN: "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:replica",
                  Name: "replica",
                  PrimaryRegion: "us-east-1"
                }
              ]
            };
          }
          assert.ok(command instanceof DescribeSecretCommand);
          return {
            ARN: command.input.SecretId,
            Name: "replica",
            PrimaryRegion: "us-east-1",
            ReplicationStatus: []
          };
        }
      })
    }
  );

  const secret = result.records[0];
  assert.equal(secret?.config["isReplica"], true);
  assert.equal(secret?.config["replicationReadComplete"], true);
  assert.equal(secret?.serverOnly?.config?.["primaryRegion"], "us-east-1");

  const scan = await createAwsProviderAdapter({
    async discoverResources() {
      return result;
    }
  }).scan({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["SECRETS_MANAGER_SECRET"]
  });

  assert.equal(scan.importSuggestions[0]?.status, "manual_review");
  assert.equal(
    scan.architectureJson.nodes[0]?.config["reverseEngineeringManagement"],
    "needs_mapping"
  );
  assert.doesNotMatch(JSON.stringify(scan), /us-east-1/u);
});

test("복제 상태를 확인하지 못한 Secret은 replica가 0개라고 추측하지 않는다", async () => {
  const result = await readAwsDeploymentSupportReverseEngineeringResources(
    { provider: "aws", region: "ap-northeast-2", resourceTypes: ["SECRETS_MANAGER_SECRET"] },
    CREDENTIALS,
    {
      createSecretsManagerClient: () => ({
        async send(command: object): Promise<unknown> {
          if (command instanceof ListSecretsCommand) {
            return {
              SecretList: [
                {
                  ARN: "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:unknown",
                  Name: "unknown"
                }
              ]
            };
          }
          assert.ok(command instanceof DescribeSecretCommand);
          return {
            ARN: command.input.SecretId,
            Name: "unknown"
          };
        }
      })
    }
  );

  const secret = result.records[0];
  assert.equal(secret?.config["replicationReadComplete"], false);
  assert.equal(secret?.config["replicaRegionCount"], undefined);

  const scan = await createAwsProviderAdapter({
    async discoverResources() {
      return result;
    }
  }).scan({
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: ["SECRETS_MANAGER_SECRET"]
  });

  assert.equal(scan.importSuggestions[0]?.status, "manual_review");
  assert.equal(
    scan.architectureJson.nodes[0]?.config["reverseEngineeringManagement"],
    "needs_mapping"
  );
});

test("ECR tag 개별 조회 실패는 Repository를 보존하고 safe scanError를 남긴다", async () => {
  const result = await readAwsDeploymentSupportReverseEngineeringResources(
    { provider: "aws", region: "ap-northeast-2", resourceTypes: ["ECR_REPOSITORY"] },
    CREDENTIALS,
    {
      createEcrClient: () => ({
        async send(command: object): Promise<unknown> {
          if (command instanceof DescribeRepositoriesCommand) {
            return {
              repositories: [
                {
                  repositoryArn:
                    "arn:aws:ecr:ap-northeast-2:123456789012:repository/audience-api",
                  repositoryName: "audience-api",
                  imageTagMutability: "IMMUTABLE",
                  imageScanningConfiguration: { scanOnPush: true },
                  encryptionConfiguration: { encryptionType: "AES256" }
                }
              ]
            };
          }
          assert.ok(command instanceof ListEcrTagsForResourceCommand);
          throw Object.assign(new Error("private repository arn"), {
            name: "AccessDeniedException"
          });
        }
      })
    }
  );

  assert.equal(result.records[0]?.displayName, "audience-api");
  assert.equal(result.records[0]?.config["tagsReadComplete"], false);
  assert.equal(result.scanErrors[0]?.serviceKey, "ecr");
  assert.equal(result.scanErrors[0]?.reason, "permission_denied");
  assert.doesNotMatch(JSON.stringify(result.scanErrors), /private repository arn|arn:aws/u);
});

test("Secret metadata 개별 조회 제한은 Secret을 보존하고 재시도 가능한 safe scanError를 남긴다", async () => {
  const result = await readAwsDeploymentSupportReverseEngineeringResources(
    { provider: "aws", region: "ap-northeast-2", resourceTypes: ["SECRETS_MANAGER_SECRET"] },
    CREDENTIALS,
    {
      createSecretsManagerClient: () => ({
        async send(command: object): Promise<unknown> {
          if (command instanceof ListSecretsCommand) {
            return {
              SecretList: [
                {
                  ARN: "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:signing",
                  Name: "signing"
                }
              ]
            };
          }
          assert.ok(command instanceof DescribeSecretCommand);
          throw Object.assign(new Error("private request id"), {
            name: "ThrottlingException"
          });
        }
      })
    }
  );

  assert.equal(result.records[0]?.displayName, "signing");
  assert.equal(result.records[0]?.config["metadataReadComplete"], false);
  assert.equal(result.scanErrors[0]?.serviceKey, "secretsmanager");
  assert.equal(result.scanErrors[0]?.reason, "throttled");
  assert.equal(result.scanErrors[0]?.retryable, true);
  assert.doesNotMatch(JSON.stringify(result.scanErrors), /private request id|arn:aws/u);
});

test("Application Auto Scaling tag 조회 실패는 Target을 보존하고 safe scanError를 남긴다", async () => {
  const result = await readAwsDeploymentSupportReverseEngineeringResources(
    {
      provider: "aws",
      region: "ap-northeast-2",
      resourceTypes: ["APPLICATION_AUTO_SCALING_TARGET"]
    },
    CREDENTIALS,
    {
      createApplicationAutoScalingClient: () => ({
        async send(command: object): Promise<unknown> {
          if (command instanceof DescribeScalableTargetsCommand) {
            return {
              ScalableTargets: [
                {
                  ScalableTargetARN:
                    "arn:aws:application-autoscaling:ap-northeast-2:123456789012:scalable-target/target-1",
                  ServiceNamespace: "ecs",
                  ResourceId: "service/demo/api",
                  ScalableDimension: "ecs:service:DesiredCount",
                  MinCapacity: 1,
                  MaxCapacity: 2
                }
              ]
            };
          }
          if (command instanceof DescribeScalingPoliciesCommand) {
            return { ScalingPolicies: [] };
          }
          assert.ok(command instanceof ListApplicationAutoScalingTagsForResourceCommand);
          throw Object.assign(new Error("private target arn"), {
            name: "AccessDeniedException"
          });
        }
      })
    }
  );

  assert.equal(result.records[0]?.displayName, "api 자동 확장");
  assert.equal(result.records[0]?.config["tagsReadComplete"], false);
  assert.equal(result.scanErrors[0]?.serviceKey, "application-autoscaling");
  assert.equal(result.scanErrors[0]?.reason, "permission_denied");
  assert.doesNotMatch(JSON.stringify(result.scanErrors), /private target arn|arn:aws/u);
});

function createDependencies(commands: string[]): AwsDeploymentSupportReaderDependencies {
  return {
    createApplicationAutoScalingClient: () => ({
      async send(command: object): Promise<unknown> {
        commands.push(command.constructor.name);
        if (command instanceof DescribeScalableTargetsCommand) {
          return {
            ScalableTargets: [
              {
                ScalableTargetARN:
                  "arn:aws:application-autoscaling:ap-northeast-2:123456789012:scalable-target/target-1",
                ServiceNamespace: "ecs",
                  ResourceId: "service/demo/api",
                  ScalableDimension: "ecs:service:DesiredCount",
                  MinCapacity: 1,
                  MaxCapacity: 2,
                  RoleARN: "arn:aws:iam::123456789012:role/custom-app-autoscaling",
                  SuspendedState: {
                  DynamicScalingInSuspended: false,
                  DynamicScalingOutSuspended: false,
                  ScheduledScalingSuspended: false
                }
              }
            ]
          };
        }
        if (command instanceof DescribeScalingPoliciesCommand) {
          return {
            ScalingPolicies: [
              {
                PolicyARN:
                  "arn:aws:autoscaling:ap-northeast-2:123456789012:scalingPolicy:policy-1:resource/ecs/service/demo/api:policyName/api-request-scaling",
                PolicyName: "api-request-scaling",
                ServiceNamespace: "ecs",
                ResourceId: "service/demo/api",
                ScalableDimension: "ecs:service:DesiredCount",
                PolicyType: "TargetTrackingScaling",
                TargetTrackingScalingPolicyConfiguration: {
                  TargetValue: 10,
                  ScaleOutCooldown: 30,
                  ScaleInCooldown: 300,
                  PredefinedMetricSpecification: {
                    PredefinedMetricType: "ALBRequestCountPerTarget",
                    ResourceLabel: "app/demo/1/targetgroup/api/2"
                  }
                }
              }
            ]
          };
        }
        assert.ok(command instanceof ListApplicationAutoScalingTagsForResourceCommand);
        return { Tags: { Environment: "demo" } };
      }
    }),
    createEcrClient: () => ({
      async send(command: object): Promise<unknown> {
        commands.push(command.constructor.name);
        if (command instanceof DescribeRepositoriesCommand) {
          return {
            repositories: [
              {
                repositoryArn:
                  "arn:aws:ecr:ap-northeast-2:123456789012:repository/audience-live-check-api",
                repositoryName: "audience-live-check-api",
                repositoryUri:
                  "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/audience-live-check-api",
                imageTagMutability: "IMMUTABLE",
                imageScanningConfiguration: { scanOnPush: true },
                encryptionConfiguration: { encryptionType: "AES256" }
              }
            ]
          };
        }
        assert.ok(command instanceof ListEcrTagsForResourceCommand);
        return { tags: [{ Key: "Environment", Value: "demo" }] };
      }
    }),
    createSecretsManagerClient: () => ({
      async send(command: object): Promise<unknown> {
        commands.push(command.constructor.name);
        if (command instanceof ListSecretsCommand) {
          return {
            SecretList: [
              {
                ARN: "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:check-in-signing-AbCdEf",
                Name: "check-in-signing"
              }
            ]
          };
        }
        assert.ok(command instanceof DescribeSecretCommand);
        return {
          ARN: "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:check-in-signing-AbCdEf",
          Name: "check-in-signing",
          Description: "Audience check-in signing key",
          RotationEnabled: false,
          ReplicationStatus: [],
          Tags: [{ Key: "Environment", Value: "demo" }]
        };
      }
    }),
    createCloudFrontClient: () => ({
      async send(command: object): Promise<unknown> {
        commands.push(command.constructor.name);
        if (command instanceof ListOriginAccessControlsCommand) {
          return {
            OriginAccessControlList: {
              Items: [
                {
                  Id: "E123OAC",
                  OriginAccessControlConfig: {
                    Name: "audience-live-check-web-oac",
                    Description: "S3 private origin",
                    OriginAccessControlOriginType: "s3",
                    SigningBehavior: "always",
                    SigningProtocol: "sigv4"
                  }
                }
              ]
            }
          };
        }
        assert.ok(command instanceof GetOriginAccessControlCommand);
        return {
          Id: "E123OAC",
          OriginAccessControl: {
            Id: "E123OAC",
            OriginAccessControlConfig: {
              Name: "audience-live-check-web-oac",
              Description: "S3 private origin",
              OriginAccessControlOriginType: "s3",
              SigningBehavior: "always",
              SigningProtocol: "sigv4"
            }
          }
        };
      }
    })
  };
}
