import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTemplateDiagramJson, type DiagramJson } from "@sketchcatch/types";
import { restoreSavedDiagram } from "./workspace-draft-restore";

const fallbackDiagram: DiagramJson = {
  edges: [],
  nodes: [],
  viewport: { x: 0, y: 0, zoom: 1 }
};

test("saved DiagramJson keeps user-owned identity and layout during restore", () => {
  const savedDiagram: DiagramJson = {
    edges: [],
    nodes: [
      {
        id: "node-user-owned",
        type: "aws_instance",
        kind: "resource",
        position: { x: 412, y: 188 },
        size: { width: 124, height: 96 },
        label: "ec2_instance",
        locked: false,
        zIndex: 4,
        parameters: {
          terraformBlockType: "resource",
          resourceType: "aws_instance",
          resourceName: "ec2_instance",
          fileName: "main.tf",
          values: { instanceType: "t3.micro" }
        }
      }
    ],
    viewport: { x: -118, y: 74, zoom: 1.25 }
  };

  const restoredDiagram = restoreSavedDiagram(savedDiagram, fallbackDiagram);

  assert.strictEqual(restoredDiagram, savedDiagram);
  assert.deepEqual(restoredDiagram, savedDiagram);
});

test("workspace restore uses the fallback only when no saved DiagramJson exists", () => {
  assert.strictEqual(restoreSavedDiagram(undefined, fallbackDiagram), fallbackDiagram);
  assert.strictEqual(restoreSavedDiagram(null, fallbackDiagram), fallbackDiagram);
});

test("workspace restore repairs incomplete legacy records with required fallback fields", () => {
  const incompleteDiagram = {
    nodes: fallbackDiagram.nodes
  } as unknown as DiagramJson;

  assert.deepEqual(restoreSavedDiagram(incompleteDiagram, fallbackDiagram), fallbackDiagram);
});

