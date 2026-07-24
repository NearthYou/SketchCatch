import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson, ReverseEngineeringScanResult } from "@sketchcatch/types";
import {
  createBoardAutoOrganizeCandidates,
  hasSameBoardAutoOrganizeSemantics
} from "../architecture-board-compiler";
import {
  convertReverseEngineeringBoardToArchitectureJson,
  createReverseEngineeringBoardApplication
} from "./reverse-engineering-board-application";
import { summarizeReverseEngineeringScan } from "./reverse-engineering-presentation";
import { createReverseEngineeringBoardCandidates } from "./reverse-engineering-board-candidates";
import {
  createReverseEngineeringFinalRegressionFixture,
  TASK9_REVIEW_ONLY_RESOURCE_IDS,
  TASK9_SUPPORTED_RESOURCE_IDS
} from "./reverse-engineering-final-regression.fixture";
import { convertDiagramJsonToArchitectureJson } from "./workspace-ai-diagram-adapter";

const currentDiagram: DiagramJson = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 }
};

const scanResult: ReverseEngineeringScanResult = {
  scan: {
    id: "scan-1",
    projectId: "project-1",
    awsConnectionId: "connection-1",
    provider: "aws",
    region: "ap-northeast-2",
    resourceTypes: [],
    status: "completed",
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    startedAt: null,
    completedAt: null,
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  },
  architectureJson: {
    nodes: [
      {
        id: "vpc-1",
        type: "VPC",
        label: "Production VPC",
        positionX: 0,
        positionY: 0,
        config: { providerResourceId: "vpc-123" }
      },
      {
        id: "unknown-1",
        type: "UNKNOWN",
        label: "Unmapped resource",
        positionX: 0,
        positionY: 0,
        config: {}
      }
    ],
    edges: []
  },
  reverseEngineeringDraft: {
    id: "draft-1",
    scanId: "scan-1",
    architectureJson: { nodes: [], edges: [] },
    protectedValueKeys: [],
    editableValueKeys: [],
    createdAt: "2026-07-15T00:00:00.000Z"
  },
  discoveredResources: [],
  findings: [],
  analysisExclusions: [],
  importSuggestions: [],
  scanErrors: []
};

test("Reverse Engineering 정리안은 표시 프레임을 고정하고 프레임 밖 멤버 이동을 버린다", () => {
  const inputBefore = structuredClone(scanResult);
  const original = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "replace",
    placement: "original",
    result: scanResult
  });
  const originalFrame = original.diagram.nodes.find(
    (node) =>
      node.metadata?.reverseEngineeringInfrastructureFrame?.memberNodeIds.includes("vpc-1") ===
      true
  );
  assert.ok(originalFrame);
  const organizedDiagram = structuredClone(original.diagram);
  organizedDiagram.nodes.find((node) => node.id === originalFrame.id)!.position = {
    x: 900,
    y: 800
  };
  organizedDiagram.nodes.find((node) => node.id === "vpc-1")!.position = {
    x: 900,
    y: 800
  };
  const application = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "replace",
    organizedDiagram,
    placement: "compiled",
    result: scanResult
  });

  assert.equal(application.compilation, null);
  assert.deepEqual(
    application.diagram.nodes.find((node) => node.id === originalFrame.id),
    originalFrame
  );
  assert.deepEqual(
    application.diagram.nodes.find((node) => node.id === "vpc-1")?.position,
    original.diagram.nodes.find((node) => node.id === "vpc-1")?.position
  );
  assert.deepEqual(application.previewDiagram, application.diagram);
  assert.equal(
    application.previewDiagram.nodes.filter((node) => node.kind === "resource").length,
    2
  );
  assert.equal(
    application.diagram.nodes.find((node) => node.id === "vpc-1")?.metadata
      ?.reverseEngineering?.source,
    "aws_scan"
  );
  assert.equal(hasSameBoardAutoOrganizeSemantics(original.diagram, application.diagram), true);
  assert.deepEqual(scanResult, inputBefore);
});

