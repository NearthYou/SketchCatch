import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveredResource, ResourceType } from "@sketchcatch/types";
import { classifyReverseEngineeringManagement } from "./reverse-engineering-management-policy.js";
import { getReverseEngineeringTerraformCompleteness } from "./reverse-engineering-terraform-completeness.js";
import {
  createReverseEngineeringTerraformProjection,
  getReverseEngineeringTerraformResourceType
} from "./reverse-engineering-terraform-projection.js";

test("배포 지원 리소스는 provider 종류별 Terraform type과 안정적인 import ID를 사용한다", () => {
  const target = resource("APPLICATION_AUTO_SCALING_TARGET", {
    providerResourceType: "AWS::ApplicationAutoScaling::ScalableTarget",
    providerResourceId:
      "arn:aws:application-autoscaling:ap-northeast-2:123456789012:scalable-target/target-1",
    config: {
      serviceNamespace: "ecs",
      resourceId: "service/demo/api",
      scalableDimension: "ecs:service:DesiredCount",
      minCapacity: 1,
      maxCapacity: 2,
      hasRoleArn: true,
      roleArn: "arn:aws:iam::123456789012:role/custom-app-autoscaling",
      tags: { Environment: "demo" },
      tagsReadComplete: true,
      suspendedState: {
        dynamicScalingInSuspended: false,
        dynamicScalingOutSuspended: false,
        scheduledScalingSuspended: false
      },
      terraformImportId: "ecs/service/demo/api/ecs:service:DesiredCount"
    }
  });
  const policy = resource("APPLICATION_AUTO_SCALING_POLICY", {
    providerResourceType: "AWS::ApplicationAutoScaling::ScalingPolicy",
    providerResourceId: "arn:aws:autoscaling:ap-northeast-2:123456789012:scalingPolicy:policy-1",
    config: {
      policyName: "api-request-scaling",
      policyType: "TargetTrackingScaling",
      serviceNamespace: "ecs",
      resourceId: "service/demo/api",
      scalableDimension: "ecs:service:DesiredCount",
      targetTrackingScalingPolicyConfiguration: {
        targetValue: 10,
        scaleOutCooldown: 30,
        scaleInCooldown: 300,
        predefinedMetricSpecification: {
          predefinedMetricType: "ALBRequestCountPerTarget",
          resourceLabel: "app/demo/1/targetgroup/api/2"
        }
      },
      terraformImportId: "ecs/service/demo/api/ecs:service:DesiredCount/api-request-scaling"
    },
    relationships: [{ type: "depends_on", targetResourceId: target.id, label: "depends_on" }]
  });
  const repository = resource("ECR_REPOSITORY", {
    providerResourceType: "AWS::ECR::Repository",
    config: {
      repositoryName: "audience-live-check-api",
      imageTagMutability: "IMMUTABLE",
      scanOnPush: true,
      encryptionType: "AES256",
      tags: { Environment: "demo" },
      tagsReadComplete: true,
      terraformImportId: "audience-live-check-api"
    }
  });
  const secret = resource("SECRETS_MANAGER_SECRET", {
    providerResourceType: "AWS::SecretsManager::Secret",
    providerResourceId:
      "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:check-in-signing-AbCdEf",
    config: {
      name: "check-in-signing",
      description: "Audience check-in signing key",
      rotationEnabled: false,
      replicaRegionCount: 0,
      replicationReadComplete: true,
      isReplica: false,
      serviceOwned: false,
      deleted: false,
      valueRead: false,
      metadataReadComplete: true,
      tags: { Environment: "demo" },
      tagsReadComplete: true,
      terraformImportId:
        "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:check-in-signing-AbCdEf"
    }
  });
  const originAccessControl = resource("CLOUDFRONT", {
    providerResourceType: "AWS::CloudFront::OriginAccessControl",
    providerResourceId: "E123OAC",
    config: {
      id: "E123OAC",
      name: "audience-live-check-web-oac",
      description: "S3 private origin",
      originAccessControlOriginType: "s3",
      signingBehavior: "always",
      signingProtocol: "sigv4",
      terraformImportId: "E123OAC"
    }
  });

  const fixtures = [target, policy, repository, secret, originAccessControl] as const;
  const expectedTypes = [
    "aws_appautoscaling_target",
    "aws_appautoscaling_policy",
    "aws_ecr_repository",
    "aws_secretsmanager_secret",
    "aws_cloudfront_origin_access_control"
  ];

  assert.deepEqual(
    fixtures.map((fixture) =>
      getReverseEngineeringTerraformResourceType(fixture.resourceType, fixture.providerResourceType)
    ),
    expectedTypes
  );
  for (const fixture of fixtures) {
    assert.equal(classifyReverseEngineeringManagement(fixture), "managed");
    assert.deepEqual(getReverseEngineeringTerraformCompleteness(fixture).missingCreationFields, []);
    assert.equal(
      getReverseEngineeringTerraformCompleteness(fixture).importId,
      fixture.config["terraformImportId"]
    );
  }

  const targetProjection = createReverseEngineeringTerraformProjection(target, fixtures);
  assert.deepEqual(targetProjection.terraformValues, {
    minCapacity: 1,
    maxCapacity: 2,
    resourceId: "service/demo/api",
    roleArn: "arn:aws:iam::123456789012:role/custom-app-autoscaling",
    scalableDimension: "ecs:service:DesiredCount",
    serviceNamespace: "ecs",
    suspendedState: {
      dynamicScalingInSuspended: false,
      dynamicScalingOutSuspended: false,
      scheduledScalingSuspended: false
    },
    tags: { Environment: "demo" }
  });
  const policyProjection = createReverseEngineeringTerraformProjection(policy, fixtures);
  assert.equal(
    policyProjection.terraformValues["resourceId"],
    `aws_appautoscaling_target.${target.id.replaceAll("-", "_")}.resource_id`
  );
  assert.equal(
    policyProjection.terraformValues["scalableDimension"],
    `aws_appautoscaling_target.${target.id.replaceAll("-", "_")}.scalable_dimension`
  );
  assert.equal(
    policyProjection.terraformValues["serviceNamespace"],
    `aws_appautoscaling_target.${target.id.replaceAll("-", "_")}.service_namespace`
  );
  assert.equal(secret.config["valueRead"], false);
});

