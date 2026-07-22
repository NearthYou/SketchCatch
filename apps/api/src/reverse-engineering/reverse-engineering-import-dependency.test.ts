import assert from "node:assert/strict";
import test from "node:test";
import type {
  DiagramJson,
  DiscoveredResource,
  ReverseEngineeringScanResult,
  ResourceType
} from "@sketchcatch/types";
import {
  ReverseEngineeringImportDecisionValidationError,
  validateAndStampReverseEngineeringImportDecisions
} from "./reverse-engineering-import-decision.js";
import {
  ReverseEngineeringImportDependencyError,
  validateReverseEngineeringImportDependencies
} from "./reverse-engineering-import-dependency.js";
import { resolveVerifiedImportTargets } from "./reverse-engineering-import-targets.js";
import { createReverseEngineeringTerraformProjection } from "./reverse-engineering-terraform-projection.js";

test("가져올 NAT가 참조하는 Subnet을 함께 선택하지 않으면 거부한다", () => {
  const result = dependencyScanResult();

  assert.throws(
    () =>
      validateReverseEngineeringImportDependencies({
        storedScanResult: result,
        importExistingResourceIds: ["resource-nat"]
      }),
    (error: unknown) =>
      error instanceof ReverseEngineeringImportDependencyError &&
      /NAT Gateway/u.test(error.message) &&
      /Private Subnet/u.test(error.message) &&
      /함께 선택/u.test(error.message)
  );
});

test("가져올 NAT와 참조 대상 Subnet을 함께 선택하면 통과한다", () => {
  assert.doesNotThrow(() =>
    validateReverseEngineeringImportDependencies({
      storedScanResult: dependencyScanResult(),
      importExistingResourceIds: ["resource-nat", "resource-subnet"]
    })
  );
});

test("중첩 Route 설정에서 시작한 여러 단계 의존성을 끝까지 확인한다", () => {
  const result = dependencyScanResult();

  assert.throws(
    () =>
      validateReverseEngineeringImportDependencies({
        storedScanResult: result,
        importExistingResourceIds: ["resource-route", "resource-nat"]
      }),
    (error: unknown) =>
      error instanceof ReverseEngineeringImportDependencyError &&
      /NAT Gateway/u.test(error.message) &&
      /Private Subnet/u.test(error.message)
  );

  assert.doesNotThrow(() =>
    validateReverseEngineeringImportDependencies({
      storedScanResult: result,
      importExistingResourceIds: ["resource-route", "resource-nat", "resource-subnet"]
    })
  );
});

test("vpc-와 subnet- 형태의 실제 AWS ID 문자열은 Terraform 참조로 오인하지 않는다", () => {
  assert.doesNotThrow(() =>
    validateReverseEngineeringImportDependencies({
      storedScanResult: dependencyScanResult(),
      importExistingResourceIds: ["resource-subnet"]
    })
  );
});

test("서버가 결정을 기록하기 전에 누락된 함께 가져오기 선택을 거부한다", () => {
  const storedScanResult = dependencyScanResult();

  assert.throws(
    () =>
      validateAndStampReverseEngineeringImportDecisions({
        request: {
          version: 1,
          selectedReadyResourceIds: ["resource-nat"],
          acknowledgedReviewOnlyResourceIds: []
        },
        diagramJson: dependencyDiagram(storedScanResult, new Set(["resource-nat"])),
        appliedSourceNodeIds: storedScanResult.discoveredResources.map((resource) => resource.id),
        storedScanResult
      }),
    (error: unknown) =>
      error instanceof ReverseEngineeringImportDecisionValidationError &&
      error.reason === "missing_import_dependency" &&
      /Private Subnet.*함께 선택/u.test(error.message)
  );
});

test("import block 대상을 만들기 직전에 저장 scan 의존성을 다시 확인한다", async () => {
  const storedScanResult = dependencyScanResult();

  await assert.rejects(
    resolveVerifiedImportTargets(
      {
        projectId: "project-1",
        accessContext: { kind: "user", userId: "user-1" },
        diagramJson: dependencyDiagram(storedScanResult, new Set(["resource-nat"]))
      },
      {
        async findAccessibleScan() {
          return {
            id: storedScanResult.scan.id,
            projectId: storedScanResult.scan.projectId,
            status: "completed",
            result: storedScanResult
          };
        }
      }
    ),
    /Private Subnet.*함께 선택/u
  );
});

