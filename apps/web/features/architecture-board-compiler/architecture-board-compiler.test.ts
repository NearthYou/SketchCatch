import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureJson, DiagramJson, DiagramNode } from "@sketchcatch/types";
import {
  ARCHITECTURE_BOARD_COMPILER_VERSION,
  applyArchitectureBoardModulePatternKnowledge,
  architectureBoardKnowledge,
  compileArchitectureBoard,
  createArchitectureBoardModulePatternResourceParentMap,
  createArchitectureBoardKnowledgeArtifact,
  evaluateArchitectureBoardKnowledgeLeaveOneOut
} from ".";
import {
  convertArchitectureJsonToDiagramJson,
  convertDiagramJsonToArchitectureJson
} from "../workspace/workspace-ai-diagram-adapter";
import { expandCuratedModuleIntoDiagram } from "../resource-settings/module-catalog";

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

  const diagnostic = proposal.diagnostics.find(
    ({ code }) => code === "compiler.dangling_relationship"
  );

  assert.ok(diagnostic);
  assert.match(diagnostic.message, /API → missing/);
  assert.doesNotMatch(diagnostic.message, /관계 dangling/);
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
  assert.ok(proposal.changes.some(({ summary }) => summary === "Resource API 추가"));
  assert.equal(
    proposal.changes.some(({ summary }) => summary === "Resource api 추가"),
    false
  );
  assert.ok(proposal.changes.some(({ summary }) => summary === "관계 API → Function 추가"));
  assert.equal(
    proposal.changes.some(({ summary }) => summary === "관계 api-function 추가"),
    false
  );
  assert.ok(proposal.quality.compilationDistance > 0);
});

test("Compiler는 유사 Template의 spacing profile을 실제 geometry 후보군에 포함한다", () => {
  const proposal = compileArchitectureBoard({
    architecture: {
      nodes: [
        {
          id: "api",
          type: "API_GATEWAY_REST_API",
          label: "API",
          positionX: 0,
          positionY: 0,
          config: { terraformResourceType: "aws_api_gateway_rest_api" }
        },
        {
          id: "handler",
          type: "LAMBDA",
          label: "Handler",
          positionX: 260,
          positionY: 0,
          config: { terraformResourceType: "aws_lambda_function" }
        }
      ],
      edges: [{ id: "api-handler", sourceId: "api", targetId: "handler", label: "invokes" }]
    },
    trigger: "ai-draft"
  });

  assert.ok(
    (proposal.provenance as { layoutProfileIds?: readonly string[] }).layoutProfileIds?.some((id) =>
      id.startsWith("knowledge:")
    )
  );
});

test("Compiler는 presentation node가 없는 실제 artifact graph도 pattern 후보와 provenance에 포함한다", () => {
  const pattern = architectureBoardKnowledge.modulePatterns.find(
    ({ id }) => id === "static-web-delivery"
  );
  assert.ok(pattern);
  const resourceNodeIds = new Set(
    pattern.nodes.filter(({ kind }) => kind === "resource").map(({ id }) => id)
  );
  const currentDiagram: DiagramJson = {
    nodes: pattern.nodes
      .filter(({ kind }) => kind === "resource")
      .map((node) => {
        const cloned = structuredClone(node) as DiagramNode;
        const parentId = cloned.metadata?.parentAreaNodeId;
        return {
          ...cloned,
          position: { x: 0, y: 0 },
          ...(parentId && !resourceNodeIds.has(parentId)
            ? { metadata: { ...cloned.metadata, parentAreaNodeId: undefined } }
            : {})
        };
      }),
    edges: structuredClone(
      pattern.edges.filter(
        ({ sourceNodeId, targetNodeId }) =>
          resourceNodeIds.has(sourceNodeId) && resourceNodeIds.has(targetNodeId)
      )
    ) as DiagramJson["edges"],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const proposal = compileArchitectureBoard({
    architecture: convertDiagramJsonToArchitectureJson(currentDiagram),
    currentDiagram,
    trigger: "board-auto-organize"
  });

  assert.ok(
    proposal.provenance.candidateIds?.some((id) => id.includes(`module-pattern:${pattern.id}`))
  );
  assert.ok(proposal.provenance.modulePatternIds?.includes(pattern.id));
  assert.ok(
    proposal.provenance.modulePatternRepresentativeTemplateIds?.includes(
      pattern.provenance.representativeTemplateId
    )
  );
  assert.deepEqual(
    proposal.provenance.modulePatternSourceTemplateIds,
    [...pattern.provenance.sourceTemplateIds].sort()
  );
  assert.ok(
    pattern.provenance.sourceTemplateIds.every((templateId) =>
      proposal.provenance.referenceTemplateIds.includes(templateId)
    )
  );
});

test("Compiler는 조립된 모든 Curated Module을 같은 pattern knowledge로 인식한다", () => {
  for (const pattern of architectureBoardKnowledge.modulePatterns) {
    const currentDiagram = expandCuratedModuleIntoDiagram({
      diagram: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, variables: [] },
      moduleId: pattern.id
    });
    const architecture = convertDiagramJsonToArchitectureJson(currentDiagram);

    const proposal = compileArchitectureBoard({
      architecture,
      currentDiagram,
      trigger: "board-auto-organize"
    });

    assert.ok(
      proposal.provenance.modulePatternIds?.includes(pattern.id),
      `${pattern.id} must be recognized after the compiler roundtrip`
    );
    assert.equal(proposal.architecture.edges.length, architecture.edges.length, pattern.id);
    assert.ok(
      proposal.diagram.edges.every(
        ({ sourceNodeId, targetNodeId }) =>
          proposal.diagram.nodes.some(({ id }) => id === sourceNodeId) &&
          proposal.diagram.nodes.some(({ id }) => id === targetNodeId)
      ),
      `${pattern.id} must keep valid edge endpoints`
    );
  }
});

