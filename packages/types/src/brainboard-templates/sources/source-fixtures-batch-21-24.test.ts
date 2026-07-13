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
type ExpectedPresentationIdentity = readonly [
  sourceNodeId: string,
  rawResourceType: string,
  catalogId: string | null,
  label: string
];

type FixtureExpectation = {
  readonly moduleFileName: string;
  readonly exportName: string;
  readonly rawFileName: string;
  readonly rawCaptureSha256: string;
  readonly mappings: readonly ExpectedResourceMapping[];
  readonly presentations: readonly ExpectedPresentationIdentity[];
  readonly workspaceOmissions: ReadonlyMap<string, readonly string[]>;
};

const captureDirectory = new URL(
  "../../../../../docs/gg/feat-infrastructure-template/brainboard-captures/",
  import.meta.url
);

const expectations = [
  {
    moduleFileName: "cross-account-aws-s3.ts",
    exportName: "crossAccountAwsS3Source",
    rawFileName: "cross-account-aws-s3.json",
    rawCaptureSha256: "fd2ed88605dcf0ad2fa89378d3926deac08d61e01de27b9159077c7a6ac858c2",
    mappings: [
      [
        "5418dbae-f0eb-4864-8a8e-a9897008c92a",
        "aws_s3_bucket.bucket_prod",
        "main.tf",
        "single-residual"
      ],
      [
        "0ff5c7a0-b03e-4e19-acc7-8c089bb7f92e",
        "aws_s3_bucket_object.s3_object_prod_c",
        "main.tf",
        "reviewed-override"
      ],
      [
        "8b881706-f98a-48f1-9995-abf026d7768a",
        "aws_s3_bucket_object.s3_object_prod",
        "main.tf",
        "reviewed-override"
      ]
    ],
    presentations: [
      ["0f0bd504-1e5b-4eb7-b82b-c34e5673d088", "region", "aws-region", "US East (N. Virginia)"],
      ["abd36fbe-31bb-4fe3-b43e-9e77644f51b5", "brainboard_shape", null, ""],
      ["6e055294-83c2-4d44-beac-e292b11dcb50", "brainboard_shape", null, ""],
      ["d1f9a61d-3dd0-4c39-bcca-83356b94db6c", "text", null, ""],
      ["9b321598-8cb3-4d4f-9305-39e31c71f1e7", "text", null, ""]
    ],
    workspaceOmissions: new Map([
      ["variables.tf", ['    archuuid = "6e3d35f1-eeb7-4015-9814-c3959928a3ac"\n']]
    ])
  },
  {
    moduleFileName: "aws-iam-users.ts",
    exportName: "awsIamUsersSource",
    rawFileName: "aws-iam-users.json",
    rawCaptureSha256: "e7daa5c6b68600d61d05a7ef02b4968f1eb565e1e4fc87ea9b81a0b39c0fe81c",
    mappings: [
      [
        "1c28c7ec-2e94-4ac1-95ed-09370ec23e35",
        "aws_iam_group.default",
        "main.tf",
        "single-residual"
      ],
      ["38a919c0-d6ae-430e-ba56-5a42ddda95d4", "aws_iam_policy.mfa", "main.tf", "exact-title"],
      [
        "8f00e827-caf6-40fd-9677-c8484b42f94c",
        "aws_iam_group_policy_attachment.iam_group_policy_attachment_13_c_c",
        "main.tf",
        "exact-title"
      ],
      [
        "b1fc8d2d-aa45-40dd-b38c-780b160f02e2",
        "data.aws_iam_policy.change_password",
        "main.tf",
        "single-residual"
      ],
      [
        "f1b74bf3-c510-4da8-baaa-d199ffaa6267",
        "aws_iam_group_policy_attachment.default",
        "main.tf",
        "exact-title"
      ],
      ["76efa2d0-4ef5-414c-af9b-7e5467b8adb1", "aws_iam_user.users", "main.tf", "exact-title"],
      [
        "b80b763b-bc6e-47c3-bdbd-ac5fe8bf37f7",
        "aws_iam_user_group_membership.default",
        "main.tf",
        "exact-title"
      ],
      [
        "f851591c-6a06-4091-874b-a9a3acce7c18",
        "aws_iam_user_login_profile.default",
        "main.tf",
        "exact-title"
      ]
    ],
    presentations: [
      [
        "89087529-31fb-4b85-abed-3418eee9a00f",
        "brainboard_group",
        "design-group",
        "Global - Not tied to any region"
      ],
      [
        "fc0d1fe3-09ac-4ee4-a83f-c04900b17d19",
        "brainboard_group",
        "design-group",
        "Users' accounts based on variables"
      ]
    ],
    workspaceOmissions: new Map([
      ["variables.tf", ['    archuuid = "46009873-0596-40b3-bcf4-b466428c54b4"\n']]
    ])
  },
  {
    moduleFileName: "aws-dashcam-video-processing.ts",
    exportName: "awsDashcamVideoProcessingSource",
    rawFileName: "aws-dashcam-video-processing.json",
    rawCaptureSha256: "c462a37511b600b862af985a29fa48634c42f96c03517ed69e72aefca0f80311",
    mappings: [
      [
        "13f9d1bb-7e57-4f23-a141-d99ebc4d39e2",
        "aws_ecs_cluster.video_processing_cluster",
        "main.tf",
        "exact-title"
      ],
      [
        "2076baeb-dbf8-463d-bb50-7ec9b5d259b9",
        "aws_s3_bucket.output_bucket",
        "main.tf",
        "exact-title"
      ],
      [
        "23f9af50-c989-4d73-ac79-fbae47e10c04",
        "aws_cloudfront_distribution.video_distribution",
        "main.tf",
        "exact-title"
      ],
      [
        "30b41b95-ecec-400f-95b4-d47d7debfcea",
        "aws_api_gateway_resource.video_resource",
        "main.tf",
        "exact-title"
      ],
      [
        "32b37e79-d0da-4ea7-88c6-2c8789b455ce",
        "aws_s3_bucket.video_bucket",
        "main.tf",
        "exact-title"
      ],
      [
        "3b240358-1a05-4628-a2e8-be852cdbf846",
        "aws_iam_role_policy_attachment.lambda_policy",
        "main.tf",
        "exact-title"
      ],
      [
        "5069c2b1-c725-4588-8c24-bb96be01ffd9",
        "aws_ecs_task_definition.video_task",
        "main.tf",
        "exact-title"
      ],
      [
        "50a96af0-1d2d-46fd-a526-01a847c44613",
        "aws_ecs_service.video_service",
        "main.tf",
        "exact-title"
      ],
      [
        "6c4d1286-6d25-4835-8637-4d392c54de45",
        "aws_api_gateway_integration.video_integration",
        "main.tf",
        "exact-title"
      ],
      [
        "9ea9ad58-0146-4a72-b2bb-a08d51f00503",
        "aws_api_gateway_method.video_method",
        "main.tf",
        "exact-title"
      ],
      [
        "be541b7f-676c-46ae-992e-e7f31d3baf48",
        "aws_lambda_function.video_processor",
        "main.tf",
        "exact-title"
      ],
      [
        "cc70890f-c0f2-4f54-bf31-4017ea652dc6",
        "aws_api_gateway_rest_api.video_api",
        "main.tf",
        "exact-title"
      ],
      [
        "ecf5cf0b-9489-429e-a6a3-3db886ef26cb",
        "aws_sqs_queue.video_queue",
        "main.tf",
        "exact-title"
      ],
      ["f7a66538-185b-4023-ad8a-0d84ad5d2842", "aws_iam_role.lambda_exec", "main.tf", "exact-title"]
    ],
    presentations: [
      ["bc43454e-5410-4f46-9610-6622c8820e40", "region", "aws-region", "US West (Oregon)"]
    ],
    workspaceOmissions: new Map()
  },
  {
    moduleFileName: "aws-secure-s3-bucket.ts",
    exportName: "awsSecureS3BucketSource",
    rawFileName: "aws-secure-s3-bucket.json",
    rawCaptureSha256: "dea43d5c696819aee3c07bfb505076409bc86f25043b9d79ab19d0dbcbedc254",
    mappings: [
      [
        "06c1d1a2-a280-419f-95a3-7e3cda0c3330",
        "aws_s3_bucket.s3_bucket",
        "s3_bucket.tf",
        "exact-title"
      ],
      [
        "262e64a9-86bc-4bc5-b7e1-82e26ddedb06",
        "aws_s3_bucket_notification.s3_bucket_notification",
        "s3_bucket.tf",
        "exact-title"
      ],
      [
        "2bad56b6-e6ee-4248-9659-56171ccca61c",
        "aws_s3_bucket_lifecycle_configuration.s3_bucket_lifecycle_configuration",
        "s3_bucket.tf",
        "single-residual"
      ],
      [
        "4940107a-b41a-4e29-b53b-5618978ed6c3",
        "aws_s3_bucket_versioning.s3_bucket_versioning",
        "s3_bucket.tf",
        "single-residual"
      ],
      [
        "6d669ff4-d4d1-44a6-b483-d16ca60e815a",
        "aws_s3_bucket_server_side_encryption_configuration.s3_bucket_server_side_encryption_configuration",
        "s3_bucket.tf",
        "single-residual"
      ],
      [
        "c636c16f-3b4a-4e46-bff2-70462f108900",
        "aws_s3_bucket_public_access_block.s3_bucket_public_access_block",
        "s3_bucket.tf",
        "single-residual"
      ],
      [
        "e06758f9-5a60-4934-8ac3-af746693a4a9",
        "aws_sns_topic.sns_topic",
        "s3_bucket.tf",
        "exact-title"
      ],
      [
        "e4f7100a-1573-46ab-96db-116709afa0e8",
        "aws_s3_bucket_acl.s3_bucket_acl",
        "main.tf",
        "exact-title"
      ],
      [
        "ef48c7ff-a34a-49fb-94fd-ea9c35cedc11",
        "aws_s3_bucket_replication_configuration.replication_configuration",
        "s3_bucket.tf",
        "single-residual"
      ],
      [
        "f079d191-2684-4c89-8e19-370d63c1d764",
        "aws_iam_role.iam_role",
        "s3_bucket.tf",
        "exact-title"
      ],
      [
        "fa1b482b-0830-4610-a6ac-086a532b1f3f",
        "aws_s3_bucket_logging.s3_bucket_logging",
        "s3_bucket.tf",
        "single-residual"
      ]
    ],
    presentations: [
      ["d688c36c-abf5-43d6-8c47-15e8b5911a50", "region", "aws-region", "US East (N. Virginia)"]
    ],
    workspaceOmissions: new Map()
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

test("ranks 21-24 generated source modules exist in manifest order", () => {
  assert.deepEqual(
    loadedModules.map((module, index) => {
      const expectation = expectations[index]!;
      assert.ok(module, `${expectation.moduleFileName} must be generated`);
      const source = module[expectation.exportName] as BrainboardTemplateSource | undefined;
      assert.ok(source, `${expectation.exportName} must be exported`);
      return source.id;
    }),
    [
      "brainboard-cross-account-aws-s3",
      "brainboard-aws-iam-users",
      "brainboard-aws-dashcam-video-pipeline",
      "brainboard-aws-secure-s3-bucket"
    ]
  );
});

test("ranks 21-24 preserve exact raw graphs, Terraform bytes, and address bijections", () => {
  for (const [index, expectation] of expectations.entries()) {
    verifyFixture(requireSource(index), expectation);
  }
  const sources = expectations.map((_, index) => requireSource(index));
  assert.equal(
    sources.reduce((count, source) => count + source.nodes.length, 0),
    45
  );
  assert.equal(
    sources.reduce((count, source) => count + source.edges.length, 0),
    33
  );
  assert.equal(
    sources.reduce((count, source) => count + source.terraform.files.length, 0),
    30
  );
  assert.equal(
    sources.reduce((count, source) => count + source.terraform.resourceAddresses.length, 0),
    36
  );
});

test("rank 21 keeps empty text and styleless shapes unresolved without aliases", () => {
  const presentations = requireSource(0).nodes.filter(isPresentationNode);
  const emptyTexts = presentations.filter(({ rawResourceType }) => rawResourceType === "text");
  const stylelessShapes = presentations.filter(
    ({ rawResourceType }) => rawResourceType === "brainboard_shape"
  );
  assert.equal(emptyTexts.length, 2);
  assert.ok(emptyTexts.every((node) => node.label === "" && node.catalogId === null));
  assert.equal(stylelessShapes.length, 2);
  assert.ok(
    stylelessShapes.every(
      (node) =>
        node.label === "" && node.catalogId === null && node.style === null && node.aliasOf === null
    )
  );
});

test("rank 22 keeps the sole data address and rank 23 keeps empty undefined.tf", () => {
  const iam = requireSource(1);
  const dataNodes = iam.nodes.filter(
    (node): node is Extract<BrainboardSourceNode, { kind: "resource" }> =>
      node.kind === "resource" && node.terraformBlockType === "data"
  );
  assert.deepEqual(dataNodes.map(formatResourceAddress), ["data.aws_iam_policy.change_password"]);

  const undefinedFile = requireSource(2).terraform.files.find(
    ({ fileName }) => fileName === "undefined.tf"
  );
  assert.ok(undefinedFile);
  assert.equal(undefinedFile.code, "");
  assert.equal(undefinedFile.sha256, sha256(""));
  assert.equal(undefinedFile.includeInWorkspace, true);
});

test("all four diagrams preserve authored negative coordinates", () => {
  for (const source of expectations.map((_, index) => requireSource(index))) {
    assert.ok(
      source.nodes.some(({ position }) => position.x < 0 || position.y < 0),
      `${source.id} must retain negative source coordinates`
    );
  }
});

test("workspace seeds omit only reviewed UUID metadata with explicit occurrence counts", () => {
  for (const [index, expectation] of expectations.entries()) {
    const source = requireSource(index);
    for (const file of source.terraform.files) {
      const omissions = expectation.workspaceOmissions.get(file.fileName) ?? [];
      if (omissions.length === 0) {
        assert.equal(file.workspaceSeed, undefined, `${expectation.rawFileName}:${file.fileName}`);
        continue;
      }
      assert.equal(file.includeInWorkspace, true);
      assert.ok(file.workspaceSeed);
      let expectedCode = file.code;
      for (const sourceText of omissions) {
        assert.equal(expectedCode.split(sourceText).length, 2);
        expectedCode = expectedCode.replace(sourceText, "");
      }
      assert.deepEqual(file.workspaceSeed, {
        code: expectedCode,
        sha256: sha256(expectedCode),
        omissions: omissions.map((sourceText) => ({
          reason: "brainboard-architecture-uuid",
          sourceText,
          occurrenceCount: 1
        }))
      });
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
  assert.deepEqual(validateBrainboardTemplateSource(source), { valid: true, errors: [] });
  assert.deepEqual(
    source.nodes.map(commonNodeProjection),
    raw.nodes.map((node) => ({
      sourceNodeId: node.sourceNodeId,
      domOrder: node.order,
      label: node.title,
      position: node.position,
      size: { width: node.width, height: node.height },
      parentSourceNodeId: node.parentSourceNodeId,
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
    source.nodes
      .filter(isPresentationNode)
      .map((node) => [node.sourceNodeId, node.rawResourceType, node.catalogId, node.label]),
    expectation.presentations
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
      .every((node) => node.aliasOf === null && node.style === null)
  );
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

function formatResourceAddress(node: Extract<BrainboardSourceNode, { kind: "resource" }>): string {
  return `${node.terraformBlockType === "data" ? "data." : ""}${node.terraformResourceType}.${node.resourceName}`;
}

function parseViewBox(viewBox: string) {
  const [x, y, width, height] = viewBox
    .trim()
    .split(/[\s,]+/u)
    .map(Number);
  return { x, y, width, height };
}

function parseRotation(transform: string): number {
  return Number(/\brotate\(\s*([-+\d.eE]+)/u.exec(transform)?.[1]);
}

function arrowDirection(edge: RawEdge): "source-to-target" | "target-to-source" | "none" {
  if (edge.arrow === null) return "none";
  const [, x, y] = /rotate\([^,]+,\s*([^,]+),\s*([^)]+)\)/u.exec(edge.arrow.transform) ?? [];
  return Number(x) === edge.targetPoint.x && Number(y) === edge.targetPoint.y
    ? "source-to-target"
    : "target-to-source";
}

function arrowAngle(edge: RawEdge): number {
  return edge.arrow === null ? 0 : Number(/rotate\(([^,]+)/u.exec(edge.arrow.transform)?.[1]);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
