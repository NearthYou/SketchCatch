import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  buildTemplateDiagramJson,
  templateDefinitions,
  type TemplateDefinition,
  type TemplateId
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
  "minimal-serverless-api": { x: 0, y: 0, zoom: 0.68 },
  "full-serverless-web-app": { x: 0, y: 0, zoom: 0.52 },
  "three-tier-web-app": { x: 0, y: 0, zoom: 0.42 },
  "ecs-fargate-container-app": { x: 0, y: 0, zoom: 0.4 },
  "eks-container-app": { x: 0, y: 0, zoom: 0.4 }
} as const satisfies Record<TemplateId, { readonly x: number; readonly y: number; readonly zoom: number }>;

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
    api: at(360, 240, "region", { width: 320, height: 760 }, true),
    route: at(440, 360, "api"),
    method: at(440, 480, "api"),
    integration: at(440, 600, "api"),
    deployment: at(440, 720, "api"),
    stage: at(440, 840, "api"),
    handler: at(760, 600, "region"),
    role: at(760, 1160),
    "role-policy": at(960, 1160),
    permission: at(760, 360, "region"),
    table: at(960, 600, "region"),
    "log-group": at(1080, 600, "region")
  },
  "full-serverless-web-app": {
    frontend: at(520, 680, "frontend-group"),
    "user-pool": at(760, 680, "identity-group"),
    "user-client": at(760, 400, "identity-group"),
    api: at(1000, 200, "api-group", { width: 280, height: 960 }, true),
    authorizer: at(1080, 320, "api"),
    route: at(1080, 440, "api"),
    method: at(1080, 560, "api"),
    integration: at(1080, 680, "api"),
    deployment: at(1080, 800, "api"),
    stage: at(1080, 920, "api"),
    handler: at(1440, 680, "compute-group"),
    role: at(1440, 1480, "global-iam-group"),
    "role-policy": at(1640, 1480, "global-iam-group"),
    permission: at(1440, 480, "compute-group"),
    table: at(1680, 680, "data-ops-group"),
    "log-group": at(1680, 840, "data-ops-group")
  },
  "three-tier-web-app": {
    vpc: at(320, 160, "region", { width: 2000, height: 1680 }),
    "public-subnet-a": at(840, 480, "az-a", { width: 560, height: 360 }),
    "public-subnet-b": at(1600, 480, "az-b", { width: 560, height: 360 }),
    "app-subnet-a": at(840, 920, "az-a", { width: 560, height: 440 }),
    "app-subnet-b": at(1600, 920, "az-b", { width: 560, height: 440 }),
    "db-subnet-a": at(840, 1400, "az-a", { width: 560, height: 320 }),
    "db-subnet-b": at(1600, 1400, "az-b", { width: 560, height: 320 }),
    "internet-gateway": at(400, 280, "vpc"),
    "public-route-table": at(400, 600, "vpc"),
    "public-route-a": at(560, 560, "vpc"),
    "public-route-b": at(560, 680, "vpc"),
    "nat-gateway": at(920, 280, "vpc"),
    "nat-eip": at(760, 280, "vpc"),
    "app-route-table": at(400, 1040, "vpc"),
    "app-route-a": at(560, 1000, "vpc"),
    "app-route-b": at(560, 1120, "vpc"),
    "db-route-table": at(400, 1480, "vpc"),
    "db-route-a": at(560, 1440, "vpc"),
    "db-route-b": at(560, 1560, "vpc"),
    "alb-security-group": at(880, 720, "public-subnet-a"),
    "app-security-group": at(1840, 1160, "app-subnet-b"),
    "db-security-group": at(1840, 1600, "db-subnet-b"),
    "latest-ami": at(1240, 1200, "app-subnet-a"),
    "launch-template": at(960, 1120, "application-group"),
    "load-balancer": at(880, 600, "public-subnet-a"),
    "target-group": at(1640, 1040, "app-subnet-b"),
    listener: at(1040, 600, "public-subnet-a"),
    "application-group": at(880, 1000, "app-subnet-a", { width: 320, height: 240 }),
    "db-subnet-group": at(880, 1520, "db-subnet-a"),
    database: at(1640, 1480, "db-subnet-b")
  },
  "ecs-fargate-container-app": {
    vpc: at(360, 600, "region", { width: 1600, height: 1280 }),
    "subnet-a": at(560, 920, "az-a", { width: 440, height: 320 }),
    "subnet-b": at(1240, 920, "az-b", { width: 440, height: 320 }),
    "internet-gateway": at(440, 720, "vpc"),
    "route-table": at(600, 720, "vpc"),
    "route-a": at(760, 720, "vpc"),
    "route-b": at(920, 720, "vpc"),
    cluster: at(520, 1360, "vpc", { width: 1200, height: 400 }, true),
    "alb-security-group": at(640, 1120, "subnet-a"),
    "task-security-group": at(680, 1600, "cluster"),
    "execution-role": at(2160, 200, "global-iam-group"),
    "execution-policy": at(2360, 200, "global-iam-group"),
    "task-role": at(2360, 320, "global-iam-group"),
    repository: at(2360, 840, "definition-ops-group"),
    "log-group": at(2360, 1000, "definition-ops-group"),
    "load-balancer": at(640, 1000, "subnet-a"),
    "target-group": at(1320, 1040, "subnet-b"),
    listener: at(800, 1000, "subnet-a"),
    task: at(2160, 1000, "definition-ops-group"),
    service: at(880, 1480, "cluster")
  },
  "eks-container-app": {
    vpc: at(360, 160, "region", { width: 1600, height: 1280 }),
    "subnet-a": at(560, 480, "az-a", { width: 440, height: 160 }),
    "subnet-b": at(1240, 480, "az-b", { width: 440, height: 160 }),
    "internet-gateway": at(440, 280, "vpc"),
    "route-table": at(600, 280, "vpc"),
    "route-a": at(760, 280, "vpc"),
    "route-b": at(920, 280, "vpc"),
    "cluster-security-group": at(1640, 1280, "vpc"),
    "cluster-role": at(2200, 440, "global-iam-group"),
    "node-role": at(2200, 600, "global-iam-group"),
    "cluster-policy": at(2400, 440, "global-iam-group"),
    "node-policy": at(2400, 600, "global-iam-group"),
    "node-cni-policy": at(2200, 760, "global-iam-group"),
    "node-ecr-policy": at(2400, 760, "global-iam-group"),
    cluster: at(520, 800, "vpc", { width: 1200, height: 400 }, true),
    "node-group": at(640, 960, "cluster"),
    namespace: at(960, 880, "cluster", { width: 600, height: 240 }, true),
    deployment: at(1040, 1000, "namespace"),
    service: at(1200, 1000, "namespace")
  }
} as const satisfies Record<TemplateId, Readonly<Record<string, LayoutExpectation>>>;

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
    "vpc-igw": route("handle-top", "handle-bottom"),
    "public-nat": route("handle-top", "handle-bottom"),
    "alb-asg": route("handle-bottom", "handle-top"),
    "app-db": route("handle-bottom", "handle-top")
  },
  "ecs-fargate-container-app": {
    "cluster-service": route("handle-right", "handle-left"),
    "service-task": route("handle-right", "handle-left"),
    "repository-task": route("handle-bottom", "handle-top"),
    "task-log-group": route("handle-right", "handle-left"),
    "task-role": route("handle-top", "handle-bottom")
  },
  "eks-container-app": {
    "cluster-role": route("handle-left", "handle-right"),
    "cluster-subnet": route("handle-top", "handle-bottom"),
    "cluster-node-group": route("handle-left", "handle-left"),
    "deployment-service": route("handle-right", "handle-left")
  }
} as const satisfies Record<TemplateId, Readonly<Record<string, EdgeRoutingExpectation>>>;