test("fixture의 S3 설정은 관리하고 Object는 body를 읽지 않아 표시 전용으로 닫는다", () => {
  const bucket = resource("S3", {
    id: "resource-bucket",
    providerResourceType: "AWS::S3::Bucket",
    providerResourceId: "audience-live-check-web",
    config: { tags: [] }
  });
  const fixtures: Array<{
    resource: DiscoveredResource;
    terraformType: string;
    importId: string;
    values: Record<string, unknown>;
  }> = [
    {
      resource: s3Child("versioning", "AWS::S3::BucketVersioning", bucket, {
        bucketName: "audience-live-check-web",
        versioningStatus: "Enabled",
        mfaDelete: "Disabled",
        terraformImportId: "audience-live-check-web"
      }),
      terraformType: "aws_s3_bucket_versioning",
      importId: "audience-live-check-web",
      values: {
        bucket: "aws_s3_bucket.resource_bucket.id",
        versioningConfiguration: { status: "Enabled", mfaDelete: "Disabled" }
      }
    },
    {
      resource: s3Child("public-access", "AWS::S3::BucketPublicAccessBlock", bucket, {
        bucketName: "audience-live-check-web",
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: true,
        restrictPublicBuckets: true,
        terraformImportId: "audience-live-check-web"
      }),
      terraformType: "aws_s3_bucket_public_access_block",
      importId: "audience-live-check-web",
      values: {
        bucket: "aws_s3_bucket.resource_bucket.id",
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: true,
        restrictPublicBuckets: true
      }
    },
    {
      resource: s3Child("policy", "AWS::S3::BucketPolicy", bucket, {
        bucketName: "audience-live-check-web",
        hasPolicy: true,
        policyReadComplete: true,
        policyDocument: { Version: "2012-10-17", Statement: [] },
        terraformImportId: "audience-live-check-web"
      }),
      terraformType: "aws_s3_bucket_policy",
      importId: "audience-live-check-web",
      values: {
        bucket: "aws_s3_bucket.resource_bucket.id",
        policy: '{"Version":"2012-10-17","Statement":[]}'
      }
    },
    {
      resource: s3Child("index-html", "AWS::S3::Object", bucket, {
        bucketName: "audience-live-check-web",
        key: "index.html",
        contentType: "text/html",
        cacheControl: "no-cache",
        etag: "etag-without-body",
        bodyRead: false,
        metadataReadComplete: true,
        tagsReadComplete: true,
        terraformImportId: "audience-live-check-web/index.html"
      }),
      terraformType: "aws_s3_object",
      importId: "audience-live-check-web/index.html",
      values: {}
    }
  ];

  for (const fixture of fixtures) {
    assert.equal(
      getReverseEngineeringTerraformResourceType(
        fixture.resource.resourceType,
        fixture.resource.providerResourceType
      ),
      fixture.terraformType
    );
    assert.equal(
      classifyReverseEngineeringManagement(fixture.resource),
      fixture.resource.providerResourceType === "AWS::S3::Object" ? "needs_mapping" : "managed"
    );
    assert.equal(
      getReverseEngineeringTerraformCompleteness(fixture.resource).importId,
      fixture.importId
    );
    assert.deepEqual(
      createReverseEngineeringTerraformProjection(fixture.resource, [bucket, fixture.resource])
        .terraformValues,
      fixture.values
    );
  }
});

