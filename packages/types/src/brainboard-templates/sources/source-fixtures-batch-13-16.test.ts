import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type {
  BrainboardSourceEdge,
  BrainboardSourceNode,
  BrainboardTemplateSource,
  BrainboardTerraformFile
} from "../source-types.js";
import { validateBrainboardTemplateSource } from "../validate-source.js";

type RawNode = {
  readonly height: number;
  readonly order: number;
  readonly parentSourceNodeId: string | null;
  readonly position: { readonly x: number; readonly y: number };
  readonly resourceType: string;
  readonly sourceNodeId: string;
  readonly title: string;
  readonly transform: string;
  readonly width: number;
};

type RawEdge = {
  readonly arrow: { readonly points: string; readonly transform: string } | null;
  readonly id: string;
  readonly order: number;
  readonly sourceNodeId: string;
  readonly sourcePoint: { readonly x: number; readonly y: number };
  readonly sourcePort: string;
  readonly svgPath: string;
  readonly targetNodeId: string;
  readonly targetPoint: { readonly x: number; readonly y: number };
  readonly targetPort: string;
  readonly waypoints: readonly { readonly x: number; readonly y: number }[];
};

type RawCapture = {
  readonly id: string;
  readonly title: string;
  readonly status: "captured";
  readonly provider: "aws";
  readonly origin: {
    readonly platform: "brainboard";
    readonly author: "Chafik Belhaoues";
    readonly sourceTemplateId: string;
    readonly sourceUrl: string;
    readonly cloneBoardUrl: string;
    readonly downloads: number;
    readonly capturedAt: string;
  };
  readonly nodes: readonly RawNode[];
  readonly edges: readonly RawEdge[];
  readonly viewport: { readonly viewBox: string };
  readonly terraform: {
    readonly files: readonly (BrainboardTerraformFile & { readonly lineCount: number })[];
    readonly resourceAddresses: readonly string[];
  };
};

type MappingStrategy = "exact-title" | "single-residual" | "reviewed-override";
type ExpectedResourceMapping = readonly [
  sourceNodeId: string,
  address: string,
  fileName: string,
  strategy: MappingStrategy
];

type FixtureExpectation = {
  readonly moduleFileName: string;
  readonly exportName: string;
  readonly rawFileName: string;
  readonly rawCaptureSha256: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly parentRepairs: ReadonlyMap<string, string | null>;
  readonly mappings: readonly ExpectedResourceMapping[];
  readonly workspaceOmissions: ReadonlyMap<string, readonly string[]>;
};

const captureDirectory = new URL(
  "../../../../../docs/gg/feat-infrastructure-template/brainboard-captures/",
  import.meta.url
);