test("Compiler roundtrip은 반복 조립한 Module instance를 서로 섞지 않고 모두 인식한다", () => {
  let currentDiagram: DiagramJson = {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    variables: []
  };
  for (let round = 0; round < 2; round += 1) {
    for (const pattern of architectureBoardKnowledge.modulePatterns) {
      currentDiagram = expandCuratedModuleIntoDiagram({
        diagram: currentDiagram,
        moduleId: pattern.id
      });
    }
  }

  const architecture = convertDiagramJsonToArchitectureJson(currentDiagram);
  const roundtripDiagram = convertArchitectureJsonToDiagramJson(architecture);
  const moduleExpansionByNodeId = Object.fromEntries(
    currentDiagram.nodes.flatMap((node) => {
      const source = node.metadata?.moduleSource;
      return source
        ? [[node.id, { moduleId: source.moduleId, expansionId: source.expandedAt }] as const]
        : [];
    })
  );
  const result = applyArchitectureBoardModulePatternKnowledge(
    roundtripDiagram,
    architectureBoardKnowledge,
    {
      projection: "compiler-roundtrip",
      semanticEdgeLabelsById: Object.fromEntries(
        architecture.edges.map(({ id, label }) => [id, label])
      ),
      moduleExpansionByNodeId,
      resourceParentByNodeId: createArchitectureBoardModulePatternResourceParentMap(
        currentDiagram.nodes
      )
    }
  );

  assert.ok(result);
  assert.equal(result.matches.length, architectureBoardKnowledge.modulePatterns.length * 2);
  for (const match of result.matches) {
    const sources = new Set(
      Object.values(match.nodeIdByPatternNodeId).map((nodeId) => {
        const source = moduleExpansionByNodeId[nodeId];
        assert.ok(source);
        assert.equal(source.moduleId, match.patternId);
        return `${source.moduleId}:${source.expansionId}`;
      })
    );
    assert.equal(sources.size, 1, `${match.patternId} must stay inside one Module instance`);
  }
});