test("Reverse Engineering 정리안은 표시 프레임 소속 변경을 거절한다", () => {
  const original = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "replace",
    placement: "original",
    result: scanResult
  });
  const organizedDiagram = structuredClone(original.diagram);
  const frame = organizedDiagram.nodes.find(
    (node) => node.metadata?.reverseEngineeringInfrastructureFrame !== undefined
  );
  assert.ok(frame);
  frame.metadata = {
    ...frame.metadata,
    reverseEngineeringInfrastructureFrame: {
      ...frame.metadata!.reverseEngineeringInfrastructureFrame!,
      memberNodeIds: []
    }
  };

  assert.throws(
    () =>
      createReverseEngineeringBoardApplication({
        currentDiagram,
        mode: "replace",
        organizedDiagram,
        placement: "compiled",
        result: scanResult
      }),
    /AWS 원본을 변경/
  );
});

test("Reverse Engineering은 원래 배치를 선택하면 Compiler proposal 없이 AWS 파생 보드를 반환한다", () => {
  const applicationInput = {
    currentDiagram,
    mode: "replace" as const,
    placement: "original" as const,
    result: scanResult
  };
  const application = createReverseEngineeringBoardApplication(applicationInput);

  assert.equal(application.compilation, null);
  assert.deepEqual(
    application.diagram.nodes
      .filter((node) => node.kind === "resource")
      .map(({ id, metadata }) => ({
        id,
        source: metadata?.reverseEngineering?.source
      })),
    [
      { id: "vpc-1", source: "aws_scan" },
      { id: "unknown-1", source: "aws_scan" }
    ]
  );
  assert.deepEqual(application.diagram, application.previewDiagram);
  assert.deepEqual(
    application.diagram.nodes
      .filter((node) => node.kind === "resource")
      .map(({ id, position }) => ({ id, position })),
    [
      { id: "vpc-1", position: { x: 0, y: 0 } },
      { id: "unknown-1", position: { x: 0, y: 0 } }
    ]
  );
});

test("가져온 원본 후보는 관계가 애매해도 Resource와 연결선을 임의로 빼지 않는다", () => {
  const result = structuredClone(scanResult);
  result.architectureJson.edges = [
    { id: "contains-1", sourceId: "vpc-1", targetId: "unknown-1", label: "contains" },
    { id: "contains-2", sourceId: "unknown-1", targetId: "vpc-1", label: "contains" }
  ];

  const candidates = createReverseEngineeringBoardCandidates(result);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.title, "가져온 원본");
  assert.deepEqual(candidates[0]?.architectureJson, result.architectureJson);
});

test("원래 배치는 AWS에서 읽은 Resource, 관계, 설정을 하나도 추가하거나 바꾸지 않는다", () => {
  const source = structuredClone(scanResult);
  source.architectureJson = {
    nodes: [
      {
        id: "vpc-source",
        type: "VPC",
        label: "원본 VPC",
        positionX: 120,
        positionY: 80,
        config: {
          providerResourceId: "vpc-source",
          providerResourceType: "AWS::EC2::VPC",
          cidrBlock: "10.0.0.0/16"
        }
      },
      {
        id: "unknown-source",
        type: "UNKNOWN",
        label: "원본 미지원 Resource",
        positionX: 360,
        positionY: 80,
        config: {
          providerResourceId: "custom-source",
          providerResourceType: "AWS::Custom::Thing",
          opaqueSetting: "keep-me"
        }
      }
    ],
    edges: [
      {
        id: "source-edge",
        sourceId: "vpc-source",
        targetId: "unknown-source",
        label: "connects_to"
      }
    ]
  };

  const application = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "replace",
    placement: "original",
    result: source
  });
  const storedArchitecture = convertReverseEngineeringBoardToArchitectureJson(
    application.diagram,
    source
  );

  assert.equal(application.diagram.presentation?.geometryPolicy, "source-exact");
  assert.deepEqual(
    application.diagram.nodes
      .filter((node) => node.kind === "resource")
      .map((node) => ({ id: node.id, values: node.parameters?.values })),
    source.architectureJson.nodes.map((node) => ({ id: node.id, values: node.config }))
  );
  assert.deepEqual(application.diagram.edges, [
    {
      id: "source-edge",
      label: "connects_to",
      sourceNodeId: "vpc-source",
      targetNodeId: "unknown-source"
    }
  ]);
  assert.deepEqual(storedArchitecture, source.architectureJson);
});