const expectations = [
  {
    moduleFileName: "aws-load-balancer-target-group.ts",
    exportName: "awsLoadBalancerTargetGroupSource",
    rawFileName: "aws-load-balancer-target-group.json",
    rawCaptureSha256: "e33e040800e41a64dcd0a6dad71872f34ce46a429555b2dab76c6793b189ded9",
    nodeCount: 13,
    edgeCount: 4,
    parentRepairs: new Map([
      ["c52a1a71-178d-4ae7-90bf-28a69b7d20a9", null],
      ["595f9ca1-9786-4270-a86e-f584fd0dd78b", "c52a1a71-178d-4ae7-90bf-28a69b7d20a9"],
      ["c62807d5-e1bf-450d-a78e-bd44c7911496", "595f9ca1-9786-4270-a86e-f584fd0dd78b"],
      ["cb5d901c-6f13-45b6-8c28-708389c20c56", "c62807d5-e1bf-450d-a78e-bd44c7911496"],
      ["d5d05b1a-2611-4237-b99e-7e67ad204bcb", "c62807d5-e1bf-450d-a78e-bd44c7911496"]
    ]),
    mappings: [
      ["595f9ca1-9786-4270-a86e-f584fd0dd78b", "aws_vpc.default", "main.tf", "exact-title"],
      ["c62807d5-e1bf-450d-a78e-bd44c7911496", "aws_security_group.sg", "main.tf", "exact-title"],
      ["e275ea03-fd95-411d-bf68-9beda7afa0a5", "aws_subnet.default", "main.tf", "exact-title"],
      ["71f7a4a8-0f10-4c27-ab01-6feb1e6279b4", "aws_subnet.subnet2", "main.tf", "exact-title"],
      [
        "9976bc88-df75-470c-8d22-b9d110e98a1c",
        "aws_lb_listener.lb_listner",
        "main.tf",
        "single-residual"
      ],
      [
        "b06847a7-437a-4d11-b271-28a83e9ff1c0",
        "aws_lb_target_group.aws_lb_target_group_8",
        "main.tf",
        "single-residual"
      ],
      ["048a3f38-9205-4ca7-b6fa-5f37ce90c75f", "aws_instance.t3a_9", "main.tf", "exact-title"],
      [
        "f18c57e0-c9a1-45c1-83f4-03b84924b7c8",
        "aws_lb_target_group_attachment.aws_lb_target_group_attachment_10",
        "main.tf",
        "single-residual"
      ],
      ["3548540e-5692-4cc2-914b-11b77e43085d", "aws_lb.alb", "main.tf", "exact-title"],
      [
        "4882367c-117c-4af0-9957-4d6d466d7658",
        "aws_internet_gateway.aws_internet_gateway_12",
        "main.tf",
        "exact-title"
      ]
    ],
    workspaceOmissions: new Map([
      ["variables.tf", ['    archuuid = "85dda071-ea16-4cbc-9d77-7cebe6ebaadd"\n']]
    ])
  },
  {
    moduleFileName: "aws-s3-api-gateway.ts",
    exportName: "awsS3ApiGatewaySource",
    rawFileName: "aws-s3-api-gateway.json",
    rawCaptureSha256: "e070854471d7419eae61653b56ae1ec9def078d097fede373f92dd3569f8b818",
    nodeCount: 16,
    edgeCount: 31,
    parentRepairs: new Map(),
    mappings: [
      [
        "f51e7972-ab44-48f6-a7e3-9cb720aa0c51",
        "aws_iam_policy.s3_policy",
        "main.tf",
        "single-residual"
      ],
      [
        "8cfad4ae-9882-4ba7-a0d7-1dbe9defb4f7",
        "aws_iam_role.s3_api_gateyway_role",
        "main.tf",
        "single-residual"
      ],
      [
        "4dfe1d77-191d-4f82-94f4-153e22afac77",
        "aws_iam_role_policy_attachment.s3_policy_attach",
        "main.tf",
        "single-residual"
      ],
      [
        "208ba11f-9da2-4fbf-8748-3fdbaddee037",
        "aws_api_gateway_rest_api.s3_gtw",
        "main.tf",
        "single-residual"
      ],
      [
        "d7f660ea-c9a7-4269-9a78-047de51122c5",
        "aws_api_gateway_resource.folder",
        "main.tf",
        "reviewed-override"
      ],
      [
        "5d9d4b38-323c-4029-b582-1ab3e2875f5e",
        "aws_api_gateway_resource.item",
        "main.tf",
        "reviewed-override"
      ],
      [
        "75347de7-6fdd-43eb-affc-adda7651310c",
        "aws_api_gateway_method.GetBuckets",
        "main.tf",
        "single-residual"
      ],
      [
        "5e8966bc-bff7-49f0-889c-7570aa6ff7ec",
        "aws_api_gateway_method_response.Status200",
        "main.tf",
        "reviewed-override"
      ],
      [
        "18c510a5-9ff3-4248-a32d-7172fdb43a77",
        "aws_api_gateway_method_response.Status400",
        "main.tf",
        "reviewed-override"
      ],
      [
        "ef9e666e-bd66-40f8-b84a-0fd40902e25c",
        "aws_api_gateway_integration_response.IntegrationResponse400",
        "main.tf",
        "reviewed-override"
      ],
      [
        "fb45b084-8383-4a40-bddb-78957f701b33",
        "aws_api_gateway_integration_response.IntegrationResponse500",
        "main.tf",
        "reviewed-override"
      ],
      [
        "b7ca82da-ac8a-45c3-b72b-f47f1eb5b83e",
        "aws_api_gateway_deployment.S3APIDeployment",
        "main.tf",
        "single-residual"
      ],
      [
        "91ca7d35-8b99-47be-83c9-952aa6c46c46",
        "aws_api_gateway_integration.S3Integration",
        "main.tf",
        "single-residual"
      ],
      [
        "aa4a3412-93c5-49e6-891b-37102ca3f8b2",
        "aws_api_gateway_method_response.Status500",
        "main.tf",
        "reviewed-override"
      ],
      [
        "b93e0c77-0069-4893-a2ce-c5635c99d530",
        "aws_api_gateway_integration_response.IntegrationResponse200",
        "main.tf",
        "reviewed-override"
      ]
    ],
    workspaceOmissions: new Map([
      ["main.tf", ['    archUUID = "682c2db8-5d36-4383-b248-cb2142e2b6fb"\n']],
      ["variables.tf", ['    archuuid = "73327761-bb6a-4516-92e5-f06007e372ec"\n']]
    ])
  },
  {
    moduleFileName: "aws-cost-monitoring.ts",
    exportName: "awsCostMonitoringSource",
    rawFileName: "aws-cost-monitoring.json",
    rawCaptureSha256: "ff1b34cfe20267bdb2c8b6db863468f75141afad709fa963c916240a85ff4bee",
    nodeCount: 5,
    edgeCount: 0,
    parentRepairs: new Map(),
    mappings: [
      [
        "40a8b4ea-aefa-4353-a717-96958029031e",
        "aws_budgets_budget.monthly",
        "main.tf",
        "reviewed-override"
      ],
      [
        "cbaf89e8-4fb7-45c6-8b27-dd90bca3a555",
        "aws_budgets_budget.ec2",
        "main.tf",
        "reviewed-override"
      ],
      [
        "1943248e-7456-4588-a76b-1b8a92a5522c",
        "aws_budgets_budget.s3",
        "main.tf",
        "reviewed-override"
      ],
      [
        "821379fd-a325-4e2e-a3bb-565d3dcea13d",
        "aws_budgets_budget.ri_utilization",
        "main.tf",
        "reviewed-override"
      ]
    ],
    workspaceOmissions: new Map([
      ["variables.tf", ['    archuuid = "6e651e34-318d-41e2-b229-86d30aa0520f"\n']]
    ])
  },
  {
    moduleFileName: "aws-ecs-fargate.ts",
    exportName: "awsEcsFargateSource",
    rawFileName: "aws-ecs-fargate.json",
    rawCaptureSha256: "fe86e289e9906106d489ceb81f031a4b8def331b2985a0a71f1642336f23c59c",
    nodeCount: 10,
    edgeCount: 4,
    parentRepairs: new Map([
      ["5ba31e54-d954-4cba-a521-3f11291d0ed7", null],
      ["162f4029-6160-4b56-80d0-e6de1b294c83", "5ba31e54-d954-4cba-a521-3f11291d0ed7"],
      ["1eca88fe-e8bd-4240-856e-92e7187e1114", "162f4029-6160-4b56-80d0-e6de1b294c83"]
    ]),
    mappings: [
      ["162f4029-6160-4b56-80d0-e6de1b294c83", "aws_vpc.ecs_vpc", "fargate.tf", "single-residual"],
      [
        "1eca88fe-e8bd-4240-856e-92e7187e1114",
        "aws_security_group.ecs_security_group",
        "fargate.tf",
        "exact-title"
      ],
      ["5b67f9b3-34fa-4d25-9451-471ad56e4291", "aws_subnet.default", "fargate.tf", "exact-title"],
      [
        "5a76bfb2-b71d-4cbc-919e-3611a1b70e1e",
        "aws_ecs_task_definition.ecs_task_definition",
        "fargate.tf",
        "exact-title"
      ],
      [
        "aedad806-5d41-458e-82d0-58daac33cc37",
        "aws_iam_role.ecs_task_role",
        "fargate.tf",
        "exact-title"
      ],
      [
        "f005a130-edd2-4747-8956-e1d409272c67",
        "aws_iam_role_policy_attachment.ecs_task_role_attachment",
        "fargate.tf",
        "exact-title"
      ],
      [
        "2eb5aa4e-4e9a-4d27-ae3a-3b10469e02a1",
        "aws_ecs_cluster.ecs_cluster",
        "fargate.tf",
        "exact-title"
      ],
      [
        "fef60bd4-81d1-4069-a6bd-01727d5903e4",
        "aws_internet_gateway.ecs_vpc_igw",
        "fargate.tf",
        "exact-title"
      ],
      ["fd1b2a28-24e2-4d3e-a14d-6560424de9bd", "aws_ecs_service.default", "main.tf", "exact-title"]
    ],
    workspaceOmissions: new Map([
      ["variables.tf", ['    archuuid = "18b7b40a-8493-4ebb-ad21-0eb85f6ae257"\n']]
    ])
  }
] as const satisfies readonly FixtureExpectation[];