const EXPECTED_SEMANTIC_HASHES = {
  "static-web-hosting": "eb1887762d91b666e43c572b51b1afbb399021be65a450051b7a273b7cd22cc9",
  "minimal-serverless-api": "569e77bce78e3f930273b4298f6c530763e27cedb37f0d29993f7fd776581375",
  "full-serverless-web-app": "ccafb8e57b7699e867144e242f0f5fc421f7e77589abc69f32d45e8b8a8b6f84",
  "three-tier-web-app": "1c4a664f9a481a7037bbb4a055767e372f1e1bcebd45c68075cf5d3b6d304eb2",
  "ecs-fargate-container-app": "442a0d397253a94d87054a02df5a920365594e7c813607c567fa9e0ae641343e",
  "eks-container-app": "db008e02882d0e8807a6066533fcc59fea7b88cf4c357991da8254d9cbd726bb"
} as const satisfies Record<TemplateId, string>;

test("six deployable templates keep their semantic graph while adopting the PNG layout contract", () => {
  for (const definition of templateDefinitions) {
    const expectedLayout = EXPECTED_LAYOUTS[definition.id];
    const expectedRouting = EXPECTED_ROUTING[definition.id];

    assert.equal(createSemanticHash(definition), EXPECTED_SEMANTIC_HASHES[definition.id], definition.id);
    assert.deepEqual(Object.keys(expectedLayout).sort(), definition.resources.map((resource) => resource.id).sort(), definition.id);
    assert.deepEqual(Object.keys(expectedRouting).sort(), definition.relationships
      .filter((relationship) => relationship.id in expectedRouting)
      .map((relationship) => relationship.id)
      .sort(), definition.id);

    for (const resource of definition.resources) {
      const expected = expectedLayout[resource.id];

      assert.ok(expected, `${definition.id}/${resource.id} must have an authored layout`);
      assert.deepEqual(resource.position, expected.position, `${definition.id}/${resource.id} position`);
      assert.equal(resource.parentResourceId, expected.parentResourceId, `${definition.id}/${resource.id} parent`);
      assert.deepEqual(resource.size, expected.size, `${definition.id}/${resource.id} size`);
      assert.equal(resource.presentationArea, expected.presentationArea, `${definition.id}/${resource.id} presentation area`);
    }

    for (const relationship of definition.relationships) {
      const expected = expectedRouting[relationship.id];

      if (!expected) {
        continue;
      }

      assert.equal(relationship.type, "smoothstep", `${definition.id}/${relationship.id} edge type`);
      assert.equal(relationship.sourceHandleId, expected.sourceHandleId, `${definition.id}/${relationship.id} source handle`);
      assert.equal(relationship.targetHandleId, expected.targetHandleId, `${definition.id}/${relationship.id} target handle`);
    }

    const diagram = buildTemplateDiagramJson(definition.id, { projectSlug: "layout", shortId: "contract" });
    assert.deepEqual(diagram.viewport, EXPECTED_VIEWPORTS[definition.id], `${definition.id} viewport`);
  }
});

