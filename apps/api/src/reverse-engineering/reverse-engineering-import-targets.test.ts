import assert from "node:assert/strict";
import test from "node:test";
import type {
  ArchitectureJson,
  DiagramJson,
  DiscoveredResource,
  ReverseEngineeringImportDecision,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";
import { createAwsProviderAdapter } from "./aws-provider-adapter.js";
import {
  resolveVerifiedImportTargets,
  ReverseEngineeringImportTargetVerificationError,
  type ReverseEngineeringImportTargetRepository
} from "./reverse-engineering-import-targets.js";
import { normalizeReverseEngineeringScanResult } from "./reverse-engineering-service.js";

const accessContext = { kind: "user" as const, userId: "user-1" };

test("같은 프로젝트의 완료된 scan과 node 원본이 모두 일치할 때만 import 대상을 만든다", async () => {
  const repository = repositoryWith(result());

  const targets = await resolveVerifiedImportTargets(
    {
      projectId: "project-1",
      accessContext,
      diagramJson: diagram()
    },
    repository
  );

  assert.deepEqual(targets, [
    {
      resourceId: "resource-existing-bucket",
      terraformAddress: "aws_s3_bucket.existing_bucket",
      importId: "existing-bucket",
      providerResourceType: "AWS::S3::Bucket",
      resourceType: "S3"
    }
  ]);
});

test("ready 리소스를 사용자가 보드 참고용으로 남기면 Terraform import에서 제외한다", async () => {
  const targets = await resolveVerifiedImportTargets(
    {
      projectId: "project-1",
      accessContext,
      diagramJson: diagram({
        importDecision: {
          version: 1,
          mode: "observe_only",
          statusAtConfirmation: "ready"
        }
      })
    },
    repositoryWith(result())
  );

  assert.deepEqual(targets, []);
});

test("서버가 확정한 가져오기 결정이 없는 과거 AWS node는 배포 전에 중단한다", async () => {
  await assert.rejects(
    resolveVerifiedImportTargets(
      {
        projectId: "project-1",
        accessContext,
        diagramJson: diagram({ importDecision: null })
      },
      repositoryWith(result())
    ),
    /가져오기 선택을 확인할 수 없습니다/u
  );
});

test("바로 관리할 수 없는 상태를 기존 리소스 가져오기로 위조하면 중단한다", async () => {
  const scanResult = result();
  scanResult.importSuggestions = [
    {
      id: "import-resource-existing-bucket",
      resourceId: "resource-existing-bucket",
      status: "manual_review",
      handoffReady: false,
      reason: "추가 확인 필요"
    }
  ];

  await assert.rejects(
    resolveVerifiedImportTargets(
      {
        projectId: "project-1",
        accessContext,
        diagramJson: diagram({
          importDecision: {
            version: 1,
            mode: "import_existing",
            statusAtConfirmation: "manual_review"
          }
        })
      },
      repositoryWith(scanResult)
    ),
    /기존 리소스로 가져올 수 없습니다/u
  );
});

test("확정 당시 상태가 저장된 suggestion과 다르면 변조로 보고 중단한다", async () => {
  await assert.rejects(
    resolveVerifiedImportTargets(
      {
        projectId: "project-1",
        accessContext,
        diagramJson: diagram({
          importDecision: {
            version: 1,
            mode: "observe_only",
            statusAtConfirmation: "manual_review"
          }
        })
      },
      repositoryWith(result())
    ),
    /저장된 AWS 원본과 다릅니다/u
  );
});

test("실제 adapter의 S3 주소를 공개 Board projection에서 바꾸지 않고 import 대상으로 검증한다", async () => {
  const rawResult = await createAwsProviderAdapter(
    {
      async discoverResources() {
        return [
          {
            providerResourceType: "AWS::S3::Bucket",
            providerResourceId: "customer-assets",
            displayName: "customer-assets",
            region: "ap-northeast-2",
            config: { bucket: "customer-assets" },
            relationships: []
          }
        ];
      }
    },
    { resultVisibility: "private" }
  ).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] });
  const persistedResult = stampPersistedIdentity(rawResult);
  const publicResult = normalizeReverseEngineeringScanResult(persistedResult.scan, persistedResult);

  const targets = await resolveVerifiedImportTargets(
    {
      projectId: "project-1",
      accessContext,
      diagramJson: diagramFromPublicArchitecture(
        publicResult.reverseEngineeringDraft.architectureJson,
        persistedResult.scan.id,
        persistedResult.reverseEngineeringDraft.id,
        publicResult
      )
    },
    repositoryWith(persistedResult)
  );

  assert.deepEqual(targets, [
    {
      resourceId: persistedResult.discoveredResources[0]?.id,
      terraformAddress: "aws_s3_bucket.resource_customer_assets",
      importId: "customer-assets",
      providerResourceType: "AWS::S3::Bucket",
      resourceType: "S3"
    }
  ]);
});