test("Reverse Engineering 자동 정리는 원본 의미를 지킨 shared 후보만 사용한다", () => {
  const overlappingResult = createOverlappingBucketScanResult();
  const originalApplication = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "replace",
    placement: "original",
    result: overlappingResult
  });
  const candidateSet = createBoardAutoOrganizeCandidates(
    originalApplication.diagram,
    convertReverseEngineeringBoardToArchitectureJson(originalApplication.diagram, overlappingResult)
  );
  const candidate = candidateSet.candidates[0];

  assert.ok(candidate);

  const compiledApplication = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "replace",
    organizedDiagram: candidate.diagram,
    placement: "compiled",
    result: overlappingResult
  });

  assert.equal(compiledApplication.compilation, null);
  assert.equal(
    hasSameBoardAutoOrganizeSemantics(originalApplication.diagram, compiledApplication.diagram),
    true
  );
  assert.notDeepEqual(
    compiledApplication.diagram.nodes.map(({ id, position }) => ({ id, position })),
    originalApplication.diagram.nodes.map(({ id, position }) => ({ id, position }))
  );
  assert.deepEqual(compiledApplication.diagram, candidate.diagram);
});

test("Reverse Engineering은 정리안이 없으면 자동 정리를 암묵적으로 실행하지 않는다", () => {
  const originalApplication = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "replace",
    placement: "original",
    result: scanResult
  });

  assert.equal(originalApplication.compilation, null);
  assert.throws(
    () =>
      createReverseEngineeringBoardApplication({
        currentDiagram,
        mode: "replace",
        placement: "compiled",
        result: scanResult
      }),
    /선택한 Board 정리안을 찾지 못했습니다/
  );
});

test("Reverse Engineering 원래 배치는 Compiler 없이 현재 Board에 추가할 최종 후보가 될 수 있다", () => {
  const currentBoard: DiagramJson = {
    nodes: [
      makeResourceNode("current-bucket", "aws_s3_bucket", "current_bucket", "bucket-current", 0)
    ],
    edges: [],
    viewport: { x: 12, y: 24, zoom: 1.2 },
    variables: [
      {
        id: "variable-current-region",
        name: "aws_region",
        type: "string",
        value: "ap-northeast-2",
        bindings: [
          {
            nodeId: "current-bucket",
            parameterKey: "region"
          }
        ],
        source: "user"
      }
    ],
    presentation: {
      geometryPolicy: "catalog-normalized",
      terraformSourceFingerprint: "terraform-source-before-reverse"
    }
  };
  const application = createReverseEngineeringBoardApplication({
    currentDiagram: currentBoard,
    mode: "append",
    placement: "original",
    result: scanResult
  });

  assert.equal(application.compilation, null);
  assert.deepEqual(
    new Set(
      application.diagram.nodes
        .filter((node) => node.kind === "resource")
        .map((node) => node.id)
    ),
    new Set(["current-bucket", "vpc-1"])
  );
  assert.deepEqual(application.diagram.viewport, currentBoard.viewport);
  assert.deepEqual(application.diagram.variables, currentBoard.variables);
  assert.deepEqual(application.diagram.presentation, currentBoard.presentation);
});