test("불완전 Secret과 Target Tracking이 아닌 Scaling Policy는 자동 관리하지 않는다", () => {
  const unsafeSecrets = [
    { metadataReadComplete: false },
    { replicationReadComplete: false },
    { isReplica: true },
    { replicaRegionCount: 1 },
    { serviceOwned: true },
    { deleted: true }
  ].map((unsafe) =>
    resource("SECRETS_MANAGER_SECRET", {
      providerResourceType: "AWS::SecretsManager::Secret",
      providerResourceId:
        "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:fixture-AbCdEf",
      config: {
        name: "fixture",
        rotationEnabled: false,
        replicaRegionCount: 0,
        replicationReadComplete: true,
        isReplica: false,
        serviceOwned: false,
        deleted: false,
        valueRead: false,
        metadataReadComplete: true,
        tags: {},
        tagsReadComplete: true,
        terraformImportId:
          "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:fixture-AbCdEf",
        ...unsafe
      }
    })
  );
  const stepPolicy = resource("APPLICATION_AUTO_SCALING_POLICY", {
    providerResourceType: "AWS::ApplicationAutoScaling::ScalingPolicy",
    config: {
      policyName: "api-step",
      policyType: "StepScaling",
      serviceNamespace: "ecs",
      resourceId: "service/demo/api",
      scalableDimension: "ecs:service:DesiredCount",
      tags: {},
      tagsReadComplete: true,
      terraformImportId: "ecs/service/demo/api/ecs:service:DesiredCount/api-step"
    }
  });

  for (const fixture of [...unsafeSecrets, stepPolicy]) {
    assert.equal(classifyReverseEngineeringManagement(fixture), "needs_mapping");
    assert.notEqual(
      getReverseEngineeringTerraformCompleteness(fixture).missingCreationFields.length,
      0
    );
  }
});