test("CloudWatch Log Group은 ARN 대신 log group name을 검증된 import ID로 사용한다", async () => {
  const rawResult = await createAwsProviderAdapter(
    {
      async discoverResources() {
        return [
          {
            providerResourceType: "AWS::Logs::LogGroup",
            providerResourceId: "arn:aws:logs:ap-northeast-2:123456789012:log-group:/ecs/orders",
            displayName: "/ecs/orders",
            region: "ap-northeast-2",
            config: {
              logGroupClass: "STANDARD",
              logGroupName: "/ecs/orders",
              retentionInDays: 30,
              tags: [],
              tagsReadComplete: true
            },
            relationships: []
          }
        ];
      }
    },
    { resultVisibility: "private" }
  ).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] });
  const persistedResult = stampPersistedIdentity(rawResult);
  const publicResult = normalizeReverseEngineeringScanResult(persistedResult.scan, persistedResult);

  const targets = await resolveVerifiedImportTargets(
    {
      projectId: "project-1",
      accessContext,
      diagramJson: diagramFromPublicArchitecture(
        publicResult.reverseEngineeringDraft.architectureJson,
        persistedResult.scan.id,
        persistedResult.reverseEngineeringDraft.id,
        publicResult
      )
    },
    repositoryWith(persistedResult)
  );

  assert.deepEqual(targets, [
    {
      resourceId: persistedResult.discoveredResources[0]?.id,
      terraformAddress: persistedResult.importSuggestions[0]?.terraformAddress,
      importId: "/ecs/orders",
      providerResourceType: "AWS::Logs::LogGroup",
      resourceType: "CLOUDWATCH_LOG_GROUP"
    }
  ]);
});

test("KMS 연결 Log Group은 공개 Draft에서 ARN을 숨기고 import 대상에서 제외한다", async () => {
  const kmsKeyArn =
    "arn:aws:kms:ap-northeast-2:123456789012:key/11111111-2222-3333-4444-555555555555";
  const rawResult = await createAwsProviderAdapter(
    {
      async discoverResources() {
        return [
          {
            providerResourceType: "AWS::Logs::LogGroup",
            providerResourceId:
              "arn:aws:logs:ap-northeast-2:123456789012:log-group:/ecs/secure-orders",
            displayName: "/ecs/secure-orders",
            region: "ap-northeast-2",
            config: {
              logGroupName: "/ecs/secure-orders",
              retentionInDays: 30,
              kmsKeyId: kmsKeyArn
            },
            relationships: []
          }
        ];
      }
    },
    { resultVisibility: "private" }
  ).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] });
  const persistedResult = stampPersistedIdentity(rawResult);
  const publicResult = normalizeReverseEngineeringScanResult(persistedResult.scan, persistedResult);
  const publicNode = publicResult.reverseEngineeringDraft.architectureJson.nodes[0];

  assert.equal(persistedResult.discoveredResources[0]?.config["kmsKeyId"], kmsKeyArn);
  assert.doesNotMatch(JSON.stringify(publicResult.reverseEngineeringDraft), /arn:aws:kms/iu);
  assert.equal(publicNode?.config["hasKmsKey"], true);
  assert.equal(publicNode?.config["reverseEngineeringManagement"], "needs_mapping");
  assert.equal(publicNode?.config["terraformResourceType"], undefined);
  assert.equal(persistedResult.importSuggestions[0]?.handoffReady, false);

  const targets = await resolveVerifiedImportTargets(
    {
      projectId: "project-1",
      accessContext,
      diagramJson: diagramFromPublicArchitecture(
        publicResult.reverseEngineeringDraft.architectureJson,
        persistedResult.scan.id,
        persistedResult.reverseEngineeringDraft.id,
        publicResult
      )
    },
    repositoryWith(persistedResult)
  );

  assert.deepEqual(targets, []);
});