const loadedModules = await Promise.all(
  expectations.map(async ({ moduleFileName }) => {
    try {
      return (await import(new URL(moduleFileName, import.meta.url).href)) as Record<
        string,
        unknown
      >;
    } catch {
      return null;
    }
  })
);

test("ranks 13-16 generated source modules exist in manifest order", () => {
  assert.deepEqual(
    loadedModules.map((module, index) => {
      const expectation = expectations[index]!;
      assert.ok(module, `${expectation.moduleFileName} must be generated`);
      const source = module[expectation.exportName] as BrainboardTemplateSource | undefined;
      assert.ok(source, `${expectation.exportName} must be exported`);
      return source.id;
    }),
    [
      "brainboard-aws-load-balancer-target-group",
      "brainboard-aws-s3-api-gateway",
      "brainboard-aws-costs-monitoring",
      "brainboard-aws-ecs-fargate"
    ]
  );
});

test("ranks 13-16 preserve raw-byte hashes, exact normalized graphs, files, and address bijections", () => {
  for (const [index, expectation] of expectations.entries()) {
    verifyFixture(requireSource(index), expectation);
  }

  const sources = expectations.map((_, index) => requireSource(index));
  assert.equal(
    sources.reduce((count, source) => count + source.nodes.length, 0),
    44
  );
  assert.equal(
    sources.reduce((count, source) => count + source.edges.length, 0),
    39
  );
  assert.equal(
    sources.reduce((count, source) => count + source.terraform.files.length, 0),
    32
  );
  assert.equal(
    sources.reduce((count, source) => count + source.terraform.resourceAddresses.length, 0),
    38
  );
  assert.equal(
    expectations.reduce((count, item) => count + item.parentRepairs.size, 0),
    8
  );
});