test("workspace restore removes legacy automatic parameter-reference edges but keeps manual edges", () => {
  const savedDiagram: DiagramJson = {
    nodes: [],
    edges: [
      {
        id: "manual-edge",
        sourceNodeId: "asg",
        targetNodeId: "target-group"
      },
      {
        id: "parameter-reference:asg:targetGroupArns[0]:target-group",
        sourceNodeId: "asg",
        targetNodeId: "target-group",
        metadata: {
          managedBy: "parameter-reference",
          parameterPath: "targetGroupArns[0]"
        }
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  assert.deepEqual(restoreSavedDiagram(savedDiagram, fallbackDiagram).edges, [
    savedDiagram.edges[0]
  ]);
});

test("workspace restore repairs selected Template semantics without moving saved nodes", () => {
  const savedDiagram: DiagramJson = {
    edges: [
      {
        id: "repository-evidence-repository-ecr-repository-fargate-runtime",
        sourceNodeId: "repository-ecr",
        targetNodeId: "repository-fargate-runtime"
      }
    ],
    nodes: [
      diagramNode("repository-browser", "client", "Browser", "design", 40, 680),
      diagramNode(
        "repository-managed-services",
        "design_group",
        "AWS Managed Services",
        "design",
        260,
        40,
        {
          width: 1800,
          height: 400
        }
      ),
      diagramNode(
        "fixed-template-ecs-fargate-container-app-vpc",
        "aws_vpc",
        "VPC",
        "resource",
        260,
        500,
        { width: 1800, height: 900 }
      ),
      diagramNode(
        "fixed-template-ecs-fargate-container-app-subnet-a",
        "aws_subnet",
        "Public Subnet A",
        "resource",
        360,
        620,
        {
          parentAreaNodeId: "fixed-template-ecs-fargate-container-app-vpc",
          width: 420,
          height: 280
        }
      ),
      diagramNode(
        "fixed-template-ecs-fargate-container-app-subnet-b",
        "aws_subnet",
        "Public Subnet B",
        "resource",
        840,
        620,
        {
          parentAreaNodeId: "fixed-template-ecs-fargate-container-app-vpc",
          width: 420,
          height: 280
        }
      ),
      diagramNode(
        "repository-private-app-subnet-a",
        "aws_subnet",
        "Private App Subnet A",
        "resource",
        360,
        1010,
        {
          parentAreaNodeId: "fixed-template-ecs-fargate-container-app-vpc",
          width: 420,
          height: 300
        }
      ),
      diagramNode(
        "repository-private-app-subnet-b",
        "aws_subnet",
        "Private App Subnet B",
        "resource",
        840,
        1010,
        {
          parentAreaNodeId: "fixed-template-ecs-fargate-container-app-vpc",
          width: 420,
          height: 300
        }
      ),
      diagramNode(
        "fixed-template-ecs-fargate-container-app-alb-security-group",
        "SECURITY_GROUP",
        "ALB Security Group",
        "resource",
        420,
        680,
        {
          parentAreaNodeId: "fixed-template-ecs-fargate-container-app-subnet-a",
          width: 300,
          height: 160
        }
      ),
      diagramNode(
        "fixed-template-ecs-fargate-container-app-task-security-group",
        "SECURITY_GROUP",
        "Task Security Group",
        "resource",
        420,
        1070,
        { parentAreaNodeId: "repository-private-app-subnet-a", width: 340, height: 180 }
      ),
      {
        ...diagramNode(
          "fixed-template-ecs-fargate-container-app-presentation-region",
          "design_group",
          "Wrong Region",
          "design",
          20,
          20,
          { width: 400, height: 300 }
        ),
        style: { borderColor: "#ffffff" }
      },
      {
        ...diagramNode(
          "fixed-template-ecs-fargate-container-app-presentation-definition-ops-group",
          "client",
          "Wrong Definition Group",
          "design",
          60,
          60,
          { width: 120, height: 80 }
        ),
        style: { borderColor: "#ffffff" }
      },
      {
        ...diagramNode(
          "fixed-template-ecs-fargate-container-app-presentation-global-iam-group",
          "client",
          "Wrong IAM Group",
          "design",
          80,
          80,
          { width: 120, height: 80 }
        ),
        style: { borderColor: "#ffffff" }
      },
      diagramNode(
        "repository-cloudfront",
        "aws_cloudfront_distribution",
        "CloudFront",
        "resource",
        340,
        140,
        {
          parentAreaNodeId: "repository-managed-services"
        }
      ),
      diagramNode(
        "repository-web-assets",
        "aws_s3_bucket",
        "Static Web Assets",
        "resource",
        580,
        140,
        {
          parentAreaNodeId: "repository-managed-services"
        }
      ),
      diagramNode(
        "repository-ecr",
        "aws_ecr_repository",
        "ECR API Image Repository",
        "resource",
        820,
        140,
        {
          parentAreaNodeId: "repository-managed-services"
        }
      ),
      diagramNode(
        "repository-fargate-runtime",
        "aws_ecs_task_definition",
        "Fargate Task",
        "design",
        460,
        1140
      )
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };

  const restoredDiagram = restoreSavedDiagram(savedDiagram, fallbackDiagram);
  const nodeById = new Map(restoredDiagram.nodes.map((node) => [node.id, node]));
  const savedNodeById = new Map(savedDiagram.nodes.map((node) => [node.id, node]));
  const authoredDiagram = buildTemplateDiagramJson("ecs-fargate-container-app", {
    projectSlug: "repository-restore",
    shortId: "layout"
  });
  const authoredNodeById = new Map(authoredDiagram.nodes.map((node) => [node.id, node]));

  assert.equal(nodeById.has("repository-managed-services"), false);
  assert.equal(nodeById.get("repository-cloudfront")?.metadata?.parentAreaNodeId, undefined);
  assert.equal(nodeById.get("repository-fargate-runtime")?.kind, "resource");
  assert.equal(
    nodeById.get("repository-fargate-runtime")?.parameters?.resourceType,
    "aws_ecs_task_definition"
  );
  assert.ok(
    nodeById
      .get("repository-fargate-runtime")
      ?.iconUrl?.includes("Res_Amazon-Elastic-Container-Service_Task_48.svg")
  );
  assert.equal(
    restoredDiagram.edges.some(
      (edge) => edge.id === "repository-evidence-repository-ecr-repository-fargate-runtime"
    ),
    false
  );
  for (const restoredNode of restoredDiagram.nodes.filter((node) =>
    node.id.startsWith("fixed-template-ecs-fargate-container-app-")
  )) {
    const authoredNodeId = restoredNode.id.replace(
      "fixed-template-ecs-fargate-container-app-",
      "template-ecs-fargate-container-app-"
    );
    const authoredNode = authoredNodeById.get(authoredNodeId);

    assert.ok(authoredNode, restoredNode.id);
    const savedNode = savedNodeById.get(restoredNode.id);

    assert.ok(savedNode, restoredNode.id);
    assert.deepEqual(restoredNode.position, savedNode.position, `${restoredNode.id} position`);
    assert.deepEqual(restoredNode.size, savedNode.size, `${restoredNode.id} size`);
  }
  assert.equal(
    nodeById.get("fixed-template-ecs-fargate-container-app-alb-security-group")?.metadata
      ?.parentAreaNodeId,
    "fixed-template-ecs-fargate-container-app-vpc"
  );
  assert.equal(
    nodeById.get("fixed-template-ecs-fargate-container-app-task-security-group")?.metadata
      ?.parentAreaNodeId,
    undefined
  );
  const restoredDefinitionOps = nodeById.get(
    "fixed-template-ecs-fargate-container-app-presentation-definition-ops-group"
  );
  const restoredGlobalIam = nodeById.get(
    "fixed-template-ecs-fargate-container-app-presentation-global-iam-group"
  );
  const restoredRegion = nodeById.get(
    "fixed-template-ecs-fargate-container-app-presentation-region"
  );

  assert.equal(restoredDefinitionOps?.type, "design_group");
  assert.equal(restoredDefinitionOps?.label, "Wrong Definition Group");
  assert.deepEqual(restoredDefinitionOps?.style, { borderColor: "#ffffff" });
  assert.equal(restoredGlobalIam?.type, "design_group");
  assert.equal(restoredGlobalIam?.label, "Wrong IAM Group");
  assert.deepEqual(restoredGlobalIam?.style, { borderColor: "#ffffff" });
  assert.equal(restoredRegion?.type, "aws-region");
  assert.equal(restoredRegion?.label, "Wrong Region");
  assert.deepEqual(restoredRegion?.style, { borderColor: "#ffffff" });
  assert.deepEqual(nodeById.get("repository-browser")?.position, { x: 40, y: 680 });
  assert.deepEqual(nodeById.get("repository-cloudfront")?.position, { x: 340, y: 140 });
  assert.deepEqual(nodeById.get("repository-private-app-subnet-a")?.position, { x: 360, y: 1010 });
  assert.deepEqual(nodeById.get("repository-private-app-subnet-b")?.position, { x: 840, y: 1010 });
});

function diagramNode(
  id: string,
  type: string,
  label: string,
  kind: "design" | "resource",
  x: number,
  y: number,
  options: {
    readonly height?: number;
    readonly parentAreaNodeId?: string;
    readonly width?: number;
  } = {}
): DiagramJson["nodes"][number] {
  return {
    id,
    kind,
    label,
    locked: false,
    metadata: options.parentAreaNodeId ? { parentAreaNodeId: options.parentAreaNodeId } : undefined,
    parameters: {
      fileName: "main.tf",
      resourceName: id.replaceAll("-", "_"),
      resourceType: type,
      terraformBlockType: kind === "resource" ? "resource" : undefined,
      values: {}
    },
    position: { x, y },
    size: { width: options.width ?? 48, height: options.height ?? 48 },
    type,
    zIndex: kind === "design" ? 1 : 4
  };
}
