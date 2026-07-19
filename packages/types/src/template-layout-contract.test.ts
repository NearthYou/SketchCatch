import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  buildTemplateDiagramJson,
  getTemplateDefinitionById,
  REPOSITORY_TEMPLATE_IDS,
  type TemplateDefinition,
  type RepositoryTemplateId
} from "./template-definitions.js";

type LayoutExpectation = {
  readonly position: { readonly x: number; readonly y: number };
  readonly parentResourceId?: string;
  readonly size?: { readonly width: number; readonly height: number };
  readonly presentationArea?: boolean;
};

type EdgeRoutingExpectation = {
  readonly sourceHandleId: string;
  readonly targetHandleId: string;
};

const EXPECTED_VIEWPORTS = {
  "static-web-hosting": { x: 0, y: 0, zoom: 0.8 },
  "minimal-serverless-api": { x: 0, y: 0, zoom: 0.62 },
  "full-serverless-web-app": { x: 0, y: 0, zoom: 0.52 },
  "three-tier-web-app": { x: 0, y: 0, zoom: 0.46 },
  "ecs-fargate-container-app": { x: 0, y: 0, zoom: 0.6 },
  "eks-container-app": { x: 0, y: 0, zoom: 0.46 }
} as const satisfies Record<
  RepositoryTemplateId,
  { readonly x: number; readonly y: number; readonly zoom: number }
>;

