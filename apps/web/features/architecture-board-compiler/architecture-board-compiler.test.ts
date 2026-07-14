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

test("source-exact Board는 semantic 후보보다 우선하며 원본을 한 글자도 바꾸지 않는다", () => {
  const source = compileArchitectureBoard({ architecture, trigger: "ai-draft" }).diagram;
  const exact: DiagramJson = {
    ...structuredClone(source),
    presentation: { geometryPolicy: "source-exact" }
  };
  const proposal = compileArchitectureBoard({
    architecture,
    currentDiagram: exact,
    trigger: "ai-draft"
  });

  assert.deepEqual(proposal.diagram, exact);
  assert.deepEqual(proposal.changes, []);
  assert.equal(proposal.provenance.candidateId, "source-exact");
});
