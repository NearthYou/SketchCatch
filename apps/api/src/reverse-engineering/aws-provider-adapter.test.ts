import assert from "node:assert/strict";
import test from "node:test";
import type { ReverseEngineeringScanResult } from "@sketchcatch/types";
import {
  createAwsProviderAdapter,
  type AwsDiscoveredResourceRecord
} from "./aws-provider-adapter.js";

const ALB_ARN =
  "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/shared/1111111111111111";
const CLOUDFRONT_ARN_A = "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTIONA";
const CLOUDFRONT_ARN_B = "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTIONB";

test("ALB와 CloudFront를 supported ResourceType 및 안정적인 Terraform import로 변환한다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: ALB_ARN,
      displayName: "shared-entry",
      config: {
        arn: ALB_ARN,
        name: "shared-entry",
        type: "application",
        scheme: "internet-facing",
        securityGroupIds: ["sg-shared"],
        subnetIds: ["subnet-a", "subnet-b"]
      }
    }),
    cloudFrontRecord(CLOUDFRONT_ARN_A, "EDISTRIBUTIONA"),
    cloudFrontRecord(CLOUDFRONT_ARN_B, "EDISTRIBUTIONB"),
    record({
      providerResourceType: "AWS::Lambda::Function",
      providerResourceId: "arn:aws:lambda:ap-northeast-2:123456789012:function:shared-entry",
      displayName: "shared-entry"
    }),
    record({
      providerResourceType: "AWS::IAM::Role",
      providerResourceId: "arn:aws:iam::123456789012:role/shared-entry",
      displayName: "shared-entry"
    })
  ]);

  const [alb, cloudFrontA, cloudFrontB, lambda, iamRole] = result.discoveredResources;
  assert.equal(alb?.resourceType, "LOAD_BALANCER");
  assert.equal(cloudFrontA?.resourceType, "CLOUDFRONT");
  assert.equal(cloudFrontB?.resourceType, "CLOUDFRONT");
  assert.equal(alb?.analysisExcluded ?? false, false);
  assert.equal(cloudFrontA?.analysisExcluded ?? false, false);
  assert.equal(cloudFrontB?.analysisExcluded ?? false, false);
  assert.deepEqual(
    result.architectureJson.nodes.map((node) => node.type),
    ["LOAD_BALANCER", "CLOUDFRONT", "CLOUDFRONT"]
  );

  const [albImport, cloudFrontImportA, cloudFrontImportB, lambdaImport, iamRoleImport] =
    result.importSuggestions;
  assertReadyImport(albImport, "aws_lb", ALB_ARN);
  assertReadyImport(cloudFrontImportA, "aws_cloudfront_distribution", "EDISTRIBUTIONA");
  assertReadyImport(cloudFrontImportB, "aws_cloudfront_distribution", "EDISTRIBUTIONB");
  assert.notEqual(cloudFrontImportA?.terraformAddress, cloudFrontImportB?.terraformAddress);

  for (const [resource, suggestion] of [
    [lambda, lambdaImport],
    [iamRole, iamRoleImport]
  ] as const) {
    assert.equal(resource?.resourceType, "UNKNOWN");
    assert.equal(resource?.analysisExcluded, true);
    assert.equal(suggestion?.status, "unsupported_resource_type");
    assert.equal(suggestion?.handoffReady, false);
    assert.equal(suggestion?.importCommand, undefined);
  }
});

test("정규화된 application 증거가 없는 ELBv2 record는 NLB를 포함해 review-only로 남긴다", async () => {
  const nlbArn =
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/net/shared/1111111111111111";
  const contradictoryNlbArn =
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/net/conflicting/2222222222222222";
  const result = await scan([
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: nlbArn,
      displayName: "resource-explorer-nlb",
      config: { arn: nlbArn, type: "network" }
    }),
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: ALB_ARN,
      displayName: "unnormalized-load-balancer",
      config: { arn: ALB_ARN }
    }),
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: contradictoryNlbArn,
      displayName: "contradictory-nlb",
      config: { arn: contradictoryNlbArn, type: "application" }
    })
  ]);

  assert.deepEqual(
    result.discoveredResources.map((resource) => ({
      resourceType: resource.resourceType,
      analysisExcluded: resource.analysisExcluded,
      terraformResourceType: resource.config["terraformResourceType"]
    })),
    [
      { resourceType: "UNKNOWN", analysisExcluded: true, terraformResourceType: undefined },
      { resourceType: "UNKNOWN", analysisExcluded: true, terraformResourceType: undefined },
      { resourceType: "UNKNOWN", analysisExcluded: true, terraformResourceType: undefined }
    ]
  );
  assert.deepEqual(result.architectureJson.nodes, []);
  assert.ok(
    result.importSuggestions.every(
      (suggestion) =>
        suggestion.status === "unsupported_resource_type" &&
        suggestion.handoffReady === false &&
        suggestion.importCommand === undefined
    )
  );
});