test("배포 지원 리소스의 모호하거나 손실된 설정은 자동 Terraform 관리에서 제외한다", () => {
  const unsafeFixtures = [
    resource("APPLICATION_AUTO_SCALING_TARGET", {
      providerResourceType: "AWS::ApplicationAutoScaling::ScalableTarget",
      config: {
        serviceNamespace: "ecs",
        resourceId: "service/demo/api",
        scalableDimension: "ecs:service:DesiredCount",
        minCapacity: 0.5,
        maxCapacity: 2,
        suspendedState: {
          dynamicScalingInSuspended: false,
          dynamicScalingOutSuspended: false,
          scheduledScalingSuspended: false
        },
        tags: {},
        tagsReadComplete: true,
        terraformImportId: "ecs/service/demo/api/ecs:service:DesiredCount"
      }
    }),
    resource("APPLICATION_AUTO_SCALING_POLICY", {
      providerResourceType: "AWS::ApplicationAutoScaling::ScalingPolicy",
      config: {
        policyName: "api-request-scaling",
        policyType: "TargetTrackingScaling",
        serviceNamespace: "ecs",
        resourceId: "service/demo/api",
        scalableDimension: "ecs:service:DesiredCount",
        targetTrackingScalingPolicyConfiguration: {
          targetValue: 10,
          predefinedMetricSpecification: {
            predefinedMetricType: "ALBRequestCountPerTarget"
          }
        },
        terraformImportId:
          "ecs/service/demo/api/ecs:service:DesiredCount/api-request-scaling"
      }
    }),
    resource("ECR_REPOSITORY", {
      providerResourceType: "AWS::ECR::Repository",
      config: {
        repositoryName: "audience-live-check-api",
        imageTagMutability: "IMMUTABLE",
        scanOnPush: true,
        encryptionType: "KMS",
        hasKmsKey: true,
        tags: {},
        tagsReadComplete: true,
        terraformImportId: "audience-live-check-api"
      }
    }),
    resource("SECRETS_MANAGER_SECRET", {
      providerResourceType: "AWS::SecretsManager::Secret",
      config: {
        name: "check-in-signing",
        hasKmsKey: true,
        rotationEnabled: false,
        replicaRegionCount: 0,
        replicationReadComplete: true,
        isReplica: false,
        serviceOwned: false,
        deleted: false,
        valueRead: false,
        metadataReadComplete: true,
        tags: {},
        tagsReadComplete: true,
        terraformImportId:
          "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:check-in-signing"
      }
    })
  ];

  for (const fixture of unsafeFixtures) {
    assert.equal(classifyReverseEngineeringManagement(fixture), "needs_mapping");
    assert.notEqual(
      getReverseEngineeringTerraformCompleteness(fixture).missingCreationFields.length,
      0
    );
  }
});

test("자동 확장 Target의 Role ARN이 있었다는 표시만 있고 원본이 없으면 자동 관리를 막는다", () => {
  const target = resource("APPLICATION_AUTO_SCALING_TARGET", {
    providerResourceType: "AWS::ApplicationAutoScaling::ScalableTarget",
    config: {
      serviceNamespace: "ecs",
      resourceId: "service/demo/api",
      scalableDimension: "ecs:service:DesiredCount",
      minCapacity: 1,
      maxCapacity: 2,
      hasRoleArn: true,
      suspendedState: {
        dynamicScalingInSuspended: false,
        dynamicScalingOutSuspended: false,
        scheduledScalingSuspended: false
      },
      tags: {},
      tagsReadComplete: true,
      terraformImportId: "ecs/service/demo/api/ecs:service:DesiredCount"
    }
  });

  assert.equal(classifyReverseEngineeringManagement(target), "needs_mapping");
  assert.deepEqual(getReverseEngineeringTerraformCompleteness(target).missingCreationFields, [
    "roleArn"
  ]);
  assert.equal(
    createReverseEngineeringTerraformProjection(target).terraformValues["roleArn"],
    undefined
  );
});

test("MFA Delete가 켜진 S3 Versioning은 기존 설정을 자동으로 다시 만들지 않는다", () => {
  const bucket = resource("S3", {
    id: "resource-bucket-mfa",
    providerResourceType: "AWS::S3::Bucket",
    providerResourceId: "mfa-bucket"
  });
  const versioning = s3Child("versioning-mfa", "AWS::S3::BucketVersioning", bucket, {
    bucketName: "mfa-bucket",
    versioningStatus: "Enabled",
    mfaDelete: "Enabled",
    terraformImportId: "mfa-bucket"
  });

  assert.equal(classifyReverseEngineeringManagement(versioning), "needs_mapping");
  assert.ok(
    getReverseEngineeringTerraformCompleteness(versioning).missingCreationFields.includes(
      "mfaDelete=Disabled"
    )
  );
  assert.deepEqual(
    createReverseEngineeringTerraformProjection(versioning, [bucket, versioning]).terraformValues,
    {}
  );
});