/** gg: 실제 projection이 중첩 참조를 만드는 Route -> NAT -> Subnet scan을 구성합니다. */
function dependencyScanResult(): ReverseEngineeringScanResult {
  const vpc = resource("VPC", {
    id: "resource-vpc",
    providerResourceType: "AWS::EC2::VPC",
    providerResourceId: "vpc-0123456789abcdef0",
    displayName: "Main VPC",
    config: { cidrBlock: "10.0.0.0/16", instanceTenancy: "default" }
  });
  const subnet = resource("SUBNET", {
    id: "resource-subnet",
    providerResourceType: "AWS::EC2::Subnet",
    providerResourceId: "subnet-0123456789abcdef0",
    displayName: "Private Subnet",
    config: {
      vpcId: "vpc-0123456789abcdef0",
      cidrBlock: "10.0.1.0/24",
      availabilityZone: "ap-northeast-2a",
      mapPublicIpOnLaunch: false,
      assignIpv6AddressOnCreation: false
    },
    relationships: [{ type: "contains", targetResourceId: vpc.id }]
  });
  const nat = resource("NAT_GATEWAY", {
    id: "resource-nat",
    providerResourceType: "AWS::EC2::NatGateway",
    providerResourceId: "nat-0123456789abcdef0",
    displayName: "NAT Gateway",
    config: {
      allocationIds: [],
      connectivityType: "private",
      natGatewayId: "nat-0123456789abcdef0",
      state: "available",
      subnetId: "subnet-0123456789abcdef0"
    },
    relationships: [{ type: "contains", targetResourceId: subnet.id }]
  });
  const route = resource("ROUTE_TABLE", {
    id: "resource-route",
    providerResourceType: "AWS::EC2::RouteTable",
    providerResourceId: "rtb-0123456789abcdef0",
    displayName: "Private Route Table",
    config: {
      vpcId: "vpc-0123456789abcdef0",
      routes: [
        {
          destinationCidrBlock: "0.0.0.0/0",
          natGatewayId: "nat-0123456789abcdef0"
        }
      ]
    },
    relationships: [{ type: "depends_on", targetResourceId: nat.id }]
  });
  const resources = [vpc, subnet, nat, route];
  const createdAt = "2026-07-23T00:00:00.000Z";
  const architectureJson = {
    nodes: resources.map((item, index) => ({
      id: item.id,
      type: item.resourceType,
      label: item.displayName,
      positionX: index * 80,
      positionY: 0,
      config: structuredClone(item.config)
    })),
    edges: []
  };

  return {
    scan: {
      id: "scan-dependency",
      projectId: "project-1",
      awsConnectionId: "connection-1",
      provider: "aws",
      region: "ap-northeast-2",
      resourceTypes: ["ALL"],
      status: "completed",
      createdAt,
      updatedAt: createdAt,
      startedAt: createdAt,
      completedAt: createdAt,
      cancelRequestedAt: null,
      deletedAt: null,
      errorSummary: null
    },
    discoveredResources: resources,
    reverseEngineeringDraft: {
      id: "draft-dependency",
      scanId: "scan-dependency",
      architectureJson,
      protectedValueKeys: [],
      editableValueKeys: [],
      createdAt
    },
    architectureJson,
    findings: [],
    analysisExclusions: [],
    importSuggestions: resources.map((item) => {
      const projection = createReverseEngineeringTerraformProjection(item, resources);
      const terraformAddress = `${projection.terraformResourceType}.${projection.terraformResourceName}`;
      return {
        id: `import-${item.id}`,
        resourceId: item.id,
        status: "ready" as const,
        handoffReady: true,
        terraformAddress,
        importCommand: `terraform import ${terraformAddress} ${item.providerResourceId}`
      };
    }),
    scanErrors: []
  };
}

/** gg: 서버 결정 검증에 사용할 source Diagram과 사용자 선택 상태를 만듭니다. */
function dependencyDiagram(
  result: ReverseEngineeringScanResult,
  selectedResourceIds: ReadonlySet<string>
): DiagramJson {
  return {
    nodes: result.discoveredResources.map((resource, index) => {
      const projection = createReverseEngineeringTerraformProjection(
        resource,
        result.discoveredResources
      );

      return {
        id: resource.id,
        type: String(projection.terraformResourceType),
        kind: "resource" as const,
        position: { x: index * 80, y: 0 },
        size: { width: 48, height: 48 },
        label: resource.displayName,
        locked: false,
        zIndex: index + 1,
        metadata: {
          reverseEngineering: {
            source: "aws_scan" as const,
            protectedValueKeys: [],
            editableValueKeys: [],
            importDecision: {
              version: 1 as const,
              mode: selectedResourceIds.has(resource.id)
                ? ("import_existing" as const)
                : ("observe_only" as const),
              statusAtConfirmation: "ready" as const
            }
          }
        },
        parameters: {
          terraformBlockType: "resource" as const,
          resourceType: String(projection.terraformResourceType),
          resourceName: String(projection.terraformResourceName),
          fileName: "reverse-engineering",
          values: {
            ...structuredClone(projection.terraformValues),
            reverseEngineeringSourceScanId: result.scan.id,
            reverseEngineeringDraftId: result.reverseEngineeringDraft.id,
            reverseEngineeringSourceKind: "saved_scan"
          }
        }
      };
    }),
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

/** gg: dependency fixture에 필요한 AWS resource 기본값을 일관되게 만듭니다. */
function resource(
  resourceType: ResourceType,
  overrides: Partial<DiscoveredResource>
): DiscoveredResource {
  return {
    id: `resource-${resourceType.toLowerCase()}`,
    provider: "aws",
    providerResourceType: `AWS::Fixture::${resourceType}`,
    providerResourceId: `provider-${resourceType.toLowerCase()}`,
    region: "ap-northeast-2",
    displayName: resourceType,
    resourceType,
    config: {},
    relationships: [],
    ...overrides
  };
}