test("ARN을 가진 ALB도 공개 Board projection의 Terraform identity로 검증한다", async () => {
  const rawResult = await createAwsProviderAdapter(
    {
      async discoverResources() {
        return [
          {
            providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
            providerResourceId:
              "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/customer/abc",
            displayName: "customer-entry",
            region: "ap-northeast-2",
            config: {
              name: "customer-entry",
              type: "application",
              scheme: "internet-facing",
              ipAddressType: "ipv4",
              subnetIds: ["subnet-a"],
              reverseEngineeringDetailsVersion: 1,
              attributesReadComplete: true,
              attributesProjectionComplete: true,
              attributes: {},
              tagsReadComplete: true,
              tags: []
            },
            relationships: []
          }
        ];
      }
    },
    { resultVisibility: "private" }
  ).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] });
  const persistedResult = stampPersistedIdentity(rawResult);
  const publicResult = normalizeReverseEngineeringScanResult(persistedResult.scan, persistedResult);
  const publicNode = publicResult.reverseEngineeringDraft.architectureJson.nodes[0];
  const storedSuggestion = persistedResult.importSuggestions[0];

  assert.equal(publicNode?.config["terraformResourceType"], "aws_lb");
  assert.equal(publicNode?.config["internal"], false);
  assert.deepEqual(publicNode?.config["subnets"], ["subnet-a"]);
  assert.equal(
    `aws_lb.${String(publicNode?.config["terraformResourceName"])}`,
    storedSuggestion?.terraformAddress
  );

  const targets = await resolveVerifiedImportTargets(
    {
      projectId: "project-1",
      accessContext,
      diagramJson: diagramFromPublicArchitecture(
        publicResult.reverseEngineeringDraft.architectureJson,
        persistedResult.scan.id,
        persistedResult.reverseEngineeringDraft.id,
        publicResult
      )
    },
    repositoryWith(persistedResult)
  );

  assert.equal(targets[0]?.terraformAddress, storedSuggestion?.terraformAddress);
  assert.equal(
    targets[0]?.importId,
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/customer/abc"
  );
});

test("CloudFront와 ECS Cluster도 공개 Board에서 Terraform identity를 유지한다", async () => {
  const rawResult = await createAwsProviderAdapter(
    {
      async discoverResources() {
        return [
          {
            providerResourceType: "AWS::CloudFront::Distribution",
            providerResourceId: "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION",
            displayName: "customer-cdn",
            region: "global",
            config: {
              id: "EDISTRIBUTION",
              enabled: true,
              origin: [{ originId: "app", domainName: "app.example.com" }],
              defaultCacheBehavior: {
                targetOriginId: "app",
                viewerProtocolPolicy: "redirect-to-https",
                allowedMethods: ["GET", "HEAD"],
                cachedMethods: ["GET", "HEAD"],
                cachePolicyId: "managed-cache-policy"
              },
              restrictions: { geoRestriction: { restrictionType: "none" } },
              viewerCertificate: { cloudfrontDefaultCertificate: true }
            },
            relationships: []
          },
          {
            providerResourceType: "AWS::ECS::Cluster",
            providerResourceId: "arn:aws:ecs:ap-northeast-2:123456789012:cluster/customer-orders",
            displayName: "customer-orders",
            region: "ap-northeast-2",
            config: { name: "customer-orders" },
            relationships: []
          }
        ];
      }
    },
    { resultVisibility: "private" }
  ).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] });
  const persistedResult = stampPersistedIdentity(rawResult);
  const publicResult = normalizeReverseEngineeringScanResult(persistedResult.scan, persistedResult);
  const publicNodes = publicResult.reverseEngineeringDraft.architectureJson.nodes;

  assert.equal(publicNodes[0]?.config["enabled"], true);
  assert.equal(publicNodes[1]?.config["name"], "customer-orders");

  for (const node of publicNodes) {
    assert.equal(node.config["terraformBlockType"], "resource");
    assert.match(String(node.config["terraformResourceType"]), /^aws_/u);
    assert.match(String(node.config["terraformResourceName"]), /^[a-z_]/u);
    assert.equal(node.config["terraformFileName"], "reverse-engineering");
  }
  assert.ok(persistedResult.importSuggestions.every((suggestion) => suggestion.status === "ready"));

  const targets = await resolveVerifiedImportTargets(
    {
      projectId: "project-1",
      accessContext,
      diagramJson: diagramFromPublicArchitecture(
        publicResult.reverseEngineeringDraft.architectureJson,
        persistedResult.scan.id,
        persistedResult.reverseEngineeringDraft.id,
        publicResult
      )
    },
    repositoryWith(persistedResult)
  );

  assert.deepEqual(
    targets.map((target) => target.terraformAddress).sort(),
    persistedResult.importSuggestions
      .map((suggestion) => suggestion.terraformAddress)
      .filter((address): address is string => address !== undefined)
      .sort()
  );
});

