import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureJson, DiagramJson } from "@sketchcatch/types";
import {
  ARCHITECTURE_BOARD_COMPILER_VERSION,
  architectureBoardKnowledge,
  compileArchitectureBoard,
  createArchitectureBoardKnowledgeArtifact,
  evaluateArchitectureBoardKnowledgeLeaveOneOut
} from ".";
import { convertArchitectureJsonToDiagramJson } from "../workspace/workspace-ai-diagram-adapter";

const architecture: ArchitectureJson = {
  nodes: [
    {
      id: "api",
      type: "API_GATEWAY_REST_API",
      label: "API",
      positionX: 0,
      positionY: 0,
      config: {}
    },
    { id: "function", type: "LAMBDA", label: "Function", positionX: 0, positionY: 0, config: {} }
  ],
  edges: [{ id: "api-function", sourceId: "api", targetId: "function", label: "invokes" }]
};

test("knowledge artifact는 30개 gallery 중 29개 사례와 실패 evidence 하나를 고정한다", () => {
  assert.equal(architectureBoardKnowledge.cases.length, 29);
  assert.equal(architectureBoardKnowledge.unavailableTemplateIds.length, 1);
  assert.equal(
    createArchitectureBoardKnowledgeArtifact().hash,
    createArchitectureBoardKnowledgeArtifact().hash
  );
});

test("29개 사례 leave-one-out report는 매 사례를 나머지 28개와 비교한다", () => {
  const report = evaluateArchitectureBoardKnowledgeLeaveOneOut();

  assert.equal(report.length, 29);
  assert.ok(report.every((result) => result.heldOutCaseId !== result.nearestCaseId));
  assert.ok(
    report.every((result) =>
      [
        result.resourceTypeRecall,
        result.aspectRatioError,
        result.siblingGapError,
        result.viewportAspectRatioError,
        result.containmentDepthError,
        result.edgeLengthError
      ].every(Number.isFinite)
    )
  );
});