test("all authored template placements stay on the compact 40px grid", () => {
  // A shared grid keeps nested areas, resource cards, and Design annotations aligned across every template.
  for (const definition of templateDefinitions) {
    for (const resource of definition.resources) {
      assertGridValue(resource.position.x, `${definition.id}/${resource.id} x`);
      assertGridValue(resource.position.y, `${definition.id}/${resource.id} y`);

      if (resource.size) {
        assertGridValue(resource.size.width, `${definition.id}/${resource.id} width`);
        assertGridValue(resource.size.height, `${definition.id}/${resource.id} height`);
      }
    }

    for (const presentationNode of definition.presentationNodes) {
      assertGridValue(presentationNode.position.x, `${definition.id}/${presentationNode.id} presentation x`);
      assertGridValue(presentationNode.position.y, `${definition.id}/${presentationNode.id} presentation y`);

      if (presentationNode.size && (presentationNode.size.width > 48 || presentationNode.size.height > 48)) {
        assertGridValue(presentationNode.size.width, `${definition.id}/${presentationNode.id} presentation width`);
        assertGridValue(presentationNode.size.height, `${definition.id}/${presentationNode.id} presentation height`);
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
    resources: definition.resources.map(({
      position: _position,
      parentResourceId: _parentResourceId,
      presentationArea: _presentationArea,
      size: _size,
      ...resource
    }) => resource),
    relationships: definition.relationships.map(({ sourceHandleId: _sourceHandleId, targetHandleId: _targetHandleId, type: _type, ...relationship }) => relationship)
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