test("rank 14 keeps all parallel edges and reviewed topology mappings", () => {
  const source = requireSource(1);
  assert.equal(source.edges.length, 31);
  const duplicateGroups = duplicateEdgeGroups(source.edges);
  assert.equal(duplicateGroups.length, 8);
  assert.ok(duplicateGroups.every((group) => group.length === 2));

  assert.ok(
    hasEdge(source, "5d9d4b38-323c-4029-b582-1ab3e2875f5e", "d7f660ea-c9a7-4269-9a78-047de51122c5")
  );
  assert.equal(
    resourceAddress(source, "d7f660ea-c9a7-4269-9a78-047de51122c5"),
    "aws_api_gateway_resource.folder"
  );
  assert.equal(
    resourceAddress(source, "5d9d4b38-323c-4029-b582-1ab3e2875f5e"),
    "aws_api_gateway_resource.item"
  );

  assert.ok(
    hasEdge(source, "ef9e666e-bd66-40f8-b84a-0fd40902e25c", "18c510a5-9ff3-4248-a32d-7172fdb43a77")
  );
  assert.equal(
    resourceAddress(source, "ef9e666e-bd66-40f8-b84a-0fd40902e25c"),
    "aws_api_gateway_integration_response.IntegrationResponse400"
  );
  assert.ok(
    hasEdge(source, "fb45b084-8383-4a40-bddb-78957f701b33", "aa4a3412-93c5-49e6-891b-37102ca3f8b2")
  );
  assert.equal(
    resourceAddress(source, "fb45b084-8383-4a40-bddb-78957f701b33"),
    "aws_api_gateway_integration_response.IntegrationResponse500"
  );
});