const EXPECTED_LAYOUTS = {
  "static-web-hosting": {
    bucket: at(560, 400, "region"),
    "index-object": at(760, 400, "region"),
    "public-access": at(560, 560, "region"),
    oac: at(320, 560),
    distribution: at(320, 400),
    "bucket-policy": at(760, 560, "region")
  },
  "minimal-serverless-api": {
    api: at(280, 200, "region", { width: 520, height: 680 }, true),
    route: at(360, 320, "api"),
    method: at(360, 440, "api"),
    integration: at(360, 560, "api"),
    deployment: at(600, 320, "api"),
    stage: at(600, 440, "api"),
    handler: at(880, 560, "region"),
    role: at(1480, 400, "global-iam-group"),
    "role-policy": at(1640, 400, "global-iam-group"),
    permission: at(880, 320, "region"),
    table: at(1120, 560, "region"),
    "log-group": at(1120, 720, "region")
  },
  "full-serverless-web-app": {
    frontend: at(520, 520, "frontend-group"),
    "user-pool": at(760, 560, "identity-group"),
    "user-client": at(760, 360, "identity-group"),
    api: at(1000, 240, "api-group", { width: 360, height: 560 }, true),
    authorizer: at(1080, 320, "api"),
    route: at(1080, 440, "api"),
    method: at(1080, 560, "api"),
    integration: at(1240, 560, "api"),
    deployment: at(1240, 320, "api"),
    stage: at(1240, 440, "api"),
    handler: at(1520, 440, "compute-group"),
    role: at(1800, 440, "global-iam-group"),
    "role-policy": at(1960, 440, "global-iam-group"),
    permission: at(1520, 320, "compute-group"),
    table: at(1520, 760, "data-ops-group"),
    "log-group": at(1520, 880, "data-ops-group")
  },
  "three-tier-web-app": {
    vpc: at(320, 160, "region", { width: 1760, height: 1360 }),
    "public-subnet-a": at(520, 400, "az-a", { width: 400, height: 280 }),
    "public-subnet-b": at(1480, 400, "az-b", { width: 400, height: 280 }),
    "app-subnet-a": at(520, 760, "az-a", { width: 400, height: 280 }),
    "app-subnet-b": at(1480, 760, "az-b", { width: 400, height: 280 }),
    "db-subnet-a": at(520, 1120, "az-a", { width: 400, height: 240 }),
    "db-subnet-b": at(1480, 1120, "az-b", { width: 400, height: 240 }),
    "internet-gateway": at(280, 240, "region"),
    "public-route-table": at(1160, 280, "vpc"),
    "public-route-a": at(640, 360, "az-a"),
    "public-route-b": at(1600, 360, "az-b"),
    "nat-gateway": at(640, 520, "public-subnet-a"),
    "nat-eip": at(240, 520, "region"),
    "app-route-table": at(1160, 680, "vpc"),
    "app-route-a": at(640, 720, "az-a"),
    "app-route-b": at(1600, 720, "az-b"),
    "db-route-table": at(360, 1080, "vpc"),
    "db-route-a": at(640, 1080, "az-a"),
    "db-route-b": at(1600, 1080, "az-b"),
    "alb-security-group": at(1080, 400, "vpc", { width: 240, height: 200 }),
    "app-security-group": at(1080, 800, "vpc", { width: 240, height: 280 }),
    "db-security-group": at(1080, 1120, "vpc", { width: 240, height: 240 }),
    "latest-ami": at(240, 880, "region"),
    "launch-template": at(1160, 840, "vpc"),
    "load-balancer": at(1160, 480, "vpc"),
    "target-group": at(1280, 600, "vpc"),
    listener: at(1040, 600, "vpc"),
    "application-group": at(1160, 960, "vpc"),
    "db-subnet-group": at(1920, 1200, "vpc"),
    database: at(1160, 1200, "vpc")
  },
  "ecs-fargate-container-app": {
    vpc: at(400, 200, "region", { width: 1360, height: 560 }),
    "subnet-a": at(520, 560, "vpc", { width: 480, height: 160 }),
    "subnet-b": at(1080, 560, "vpc", { width: 480, height: 160 }),
    "internet-gateway": at(360, 240, "region"),
    "route-table": at(440, 640, "vpc"),
    "route-a": at(920, 520, "vpc"),
    "route-b": at(1480, 520, "vpc"),
    cluster: at(1280, 280, "vpc", { width: 320, height: 240 }, true),
    "alb-security-group": at(560, 280, "vpc", { width: 200, height: 200 }),
    "task-security-group": at(1360, 320, "cluster", { width: 160, height: 160 }),
    "execution-role": at(1880, 200, "global-iam-group"),
    "execution-policy": at(2040, 200, "global-iam-group"),
    "task-role": at(1880, 320, "global-iam-group"),
    repository: at(1880, 560, "definition-ops-group"),
    "log-group": at(1880, 680, "definition-ops-group"),
    "load-balancer": at(640, 360, "vpc"),
    "target-group": at(1080, 360, "vpc"),
    listener: at(880, 360, "vpc"),
    task: at(2040, 560, "definition-ops-group"),
    service: at(1400, 360, "cluster"),
    "scaling-target": at(2040, 680, "definition-ops-group"),
    "scaling-policy": at(2200, 560, "definition-ops-group")
  },
  "eks-container-app": {
    vpc: at(320, 240, "region", { width: 1480, height: 1040 }),
    "subnet-a": at(520, 480, "az-a", { width: 360, height: 160 }),
    "subnet-b": at(1280, 480, "az-b", { width: 360, height: 160 }),
    "internet-gateway": at(280, 320, "region"),
    "route-table": at(360, 440, "vpc"),
    "route-a": at(480, 440, "az-a"),
    "route-b": at(1240, 440, "az-b"),
    "cluster-security-group": at(960, 440, "vpc", { width: 240, height: 200 }),
    "cluster-role": at(1960, 320, "global-iam-group"),
    "node-role": at(1960, 480, "global-iam-group"),
    "cluster-policy": at(2120, 320, "global-iam-group"),
    "node-policy": at(2120, 480, "global-iam-group"),
    "node-cni-policy": at(1960, 640, "global-iam-group"),
    "node-ecr-policy": at(2120, 640, "global-iam-group"),
    cluster: at(1040, 520, "vpc"),
    "node-group": at(640, 920, "workloads-group"),
    namespace: at(960, 840, "workloads-group", { width: 520, height: 240 }, true),
    deployment: at(1040, 920, "namespace"),
    service: at(1280, 920, "namespace")
  }
} as const satisfies Record<RepositoryTemplateId, Readonly<Record<string, LayoutExpectation>>>;