test("Reverse Engineering append는 새 Resource가 속한 표시 프레임도 함께 유지한다", () => {
  const currentBoard: DiagramJson = {
    nodes: [
      makeResourceNode("current-bucket", "aws_s3_bucket", "current_bucket", "bucket-current", 0)
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const application = createReverseEngineeringBoardApplication({
    currentDiagram: currentBoard,
    mode: "append",
    placement: "original",
    result: scanResult
  });
  const frame = application.diagram.nodes.find(
    (node) => node.metadata?.reverseEngineeringInfrastructureFrame !== undefined
  );

  assert.ok(frame);
  assert.deepEqual(
    frame.metadata?.reverseEngineeringInfrastructureFrame?.memberNodeIds,
    ["vpc-1"]
  );
  assert.equal(frame.metadata?.reverseEngineering, undefined);
  assert.equal(application.sourceOwnership.nodeIds.includes(frame.id), false);
});

test("Reverse Engineering append의 새 표시 프레임은 실제 추가 멤버 범위만 감싼다", () => {
  const currentBoard: DiagramJson = {
    nodes: [
      makeResourceNode(
        "existing-bucket",
        "aws_s3_bucket",
        "existing_bucket",
        "bucket-existing",
        0
      )
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const result = structuredClone(scanResult);
  result.architectureJson = {
    nodes: [
      {
        id: "scanned-existing-bucket",
        type: "S3",
        label: "Existing bucket",
        positionX: 0,
        positionY: 0,
        config: {
          providerResourceId: "bucket-existing",
          tags: { Project: "store" }
        }
      },
      {
        id: "scanned-new-bucket",
        type: "S3",
        label: "New bucket",
        positionX: 1_000,
        positionY: 200,
        config: {
          providerResourceId: "bucket-new",
          tags: { Project: "store" }
        }
      }
    ],
    edges: []
  };

  const application = createReverseEngineeringBoardApplication({
    currentDiagram: currentBoard,
    mode: "append",
    placement: "original",
    result
  });
  const frame = application.diagram.nodes.find(
    (node) => node.metadata?.reverseEngineeringInfrastructureFrame !== undefined
  );
  const addedNode = application.diagram.nodes.find((node) => node.id === "scanned-new-bucket");

  assert.ok(frame);
  assert.ok(addedNode);
  assert.deepEqual(
    frame.metadata?.reverseEngineeringInfrastructureFrame?.memberNodeIds,
    ["scanned-new-bucket"]
  );
  assert.equal(frame.position.x > 900, true);
  assert.equal(addedNode.position.x >= frame.position.x, true);
  assert.equal(
    addedNode.position.x + addedNode.size.width <= frame.position.x + frame.size.width,
    true
  );
});

test("Reverse Engineering 자동 정리는 scan 진단을 보드 의미 정보에 섞지 않는다", () => {
  const result = {
    ...scanResult,
    findings: [
      {
        id: "finding-public-vpc",
        category: "security",
        severity: "high",
        resourceId: "vpc-1",
        title: "Public exposure",
        description: "VPC ingress를 확인해야 합니다.",
        recommendation: "inbound rule을 제한하세요."
      }
    ],
    analysisExclusions: [
      {
        id: "excluded-unknown",
        resourceId: "unknown-1",
        reason: "unsupported_resource_type",
        message: "지원하지 않는 리소스입니다."
      }
    ],
    scanErrors: [
      {
        id: "scan-permission",
        resourceType: "UNKNOWN",
        stage: "provider_api",
        reason: "permission_denied",
        message: "권한이 부족합니다.",
        retryable: false
      }
    ]
  } satisfies ReverseEngineeringScanResult;
  const original = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "replace",
    placement: "original",
    result
  });
  const organized = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "replace",
    organizedDiagram: moveFirstNode(original.diagram, 120),
    placement: "compiled",
    result
  });

  const organizedArchitecture = convertReverseEngineeringBoardToArchitectureJson(
    organized.diagram,
    result
  );
  assert.deepEqual(
    organizedArchitecture.nodes.map(({ id, type, label, config }) => ({ id, type, label, config })),
    result.architectureJson.nodes.map(({ id, type, label, config }) => ({
      id,
      type,
      label,
      config
    }))
  );
  assert.deepEqual(organizedArchitecture.edges, result.architectureJson.edges);
});

test("발견한 검토 전용 Lambda와 IAM Role은 관계 유무와 관계없이 보호 metadata와 함께 보드에 남긴다", () => {
  const result = createReviewOnlyScanResult();
  const application = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "replace",
    placement: "original",
    result
  });
  const nodeById = new Map(application.diagram.nodes.map((node) => [node.id, node]));
  const lambda = nodeById.get("lambda-1");
  const iamRole = nodeById.get("iam-role-1");

  assert.deepEqual(
    application.diagram.nodes
      .filter((node) => node.kind === "resource")
      .map((node) => node.id),
    ["vpc-1", "lambda-1", "iam-role-1"]
  );
  assert.deepEqual(
    application.diagram.edges.map((edge) => ({
      sourceId: edge.sourceNodeId,
      targetId: edge.targetNodeId,
      label: edge.label
    })),
    [{ sourceId: "vpc-1", targetId: "lambda-1", label: "uses" }]
  );
  assert.equal(lambda?.label, "orders-handler");
  assert.equal(lambda?.type, "LAMBDA");
  assert.equal(lambda?.parameters?.values["analysisExcluded"], true);
  assert.deepEqual(lambda?.style, { borderColor: "#f97316", textColor: "#9a3412" });
  assert.equal(lambda?.metadata?.reverseEngineering?.source, "aws_scan");
  assert.deepEqual(lambda?.metadata?.reverseEngineering?.protectedValueKeys, [
    "providerResourceId",
    "providerResourceType",
    "region",
    "accountId",
    "terraformResourceName",
    "terraformResourceType"
  ]);
  assert.equal(iamRole?.label, "read-only");
  assert.equal(iamRole?.type, "IAM_ROLE");
  assert.equal(iamRole?.parameters?.values["analysisExcluded"], true);
  assert.deepEqual(iamRole?.style, { borderColor: "#f97316", textColor: "#9a3412" });
  assert.equal(iamRole?.metadata?.reverseEngineering?.source, "aws_scan");
  assert.deepEqual(summarizeReverseEngineeringScan(result), {
    discoveredCount: 3,
    boardCount: 3,
    reviewOnlyCount: 2,
    unreadableServiceCount: 0
  });
  assert.deepEqual(
    result.importSuggestions.find((suggestion) => suggestion.resourceId === "lambda-1"),
    {
      id: "import-lambda-1",
      resourceId: "lambda-1",
      status: "unsupported_resource_type",
      handoffReady: false,
      reason: "아직 정식 ResourceType으로 매핑되지 않았습니다."
    }
  );
});