test("rank 15 preserves the zero-edge diagram and ranks 13-15 keep empty undefined.tf", () => {
  assert.deepEqual(requireSource(2).edges, []);
  for (const index of [0, 1, 2]) {
    const undefinedFile = requireSource(index).terraform.files.find(
      ({ fileName }) => fileName === "undefined.tf"
    );
    assert.ok(undefinedFile);
    assert.equal(undefinedFile.code, "");
    assert.equal(undefinedFile.sha256, sha256(""));
    assert.equal(undefinedFile.includeInWorkspace, true);
  }
  assert.equal(
    requireSource(3).terraform.files.some(({ fileName }) => fileName === "undefined.tf"),
    false
  );
});

test("workspace seeds omit only reviewed Brainboard UUID metadata", () => {
  for (const [index, expectation] of expectations.entries()) {
    const source = requireSource(index);
    for (const file of source.terraform.files) {
      const omissions = expectation.workspaceOmissions.get(file.fileName) ?? [];
      if (omissions.length === 0) {
        assert.equal(file.workspaceSeed, undefined, `${expectation.rawFileName}:${file.fileName}`);
        continue;
      }
      assert.equal(file.includeInWorkspace, true);
      assert.ok(file.workspaceSeed, `${expectation.rawFileName}:${file.fileName}`);
      let expectedCode = file.code;
      for (const sourceText of omissions) {
        assert.equal(expectedCode.split(sourceText).length, 2, `${file.fileName}:${sourceText}`);
        expectedCode = expectedCode.replace(sourceText, "");
      }
      assert.equal(file.workspaceSeed.code, expectedCode);
      assert.equal(file.workspaceSeed.sha256, sha256(expectedCode));
      assert.deepEqual(
        file.workspaceSeed.omissions,
        omissions.map((sourceText) => ({
          reason: "brainboard-architecture-uuid",
          sourceText,
          occurrenceCount: 1
        }))
      );
      assert.doesNotMatch(file.workspaceSeed.code, /\barchUUID\s*=|\barchuuid\s*=/u);
    }
  }
});