const EXPECTED_ROUTING = {
  "static-web-hosting": {
    "bucket-public-access": route("handle-bottom", "handle-top"),
    "bucket-index": route("handle-right", "handle-left"),
    "bucket-oac": route("handle-bottom", "handle-right"),
    "oac-distribution": route("handle-top", "handle-bottom"),
    "distribution-bucket": route("handle-right", "handle-left"),
    "bucket-policy-bucket": route("handle-left", "handle-right")
  },
  "minimal-serverless-api": {
    "api-route": route("handle-bottom", "handle-top"),
    "route-method": route("handle-bottom", "handle-top"),
    "method-integration": route("handle-bottom", "handle-top"),
    "integration-handler": route("handle-right", "handle-left"),
    "handler-role": route("handle-bottom", "handle-top"),
    "handler-table": route("handle-right", "handle-left")
  },
  "full-serverless-web-app": {
    "frontend-api": route("handle-bottom", "handle-bottom"),
    "client-pool": route("handle-bottom", "handle-top"),
    "api-pool": route("handle-left", "handle-right"),
    "api-handler": route("handle-right", "handle-left"),
    "handler-table": route("handle-right", "handle-left")
  },
  "three-tier-web-app": {
    "vpc-igw": route("handle-left", "handle-right"),
    "igw-public-route-table": route("handle-bottom", "handle-top"),
    "public-route-a-link": route("handle-left", "handle-right"),
    "public-route-b-link": route("handle-right", "handle-left"),
    "nat-eip-link": route("handle-right", "handle-left"),
    "public-nat": route("handle-top", "handle-bottom"),
    "nat-app-route-table": route("handle-bottom", "handle-top"),
    "app-route-a-link": route("handle-left", "handle-right"),
    "app-route-b-link": route("handle-right", "handle-left"),
    "db-route-a-link": route("handle-top", "handle-top"),
    "db-route-b-link": route("handle-top", "handle-top"),
    "alb-sg-load-balancer": route("handle-bottom", "handle-top"),
    "load-balancer-listener": route("handle-bottom", "handle-top"),
    "listener-target-group": route("handle-right", "handle-left"),
    "target-group-asg": route("handle-bottom", "handle-top"),
    "app-sg-launch-template": route("handle-top", "handle-top"),
    "app-sg-asg": route("handle-bottom", "handle-bottom"),
    "launch-template-asg": route("handle-bottom", "handle-top"),
    "db-sg-database": route("handle-bottom", "handle-top"),
    "app-db": route("handle-bottom", "handle-top")
  },
  "ecs-fargate-container-app": {
    "vpc-igw": route("handle-left", "handle-right"),
    "igw-route-table": route("handle-bottom", "handle-left"),
    "route-table-a": route("handle-right", "handle-left"),
    "route-table-b": route("handle-right", "handle-left"),
    "alb-sg-load-balancer": route("handle-bottom", "handle-top"),
    "alb-sg-task-sg": route("handle-bottom", "handle-top"),
    "task-sg-service": route("handle-bottom", "handle-top"),
    "load-balancer-listener": route("handle-right", "handle-left"),
    "listener-target-group": route("handle-right", "handle-left"),
    "target-group-service": route("handle-right", "handle-left"),
    "cluster-service": route("handle-right", "handle-left"),
    "service-task": route("handle-right", "handle-left"),
    "service-scaling-target": route("handle-right", "handle-left"),
    "scaling-target-policy": route("handle-right", "handle-left"),
    "repository-task": route("handle-bottom", "handle-top"),
    "task-log-group": route("handle-right", "handle-left"),
    "task-role": route("handle-top", "handle-bottom")
  },
  "eks-container-app": {
    "vpc-igw": route("handle-left", "handle-right"),
    "igw-route-table": route("handle-bottom", "handle-left"),
    "route-table-a": route("handle-right", "handle-left"),
    "route-table-b": route("handle-right", "handle-left"),
    "cluster-sg-cluster": route("handle-bottom", "handle-top"),
    "cluster-role": route("handle-left", "handle-right"),
    "cluster-subnet": route("handle-top", "handle-bottom"),
    "cluster-subnet-b": route("handle-top", "handle-bottom"),
    "cluster-node-group": route("handle-left", "handle-left"),
    "deployment-service": route("handle-right", "handle-left")
  }
} as const satisfies Record<RepositoryTemplateId, Readonly<Record<string, EdgeRoutingExpectation>>>;