test("다른 프로젝트이거나 접근할 수 없는 scan은 import에 사용하지 않는다", async () => {
  const repository: ReverseEngineeringImportTargetRepository = {
    async findAccessibleScan() {
      return undefined;
    }
  };

  await assert.rejects(
    resolveVerifiedImportTargets(
      { projectId: "project-1", accessContext, diagramJson: diagram() },
      repository
    ),
    ReverseEngineeringImportTargetVerificationError
  );
});

test("draft ID와 현재 Terraform 주소가 저장된 scan과 다르면 fail closed한다", async () => {
  const repository = repositoryWith(result());

  await assert.rejects(
    resolveVerifiedImportTargets(
      {
        projectId: "project-1",
        accessContext,
        diagramJson: diagram({ reverseEngineeringDraftId: "draft-stale" })
      },
      repository
    ),
    /원본이 달라/u
  );

  await assert.rejects(
    resolveVerifiedImportTargets(
      {
        projectId: "project-1",
        accessContext,
        diagramJson: diagram({ resourceName: "browser_changed" })
      },
      repository
    ),
    /Terraform 주소/u
  );
});

test("saved_scan이 아닌 source와 저장 row/result/draft의 어긋난 identity를 거부한다", async () => {
  await assert.rejects(
    resolveVerifiedImportTargets(
      {
        projectId: "project-1",
        accessContext,
        diagramJson: diagram({ reverseEngineeringSourceKind: "preview_scan" })
      },
      repositoryWith(result())
    ),
    /저장된 AWS 원본/u
  );

  for (const malformed of [
    repositoryWith(result(), { id: "scan-other" }),
    repositoryWith({ ...result(), scan: { ...result().scan, id: "scan-other" } }),
    repositoryWith({
      ...result(),
      reverseEngineeringDraft: {
        ...result().reverseEngineeringDraft,
        scanId: "scan-other"
      }
    })
  ]) {
    await assert.rejects(
      resolveVerifiedImportTargets(
        { projectId: "project-1", accessContext, diagramJson: diagram() },
        malformed
      ),
      ReverseEngineeringImportTargetVerificationError
    );
  }
});

test("서버가 만든 Reverse Engineering node에서 provenance 세 필드를 모두 지우면 중단한다", async () => {
  const rawResult = await createAwsProviderAdapter(
    {
      async discoverResources() {
        return [
          {
            providerResourceType: "AWS::S3::Bucket",
            providerResourceId: "customer-assets",
            displayName: "customer-assets",
            region: "ap-northeast-2",
            config: { bucket: "customer-assets" },
            relationships: []
          }
        ];
      }
    },
    { resultVisibility: "private" }
  ).scan({ provider: "aws", region: "ap-northeast-2", resourceTypes: ["ALL"] });
  const persistedResult = stampPersistedIdentity(rawResult);
  const publicResult = normalizeReverseEngineeringScanResult(persistedResult.scan, persistedResult);
  const forgedDiagram = diagramFromPublicArchitecture(
    publicResult.reverseEngineeringDraft.architectureJson,
    persistedResult.scan.id,
    persistedResult.reverseEngineeringDraft.id,
    publicResult
  );
  const values = forgedDiagram.nodes[0]?.parameters?.values;

  assert.equal(values?.["reverseEngineeringManagement"], "managed");
  delete values?.["reverseEngineeringSourceScanId"];
  delete values?.["reverseEngineeringDraftId"];
  delete values?.["reverseEngineeringSourceKind"];

  await assert.rejects(
    resolveVerifiedImportTargets(
      { projectId: "project-1", accessContext, diagramJson: forgedDiagram },
      repositoryWith(persistedResult)
    ),
    /AWS 원본 정보가 제거/u
  );
});