function verifyFixture(source: BrainboardTemplateSource, expectation: FixtureExpectation): void {
  const rawBytes = readFileSync(new URL(expectation.rawFileName, captureDirectory));
  const raw = JSON.parse(rawBytes.toString("utf8")) as RawCapture;
  assert.equal(sha256(rawBytes), expectation.rawCaptureSha256);
  assert.equal(source.id, raw.id);
  assert.equal(source.title, raw.title);
  assert.equal(source.captureStatus, raw.status);
  assert.equal(source.provider, raw.provider);
  assert.equal(source.description, null);
  assert.deepEqual(source.origin, {
    platform: raw.origin.platform,
    author: raw.origin.author,
    sourceTemplateId: raw.origin.sourceTemplateId,
    sourceUrl: raw.origin.sourceUrl,
    cloneArchitectureId: /\/a\/([^/]+)\/design/u.exec(raw.origin.cloneBoardUrl)?.[1],
    downloads: raw.origin.downloads,
    capturedAt: raw.origin.capturedAt
  });
  assert.deepEqual(source.viewport, parseViewBox(raw.viewport.viewBox));
  assert.equal(source.nodes.length, expectation.nodeCount);
  assert.equal(source.edges.length, expectation.edgeCount);
  assert.deepEqual(validateBrainboardTemplateSource(source), { valid: true, errors: [] });

  assert.deepEqual(
    source.nodes.map(commonNodeProjection),
    raw.nodes.map((node) => ({
      sourceNodeId: node.sourceNodeId,
      domOrder: node.order,
      label: node.title,
      position: node.position,
      size: { width: node.width, height: node.height },
      parentSourceNodeId: expectation.parentRepairs.has(node.sourceNodeId)
        ? expectation.parentRepairs.get(node.sourceNodeId)!
        : node.parentSourceNodeId,
      zIndex: node.order,
      rawTransform: node.transform,
      rotation: parseRotation(node.transform),
      rawResourceType: node.resourceType
    }))
  );
  assert.deepEqual(source.edges, raw.edges.map(normalizeRawEdge));
  assert.deepEqual(
    source.terraform.files.map(rawFileProjection),
    raw.terraform.files.map(rawFileProjection)
  );
  assert.deepEqual(source.terraform.resourceAddresses, raw.terraform.resourceAddresses);
  assert.deepEqual(
    source.nodes
      .filter(isResourceNode)
      .map((node) => [
        node.sourceNodeId,
        formatResourceAddress(node),
        node.fileName,
        node.addressMapping
      ]),
    expectation.mappings
  );
  assert.deepEqual(
    new Set(expectation.mappings.map(([, address]) => address)),
    new Set(raw.terraform.resourceAddresses)
  );
  assert.equal(
    new Set(expectation.mappings.map(([, address]) => address)).size,
    expectation.mappings.length
  );
  assert.ok(
    source.nodes
      .filter(isResourceNode)
      .every(
        (node) =>
          node.valuesResolution === "source-file-authoritative/unresolved" && !("values" in node)
      )
  );
  assert.ok(
    source.nodes
      .filter(isPresentationNode)
      .every(
        (node) =>
          node.aliasOf === null &&
          node.style === null &&
          node.catalogId === presentationCatalogId(node.rawResourceType)
      )
  );
  assert.deepEqual(findParentCycles(source.nodes), []);
}

function requireSource(index: number): BrainboardTemplateSource {
  const expectation = expectations[index]!;
  const module = loadedModules[index];
  assert.ok(module, `${expectation.moduleFileName} must be generated`);
  const source = module[expectation.exportName] as BrainboardTemplateSource | undefined;
  assert.ok(source, `${expectation.exportName} must be exported`);
  return source;
}

function commonNodeProjection(node: BrainboardSourceNode) {
  return {
    sourceNodeId: node.sourceNodeId,
    domOrder: node.domOrder,
    label: node.label,
    position: node.position,
    size: node.size,
    parentSourceNodeId: node.parentSourceNodeId,
    zIndex: node.zIndex,
    rawTransform: node.rawTransform,
    rotation: node.rotation,
    rawResourceType: node.kind === "resource" ? node.terraformResourceType : node.rawResourceType
  };
}

function normalizeRawEdge(edge: RawEdge): BrainboardSourceEdge {
  return {
    sourceEdgeId: edge.id,
    domOrder: edge.order,
    zIndex: edge.order,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    sourcePort: edge.sourcePort,
    targetPort: edge.targetPort,
    svgPath: edge.svgPath,
    sourcePoint: edge.sourcePoint,
    targetPoint: edge.targetPoint,
    waypoints: edge.waypoints,
    arrowDirection: arrowDirection(edge),
    arrowAngle: arrowAngle(edge),
    rawArrow: edge.arrow
  };
}