const EXPECTED_SEMANTIC_HASHES = {
  "static-web-hosting": "4e85bf89001a4d19444f232dca3127751cc0fd1a592a6fad82cbd30d27500987",
  "minimal-serverless-api": "f4a555474884830020690cfc0a182a4826a8829e60ca1d32fa392374867f04e4",
  "full-serverless-web-app": "f491ee46e9a1a0db6a67c212b24e6fe2c10ef57531be822f5edf7200dce3ee61",
  "three-tier-web-app": "6b78785744969d30a8172d917987d7831ae9d1ec5336660aa8ba3817f0f3c80e",
  "ecs-fargate-container-app": "a97686c693950593aa0c218d38b2ceecda6284e0fd6d0d0eb3a32b72200c9f04",
  "eks-container-app": "f6e0e5c7d00cfd2f6a38bfa41e0eb9f9676c8ffe6f7728e573433e7701f65839"
} as const satisfies Record<RepositoryTemplateId, string>;

test("six deployable templates keep their semantic graph while adopting the PNG layout contract", () => {
  for (const templateId of REPOSITORY_TEMPLATE_IDS) {
    const definition = getTemplateDefinitionById(templateId);
    const expectedLayout = EXPECTED_LAYOUTS[templateId];
    const expectedRouting = EXPECTED_ROUTING[templateId];

    assert.equal(createSemanticHash(definition), EXPECTED_SEMANTIC_HASHES[templateId], templateId);
    assert.deepEqual(
      Object.keys(expectedLayout).sort(),
      definition.resources.map((resource) => resource.id).sort(),
      definition.id
    );
    assert.deepEqual(
      Object.keys(expectedRouting).sort(),
      definition.relationships
        .filter((relationship) => relationship.id in expectedRouting)
        .map((relationship) => relationship.id)
        .sort(),
      definition.id
    );

    for (const resource of definition.resources) {
      const expected = expectedLayout[resource.id];

      assert.ok(expected, `${definition.id}/${resource.id} must have an authored layout`);
      assert.deepEqual(
        resource.position,
        expected.position,
        `${definition.id}/${resource.id} position`
      );
      assert.equal(
        resource.parentResourceId,
        expected.parentResourceId,
        `${definition.id}/${resource.id} parent`
      );
      assert.deepEqual(resource.size, expected.size, `${definition.id}/${resource.id} size`);
      assert.equal(
        resource.presentationArea,
        expected.presentationArea,
        `${definition.id}/${resource.id} presentation area`
      );
    }

    for (const relationship of definition.relationships) {
      const expected = expectedRouting[relationship.id];

      if (!expected) {
        continue;
      }

      assert.equal(
        relationship.type,
        "smoothstep",
        `${definition.id}/${relationship.id} edge type`
      );
      assert.equal(
        relationship.sourceHandleId,
        expected.sourceHandleId,
        `${definition.id}/${relationship.id} source handle`
      );
      assert.equal(
        relationship.targetHandleId,
        expected.targetHandleId,
        `${definition.id}/${relationship.id} target handle`
      );
    }

    const diagram = buildTemplateDiagramJson(templateId, {
      projectSlug: "layout",
      shortId: "contract"
    });
    assert.deepEqual(diagram.viewport, EXPECTED_VIEWPORTS[templateId], `${templateId} viewport`);
  }
});