test("loadBalancerType application 정규화 값도 ALB 지원과 생성 가능성 판단에 쓴다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: ALB_ARN,
      displayName: "normalized-alb",
      config: {
        arn: ALB_ARN,
        name: "normalized-alb",
        loadBalancerType: "application",
        scheme: "internet-facing",
        subnetIds: ["subnet-a"]
      }
    })
  ]);

  assert.equal(result.discoveredResources[0]?.resourceType, "LOAD_BALANCER");
  assert.equal(result.discoveredResources[0]?.config["sketchcatchReferenceTerraform"], undefined);
  assert.deepEqual(result.findings, []);
  assert.equal(result.importSuggestions[0]?.handoffReady, true);
});

test("ALB ARN 또는 CloudFront distribution ID가 없으면 빈 import command 대신 수동 검토 이유를 반환한다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: "shared-entry-without-alb-arn",
      displayName: "shared-entry",
      config: {
        name: "shared-entry",
        type: "application",
        scheme: "internet-facing",
        subnetIds: ["subnet-a"]
      }
    }),
    record({
      providerResourceType: "AWS::CloudFront::Distribution",
      providerResourceId: CLOUDFRONT_ARN_A,
      displayName: "shared-entry",
      config: createCloudFrontConfig(undefined)
    })
  ]);

  for (const suggestion of result.importSuggestions) {
    assert.equal(suggestion.status, "manual_review");
    assert.equal(suggestion.handoffReady, false);
    assert.equal(suggestion.importCommand, undefined);
    assert.ok(suggestion.terraformAddress);
    assert.ok(suggestion.terraformBlockDraft);
    assert.match(suggestion.reason ?? "", /import/i);
  }
});

test("생성 필수값이 부족한 supported Resource는 Board와 import에 남고 Terraform 생성만 fail-closed 한다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: ALB_ARN,
      displayName: "incomplete-alb",
      config: { arn: ALB_ARN, name: "incomplete-alb", type: "application" }
    }),
    record({
      providerResourceType: "AWS::CloudFront::Distribution",
      providerResourceId: CLOUDFRONT_ARN_A,
      displayName: "incomplete-cloudfront",
      config: { arn: CLOUDFRONT_ARN_A, id: "EDISTRIBUTIONA", enabled: true }
    })
  ]);

  assert.deepEqual(
    result.discoveredResources.map((resource) => ({
      resourceType: resource.resourceType,
      analysisExcluded: resource.analysisExcluded ?? false,
      referenceOnly: resource.config["sketchcatchReferenceTerraform"]
    })),
    [
      { resourceType: "LOAD_BALANCER", analysisExcluded: false, referenceOnly: true },
      { resourceType: "CLOUDFRONT", analysisExcluded: false, referenceOnly: true }
    ]
  );
  assert.equal(result.architectureJson.nodes.length, 2);
  assert.equal(result.importSuggestions.every((suggestion) => suggestion.handoffReady), true);
  assert.deepEqual(
    result.findings.map((finding) => finding.resourceId),
    result.discoveredResources.map((resource) => resource.id)
  );
  assert.ok(result.findings.every((finding) => finding.category === "configuration"));
  assert.match(result.findings[0]?.description ?? "", /scheme.*subnetIds/);
  assert.match(result.findings[1]?.description ?? "", /origin.*defaultCacheBehavior/);
});