function rawFileProjection(file: BrainboardTerraformFile) {
  return {
    fileName: file.fileName,
    code: file.code,
    sha256: file.sha256,
    includeInWorkspace: file.includeInWorkspace
  };
}

function isResourceNode(
  node: BrainboardSourceNode
): node is Extract<BrainboardSourceNode, { kind: "resource" }> {
  return node.kind === "resource";
}

function isPresentationNode(
  node: BrainboardSourceNode
): node is Extract<BrainboardSourceNode, { kind: "presentation" }> {
  return node.kind === "presentation";
}

function presentationCatalogId(rawResourceType: string): string {
  if (rawResourceType === "region") return "aws-region";
  assert.equal(rawResourceType, "availability_zone");
  return "aws-availability-zone";
}

function formatResourceAddress(node: Extract<BrainboardSourceNode, { kind: "resource" }>): string {
  return `${node.terraformBlockType === "data" ? "data." : ""}${node.terraformResourceType}.${node.resourceName}`;
}

function resourceAddress(source: BrainboardTemplateSource, sourceNodeId: string): string {
  const node = source.nodes.find((candidate) => candidate.sourceNodeId === sourceNodeId);
  assert.ok(node?.kind === "resource", sourceNodeId);
  return formatResourceAddress(node);
}

function hasEdge(
  source: BrainboardTemplateSource,
  sourceNodeId: string,
  targetNodeId: string
): boolean {
  return source.edges.some(
    (edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId
  );
}

function duplicateEdgeGroups(
  edges: readonly BrainboardSourceEdge[]
): readonly BrainboardSourceEdge[][] {
  const groups = new Map<string, BrainboardSourceEdge[]>();
  for (const edge of edges) {
    const {
      sourceEdgeId: _sourceEdgeId,
      domOrder: _domOrder,
      zIndex: _zIndex,
      ...authoredEdge
    } = edge;
    const signature = JSON.stringify(authoredEdge);
    const group = groups.get(signature) ?? [];
    group.push(edge);
    groups.set(signature, group);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function parseViewBox(viewBox: string) {
  const [x, y, width, height] = viewBox.split(/\s+/u).map(Number);
  return { x, y, width, height };
}

function parseRotation(transform: string): number {
  return Number(/rotate\(([-+\d.eE]+)/u.exec(transform)?.[1]);
}

function arrowDirection(edge: RawEdge): "source-to-target" | "target-to-source" | "none" {
  if (edge.arrow === null) return "none";
  const [, x, y] = /rotate\([^,]+,\s*([^,]+),\s*([^)]+)\)/u.exec(edge.arrow.transform) ?? [];
  const center = { x: Number(x), y: Number(y) };
  return center.x === edge.targetPoint.x && center.y === edge.targetPoint.y
    ? "source-to-target"
    : "target-to-source";
}

function arrowAngle(edge: RawEdge): number {
  return edge.arrow === null ? 0 : Number(/rotate\(([^,]+)/u.exec(edge.arrow.transform)?.[1]);
}

function findParentCycles(nodes: readonly BrainboardSourceNode[]): readonly string[][] {
  const nodesById = new Map(nodes.map((node) => [node.sourceNodeId, node]));
  const cycles: string[][] = [];
  for (const start of nodes) {
    const path: string[] = [];
    const indexes = new Map<string, number>();
    let current: BrainboardSourceNode | undefined = start;
    while (current) {
      const cycleStart = indexes.get(current.sourceNodeId);
      if (cycleStart !== undefined) {
        cycles.push(path.slice(cycleStart));
        break;
      }
      indexes.set(current.sourceNodeId, path.length);
      path.push(current.sourceNodeId);
      current =
        current.parentSourceNodeId === null ? undefined : nodesById.get(current.parentSourceNodeId);
    }
  }
  return cycles;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