test("최종 혼합 fixture는 지원 Resource와 검토 전용 Lambda 및 IAM Role을 모두 실제 타입으로 Board에 남긴다", () => {
  const { result } = createReverseEngineeringFinalRegressionFixture();
  const supportedArchitectureTypeById = new Map([
    ["vpc-task9", "VPC"],
    ["subnet-task9", "SUBNET"],
    ["security-group-task9", "SECURITY_GROUP"],
    ["load-balancer-task9", "LOAD_BALANCER"],
    ["cloudfront-task9", "CLOUDFRONT"],
    ["ecs-cluster-task9", "ECS_CLUSTER"],
    ["ecs-service-task9", "ECS_SERVICE"],
    ["ecs-task-definition-task9", "ECS_TASK_DEFINITION"]
  ] as const);
  const reviewOnlyArchitectureTypeById = new Map([
    ["lambda-task9", "LAMBDA"],
    ["iam-role-task9", "IAM_ROLE"]
  ] as const);

  for (const placement of ["original", "compiled"] as const) {
    const originalApplication = createReverseEngineeringBoardApplication({
      currentDiagram,
      mode: "replace",
      placement: "original",
      result
    });
    const application =
      placement === "original"
        ? originalApplication
        : createReverseEngineeringBoardApplication({
            currentDiagram,
            mode: "replace",
            organizedDiagram: moveFirstNode(originalApplication.diagram, 80),
            placement: "compiled",
            result
          });
    const nodeById = new Map(application.diagram.nodes.map((node) => [node.id, node]));
    const appliedArchitectureById = new Map(
      convertReverseEngineeringBoardToArchitectureJson(application.diagram, result).nodes.map(
        (node) => [node.id, node]
      )
    );

    for (const resourceId of TASK9_SUPPORTED_RESOURCE_IDS) {
      const node = nodeById.get(resourceId);
      const appliedNode = appliedArchitectureById.get(resourceId);

      assert.ok(node, `${placement} Board에 ${resourceId}가 남아야 합니다.`);
      assert.ok(appliedNode, `${placement} 적용 결과에 ${resourceId}가 남아야 합니다.`);
      assert.equal(appliedNode.type, supportedArchitectureTypeById.get(resourceId));
      assert.doesNotMatch(node.label, /^보드 표시만 · /);
      assert.notEqual(node.parameters?.values["analysisExcluded"], true);
      assert.equal(node.metadata?.reverseEngineering?.source, "aws_scan");
    }

    for (const resourceId of TASK9_REVIEW_ONLY_RESOURCE_IDS) {
      const node = nodeById.get(resourceId);
      const appliedNode = appliedArchitectureById.get(resourceId);

      assert.ok(node, `${placement} Board에 ${resourceId}가 남아야 합니다.`);
      assert.ok(appliedNode, `${placement} 적용 결과에 ${resourceId}가 남아야 합니다.`);
      assert.equal(appliedNode.type, reviewOnlyArchitectureTypeById.get(resourceId));
      assert.equal(node.parameters?.values["analysisExcluded"], true);
      assert.deepEqual(node.style, { borderColor: "#f97316", textColor: "#9a3412" });
      assert.equal(node.metadata?.reverseEngineering?.source, "aws_scan");
      assert.deepEqual(node.metadata?.reverseEngineering?.protectedValueKeys, [
        "providerResourceId",
        "providerResourceType",
        "region",
        "accountId",
        "terraformResourceName",
        "terraformResourceType"
      ]);
      assert.equal(
        application.comparison.manualReviews.some((item) => item.nodeId === resourceId),
        false
      );
    }
    assert.equal(nodeById.get("lambda-task9")?.label, "orders-handler");
    assert.equal(nodeById.get("iam-role-task9")?.label, "orders-read-only");
  }

  assert.deepEqual(
    result.architectureJson.edges
      .filter((edge) => edge.targetId === "lambda-task9")
      .map((edge) => [edge.sourceId, edge.targetId, edge.label]),
    [["vpc-task9", "lambda-task9", "uses"]]
  );
  const supportedSuggestionById = new Map(
    result.importSuggestions
      .filter((suggestion) => TASK9_SUPPORTED_RESOURCE_IDS.includes(suggestion.resourceId as never))
      .map((suggestion) => [suggestion.resourceId, suggestion])
  );
  for (const resourceId of TASK9_SUPPORTED_RESOURCE_IDS) {
    const suggestion = supportedSuggestionById.get(resourceId);

    assert.ok(suggestion);
    assert.equal(Boolean(suggestion.importCommand), true);
    if (resourceId === "ecs-task-definition-task9") {
      assert.equal(suggestion.status, "manual_review");
      assert.equal(suggestion.handoffReady, false);
      assert.match(suggestion.reason ?? "", /containerDefinitions\.environment/);
      assert.equal(suggestion.terraformBlockDraft, undefined);
    } else {
      assert.equal(suggestion.status, "ready");
      assert.equal(suggestion.handoffReady, true);
    }
  }
  assert.deepEqual(
    result.importSuggestions
      .filter((suggestion) =>
        TASK9_REVIEW_ONLY_RESOURCE_IDS.includes(suggestion.resourceId as never)
      )
      .map((suggestion) => ({
        id: suggestion.resourceId,
        status: suggestion.status,
        handoffReady: suggestion.handoffReady,
        terraformAddress: suggestion.terraformAddress,
        terraformBlockDraft: suggestion.terraformBlockDraft,
        importCommand: suggestion.importCommand
      })),
    [
      {
        id: "lambda-task9",
        status: "unsupported_resource_type",
        handoffReady: false,
        terraformAddress: undefined,
        terraformBlockDraft: undefined,
        importCommand: undefined
      },
      {
        id: "iam-role-task9",
        status: "unsupported_resource_type",
        handoffReady: false,
        terraformAddress: undefined,
        terraformBlockDraft: undefined,
        importCommand: undefined
      }
    ]
  );
  assert.deepEqual(
    result.findings.map((finding) => [finding.resourceId, finding.category]),
    [["ecs-task-definition-task9", "configuration"]]
  );
  assert.equal(
    result.discoveredResources.find((resource) => resource.id === "ecs-task-definition-task9")
      ?.config["sketchcatchReferenceTerraform"],
    true
  );
  assert.deepEqual(
    result.discoveredResources.find((resource) => resource.id === "ecs-task-definition-task9")
      ?.config["terraformValidationMissingFields"],
    ["containerDefinitions.environment"]
  );
});