test("browser가 import command와 ID를 위조해도 저장된 suggestion만 사용한다", async () => {
  const targets = await resolveVerifiedImportTargets(
    {
      projectId: "project-1",
      accessContext,
      diagramJson: diagram({
        browserValues: {
          importCommand: "terraform import aws_s3_bucket.attacker attacker-bucket",
          importId: "attacker-bucket",
          terraformAddress: "aws_s3_bucket.attacker"
        }
      })
    },
    repositoryWith(result())
  );

  assert.equal(targets[0]?.terraformAddress, "aws_s3_bucket.existing_bucket");
  assert.equal(targets[0]?.importId, "existing-bucket");
});

test("ready suggestion이 없는 관리 대상은 참고용 결정으로 import에서 제외한다", async () => {
  const scanResult = result();
  scanResult.importSuggestions = [
    {
      id: "import-resource-existing-bucket",
      resourceId: "resource-existing-bucket",
      status: "manual_review",
      handoffReady: false,
      reason: "import ID 없음"
    }
  ];

  const targets = await resolveVerifiedImportTargets(
    {
      projectId: "project-1",
      accessContext,
      diagramJson: diagram({
        importDecision: {
          version: 1,
          mode: "observe_only",
          statusAtConfirmation: "manual_review"
        }
      })
    },
    repositoryWith(scanResult)
  );

  assert.deepEqual(targets, []);
});

test("AWS와 SketchCatch가 소유한 리소스는 보드에 남아도 프로젝트 import에서 제외한다", async () => {
  const scanResult = result({
    id: "resource-control-role",
    providerResourceType: "AWS::IAM::Role",
    providerResourceId: "arn:aws:iam::123456789012:role/SketchCatchImportRead-control",
    displayName: "SketchCatchImportRead-control",
    resourceType: "IAM_ROLE",
    config: { roleName: "SketchCatchImportRead-control" }
  });
  scanResult.importSuggestions = [
    {
      id: "import-resource-control-role",
      resourceId: "resource-control-role",
      status: "ready",
      handoffReady: true,
      terraformAddress: "aws_iam_role.sketchcatch_control",
      importCommand:
        "terraform import aws_iam_role.sketchcatch_control arn:aws:iam::123456789012:role/SketchCatchImportRead-control"
    }
  ];

  const targets = await resolveVerifiedImportTargets(
    {
      projectId: "project-1",
      accessContext,
      diagramJson: diagram({
        id: "resource-control-role",
        resourceType: "aws_iam_role",
        resourceName: "sketchcatch_control",
        importDecision: {
          version: 1,
          mode: "observe_only",
          statusAtConfirmation: "ready"
        }
      })
    },
    repositoryWith(scanResult)
  );

  assert.deepEqual(targets, []);
});

