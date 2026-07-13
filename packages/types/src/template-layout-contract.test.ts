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
  "static-web-hosting": { x: 0, y: 0, zoom: 0.75 },
  "minimal-serverless-api": { x: 0, y: 0, zoom: 0.64 },
  "full-serverless-web-app": { x: 0, y: 0, zoom: 0.48 },
  "three-tier-web-app": { x: 0, y: 0, zoom: 0.38 },
  "ecs-fargate-container-app": { x: 0, y: 0, zoom: 0.4 },
  "eks-container-app": { x: 0, y: 0, zoom: 0.42 }
} as const satisfies Record<TemplateId, { readonly x: number; readonly y: number; readonly zoom: number }>;

const EXPECTED_LAYOUTS = {
  "static-web-hosting": {
    bucket: at(920, 280),
    "index-object": at(1120, 360),
    "public-access": at(920, 520),
    oac: at(640, 480),
    distribution: at(480, 280),
    "bucket-policy": at(1480, 560)
  },
  "minimal-serverless-api": {
    api: at(320, 240, undefined, { width: 480, height: 900 }, true),
    route: at(440, 380, "api"),
    method: at(440, 520, "api"),
    integration: at(440, 660, "api"),
    deployment: at(440, 800, "api"),
    stage: at(440, 940, "api"),
    handler: at(880, 560),
    role: at(880, 840),
    "role-policy": at(1160, 840),
    permission: at(880, 320),
    table: at(1200, 560),
    "log-group": at(1480, 560)
  },
  "full-serverless-web-app": {
    frontend: at(200, 560),
    "user-pool": at(560, 640),
    "user-client": at(560, 400),
    api: at(920, 260, undefined, { width: 480, height: 1040 }, true),
    authorizer: at(1040, 420, "api"),
    route: at(1040, 580, "api"),
    method: at(1040, 720, "api"),
    integration: at(1040, 860, "api"),
    deployment: at(1040, 1000, "api"),
    stage: at(1040, 1140, "api"),
    handler: at(1520, 560),
    role: at(1520, 840),
    "role-policy": at(1760, 840),
    permission: at(1520, 400),
    table: at(1840, 560),
    "log-group": at(2080, 720)
  },
  "three-tier-web-app": {
    vpc: at(160, 160, undefined, { width: 2400, height: 1840 }),
    "public-subnet-a": at(680, 440, "vpc", { width: 560, height: 400 }),
    "public-subnet-b": at(1440, 440, "vpc", { width: 560, height: 400 }),
    "app-subnet-a": at(680, 920, "vpc", { width: 560, height: 440 }),
    "app-subnet-b": at(1440, 920, "vpc", { width: 560, height: 440 }),
    "db-subnet-a": at(680, 1400, "vpc", { width: 560, height: 360 }),
    "db-subnet-b": at(1440, 1400, "vpc", { width: 560, height: 360 }),
    "internet-gateway": at(320, 280, "vpc"),
    "public-route-table": at(320, 560, "vpc"),
    "public-route-a": at(520, 560, "vpc"),
    "public-route-b": at(520, 680, "vpc"),
    "nat-gateway": at(1120, 280, "vpc"),
    "nat-eip": at(960, 280, "vpc"),
    "app-route-table": at(320, 1040, "vpc"),
    "app-route-a": at(520, 1040, "vpc"),
    "app-route-b": at(520, 1160, "vpc"),
    "db-route-table": at(320, 1520, "vpc"),
    "db-route-a": at(520, 1520, "vpc"),
    "db-route-b": at(520, 1640, "vpc"),
    "alb-security-group": at(820, 680, "public-subnet-a"),
    "app-security-group": at(1760, 1120, "app-subnet-b"),
    "db-security-group": at(1820, 1560, "db-subnet-b"),
    "latest-ami": at(1120, 1240, "app-subnet-a"),
    "launch-template": at(900, 1080, "application-group"),
    "load-balancer": at(820, 560, "public-subnet-a"),
    "target-group": at(1520, 1000, "app-subnet-b"),
    listener: at(1040, 560, "public-subnet-a"),
    "application-group": at(760, 980, "app-subnet-a", { width: 400, height: 220 }),
    "db-subnet-group": at(860, 1480, "db-subnet-a"),
    database: at(1660, 1460, "db-subnet-b")
  },
  "ecs-fargate-container-app": {
    vpc: at(160, 160, undefined, { width: 1800, height: 1440 }),
    "subnet-a": at(400, 360, "vpc", { width: 560, height: 400 }),
    "subnet-b": at(1120, 360, "vpc", { width: 560, height: 320 }),
    "internet-gateway": at(320, 1360, "vpc"),
    "route-table": at(520, 1360, "vpc"),
    "route-a": at(720, 1360, "vpc"),
    "route-b": at(880, 1360, "vpc"),
    cluster: at(440, 760, "vpc", { width: 1200, height: 560 }, true),
    "alb-security-group": at(480, 620, "subnet-a"),
    "task-security-group": at(600, 1160, "cluster"),
    "execution-role": at(2200, 760),
    "execution-policy": at(2440, 760),
    "task-role": at(2200, 960),
    repository: at(2200, 360),
    "log-group": at(2600, 560),
    "load-balancer": at(600, 440, "subnet-a"),
    "target-group": at(1200, 480, "subnet-b"),
    listener: at(800, 560, "subnet-a"),
    task: at(2200, 560),
    service: at(880, 980, "cluster")
  },
  "eks-container-app": {
    vpc: at(160, 160, undefined, { width: 1800, height: 1280 }),
    "subnet-a": at(400, 360, "vpc", { width: 560, height: 200 }),
    "subnet-b": at(1120, 360, "vpc", { width: 560, height: 200 }),
    "internet-gateway": at(320, 1240, "vpc"),
    "route-table": at(520, 1240, "vpc"),
    "route-a": at(720, 1240, "vpc"),
    "route-b": at(880, 1240, "vpc"),
    "cluster-security-group": at(2160, 360),
    "cluster-role": at(2160, 560),
    "node-role": at(2160, 760),
    "cluster-policy": at(2400, 560),
    "node-policy": at(2400, 760),
    "node-cni-policy": at(2160, 960),
    "node-ecr-policy": at(2400, 960),
    cluster: at(400, 640, "vpc", { width: 1200, height: 480 }, true),
    "node-group": at(600, 800, "cluster"),
    namespace: at(920, 760, "cluster", { width: 560, height: 280 }, true),
    deployment: at(1040, 900, "namespace"),
    service: at(1280, 900, "namespace")
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
    "frontend-api": route("handle-right", "handle-left"),
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
    "task-role": route("handle-bottom", "handle-top")
  },
  "eks-container-app": {
    "cluster-role": route("handle-left", "handle-right"),
    "cluster-subnet": route("handle-top", "handle-bottom"),
    "cluster-node-group": route("handle-right", "handle-left"),
    "deployment-service": route("handle-right", "handle-left")
  }
} as const satisfies Record<TemplateId, Readonly<Record<string, EdgeRoutingExpectation>>>;

const EXPECTED_SEMANTIC_HASHES = {
  "static-web-hosting": "eb1887762d91b666e43c572b51b1afbb399021be65a450051b7a273b7cd22cc9",
  "minimal-serverless-api": "569e77bce78e3f930273b4298f6c530763e27cedb37f0d29993f7fd776581375",
  "full-serverless-web-app": "ccafb8e57b7699e867144e242f0f5fc421f7e77589abc69f32d45e8b8a8b6f84",
  "three-tier-web-app": "1c4a664f9a481a7037bbb4a055767e372f1e1bcebd45c68075cf5d3b6d304eb2",
  "ecs-fargate-container-app": "3ba6e58bbdbd2ea59626a8d46146329e317bcfd177c65a9cc1762d7754eccb5d",
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