test("과거 스캔에서 보정된 Lambda는 원래 배치에서도 짧은 이름과 실행 제외 marker를 유지한다", () => {
  const providerResourceId = "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler";
  const result: ReverseEngineeringScanResult = {
    ...structuredClone(scanResult),
    architectureJson: {
      nodes: [
        {
          id: "legacy-lambda",
          type: "LAMBDA",
          label: "orders-handler",
          positionX: 120,
          positionY: 80,
          config: {
            legacyConfigMarker: "keep-lambda-raw",
            providerResourceType: "AWS::Lambda::Function",
            providerResourceId,
            analysisExcluded: true
          }
        }
      ],
      edges: []
    },
    discoveredResources: [
      {
        id: "legacy-lambda",
        provider: "aws",
        providerResourceType: "AWS::Lambda::Function",
        providerResourceId,
        region: "ap-northeast-2",
        displayName: providerResourceId,
        resourceType: "LAMBDA",
        config: { functionName: "orders-handler" },
        analysisExcluded: true
      }
    ],
    analysisExclusions: [
      {
        id: "exclude-legacy-lambda",
        resourceId: "legacy-lambda",
        reason: "unsupported_resource_type",
        message: "지원하지 않는 Resource입니다."
      }
    ],
    importSuggestions: [
      {
        id: "import-legacy-lambda",
        resourceId: "legacy-lambda",
        status: "manual_review",
        handoffReady: false,
        reason:
          "AWS에서 찾았지만 현재 설정을 안전하게 Terraform으로 옮길 수 없습니다. 보드에서 구조를 확인할 수 있습니다."
      }
    ]
  };

  const application = createReverseEngineeringBoardApplication({
    currentDiagram,
    mode: "replace",
    placement: "original",
    result
  });
  const lambda = application.diagram.nodes.find((node) => node.id === "legacy-lambda");
  const appliedArchitecture = convertReverseEngineeringBoardToArchitectureJson(
    application.diagram,
    result
  );
  const appliedLambda = appliedArchitecture.nodes.find((node) => node.id === "legacy-lambda");

  assert.equal(application.compilation, null);
  assert.equal(lambda?.label, "orders-handler");
  assert.equal(lambda?.parameters?.values["analysisExcluded"], true);
  assert.equal(lambda?.parameters?.values["providerResourceId"], providerResourceId);
  assert.equal(lambda?.parameters?.values["legacyConfigMarker"], "keep-lambda-raw");
  assert.equal(lambda?.metadata?.reverseEngineering?.source, "aws_scan");
  assert.equal(appliedLambda?.config["analysisExcluded"], true);
  assert.equal(appliedLambda?.config["providerResourceId"], providerResourceId);
  assert.equal(appliedLambda?.config["legacyConfigMarker"], "keep-lambda-raw");
  assert.equal(result.importSuggestions[0]?.status, "manual_review");
});