test("같은 scan에 Subnet과 Route Table이 없는 과거 Association handoff는 import 대상에서 제외한다", async () => {
  const scanResult = result({
    id: "resource-route-table-association",
    providerResourceType: "AWS::EC2::RouteTableAssociation",
    providerResourceId: "rtbassoc-main-subnet",
    displayName: "rtbassoc-main-subnet",
    resourceType: "ROUTE_TABLE_ASSOCIATION",
    config: {
      routeTableAssociationId: "rtbassoc-main-subnet",
      subnetId: "subnet-main",
      routeTableId: "rtb-main",
      main: false
    },
    relationships: [
      {
        type: "connects_to",
        targetResourceId: "resource-subnet-main",
        label: "attached_to"
      },
      {
        type: "depends_on",
        targetResourceId: "resource-rtb-main",
        label: "depends_on"
      }
    ]
  });
  scanResult.importSuggestions = [
    {
      id: "import-resource-route-table-association",
      resourceId: "resource-route-table-association",
      status: "ready",
      handoffReady: true,
      terraformAddress: "aws_route_table_association.resource_route_table_association",
      importCommand:
        "terraform import aws_route_table_association.resource_route_table_association subnet-main/rtb-main"
    }
  ];

  const targets = await resolveVerifiedImportTargets(
    {
      projectId: "project-1",
      accessContext,
      diagramJson: diagram({
        id: "resource-route-table-association",
        resourceType: "aws_route_table_association",
        resourceName: "resource_route_table_association",
        importDecision: {
          version: 1,
          mode: "observe_only",
          statusAtConfirmation: "ready"
        }
      })
    },
    repositoryWith(scanResult)
  );

  assert.deepEqual(targets, []);
});

test("같은 scan 참조가 없는 과거 EIP/NAT handoff는 import 대상에서 제외한다", async () => {
  const scenarios = [
    {
      resource: {
        id: "resource-orphan-eip",
        providerResourceType: "AWS::EC2::EIP",
        providerResourceId: "eipalloc-0123456789abcdef0",
        displayName: "orphan-eip",
        resourceType: "ELASTIC_IP" as const,
        config: {
          allocationId: "eipalloc-0123456789abcdef0",
          associationTargetType: "nat_gateway",
          domain: "vpc"
        },
        relationships: [
          { type: "depends_on" as const, targetResourceId: "missing-nat", label: "depends_on" }
        ]
      },
      terraformType: "aws_eip",
      terraformName: "resource_orphan_eip"
    },
    {
      resource: {
        id: "resource-orphan-nat",
        providerResourceType: "AWS::EC2::NatGateway",
        providerResourceId: "nat-0123456789abcdef0",
        displayName: "orphan-nat",
        resourceType: "NAT_GATEWAY" as const,
        config: {
          allocationIds: [],
          connectivityType: "private",
          natGatewayId: "nat-0123456789abcdef0",
          state: "available",
          subnetId: "subnet-0123456789abcdef0"
        },
        relationships: [
          { type: "contains" as const, targetResourceId: "missing-subnet", label: "contains" }
        ]
      },
      terraformType: "aws_nat_gateway",
      terraformName: "resource_orphan_nat"
    }
  ];

  for (const scenario of scenarios) {
    const scanResult = result(scenario.resource);
    scanResult.importSuggestions = [
      {
        id: `import-${scenario.resource.id}`,
        resourceId: scenario.resource.id,
        status: "ready",
        handoffReady: true,
        terraformAddress: `${scenario.terraformType}.${scenario.terraformName}`,
        importCommand: `terraform import ${scenario.terraformType}.${scenario.terraformName} ${scenario.resource.providerResourceId}`
      }
    ];

    const targets = await resolveVerifiedImportTargets(
      {
        projectId: "project-1",
        accessContext,
        diagramJson: diagram({
          id: scenario.resource.id,
          resourceType: scenario.terraformType,
          resourceName: scenario.terraformName,
          importDecision: {
            version: 1,
            mode: "observe_only",
            statusAtConfirmation: "ready"
          }
        })
      },
      repositoryWith(scanResult)
    );

    assert.deepEqual(targets, [], scenario.resource.resourceType);
  }
});