test("CloudFront VPC origin은 import identity를 보존하지만 reference-only로 fail-close 한다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::CloudFront::Distribution",
      providerResourceId: CLOUDFRONT_ARN_A,
      displayName: "private-origin-edge",
      region: "global",
      config: {
        ...createCloudFrontConfig("EDISTRIBUTIONA"),
        origin: [
          {
            originId: "private-origin",
            domainName: "internal.example.com",
            vpcOriginConfig: {
              vpcOriginId: "vo_0123456789abcdef0",
              ownerAccountId: "123456789012"
            }
          }
        ]
      }
    })
  ]);

  const [resource] = result.discoveredResources;
  const [suggestion] = result.importSuggestions;
  const [finding] = result.findings;

  assert.equal(resource?.resourceType, "CLOUDFRONT");
  assert.equal(resource?.analysisExcluded ?? false, false);
  assert.equal(resource?.config["sketchcatchReferenceTerraform"], true);
  assert.deepEqual(resource?.config["terraformValidationMissingFields"], ["origin.vpcOriginConfig"]);
  assert.equal(suggestion?.handoffReady, true);
  assert.equal(suggestion?.importCommand?.split(" ").at(-1), "EDISTRIBUTIONA");
  assert.match(finding?.description ?? "", /origin\.vpcOriginConfig/);
});

test("ALB subnet_mapping은 subnets 대신 새 Terraform 생성 위치 정보로 인정한다", async () => {
  const result = await scan([
    record({
      providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      providerResourceId: ALB_ARN,
      displayName: "mapped-alb",
      config: {
        arn: ALB_ARN,
        name: "mapped-alb",
        type: "application",
        scheme: "internet-facing",
        subnetMapping: [{ subnetId: "subnet-a", allocationId: "eipalloc-a" }]
      }
    })
  ]);

  assert.equal(result.discoveredResources[0]?.config["sketchcatchReferenceTerraform"], undefined);
  assert.deepEqual(result.findings, []);
  assert.equal(result.importSuggestions[0]?.handoffReady, true);
});

async function scan(records: AwsDiscoveredResourceRecord[]): Promise<ReverseEngineeringScanResult> {
  return createAwsProviderAdapter({
    async discoverResources() {
      return records;
    }
  }).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] });
}

function cloudFrontRecord(
  providerResourceId: string,
  distributionId: string
): AwsDiscoveredResourceRecord {
  return record({
    providerResourceType: "AWS::CloudFront::Distribution",
    providerResourceId,
    displayName: "shared-entry",
    region: "global",
    config: createCloudFrontConfig(distributionId)
  });
}

function createCloudFrontConfig(distributionId: string | undefined): Record<string, unknown> {
  return {
    arn: CLOUDFRONT_ARN_A,
    ...(distributionId ? { id: distributionId } : {}),
    enabled: true,
    comment: "shared edge",
    origin: [
      {
        originId: "assets",
        domainName: "assets.example.s3.ap-northeast-2.amazonaws.com",
        s3OriginConfig: { originAccessIdentity: "" }
      }
    ],
    defaultCacheBehavior: {
      targetOriginId: "assets",
      viewerProtocolPolicy: "redirect-to-https",
      allowedMethods: ["GET", "HEAD"],
      cachedMethods: ["GET", "HEAD"],
      forwardedValues: { queryString: false, cookies: { forward: "none" } }
    },
    restrictions: { geoRestriction: { restrictionType: "none" } },
    viewerCertificate: { cloudfrontDefaultCertificate: true }
  };
}

function assertReadyImport(
  suggestion: ReverseEngineeringScanResult["importSuggestions"][number] | undefined,
  terraformType: string,
  importId: string
): void {
  assert.equal(suggestion?.status, "ready");
  assert.equal(suggestion?.handoffReady, true);
  assert.match(suggestion?.terraformAddress ?? "", new RegExp(`^${terraformType}\\.`));
  assert.match(
    suggestion?.terraformBlockDraft ?? "",
    new RegExp(`^resource "${terraformType}" "[a-z0-9_]+" \\{\\}$`)
  );
  assert.equal(suggestion?.importCommand?.split(" ").at(-1), importId);
}

function record(input: {
  providerResourceType: string;
  providerResourceId: string;
  displayName: string;
  region?: string;
  config?: Record<string, unknown>;
  relationships?: AwsDiscoveredResourceRecord["relationships"];
}): AwsDiscoveredResourceRecord {
  return {
    providerResourceType: input.providerResourceType,
    providerResourceId: input.providerResourceId,
    displayName: input.displayName,
    region: input.region ?? "ap-northeast-2",
    config: input.config ?? {},
    relationships: input.relationships ?? []
  };
}