test("Compiler roundtrip matcher는 presentation Area를 걷어내도 Resource containment를 요구한다", () => {
  const pattern = architectureBoardKnowledge.modulePatterns.find(
    ({ id }) => id === "relational-data-layer"
  );
  assert.ok(pattern);
  const resourceNodeIds = new Set(
    pattern.nodes.filter(({ kind }) => kind === "resource").map(({ id }) => id)
  );
  const scattered: DiagramJson = {
    nodes: pattern.nodes
      .filter(({ kind }) => kind === "resource")
      .map((node) => {
        const cloned = structuredClone(node) as DiagramNode;
        return {
          ...cloned,
          metadata: { ...cloned.metadata, parentAreaNodeId: undefined }
        };
      }),
    edges: structuredClone(
      pattern.edges.filter(
        ({ sourceNodeId, targetNodeId, label }) =>
          resourceNodeIds.has(sourceNodeId) &&
          resourceNodeIds.has(targetNodeId) &&
          label !== "contains" &&
          label !== "hosts"
      )
    ) as DiagramJson["edges"],
    viewport: { x: 0, y: 0, zoom: 1 },
    variables: []
  };
  const result = applyArchitectureBoardModulePatternKnowledge(
    scattered,
    architectureBoardKnowledge,
    { projection: "compiler-roundtrip" }
  );

  assert.equal(result?.matchedPatternIds.includes(pattern.id) ?? false, false);
});

test("network pattern Compiler proposal은 containment만 숨기고 semantic Area edge는 보존한다", () => {
  const expanded = expandCuratedModuleIntoDiagram({
    diagram: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, variables: [] },
    moduleId: "network-foundation"
  });
  const currentDiagram: DiagramJson = {
    ...expanded,
    presentation: { geometryPolicy: "source-exact" }
  };
  const architecture = convertDiagramJsonToArchitectureJson(currentDiagram);

  const proposal = compileArchitectureBoard({
    architecture,
    currentDiagram,
    trigger: "board-auto-organize"
  });

  assert.equal(architecture.edges.length, 17);
  assert.equal(proposal.architecture.edges.length, 17);
  assert.equal(proposal.diagram.edges.length, 11);
  const visibleEdgeIds = new Set(proposal.diagram.edges.map(({ id }) => id));
  assert.ok(
    [...visibleEdgeIds].some((id) => id.endsWith("vpc-igw")),
    "VPC to Internet Gateway route must remain visible"
  );
  assert.ok(
    [...visibleEdgeIds].some((id) => id.endsWith("public-nat")),
    "Subnet to NAT egress must remain visible"
  );
  assert.ok(proposal.architecture.edges.some(({ label }) => label === "routes"));
  assert.ok(proposal.architecture.edges.some(({ label }) => label === "egress"));
  assert.ok(proposal.provenance.modulePatternIds?.includes("network-foundation"));
});

test("Compiler는 승인된 semantic operation과 외부 충돌 신호를 하나의 proposal로 설명한다", () => {
  const proposal = compileArchitectureBoard({
    architecture: {
      nodes: [
        {
          id: "api",
          type: "API_GATEWAY_REST_API",
          label: "API",
          positionX: 0,
          positionY: 0,
          config: { terraformResourceType: "aws_api_gateway_rest_api" }
        }
      ],
      edges: []
    },
    semanticContext: {
      operations: [
        {
          id: "add-vpc",
          kind: "resource-add",
          node: {
            id: "vpc",
            type: "VPC",
            label: "VPC",
            positionX: -120,
            positionY: -80,
            config: { terraformResourceType: "aws_vpc" }
          }
        },
        { id: "contain-api", kind: "containment-set", targetId: "api", parentAreaNodeId: "vpc" },
        {
          id: "add-platform-group",
          kind: "presentation-add",
          node: {
            id: "platform-group",
            type: "design_group",
            kind: "design",
            label: "Platform",
            locked: false,
            position: { x: -160, y: -120 },
            size: { width: 480, height: 320 },
            zIndex: 1
          }
        }
      ],
      signals: [
        {
          id: "provider-limit",
          kind: "provider",
          level: "warning",
          summary: "Provider quota 확인 필요",
          message: "이 후보는 Provider quota와 충돌할 수 있습니다.",
          relatedResourceIds: ["vpc"],
          penalty: 321
        }
      ]
    },
    trigger: "ai-draft"
  });

  assert.ok(proposal.architecture.nodes.some((node) => node.id === "vpc"));
  assert.equal(
    proposal.architecture.nodes.find((node) => node.id === "api")?.config.parentAreaNodeId,
    "vpc"
  );
  assert.ok(proposal.diagram.nodes.some((node) => node.id === "platform-group"));
  assert.ok(
    proposal.changes.some(
      ({ action, kind, targetIds }) =>
        action === "add" && kind === "resource" && targetIds.includes("vpc")
    )
  );
  assert.ok(
    proposal.changes.some(
      ({ action, kind, targetIds }) =>
        action === "add" && kind === "presentation" && targetIds.includes("platform-group")
    )
  );
  assert.ok(
    proposal.diagnostics.some(({ code }) => code === "compiler.context.provider:provider-limit")
  );
  assert.ok(proposal.quality.after.semanticDiagnosticPenalty >= 321);
});