test("같은 scan ALB 관계가 없는 과거 Target Group과 Listener handoff는 import에서 제외한다", async () => {
  const scenarios = [
    {
      resource: {
        id: "resource-orphan-target-group",
        providerResourceType: "AWS::ElasticLoadBalancingV2::TargetGroup",
        providerResourceId:
          "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/orders/b1c2d3e4f5a6b7c8",
        displayName: "orders-api",
        resourceType: "LOAD_BALANCER_TARGET_GROUP" as const,
        config: {
          name: "orders-api",
          port: 8080,
          protocol: "HTTP",
          targetType: "ip",
          vpcId: "vpc-orders",
          healthCheck: {
            enabled: true,
            protocol: "HTTP",
            port: "traffic-port",
            path: "/health",
            matcher: "200-399",
            interval: 30,
            timeout: 5,
            healthyThreshold: 2,
            unhealthyThreshold: 2
          },
          reverseEngineeringDetailsVersion: 1,
          attributesReadComplete: true,
          tagsReadComplete: true,
          attributes: {},
          tags: []
        },
        relationships: [
          { type: "depends_on" as const, targetResourceId: "missing-vpc" },
          { type: "connects_to" as const, targetResourceId: "missing-alb" }
        ]
      },
      terraformType: "aws_lb_target_group",
      terraformName: "resource_orphan_target_group"
    },
    {
      resource: {
        id: "resource-orphan-listener",
        providerResourceType: "AWS::ElasticLoadBalancingV2::Listener",
        providerResourceId:
          "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:listener/app/orders/a1b2c3d4e5f6a7b8/c1d2e3f4a5b6c7d8",
        displayName: "HTTP:80",
        resourceType: "LOAD_BALANCER_LISTENER" as const,
        config: {
          port: 80,
          protocol: "HTTP",
          defaultAction: { type: "forward" },
          simpleForwardAction: true,
          reverseEngineeringDetailsVersion: 1,
          attributesReadComplete: true,
          tagsReadComplete: true,
          attributes: {},
          tags: []
        },
        relationships: [
          { type: "depends_on" as const, targetResourceId: "missing-alb" },
          { type: "connects_to" as const, targetResourceId: "missing-target-group" }
        ]
      },
      terraformType: "aws_lb_listener",
      terraformName: "resource_orphan_listener"
    }
  ];

  for (const scenario of scenarios) {
    const scanResult = result(scenario.resource);
    scanResult.importSuggestions = [
      {
        id: `import-${scenario.resource.id}`,
        resourceId: scenario.resource.id,
        status: "ready",
        handoffReady: true,
        terraformAddress: `${scenario.terraformType}.${scenario.terraformName}`,
        importCommand: `terraform import ${scenario.terraformType}.${scenario.terraformName} ${scenario.resource.providerResourceId}`
      }
    ];

    const targets = await resolveVerifiedImportTargets(
      {
        projectId: "project-1",
        accessContext,
        diagramJson: diagram({
          id: scenario.resource.id,
          resourceType: scenario.terraformType,
          resourceName: scenario.terraformName,
          importDecision: {
            version: 1,
            mode: "observe_only",
            statusAtConfirmation: "ready"
          }
        })
      },
      repositoryWith(scanResult)
    );

    assert.deepEqual(targets, [], scenario.resource.resourceType);
  }
});

function repositoryWith(
  scanResult: ReverseEngineeringScanResult,
  overrides: Partial<{ id: string; projectId: string; status: string }> = {}
): ReverseEngineeringImportTargetRepository {
  return {
    async findAccessibleScan(projectId, scanId) {
      assert.equal(projectId, "project-1");
      assert.equal(scanId, "scan-1");
      return {
        id: overrides.id ?? "scan-1",
        projectId: overrides.projectId ?? projectId,
        status: overrides.status ?? "completed",
        result: scanResult
      };
    }
  };
}

function result(resourceOverrides: Partial<DiscoveredResource> = {}): ReverseEngineeringScanResult {
  const resource: DiscoveredResource = {
    id: "resource-existing-bucket",
    provider: "aws",
    providerResourceType: "AWS::S3::Bucket",
    providerResourceId: "existing-bucket",
    region: "ap-northeast-2",
    displayName: "existing-bucket",
    resourceType: "S3",
    config: { bucket: "existing-bucket" },
    ...resourceOverrides
  };
  const scan = {
    id: "scan-1",
    projectId: "project-1",
    awsConnectionId: "connection-1",
    provider: "aws" as const,
    region: "ap-northeast-2",
    resourceTypes: ["ALL" as const],
    status: "completed" as const,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    startedAt: "2026-07-20T00:00:00.000Z",
    completedAt: "2026-07-20T00:00:00.000Z",
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  };

  return {
    scan,
    discoveredResources: [resource],
    reverseEngineeringDraft: {
      id: "draft-scan-1",
      scanId: "scan-1",
      architectureJson: { nodes: [], edges: [] },
      protectedValueKeys: [],
      editableValueKeys: [],
      createdAt: "2026-07-20T00:00:00.000Z"
    },
    architectureJson: { nodes: [], edges: [] },
    findings: [],
    analysisExclusions: [],
    importSuggestions: [
      {
        id: "import-resource-existing-bucket",
        resourceId: resource.id,
        status: "ready",
        handoffReady: true,
        terraformAddress: "aws_s3_bucket.existing_bucket",
        importCommand: "terraform import aws_s3_bucket.existing_bucket existing-bucket"
      }
    ],
    scanErrors: []
  };
}