test("CloudFront Distribution은 같은 scan의 OAC ID를 Terraform 참조로 연결한다", () => {
  const oac = resource("CLOUDFRONT", {
    id: "resource-web-oac",
    providerResourceType: "AWS::CloudFront::OriginAccessControl",
    providerResourceId: "E123OAC",
    config: {
      id: "E123OAC",
      name: "web-oac",
      originAccessControlOriginType: "s3",
      signingBehavior: "always",
      signingProtocol: "sigv4",
      terraformImportId: "E123OAC"
    }
  });
  const distribution = resource("CLOUDFRONT", {
    id: "resource-web-distribution",
    providerResourceType: "AWS::CloudFront::Distribution",
    providerResourceId: "EDISTRIBUTION",
    config: {
      id: "EDISTRIBUTION",
      aliases: ["app.example.com"],
      comment: "demo",
      configReadComplete: true,
      customErrorResponse: [],
      defaultRootObject: "index.html",
      enabled: true,
      httpVersion: "http2and3",
      isIpv6Enabled: true,
      loggingConfig: { enabled: false, includeCookies: false, bucket: "", prefix: "" },
      origin: [
        {
          originId: "web",
          domainName: "web.s3.ap-northeast-2.amazonaws.com",
          originAccessControlId: "E123OAC"
        }
      ],
      defaultCacheBehavior: {
        targetOriginId: "web",
        viewerProtocolPolicy: "redirect-to-https",
        allowedMethods: ["GET", "HEAD"],
        cachedMethods: ["GET", "HEAD"],
        cachePolicyId: "managed-cache-policy"
      },
      orderedCacheBehavior: [
        {
          pathPattern: "/api/*",
          targetOriginId: "api",
          viewerProtocolPolicy: "redirect-to-https",
          allowedMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
          cachedMethods: ["GET", "HEAD"],
          cachePolicyId: "managed-disabled",
          originRequestPolicyId: "managed-all-viewer"
        },
        {
          pathPattern: "/health",
          targetOriginId: "api",
          viewerProtocolPolicy: "redirect-to-https",
          allowedMethods: ["GET", "HEAD"],
          cachedMethods: ["GET", "HEAD"],
          cachePolicyId: "managed-disabled"
        }
      ],
      priceClass: "PriceClass_100",
      restrictions: { geoRestriction: { restrictionType: "none" } },
      staging: false,
      tags: { Environment: "demo" },
      tagsReadComplete: true,
      viewerCertificate: { cloudfrontDefaultCertificate: true },
      webAclId: "",
      terraformImportId: "EDISTRIBUTION"
    },
    relationships: [{ type: "depends_on", targetResourceId: oac.id, label: "depends_on" }]
  });

  const projection = createReverseEngineeringTerraformProjection(distribution, [
    distribution,
    oac
  ]);
  const origins = projection.terraformValues["origin"];

  assert.ok(Array.isArray(origins));
  assert.equal(
    origins[0]?.["originAccessControlId"],
    "aws_cloudfront_origin_access_control.resource_web_oac.id"
  );
  assert.deepEqual(projection.terraformValues["orderedCacheBehavior"], [
    {
      pathPattern: "/api/*",
      targetOriginId: "api",
      viewerProtocolPolicy: "redirect-to-https",
      allowedMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
      cachedMethods: ["GET", "HEAD"],
      cachePolicyId: "managed-disabled",
      originRequestPolicyId: "managed-all-viewer"
    },
    {
      pathPattern: "/health",
      targetOriginId: "api",
      viewerProtocolPolicy: "redirect-to-https",
      allowedMethods: ["GET", "HEAD"],
      cachedMethods: ["GET", "HEAD"],
      cachePolicyId: "managed-disabled"
    }
  ]);
  assert.equal(projection.terraformValues["defaultRootObject"], "index.html");
  assert.equal(projection.terraformValues["priceClass"], "PriceClass_100");
  assert.deepEqual(projection.terraformValues["aliases"], ["app.example.com"]);
  assert.deepEqual(projection.terraformValues["tags"], { Environment: "demo" });
});

