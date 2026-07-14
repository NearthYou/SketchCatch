import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, DiagramNode } from "../../../../packages/types/src";
import { isAreaNode } from "../diagram-editor/area-nodes";
import { toFlowEdges } from "../diagram-editor/flow-mappers";
import { doesOrthogonalRouteCrossResource } from "../diagram-editor/obstacle-safe-edge-routing";
import { getResourceNodeVisualBounds } from "../diagram-editor/resource-node-visual-footprint";
import { hydrateCatalogResourceNodes } from "./template-resource-materializer";
import * as templateLibrary from "./template-library";

test("every reviewed deployable Template has zero unintended sibling collisions", () => {
  const templates = templateLibrary.listRepositoryBoardTemplates();

  assert.equal(templates.length, 6);
  for (const template of templates) {
    assert.deepEqual(findSiblingVisualCollisions(template.diagramJson), [], template.id);
  }
});

test("every reviewed deployable Template keeps child visual footprints inside its Area", () => {
  for (const template of getAllMaterializedTemplates()) {
    const nodeById = new Map(template.diagramJson.nodes.map((node) => [node.id, node]));

    for (const child of template.diagramJson.nodes) {
      const parentId = child.metadata?.parentAreaNodeId;
      const parent = parentId ? nodeById.get(parentId) : undefined;

      if (!parent || !isAreaNode(parent)) {
        continue;
      }

      const childBounds = getResourceNodeVisualBounds(child);
      const parentBounds = getResourceNodeVisualBounds(parent);
      assert.ok(
        childBounds.x >= parentBounds.x &&
          childBounds.y >= parentBounds.y &&
          childBounds.x + childBounds.width <= parentBounds.x + parentBounds.width &&
          childBounds.y + childBounds.height <= parentBounds.y + parentBounds.height,
        `${template.id}: ${child.id} must fit inside ${parent.id}`
      );
    }
  }
});

test("every reviewed deployable Template routes each visible edge around Resource captions", () => {
  for (const template of getAllMaterializedTemplates()) {
    const nodeById = new Map(template.diagramJson.nodes.map((node) => [node.id, node]));
    const flowEdges = toFlowEdges(template.diagramJson.edges, [], template.diagramJson.nodes, { isPreview: true });
    const crossings: string[] = [];

    for (const flowEdge of flowEdges) {
      const source = nodeById.get(flowEdge.source);
      const target = nodeById.get(flowEdge.target);
      const sourceHandleId = toLogicalHandleId(flowEdge.sourceHandle);
      const targetHandleId = toLogicalHandleId(flowEdge.targetHandle);

      assert.ok(source, `${template.id}: ${flowEdge.id} source must exist`);
      assert.ok(target, `${template.id}: ${flowEdge.id} target must exist`);
      assert.ok(sourceHandleId, `${template.id}: ${flowEdge.id} source handle must exist`);
      assert.ok(targetHandleId, `${template.id}: ${flowEdge.id} target handle must exist`);
      if (doesOrthogonalRouteCrossResource(
        source,
        target,
        { sourceHandleId, targetHandleId },
        template.diagramJson.nodes
      )) {
        crossings.push(flowEdge.id);
      }
    }

    assert.deepEqual(crossings, [], `${template.id}: edges cross a Resource caption`);
  }
});

test("materialized network Templates keep IGW and Route Association nodes on Area boundaries", () => {
  const networkTemplateIds = new Set([
    "three-tier-web-app",
    "ecs-fargate-container-app",
    "eks-container-app"
  ]);

  for (const template of getAllMaterializedTemplates().filter((candidate) =>
    networkTemplateIds.has(candidate.id)
  )) {
    const vpc = template.diagramJson.nodes.find((node) => getResourceType(node) === "aws_vpc");
    const internetGateway = template.diagramJson.nodes.find(
      (node) => getResourceType(node) === "aws_internet_gateway"
    );

    assert.ok(vpc, `${template.id}/vpc`);
    assert.ok(internetGateway, `${template.id}/internet-gateway`);
    assert.notEqual(internetGateway.metadata?.parentAreaNodeId, vpc.id, `${template.id}/IGW parent`);
    assert.equal(referencesResource(internetGateway, "vpcId", vpc), true, `${template.id}/IGW ref`);
    assert.equal(straddlesStoredBoundary(vpc, internetGateway), true, `${template.id}/IGW boundary`);

    for (const association of template.diagramJson.nodes.filter(
      (node) => getResourceType(node) === "aws_route_table_association"
    )) {
      const subnet = template.diagramJson.nodes.find(
        (node) =>
          getResourceType(node) === "aws_subnet" &&
          referencesResource(association, "subnetId", node)
      );

      assert.ok(subnet, `${template.id}/${association.id} subnet`);
      assert.notEqual(association.metadata?.parentAreaNodeId, subnet.id, `${template.id}/${association.id} parent`);
      assert.equal(
        straddlesStoredBoundary(subnet, association),
        true,
        `${template.id}/${association.id} boundary`
      );
    }
  }
});

test("draft catalog hydration preserves user-authored coordinates", () => {
  const savedDraft = createDiagram([
    {
      id: "saved-bucket",
      kind: "resource",
      label: "Saved Bucket",
      locked: false,
      parameters: {
        fileName: "main",
        resourceName: "saved",
        resourceType: "aws_s3_bucket",
        terraformBlockType: "resource",
        values: {}
      },
      position: { x: 173, y: 287 },
      size: { height: 48, width: 48 },
      type: "aws_s3_bucket",
      zIndex: 1
    }
  ]);

  const hydrated = hydrateCatalogResourceNodes(savedDraft);

  assert.deepEqual(hydrated.nodes[0]?.position, { x: 173, y: 287 });
});

