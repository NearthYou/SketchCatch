import assert from "node:assert/strict";
import test from "node:test";
import type {
  DiagramJson,
  DiscoveredResource,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";
import {
  resolveVerifiedImportTargets,
  ReverseEngineeringImportTargetVerificationError,
  type ReverseEngineeringImportTargetRepository
} from "./reverse-engineering-import-targets.js";

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

test("ready suggestion이 없는 관리 대상은 새 리소스로 생성되지 않도록 중단한다", async () => {
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

  await assert.rejects(
    resolveVerifiedImportTargets(
      {
        projectId: "project-1",
        accessContext,
        diagramJson: diagram()
      },
      repositoryWith(scanResult)
    ),
    /안전하게 가져올 수 없습니다/u
  );
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
        resourceName: "sketchcatch_control"
      })
    },
    repositoryWith(scanResult)
  );

  assert.deepEqual(targets, []);
});

function repositoryWith(
  scanResult: ReverseEngineeringScanResult
): ReverseEngineeringImportTargetRepository {
  return {
    async findAccessibleScan(projectId, scanId) {
      assert.equal(projectId, "project-1");
      assert.equal(scanId, "scan-1");
      return {
        id: "scan-1",
        projectId,
        status: "completed",
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
        parameters: {
          terraformBlockType: "resource",
          resourceType: overrides.resourceType ?? "aws_s3_bucket",
          resourceName: overrides.resourceName ?? "existing_bucket",
          fileName: "main",
          values: {
            reverseEngineeringSourceScanId: "scan-1",
            reverseEngineeringDraftId:
              overrides.reverseEngineeringDraftId ?? "draft-scan-1",
            reverseEngineeringSourceKind: "saved_scan"
          }
        }
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}