test("CloudFront의 상세 조회 누락이나 아직 투영하지 못하는 설정은 자동 관리하지 않는다", () => {
  const baseConfig = {
    id: "EDISTRIBUTION",
    configReadComplete: true,
    enabled: true,
    origin: [{ originId: "web", domainName: "web.example.com" }],
    defaultCacheBehavior: {
      targetOriginId: "web",
      viewerProtocolPolicy: "redirect-to-https",
      allowedMethods: ["GET", "HEAD"],
      cachedMethods: ["GET", "HEAD"],
      cachePolicyId: "managed-cache-policy"
    },
    orderedCacheBehavior: [],
    restrictions: { geoRestriction: { restrictionType: "none" } },
    viewerCertificate: { cloudfrontDefaultCertificate: true },
    priceClass: "PriceClass_All",
    httpVersion: "http2",
    isIpv6Enabled: true,
    tags: {},
    tagsReadComplete: true,
    customErrorResponse: [],
    loggingConfig: { enabled: false, includeCookies: false, bucket: "", prefix: "" },
    staging: false,
    terraformImportId: "EDISTRIBUTION"
  };
  const unsafe = [
    { ...baseConfig, configReadComplete: false },
    { ...baseConfig, tagsReadComplete: false },
    {
      ...baseConfig,
      customErrorResponse: [
        { errorCode: 404, responseCode: 200, responsePagePath: "/index.html" }
      ]
    },
    {
      ...baseConfig,
      loggingConfig: {
        enabled: true,
        includeCookies: false,
        bucket: "logs.s3.amazonaws.com",
        prefix: "cloudfront/"
      }
    },
    { ...baseConfig, continuousDeploymentPolicyId: "continuous-policy" },
    { ...baseConfig, staging: true },
    { ...baseConfig, unsupportedConfiguration: ["OriginGroups"] }
  ].map((config, index) =>
    resource("CLOUDFRONT", {
      id: `unsafe-cloudfront-${index}`,
      providerResourceType: "AWS::CloudFront::Distribution",
      providerResourceId: `EUNSAFE${index}`,
      config
    })
  );

  for (const distribution of unsafe) {
    assert.equal(classifyReverseEngineeringManagement(distribution), "needs_mapping");
    assert.notEqual(
      getReverseEngineeringTerraformCompleteness(distribution).missingCreationFields.length,
      0
    );
    assert.deepEqual(
      createReverseEngineeringTerraformProjection(distribution, [distribution]).terraformValues,
      {}
    );
  }
});

test("S3 Bucket Policy의 AWS 변수는 Terraform interpolation이 아닌 literal로 보존한다", () => {
  const bucket = resource("S3", {
    id: "resource-policy-bucket",
    providerResourceType: "AWS::S3::Bucket",
    providerResourceId: "policy-bucket"
  });
  const policy = s3Child("policy-variables", "AWS::S3::BucketPolicy", bucket, {
    bucketName: "policy-bucket",
    hasPolicy: true,
    policyReadComplete: true,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Resource: "arn:aws:s3:::policy-bucket/home/${aws:username}/*"
        }
      ]
    },
    terraformImportId: "policy-bucket"
  });

  const projection = createReverseEngineeringTerraformProjection(policy, [bucket, policy]);
  assert.equal(
    projection.terraformValues["bucket"],
    "aws_s3_bucket.resource_policy_bucket.id"
  );
  assert.match(String(projection.terraformValues["policy"]), /\$\$\{aws:username\}/u);
  assert.doesNotMatch(String(projection.terraformValues["policy"]), /[^$]\$\{aws:username\}/u);
});

function s3Child(
  id: string,
  providerResourceType: string,
  bucket: DiscoveredResource,
  config: Record<string, unknown>
): DiscoveredResource {
  return resource("S3", {
    id: `resource-${id}`,
    providerResourceType,
    providerResourceId: `${bucket.providerResourceId}/${id}`,
    config,
    relationships: [{ type: "depends_on", targetResourceId: bucket.id, label: "depends_on" }]
  });
}

function resource(
  resourceType: ResourceType,
  overrides: Partial<DiscoveredResource> = {}
): DiscoveredResource {
  const id = overrides.id ?? `resource-${resourceType.toLowerCase().replaceAll("_", "-")}`;
  const providerResourceType =
    overrides.providerResourceType ?? `AWS::Fixture::${resourceType}`;
  const config =
    resourceType === "S3" && providerResourceType === "AWS::S3::Bucket"
      ? { tags: [], tagsReadComplete: true, ...(overrides.config ?? {}) }
      : (overrides.config ?? {});
  return {
    id,
    provider: "aws",
    providerResourceType,
    providerResourceId: overrides.providerResourceId ?? `${resourceType.toLowerCase()}-fixture`,
    displayName: overrides.displayName ?? resourceType,
    resourceType,
    region: "ap-northeast-2",
    analysisExcluded: false,
    importSuggestionStatus: "ready",
    config,
    relationships: overrides.relationships ?? []
  };
}