test("all authored template placements stay on the compact 40px grid", () => {
  // A shared grid keeps nested areas, resource cards, and Design annotations aligned across every template.
  for (const templateId of REPOSITORY_TEMPLATE_IDS) {
    const definition = getTemplateDefinitionById(templateId);
    for (const resource of definition.resources) {
      assertGridValue(resource.position.x, `${definition.id}/${resource.id} x`);
      assertGridValue(resource.position.y, `${definition.id}/${resource.id} y`);

      if (resource.size) {
        assertGridValue(resource.size.width, `${definition.id}/${resource.id} width`);
        assertGridValue(resource.size.height, `${definition.id}/${resource.id} height`);
      }
    }

    for (const presentationNode of definition.presentationNodes) {
      assertGridValue(
        presentationNode.position.x,
        `${definition.id}/${presentationNode.id} presentation x`
      );
      assertGridValue(
        presentationNode.position.y,
        `${definition.id}/${presentationNode.id} presentation y`
      );

      if (
        presentationNode.size &&
        (presentationNode.size.width > 48 || presentationNode.size.height > 48)
      ) {
        assertGridValue(
          presentationNode.size.width,
          `${definition.id}/${presentationNode.id} presentation width`
        );
        assertGridValue(
          presentationNode.size.height,
          `${definition.id}/${presentationNode.id} presentation height`
        );
      }
    }
  }
});

test("ECS Fargate support groups contain their grid-laid resources without overlap", () => {
  const diagram = buildTemplateDiagramJson("ecs-fargate-container-app", {
    projectSlug: "layout",
    shortId: "support-groups"
  });
  const nodeByLabel = new Map(diagram.nodes.map((node) => [node.label, node]));
  const pairs = [
    [
      "Definition / Ops",
      ["Application ECR Repository", "Application ECS Task Definition", "ECS Task Log Group"]
    ],
    [
      "Global IAM",
      ["ECS Task Execution IAM Role", "ECS Task Execution Policy Attachment", "ECS Task IAM Role"]
    ]
  ] as const;

  for (const [parentLabel, childLabels] of pairs) {
    const parent = nodeByLabel.get(parentLabel);
    assert.ok(parent);
    const children = childLabels.map((label) => {
      const child = nodeByLabel.get(label);
      assert.ok(child);
      assert.equal(child.metadata?.parentAreaNodeId, parent.id);
      assert.ok(child.position.x >= parent.position.x);
      assert.ok(child.position.y >= parent.position.y);
      assert.ok(child.position.x + child.size.width <= parent.position.x + parent.size.width);
      assert.ok(child.position.y + child.size.height <= parent.position.y + parent.size.height);
      return child;
    });
    for (let leftIndex = 0; leftIndex < children.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < children.length; rightIndex += 1) {
        assert.equal(rectanglesOverlap(children[leftIndex]!, children[rightIndex]!), false);
      }
    }
  }
});

function at(
  x: number,
  y: number,
  parentResourceId?: string,
  size?: LayoutExpectation["size"],
  presentationArea?: boolean
): LayoutExpectation {
  return {
    position: { x, y },
    ...(parentResourceId ? { parentResourceId } : {}),
    ...(size ? { size } : {}),
    ...(presentationArea ? { presentationArea: true } : {})
  };
}

function route(sourceHandleId: string, targetHandleId: string): EdgeRoutingExpectation {
  return { sourceHandleId, targetHandleId };
}

function rectanglesOverlap(
  left: {
    readonly position: { readonly x: number; readonly y: number };
    readonly size: { readonly width: number; readonly height: number };
  },
  right: {
    readonly position: { readonly x: number; readonly y: number };
    readonly size: { readonly width: number; readonly height: number };
  }
): boolean {
  return (
    left.position.x < right.position.x + right.size.width &&
    left.position.x + left.size.width > right.position.x &&
    left.position.y < right.position.y + right.size.height &&
    left.position.y + left.size.height > right.position.y
  );
}

// Grid assertions include the offending field in their message so a layout drift is quick to repair.
function assertGridValue(value: number, field: string): void {
  assert.equal(value % 40, 0, `${field} must align to the 40px grid`);
}

function createSemanticHash(definition: TemplateDefinition): string {
  const payload = {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    tags: definition.tags,
    providers: definition.providers,
    parameters: definition.parameters,
    resources: definition.resources.map(
      ({
        position: _position,
        parentResourceId: _parentResourceId,
        presentationArea: _presentationArea,
        size: _size,
        ...resource
      }) => resource
    ),
    relationships: definition.relationships.map(
      ({
        sourceHandleId: _sourceHandleId,
        targetHandleId: _targetHandleId,
        type: _type,
        ...relationship
      }) => relationship
    )
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