test("Compiler는 같은 입력과 version에 완전히 같은 proposal을 반환하고 입력을 바꾸지 않는다", () => {
  const input = { architecture, trigger: "ai-draft" as const };
  const before = structuredClone(input);
  const first = compileArchitectureBoard(input);
  const second = compileArchitectureBoard(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(first.provenance.compilerVersion, ARCHITECTURE_BOARD_COMPILER_VERSION);
  assert.equal(first.provenance.referenceTemplateIds.length, 3);
  assert.equal(first.diagram.nodes.length, architecture.nodes.length);
  assert.ok(first.quality.after.structuralPenalty >= 0);
  assert.ok(Number.isFinite(first.quality.after.metrics["knowledgeViewportAspectRatio"]));
  assert.equal(
    first.quality.after.score,
    first.quality.after.visualPenalty +
      first.quality.after.structuralPenalty +
      first.quality.after.semanticDiagnosticPenalty +
      first.quality.after.metrics["knowledgePenalty"]! +
      first.quality.after.metrics["compilationDistance"]!
  );
});

test("Compiler는 original 후보를 선택할 수 있고 빈 Board로 Resource를 지우지 않는다", () => {
  const currentDiagram = compileArchitectureBoard({ architecture, trigger: "ai-draft" }).diagram;
  const proposal = compileArchitectureBoard({
    architecture,
    currentDiagram,
    trigger: "board-auto-organize"
  });

  assert.ok(
    proposal.provenance.candidateId === "original" ||
      proposal.provenance.candidateId.startsWith("compiled:")
  );
  assert.equal(proposal.diagram.nodes.length, 2);
});

test("Compiler는 잘못된 관계를 숨기지 않고 diagnostic으로 반환한다", () => {
  const proposal = compileArchitectureBoard({
    architecture: {
      nodes: architecture.nodes,
      edges: [{ id: "dangling", sourceId: "api", targetId: "missing" }]
    },
    trigger: "reverse-engineering"
  });

  assert.ok(proposal.diagnostics.some(({ code }) => code === "compiler.dangling_relationship"));
});

test("Compiler changes는 승인 전 proposal일 뿐 현재 Diagram을 mutation하지 않는다", () => {
  const currentDiagram: DiagramJson = {
    nodes: [],
    edges: [],
    viewport: { x: 7, y: 9, zoom: 0.75 }
  };
  const before = structuredClone(currentDiagram);
  const proposal = compileArchitectureBoard({ architecture, currentDiagram, trigger: "ai-draft" });

  assert.deepEqual(currentDiagram, before);
  assert.ok(proposal.changes.some(({ action, kind }) => kind === "resource" && action === "add"));
  assert.ok(proposal.quality.compilationDistance > 0);
});

test("Compiler는 contains/hosts와 Terraform 참조에서 Security Group을 제외한 containment를 제안한다", () => {
  const proposal = compileArchitectureBoard({
    architecture: {
      nodes: [
        {
          id: "vpc",
          type: "VPC",
          label: "VPC",
          positionX: 0,
          positionY: 0,
          config: { terraformResourceType: "aws_vpc", terraformResourceName: "main" }
        },
        {
          id: "subnet",
          type: "SUBNET",
          label: "Public subnet",
          positionX: 0,
          positionY: 0,
          config: { terraformResourceType: "aws_subnet", terraformResourceName: "public" }
        },
        {
          id: "group",
          type: "SECURITY_GROUP",
          label: "App SG",
          positionX: 0,
          positionY: 0,
          config: { terraformResourceType: "aws_security_group", terraformResourceName: "app" }
        },
        {
          id: "instance",
          type: "EC2",
          label: "App",
          positionX: 0,
          positionY: 0,
          config: {
            terraformResourceType: "aws_instance",
            subnetId: "${aws_subnet.public.id}",
            vpcSecurityGroupIds: ["aws_security_group.app.id"]
          }
        }
      ],
      edges: [
        { id: "vpc-subnet", sourceId: "vpc", targetId: "subnet", label: "contains" },
        { id: "sg-instance", sourceId: "group", targetId: "instance", label: "contains" }
      ]
    },
    trigger: "ai-draft"
  });
  const nodeById = new Map(proposal.architecture.nodes.map((node) => [node.id, node]));

  assert.equal(nodeById.get("subnet")?.config["parentAreaNodeId"], "vpc");
  assert.equal(nodeById.get("instance")?.config["parentAreaNodeId"], "subnet");
  assert.notEqual(nodeById.get("instance")?.config["parentAreaNodeId"], "group");
  assert.ok(
    proposal.changes.some(
      ({ kind, targetIds }) => kind === "containment" && targetIds.includes("instance")
    )
  );
  assert.ok(proposal.diagnostics.some(({ code }) => code === "compiler.inferred_containment"));
});

test("Compiler는 hosted EKS Cluster를 presentation Area로 만들고 Terraform 참조 관계를 명시한다", () => {
  const proposal = compileArchitectureBoard({
    architecture: {
      nodes: [
        {
          id: "cluster",
          type: "EKS_CLUSTER",
          label: "Cluster",
          positionX: 0,
          positionY: 0,
          config: { terraformResourceType: "aws_eks_cluster", terraformResourceName: "app" }
        },
        {
          id: "node-group",
          type: "EKS_NODE_GROUP",
          label: "Node group",
          positionX: 0,
          positionY: 0,
          config: {
            terraformResourceType: "aws_eks_node_group",
            clusterName: "${aws_eks_cluster.app.name}"
          }
        }
      ],
      edges: []
    },
    trigger: "ai-draft"
  });
  const cluster = proposal.architecture.nodes.find((node) => node.id === "cluster");
  const nodeGroup = proposal.architecture.nodes.find((node) => node.id === "node-group");
  const referenceChange = proposal.changes.find(
    ({ kind, action, after }) =>
      kind === "relationship" && action === "add" &&
      typeof after === "object" && after !== null && (after as { label?: unknown }).label === "references"
  );

  assert.equal(cluster?.config["presentationArea"], true);
  assert.equal(nodeGroup?.config["parentAreaNodeId"], "cluster");
  assert.ok(referenceChange);
  assert.ok(proposal.changes.some(({ kind }) => kind === "presentation"));
  assert.ok(proposal.diagnostics.some(({ code }) => code === "compiler.inferred_terraform_relationship"));
});

test("Compiler는 중복 Resource와 dangling 관계를 optional repair proposal 및 diagnostic으로 남긴다", () => {
  const proposal = compileArchitectureBoard({
    architecture: {
      nodes: [
        { id: "api", type: "API_GATEWAY_REST_API", positionX: 0, positionY: 0, config: {} },
        { id: "api", type: "API_GATEWAY_REST_API", positionX: 60, positionY: 0, config: {} }
      ],
      edges: [{ id: "missing", sourceId: "api", targetId: "not-found", label: "invokes" }]
    },
    trigger: "reverse-engineering"
  });

  assert.deepEqual(
    proposal.architecture.nodes.map((node) => node.id).sort(),
    ["api", "api__2"]
  );
  assert.equal(proposal.architecture.edges.length, 0);
  assert.ok(
    proposal.changes.some(
      ({ kind, action }) => kind === "resource" && action === "modify"
    )
  );
  assert.ok(
    proposal.changes.some(
      ({ kind, action }) => kind === "relationship" && action === "remove"
    )
  );
  assert.ok(
    proposal.diagnostics.some(({ code }) => code === "compiler.duplicate_resource_id_normalized")
  );
  assert.ok(proposal.diagnostics.some(({ code }) => code === "compiler.dangling_relationship"));
});

test("source-exact Board도 명시적 자동 정리 제안을 만들되 원본 fixture를 바꾸지 않는다", () => {
  const source = compileArchitectureBoard({ architecture, trigger: "ai-draft" }).diagram;
  const exact: DiagramJson = {
    ...structuredClone(source),
    nodes: source.nodes.map((node) => ({ ...node, position: { x: 0, y: 0 } })),
    presentation: { geometryPolicy: "source-exact" }
  };
  const before = structuredClone(exact);
  const proposal = compileArchitectureBoard({
    architecture,
    currentDiagram: exact,
    trigger: "board-auto-organize"
  });

  assert.deepEqual(exact, before);
  assert.ok(proposal.provenance.candidateId.startsWith("compiled:"));
  assert.ok(proposal.changes.some(({ kind }) => kind === "geometry"));
});

test("자동 정리는 기존 Board의 variable, viewport, presentation 상태를 보존한다", () => {
  const source = compileArchitectureBoard({ architecture, trigger: "ai-draft" }).diagram;
  const currentDiagram: DiagramJson = {
    ...structuredClone(source),
    nodes: source.nodes.map((node) => ({ ...node, position: { x: 0, y: 0 } })),
    presentation: {
      geometryPolicy: "source-exact",
      initialViewportPending: false,
      sourceViewBox: { x: -120, y: -80, width: 640, height: 480 }
    },
    variables: [
      {
        id: "environment",
        name: "environment",
        type: "string",
        value: "staging",
        source: "user",
        bindings: [{ nodeId: "api", parameterKey: "stageName" }]
      }
    ],
    viewport: { x: 31, y: -28, zoom: 0.62 }
  };
  const before = structuredClone(currentDiagram);
  const proposal = compileArchitectureBoard({
    architecture,
    currentDiagram,
    trigger: "board-auto-organize"
  });

  assert.deepEqual(currentDiagram, before);
  assert.deepEqual(proposal.diagram.variables, before.variables);
  assert.deepEqual(proposal.diagram.presentation, before.presentation);
  assert.deepEqual(proposal.diagram.viewport, before.viewport);
});

test("semantic 후보는 Terraform 참조가 가리키는 더 구체적인 Area로 유효한 기존 소속도 재판단한다", () => {
  const proposal = compileArchitectureBoard({
    architecture: {
      nodes: [
        {
          id: "vpc-a",
          type: "VPC",
          positionX: 0,
          positionY: 0,
          config: { terraformResourceType: "aws_vpc", terraformResourceName: "a" }
        },
        {
          id: "vpc-b",
          type: "VPC",
          positionX: 300,
          positionY: 0,
          config: { terraformResourceType: "aws_vpc", terraformResourceName: "b" }
        },
        {
          id: "subnet-b",
          type: "SUBNET",
          positionX: 340,
          positionY: 100,
          config: {
            parentAreaNodeId: "vpc-b",
            terraformResourceType: "aws_subnet",
            terraformResourceName: "private_b"
          }
        },
        {
          id: "instance",
          type: "EC2",
          positionX: 80,
          positionY: 100,
          config: {
            parentAreaNodeId: "vpc-a",
            subnetId: "aws_subnet.private_b.id",
            terraformResourceType: "aws_instance"
          }
        }
      ],
      edges: []
    },
    trigger: "ai-draft"
  });
  const instance = proposal.architecture.nodes.find((node) => node.id === "instance");

  assert.equal(instance?.config["parentAreaNodeId"], "subnet-b");
  assert.ok(
    proposal.changes.some(
      ({ kind, targetIds }) => kind === "containment" && targetIds.includes("instance")
    )
  );
  assert.ok(proposal.diagnostics.some(({ code }) => code === "compiler.inferred_containment"));
});

test("숨긴 Area 내부 edge도 proposal diff와 compilation distance에 기록한다", () => {
  const containedArchitecture: ArchitectureJson = {
    nodes: [
      {
        id: "subnet",
        type: "SUBNET",
        positionX: 0,
        positionY: 0,
        config: { terraformResourceType: "aws_subnet", terraformResourceName: "private" }
      },
      {
        id: "instance",
        type: "EC2",
        positionX: 0,
        positionY: 0,
        config: {
          parentAreaNodeId: "subnet",
          subnetId: "aws_subnet.private.id",
          terraformResourceType: "aws_instance"
        }
      }
    ],
    edges: [{ id: "instance-subnet", sourceId: "instance", targetId: "subnet", label: "references" }]
  };
  const initialDiagram = convertArchitectureJsonToDiagramJson(containedArchitecture);
  const currentDiagram: DiagramJson = {
    ...initialDiagram,
    edges: [
      ...initialDiagram.edges,
      {
        id: "instance-subnet",
        sourceNodeId: "instance",
        targetNodeId: "subnet",
        label: "references"
      }
    ],
    nodes: initialDiagram.nodes.map((node) => ({ ...node, position: { x: 0, y: 0 } }))
  };
  const proposal = compileArchitectureBoard({
    architecture: containedArchitecture,
    currentDiagram,
    trigger: "board-auto-organize"
  });

  assert.ok(currentDiagram.edges.some((edge) => edge.id === "instance-subnet"));
  assert.ok(!proposal.diagram.edges.some((edge) => edge.id === "instance-subnet"));
  assert.ok(
    proposal.changes.some(
      ({ action, id, kind }) => action === "remove" && kind === "edge-routing" && id.endsWith("instance-subnet")
    )
  );
});

test("동일 관계의 object key 순서만 달라도 relationship 변경으로 계산하지 않는다", () => {
  const orderedArchitecture: ArchitectureJson = {
    nodes: architecture.nodes,
    edges: [
      {
        label: "invokes",
        targetId: "function",
        sourceId: "api",
        id: "api-function"
      }
    ]
  };
  const currentDiagram = convertArchitectureJsonToDiagramJson(orderedArchitecture);
  const proposal = compileArchitectureBoard({
    architecture: orderedArchitecture,
    currentDiagram,
    trigger: "board-auto-organize"
  });

  assert.ok(
    !proposal.changes.some(
      ({ action, kind }) => kind === "relationship" && action === "modify"
    )
  );
});