test("semantic operation이 있으면 진짜 원본을 보존하되 요청된 graph를 무음으로 되돌리지 않는다", () => {
  const proposal = compileArchitectureBoard({
    architecture: {
      nodes: [
        {
          id: "api",
          type: "API_GATEWAY_REST_API",
          label: "API",
          positionX: 0,
          positionY: 0,
          config: { terraformResourceType: "aws_api_gateway_rest_api" }
        }
      ],
      edges: []
    },
    semanticContext: {
      operations: [
        {
          id: "add-vpc",
          kind: "resource-add",
          node: {
            id: "vpc",
            type: "VPC",
            label: "VPC",
            positionX: 0,
            positionY: 0,
            config: { terraformResourceType: "aws_vpc" }
          }
        }
      ]
    },
    trigger: "ai-draft"
  });

  assert.ok(proposal.provenance.candidateIds?.includes("original"));
  assert.ok(proposal.provenance.candidateIds?.includes("requested-original"));
  assert.ok(proposal.architecture.nodes.some((node) => node.id === "vpc"));
  assert.ok(
    proposal.changes.some(
      ({ action, kind, targetIds }) =>
        action === "add" && kind === "resource" && targetIds.includes("vpc")
    )
  );
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
  const containmentChange = proposal.changes.find(
    ({ kind, targetIds }) => kind === "containment" && targetIds.includes("instance")
  );
  const containmentDiagnostic = proposal.diagnostics.find(
    ({ code }) => code === "compiler.inferred_containment"
  );

  assert.match(containmentChange?.summary ?? "", /Resource App/);
  assert.doesNotMatch(containmentChange?.summary ?? "", /Resource instance/);
  assert.match(containmentDiagnostic?.message ?? "", /App/);
  assert.match(containmentDiagnostic?.message ?? "", /Public subnet/);
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
      kind === "relationship" &&
      action === "add" &&
      typeof after === "object" &&
      after !== null &&
      (after as { label?: unknown }).label === "references"
  );

  assert.equal(cluster?.config["presentationArea"], true);
  assert.equal(nodeGroup?.config["parentAreaNodeId"], "cluster");
  assert.ok(referenceChange);
  assert.equal(referenceChange.summary, "관계 Node group → Cluster 추가");
  assert.ok(proposal.changes.some(({ kind }) => kind === "presentation"));
  const relationshipDiagnostic = proposal.diagnostics.find(
    ({ code }) => code === "compiler.inferred_terraform_relationship"
  );

  assert.ok(relationshipDiagnostic);
  assert.match(relationshipDiagnostic.message, /Node group/);
  assert.match(relationshipDiagnostic.message, /Cluster/);
  assert.doesNotMatch(relationshipDiagnostic.message, /node-group/);
});