// SG scope와 network boundary marker만 허용하고 실제 node/caption 충돌을 수집합니다.
function findSiblingVisualCollisions(diagram: DiagramJson): string[] {
  // DiagramEditor renders every persisted node, including parameter-helper resources with captions.
  const renderableNodes = diagram.nodes;
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]));
  const groups = new Map<string, DiagramNode[]>();

  for (const node of renderableNodes) {
    const parentAreaNodeId = node.metadata?.parentAreaNodeId;
    const parent = parentAreaNodeId ? nodeById.get(parentAreaNodeId) : undefined;
    const parentId = parent && isAreaNode(parent) ? parent.id : "__root__";
    const siblings = groups.get(parentId) ?? [];

    siblings.push(node);
    groups.set(parentId, siblings);
  }

  const collisions: string[] = [];

  for (const siblings of groups.values()) {
    for (let leftIndex = 0; leftIndex < siblings.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < siblings.length; rightIndex += 1) {
        const left = siblings[leftIndex];
        const right = siblings[rightIndex];

        if (
          left &&
          right &&
          intersects(left, right) &&
          !isIntentionalArchitectureOverlap(diagram, left, right)
        ) {
          collisions.push(`${left.id} <> ${right.id}`);
        }
      }
    }
  }

  return collisions;
}

// 명시적 SG 적용 범위, IGW-VPC 경계, Route association-Subnet 경계만 intentional로 인정합니다.
function isIntentionalArchitectureOverlap(
  diagram: DiagramJson,
  left: DiagramNode,
  right: DiagramNode
): boolean {
  const [firstType, secondType] = [getResourceType(left), getResourceType(right)];

  if (firstType === "aws_security_group" || secondType === "aws_security_group") {
    const scope = firstType === "aws_security_group" ? left : right;
    const target = scope === left ? right : left;
    const hasScopeEdge = diagram.edges.some(
      (edge) => edge.sourceNodeId === scope.id && edge.targetNodeId === target.id
    );

    return hasScopeEdge && containsVisualBounds(scope, target);
  }

  if (
    (firstType === "aws_internet_gateway" && secondType === "aws_vpc") ||
    (firstType === "aws_vpc" && secondType === "aws_internet_gateway")
  ) {
    const gateway = firstType === "aws_internet_gateway" ? left : right;
    const vpc = gateway === left ? right : left;

    return referencesResource(gateway, "vpcId", vpc) && straddlesStoredBoundary(vpc, gateway);
  }

  if (
    (firstType === "aws_route_table_association" && secondType === "aws_subnet") ||
    (firstType === "aws_subnet" && secondType === "aws_route_table_association")
  ) {
    const association = firstType === "aws_route_table_association" ? left : right;
    const subnet = association === left ? right : left;

    return referencesResource(association, "subnetId", subnet) && straddlesStoredBoundary(subnet, association);
  }

  return false;
}

// Template reference가 materialize된 Terraform address로 정확한 대상 resource를 가리키는지 확인합니다.
function referencesResource(source: DiagramNode, valueKey: string, target: DiagramNode): boolean {
  const resourceType = target.parameters?.resourceType;
  const resourceName = target.parameters?.resourceName;

  if (!resourceType || !resourceName) {
    return false;
  }

  return source.parameters?.values[valueKey] === `${resourceType}.${resourceName}.id`;
}

// 일반 Resource caption까지 포함한 target footprint가 scope 내부에 있는지 확인합니다.
function containsVisualBounds(scope: DiagramNode, target: DiagramNode): boolean {
  const scopeBounds = getResourceNodeVisualBounds(scope);
  const targetBounds = getResourceNodeVisualBounds(target);

  return (
    targetBounds.x >= scopeBounds.x &&
    targetBounds.y >= scopeBounds.y &&
    targetBounds.x + targetBounds.width <= scopeBounds.x + scopeBounds.width &&
    targetBounds.y + targetBounds.height <= scopeBounds.y + scopeBounds.height
  );
}

// Parameter metadata가 있으면 Terraform type을, 없으면 visual type을 사용합니다.
function getResourceType(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}

// persisted icon rectangle이 Area 내부와 외부에 동시에 걸치는지 확인합니다.
function straddlesStoredBoundary(area: DiagramNode, marker: DiagramNode): boolean {
  const areaRight = area.position.x + area.size.width;
  const areaBottom = area.position.y + area.size.height;
  const markerRight = marker.position.x + marker.size.width;
  const markerBottom = marker.position.y + marker.size.height;
  const intersectsStoredBounds =
    marker.position.x < areaRight &&
    markerRight > area.position.x &&
    marker.position.y < areaBottom &&
    markerBottom > area.position.y;
  const isFullyInside =
    marker.position.x >= area.position.x &&
    marker.position.y >= area.position.y &&
    markerRight <= areaRight &&
    markerBottom <= areaBottom;

  return intersectsStoredBounds && !isFullyInside;
}

function getAllMaterializedTemplates() {
  return templateLibrary.listRepositoryBoardTemplates();
}

function toLogicalHandleId(handleId: string | null | undefined): string | undefined {
  const side = handleId?.match(/(?:source-|target-|handle-)?(left|top|right|bottom)$/u)?.[1];
  return side ? `handle-${side}` : undefined;
}

function intersects(left: DiagramNode, right: DiagramNode): boolean {
  const a = getResourceNodeVisualBounds(left);
  const b = getResourceNodeVisualBounds(right);

  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function createDiagram(nodes: readonly DiagramNode[]): DiagramJson {
  return { edges: [], nodes: [...nodes], viewport: { x: 0, y: 0, zoom: 1 } };
}