test("Reverse Engineering append는 현재 Board와 새 스캔 리소스의 visual-only 정리안만 적용한다", () => {
  const currentBoard: DiagramJson = {
    nodes: [
      makeResourceNode("current-bucket", "aws_s3_bucket", "current_bucket", "bucket-current", 0),
      makeResourceNode("current-log", "aws_cloudwatch_log_group", "current_log", "log-current", 600)
    ],
    edges: [],
    viewport: { x: 12, y: 24, zoom: 1.2 }
  };
  const originalAppendApplication = createReverseEngineeringBoardApplication({
    currentDiagram: currentBoard,
    mode: "append",
    placement: "original",
    result: scanResult
  });
  const application = createReverseEngineeringBoardApplication({
    currentDiagram: currentBoard,
    mode: "append",
    organizedDiagram: moveFirstNode(originalAppendApplication.diagram, 180),
    placement: "compiled",
    result: scanResult
  });

  assert.equal(application.compilation, null);
  assert.deepEqual(application.previewDiagram, application.diagram);
  assert.deepEqual(
    new Set(
      application.diagram.nodes
        .filter((node) => node.kind === "resource")
        .map((node) => node.id)
    ),
    new Set(["current-bucket", "current-log", "vpc-1"])
  );
  assert.equal(
    hasSameBoardAutoOrganizeSemantics(originalAppendApplication.diagram, application.diagram),
    true
  );
  assert.equal(
    application.diagram.nodes.find((node) => node.id === "vpc-1")?.metadata?.reverseEngineering
      ?.source,
    "aws_scan"
  );
  assert.equal(
    application.diagram.nodes.find((node) => node.id === "current-bucket")?.metadata
      ?.reverseEngineering,
    undefined
  );
});