function diagram(
  overrides: {
    id?: string;
    resourceType?: string;
    resourceName?: string;
    reverseEngineeringDraftId?: string;
    reverseEngineeringSourceKind?: string;
    importDecision?: ReverseEngineeringImportDecision | null;
    browserValues?: Record<string, unknown>;
  } = {}
): DiagramJson {
  return {
    nodes: [
      {
        id: overrides.id ?? "resource-existing-bucket",
        type: overrides.resourceType ?? "aws_s3_bucket",
        kind: "resource",
        position: { x: 0, y: 0 },
        size: { width: 48, height: 48 },
        label: "기존 리소스",
        locked: false,
        zIndex: 1,
        metadata: {
          reverseEngineering: {
            source: "aws_scan",
            protectedValueKeys: [],
            editableValueKeys: [],
            ...(overrides.importDecision === null
              ? {}
              : {
                  importDecision: overrides.importDecision ?? {
                    version: 1,
                    mode: "import_existing",
                    statusAtConfirmation: "ready"
                  }
                })
          }
        },
        parameters: {
          terraformBlockType: "resource",
          resourceType: overrides.resourceType ?? "aws_s3_bucket",
          resourceName: overrides.resourceName ?? "existing_bucket",
          fileName: "main",
          values: {
            ...overrides.browserValues,
            reverseEngineeringSourceScanId: "scan-1",
            reverseEngineeringDraftId: overrides.reverseEngineeringDraftId ?? "draft-scan-1",
            reverseEngineeringSourceKind: overrides.reverseEngineeringSourceKind ?? "saved_scan"
          }
        }
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function stampPersistedIdentity(
  rawResult: ReverseEngineeringScanResult
): ReverseEngineeringScanResult {
  const scan = result().scan;

  return {
    ...rawResult,
    scan,
    reverseEngineeringDraft: {
      ...rawResult.reverseEngineeringDraft,
      id: "draft-scan-1",
      scanId: scan.id,
      createdAt: scan.completedAt ?? scan.updatedAt
    }
  };
}

function diagramFromPublicArchitecture(
  architectureJson: ArchitectureJson,
  scanId: string,
  draftId: string,
  scanResult: ReverseEngineeringScanResult
): DiagramJson {
  return {
    nodes: architectureJson.nodes.map((node, index) => {
      const suggestion = scanResult.importSuggestions.find(
        (candidate) => candidate.resourceId === node.id
      );
      const statusAtConfirmation = suggestion?.status ?? "unsupported_resource_type";

      return {
        id: node.id,
        type: String(node.config["terraformResourceType"] ?? node.type),
        kind: "resource" as const,
        position: { x: node.positionX, y: node.positionY },
        size: { width: 48, height: 48 },
        label: node.label ?? node.id,
        locked: false,
        zIndex: index + 1,
        metadata: {
          reverseEngineering: {
            source: "aws_scan" as const,
            protectedValueKeys: [],
            editableValueKeys: [],
            importDecision: {
              version: 1 as const,
              mode:
                statusAtConfirmation === "ready"
                  ? ("import_existing" as const)
                  : ("observe_only" as const),
              statusAtConfirmation
            }
          }
        },
        parameters: {
          terraformBlockType: "resource" as const,
          resourceType: String(node.config["terraformResourceType"] ?? ""),
          resourceName: String(node.config["terraformResourceName"] ?? ""),
          fileName: String(node.config["terraformFileName"] ?? ""),
          values: {
            ...structuredClone(node.config),
            reverseEngineeringSourceScanId: scanId,
            reverseEngineeringDraftId: draftId,
            reverseEngineeringSourceKind: "saved_scan"
          }
        }
      };
    }),
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}