test("Compiler는 연결된 ASG도 일반 Resource tile로 유지한다", () => {
  const asgArchitecture: ArchitectureJson = {
    nodes: [
      {
        id: "asg",
        type: "AUTO_SCALING_GROUP",
        label: "Web ASG",
        positionX: 0,
        positionY: 0,
        config: {
          terraformResourceType: "aws_autoscaling_group",
          terraformResourceName: "web",
          minSize: 1,
          maxSize: 2
        }
      },
      {
        id: "scale-out",
        type: "AUTO_SCALING_POLICY",
        label: "Scale out",
        positionX: 120,
        positionY: 0,
        config: {
          terraformResourceType: "aws_autoscaling_policy",
          terraformResourceName: "scale_out",
          autoscalingGroupName: "${aws_autoscaling_group.web.name}"
        }
      }
    ],
    edges: []
  };
  const currentDiagram: DiagramJson = {
    ...convertArchitectureJsonToDiagramJson(asgArchitecture),
    presentation: { geometryPolicy: "source-exact" }
  };
  const proposal = compileArchitectureBoard({
    architecture: asgArchitecture,
    currentDiagram,
    trigger: "board-auto-organize"
  });
  const asgArchitectureNode = proposal.architecture.nodes.find((node) => node.id === "asg");
  const policyArchitectureNode = proposal.architecture.nodes.find(
    (node) => node.id === "scale-out"
  );
  const asgDiagramNode = proposal.diagram.nodes.find((node) => node.id === "asg");

  assert.equal(proposal.provenance.candidateId.startsWith("compiled:"), true);
  assert.notEqual(asgArchitectureNode?.config["presentationArea"], true);
  assert.notEqual(policyArchitectureNode?.config["parentAreaNodeId"], "asg");
  assert.notEqual(asgDiagramNode?.metadata?.presentationArea, true);
  assert.ok((asgDiagramNode?.zIndex ?? 0) >= 100);
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

  assert.deepEqual(proposal.architecture.nodes.map((node) => node.id).sort(), ["api", "api__2"]);
  assert.equal(proposal.architecture.edges.length, 0);
  assert.ok(
    proposal.changes.some(({ kind, action }) => kind === "resource" && action === "modify")
  );
  assert.ok(
    proposal.changes.some(({ kind, action }) => kind === "relationship" && action === "remove")
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
  assert.ok(
    (proposal.provenance as { candidateIds?: readonly string[] }).candidateIds?.includes("original")
  );
  assert.ok(proposal.changes.some(({ kind }) => kind === "geometry"));
});

test("source-exact Board의 명시적 자동 정리는 이미 정렬된 경우에도 별도 compiled variant를 설명한다", () => {
  const source = compileArchitectureBoard({ architecture, trigger: "ai-draft" }).diagram;
  const exact: DiagramJson = {
    ...structuredClone(source),
    presentation: { geometryPolicy: "source-exact" }
  };

  const proposal = compileArchitectureBoard({
    architecture,
    currentDiagram: exact,
    trigger: "board-auto-organize"
  });

  assert.ok(proposal.provenance.candidateId.startsWith("compiled:"));
  assert.ok(
    proposal.changes.some(
      ({ kind, targetIds }) => kind === "presentation" && targetIds.includes("board-presentation")
    )
  );
});

test("자동 정리는 기존 Board의 variable, viewport, presentation 상태를 보존한다", () => {
  const source = compileArchitectureBoard({ architecture, trigger: "ai-draft" }).diagram;
  const currentDiagram: DiagramJson = {
    ...structuredClone(source),
    nodes: source.nodes.map((node) => ({ ...node, position: { x: 0, y: 0 } })),
    presentation: {
      geometryPolicy: "catalog-normalized",
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

test("source-exact 자동 정리는 잠긴 node를 보호하고 새 geometry에 맞는 presentation으로 변환한다", () => {
  const source = compileArchitectureBoard({ architecture, trigger: "ai-draft" }).diagram;
  const currentDiagram: DiagramJson = {
    ...structuredClone(source),
    nodes: source.nodes.map((node, index) => ({
      ...node,
      locked: index === 0,
      position: { x: 0, y: 0 }
    })),
    presentation: {
      geometryPolicy: "source-exact",
      initialViewportPending: true,
      sourceViewBox: { x: -900, y: -700, width: 1_800, height: 1_200 }
    },
    viewport: { x: 99, y: -88, zoom: 0.42 }
  };
  const before = structuredClone(currentDiagram);
  const proposal = compileArchitectureBoard({
    architecture,
    currentDiagram,
    trigger: "board-auto-organize"
  });
  const lockedBefore = before.nodes.find((node) => node.locked);
  const lockedAfter = proposal.diagram.nodes.find((node) => node.id === lockedBefore?.id);

  assert.equal(lockedAfter?.locked, true);
  assert.deepEqual(lockedAfter?.position, lockedBefore?.position);
  assert.deepEqual(proposal.diagram.presentation, { geometryPolicy: "catalog-normalized" });
  assert.deepEqual(proposal.diagram.viewport, source.viewport);
  assert.ok(
    proposal.changes.some(
      ({ kind, targetIds }) => kind === "geometry" && targetIds.includes("board-viewport")
    )
  );
});

test("source-exact 자동 정리는 잠긴 Resource의 위치·크기·z-index를 정확히 보존한다", () => {
  const source = compileArchitectureBoard({ architecture, trigger: "ai-draft" }).diagram;
  const lockedGeometry = {
    position: { x: 731, y: -219 },
    size: { width: 173, height: 91 },
    zIndex: 913
  };
  const currentDiagram: DiagramJson = {
    ...structuredClone(source),
    nodes: source.nodes.map((node) =>
      node.id === "api" ? { ...node, ...lockedGeometry, locked: true } : structuredClone(node)
    ),
    presentation: { geometryPolicy: "source-exact" }
  };

  const proposal = compileArchitectureBoard({
    architecture,
    currentDiagram,
    trigger: "board-auto-organize"
  });
  const lockedAfter = proposal.diagram.nodes.find((node) => node.id === "api");

  assert.equal(proposal.provenance.candidateId.startsWith("compiled:"), true);
  assert.deepEqual(
    lockedAfter && {
      position: lockedAfter.position,
      size: lockedAfter.size,
      zIndex: lockedAfter.zIndex
    },
    lockedGeometry
  );
});

test("source-exact 자동 정리는 잠긴 design node와 유효한 presentation edge를 보존한다", () => {
  const source = compileArchitectureBoard({ architecture, trigger: "ai-draft" }).diagram;
  const lockedDesignNode: DiagramNode = {
    id: "locked-client-frame",
    type: "design-client-frame",
    kind: "design",
    label: "Client entry",
    position: { x: -440, y: 248 },
    size: { width: 236, height: 134 },
    locked: true,
    zIndex: 77,
    metadata: { presentationArea: true },
    style: { borderColor: "#123456", borderStyle: "dashed" }
  };
  const currentDiagram: DiagramJson = {
    ...structuredClone(source),
    nodes: [...source.nodes.map((node) => structuredClone(node)), lockedDesignNode],
    edges: [
      ...source.edges.map((edge) => structuredClone(edge)),
      {
        id: "locked-client-requests-api",
        sourceNodeId: lockedDesignNode.id,
        targetNodeId: "api",
        label: "requests",
        metadata: { presentationRole: "primary" }
      }
    ],
    presentation: { geometryPolicy: "source-exact" }
  };

  const proposal = compileArchitectureBoard({
    architecture,
    currentDiagram,
    trigger: "board-auto-organize"
  });
  const carriedDesignNode = proposal.diagram.nodes.find((node) => node.id === lockedDesignNode.id);
  const carriedEdge = proposal.diagram.edges.find(
    (edge) => edge.id === "locked-client-requests-api"
  );

  assert.equal(proposal.provenance.candidateId.startsWith("compiled:"), true);
  assert.deepEqual(carriedDesignNode, lockedDesignNode);
  assert.deepEqual(
    carriedEdge && {
      id: carriedEdge.id,
      sourceNodeId: carriedEdge.sourceNodeId,
      targetNodeId: carriedEdge.targetNodeId,
      label: carriedEdge.label,
      metadata: carriedEdge.metadata
    },
    {
      id: "locked-client-requests-api",
      sourceNodeId: lockedDesignNode.id,
      targetNodeId: "api",
      label: "requests",
      metadata: { presentationRole: "primary" }
    }
  );
});

test("source-exact 자동 정리는 잠기지 않은 Reverse Engineering 표시 프레임도 고정한다", () => {
  const source = compileArchitectureBoard({ architecture, trigger: "ai-draft" }).diagram;
  const frame: DiagramNode = {
    id: "reverse-infra-frame:project:store",
    type: "design_group",
    kind: "design",
    label: "프로젝트 · store",
    position: { x: -80, y: -100 },
    size: { width: 520, height: 320 },
    locked: false,
    zIndex: 0,
    metadata: {
      presentationCatalogItemId: "design-group",
      reverseEngineeringInfrastructureFrame: {
        source: "aws_scan",
        groupBy: "project",
        groupKey: "store",
        memberNodeIds: ["api", "function"]
      }
    }
  };
  const currentDiagram: DiagramJson = {
    ...structuredClone(source),
    nodes: [
      frame,
      ...source.nodes.map((node) => ({
        ...structuredClone(node),
        position: { x: 20, y: 20 }
      }))
    ],
    presentation: { geometryPolicy: "source-exact" }
  };

  const proposal = compileArchitectureBoard({
    architecture,
    currentDiagram,
    trigger: "board-auto-organize"
  });
  const carriedFrame = proposal.diagram.nodes.find((node) => node.id === frame.id);
  const api = proposal.diagram.nodes.find((node) => node.id === "api");
  const fn = proposal.diagram.nodes.find((node) => node.id === "function");

  assert.deepEqual(carriedFrame, frame);
  assert.ok(api);
  assert.ok(fn);
  assert.equal(api.metadata?.parentAreaNodeId, undefined);
  assert.equal(fn.metadata?.parentAreaNodeId, undefined);
  assert.ok(api.position.x >= frame.position.x);
  assert.ok(api.position.y >= frame.position.y);
  assert.ok(api.position.x + api.size.width <= frame.position.x + frame.size.width);
  assert.ok(api.position.y + api.size.height <= frame.position.y + frame.size.height);
  assert.ok(fn.position.x >= frame.position.x);
  assert.ok(fn.position.y >= frame.position.y);
  assert.ok(fn.position.x + fn.size.width <= frame.position.x + frame.size.width);
  assert.ok(fn.position.y + fn.size.height <= frame.position.y + frame.size.height);
});

test("같은 Resource의 위치·크기·z-index 변경은 각각 고유한 change id를 가진다", () => {
  const source = compileArchitectureBoard({ architecture, trigger: "ai-draft" }).diagram;
  const currentDiagram: DiagramJson = {
    ...structuredClone(source),
    nodes: source.nodes.map((node) =>
      node.id === "api"
        ? {
            ...node,
            position: { x: -901, y: 543 },
            size: { width: 277, height: 89 },
            zIndex: 777
          }
        : structuredClone(node)
    ),
    presentation: { geometryPolicy: "source-exact" }
  };

  const proposal = compileArchitectureBoard({
    architecture,
    currentDiagram,
    trigger: "board-auto-organize"
  });
  const apiGeometryChanges = proposal.changes.filter(
    (change) => change.kind === "geometry" && change.targetIds.includes("api")
  );

  assert.equal(apiGeometryChanges.length, 3);
  assert.equal(
    new Set(apiGeometryChanges.map((change) => change.id)).size,
    apiGeometryChanges.length
  );
});

test("AI draft는 같은 shape의 현재 Board가 있어도 요청된 config와 관계 label을 materialize한다", () => {
  const currentArchitecture: ArchitectureJson = {
    nodes: [
      {
        id: "api",
        type: "API_GATEWAY_REST_API",
        label: "API",
        positionX: 0,
        positionY: 0,
        config: { endpointType: "EDGE" }
      },
      {
        id: "function",
        type: "LAMBDA",
        label: "Function",
        positionX: 160,
        positionY: 0,
        config: { runtime: "nodejs18.x" }
      }
    ],
    edges: [{ id: "api-function", sourceId: "api", targetId: "function", label: "old invokes" }]
  };
  const requestedArchitecture: ArchitectureJson = {
    ...structuredClone(currentArchitecture),
    nodes: currentArchitecture.nodes.map((node) =>
      node.id === "function"
        ? { ...node, config: { runtime: "nodejs20.x" } }
        : structuredClone(node)
    ),
    edges: [
      {
        id: "api-function",
        sourceId: "api",
        targetId: "function",
        label: "new invokes"
      }
    ]
  };
  const currentDiagram = convertArchitectureJsonToDiagramJson(currentArchitecture);

  const proposal = compileArchitectureBoard({
    architecture: requestedArchitecture,
    currentDiagram,
    trigger: "ai-draft"
  });
  const functionNode = proposal.diagram.nodes.find((node) => node.id === "function");
  const apiFunctionEdge = proposal.diagram.edges.find((edge) => edge.id === "api-function");

  assert.equal(functionNode?.parameters?.values["runtime"], "nodejs20.x");
  assert.equal(apiFunctionEdge?.label, "new invokes");
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
    edges: [
      { id: "instance-subnet", sourceId: "instance", targetId: "subnet", label: "references" }
    ]
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
      ({ action, id, kind }) =>
        action === "remove" && kind === "edge-routing" && id.endsWith("instance-subnet")
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
    !proposal.changes.some(({ action, kind }) => kind === "relationship" && action === "modify")
  );
});