test("Reverse Engineering append Snapshot은 같은 id의 기존 Resource를 scan 원본으로 덮어쓰지 않는다", () => {
  const existingVpc = makeResourceNode("vpc-1", "aws_vpc", "existing_vpc", "vpc-123", 40);
  existingVpc.label = "사용자가 편집한 VPC";
  existingVpc.parameters!.values = {
    providerResourceId: "vpc-123",
    currentOnly: "KEEP"
  };
  const currentBoard: DiagramJson = {
    nodes: [existingVpc],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const application = createReverseEngineeringBoardApplication({
    currentDiagram: currentBoard,
    mode: "append",
    placement: "original",
    result: scanResult
  });
  const snapshot = convertReverseEngineeringBoardToArchitectureJson(
    application.diagram,
    scanResult,
    application.sourceOwnership
  );
  const expected = convertDiagramJsonToArchitectureJson(currentBoard);

  assert.deepEqual(
    application.comparison.duplicates.map((item) => item.nodeId),
    ["vpc-1"]
  );
  assert.deepEqual(snapshot, expected);
});

// 테스트 정리안은 의미 정보는 그대로 두고 첫 Resource 위치만 옮깁니다.
function moveFirstNode(diagram: DiagramJson, offsetX: number): DiagramJson {
  return {
    ...structuredClone(diagram),
    nodes: diagram.nodes.map((node, index) =>
      index === 0
        ? {
            ...structuredClone(node),
            position: { x: node.position.x + offsetX, y: node.position.y }
          }
        : structuredClone(node)
    )
  };
}

function makeResourceNode(
  id: string,
  resourceType: string,
  resourceName: string,
  providerResourceId: string,
  x: number
): DiagramJson["nodes"][number] {
  return {
    id,
    kind: "resource",
    label: resourceName,
    locked: false,
    parameters: {
      fileName: "main",
      resourceName,
      resourceType,
      terraformBlockType: "resource",
      values: { providerResourceId }
    },
    position: { x, y: 0 },
    size: { width: 48, height: 48 },
    type: resourceType,
    zIndex: 1
  };
}

function createOverlappingBucketScanResult(): ReverseEngineeringScanResult {
  return {
    ...scanResult,
    architectureJson: {
      nodes: [
        {
          id: "bucket-a",
          type: "S3",
          label: "Bucket A",
          positionX: 0,
          positionY: 0,
          config: { providerResourceId: "bucket-a" }
        },
        {
          id: "bucket-b",
          type: "S3",
          label: "Bucket B",
          positionX: 0,
          positionY: 0,
          config: { providerResourceId: "bucket-b" }
        }
      ],
      edges: []
    }
  };
}

function createReviewOnlyScanResult(): ReverseEngineeringScanResult {
  return {
    ...structuredClone(scanResult),
    architectureJson: {
      nodes: [
        {
          id: "vpc-1",
          type: "VPC",
          label: "Production VPC",
          positionX: 0,
          positionY: 0,
          config: { providerResourceId: "vpc-0123456789abcdef0" }
        },
        {
          id: "lambda-1",
          type: "LAMBDA",
          label: "orders-handler",
          positionX: 260,
          positionY: 0,
          config: {
            providerResourceId:
              "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler",
            providerResourceType: "AWS::Lambda::Function",
            analysisExcluded: true
          }
        },
        {
          id: "iam-role-1",
          type: "IAM_ROLE",
          label: "read-only",
          positionX: 520,
          positionY: 0,
          config: {
            providerResourceId: "arn:aws:iam::123456789012:role/read-only",
            providerResourceType: "AWS::IAM::Role",
            analysisExcluded: true
          }
        }
      ],
      edges: [
        { id: "edge-lambda-1-vpc-1-uses", sourceId: "vpc-1", targetId: "lambda-1", label: "uses" }
      ]
    },
    discoveredResources: [
      {
        id: "vpc-1",
        provider: "aws",
        providerResourceType: "AWS::EC2::VPC",
        providerResourceId: "vpc-0123456789abcdef0",
        region: "ap-northeast-2",
        displayName: "Production VPC",
        resourceType: "VPC",
        config: {}
      },
      {
        id: "lambda-1",
        provider: "aws",
        providerResourceType: "AWS::Lambda::Function",
        providerResourceId: "arn:aws:lambda:ap-northeast-2:123456789012:function:orders-handler",
        region: "ap-northeast-2",
        displayName: "orders-handler",
        resourceType: "LAMBDA",
        config: {},
        analysisExcluded: true,
        relationships: [{ type: "connects_to", targetResourceId: "vpc-1", label: "uses" }]
      },
      {
        id: "iam-role-1",
        provider: "aws",
        providerResourceType: "AWS::IAM::Role",
        providerResourceId: "arn:aws:iam::123456789012:role/read-only",
        region: "ap-northeast-2",
        displayName: "read-only",
        resourceType: "IAM_ROLE",
        config: {},
        analysisExcluded: true,
        relationships: []
      }
    ],
    importSuggestions: [
      {
        id: "import-vpc-1",
        resourceId: "vpc-1",
        status: "ready",
        handoffReady: true,
        terraformAddress: "aws_vpc.production"
      },
      {
        id: "import-lambda-1",
        resourceId: "lambda-1",
        status: "unsupported_resource_type",
        handoffReady: false,
        reason: "아직 정식 ResourceType으로 매핑되지 않았습니다."
      },
      {
        id: "import-iam-role-1",
        resourceId: "iam-role-1",
        status: "unsupported_resource_type",
        handoffReady: false,
        reason: "아직 정식 ResourceType으로 매핑되지 않았습니다."
      }
    ]
  };
}
