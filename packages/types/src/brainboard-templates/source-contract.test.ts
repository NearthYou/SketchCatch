import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type {
  BrainboardFailedCaptureEvidence,
  BrainboardTemplateCaptureStatus,
  BrainboardTemplateEvidence,
  BrainboardTemplateSource
} from "./source-types.js";

type ManifestEntry = {
  readonly author: string;
  readonly downloads: number;
  readonly id: string;
  readonly provider: string;
  readonly sourceTemplateId: string;
  readonly title: string;
};

type ValidationError = {
  readonly code: string;
  readonly message: string;
  readonly path: string;
};

type ValidationResult = {
  readonly errors: readonly ValidationError[];
  readonly valid: boolean;
};

type PublicContract = {
  readonly BRAINBOARD_TEMPLATE_IDS?: readonly string[];
  readonly TEMPLATE_IDS?: readonly string[];
  readonly brainboardTemplateManifest?: readonly ManifestEntry[];
  readonly validateBrainboardTemplateSource?: (source: unknown) => ValidationResult;
};

const contract = (await import("../index.js")) as unknown as PublicContract;

const EXPECTED_MANIFEST = [
  [
    "brainboard-training-aws-onboarding",
    19_855,
    "[Training] AWS onboarding",
    "d71155af-5339-44f1-ae11-2bcd29411c2d"
  ],
  [
    "brainboard-aws-kubernetes-native-cnis",
    1_414,
    "AWS Kubernetes cluster with native CNIs",
    "43b2ae45-cae5-4a06-83d3-2c5007e0c49b"
  ],
  [
    "brainboard-aws-vpc-subnets-security-groups-2az",
    1_055,
    "AWS VPC with subnet and security groups on 2 AZs",
    "a9b3f02c-a950-4153-92d2-47905dd8ffd3"
  ],
  [
    "brainboard-aws-serverless-cdn",
    812,
    "AWS serverless architecture with CDN",
    "45191152-00cd-443d-a7f5-9a7295120e48"
  ],
  [
    "brainboard-aws-ec2-vpc-subnet",
    684,
    "AWS EC2 instance inside VPC & Subnet",
    "9009bff8-8177-4022-ad39-6035ad4acd05"
  ],
  [
    "brainboard-aws-asg-lb-vpc-subnets",
    655,
    "AWS ASG and LB with VPC & subnets",
    "f161f840-d697-4651-aa8d-6ec05b981a79"
  ],
  [
    "brainboard-aws-jenkins-ec2",
    637,
    "AWS Jenkins architecture on EC2",
    "c884d82a-6fab-454f-a984-619d65ad6044"
  ],
  [
    "brainboard-aws-rest-api-documentdb",
    631,
    "AWS REST API for DocumentDB",
    "9447b484-b256-42b3-b933-ced015820d0b"
  ],
  [
    "brainboard-aws-network-landing-zone",
    537,
    "AWS network landing zone",
    "32450f82-e196-4602-853c-c55c0cb9718e"
  ],
  [
    "brainboard-aws-three-tier-database",
    489,
    "AWS 3-tier web app with a database",
    "fb2334bf-3291-40db-a779-1e4e56df27dd"
  ],
  ["brainboard-aws-bastion", 485, "AWS Bastion", "130f8091-21a4-4e8b-8b39-2373cb720d72"],
  [
    "brainboard-aws-instance-db-multiple-networks",
    460,
    "AWS instance and DB with multiple networks",
    "09fd3420-d8f0-409c-a1cc-694dba97443f"
  ],
  [
    "brainboard-aws-load-balancer-target-group",
    300,
    "AWS load balancer with target group",
    "85dda071-ea16-4cbc-9d77-7cebe6ebaadd"
  ],
  [
    "brainboard-aws-s3-api-gateway",
    299,
    "AWS S3 API Gateway integration",
    "73327761-bb6a-4516-92e5-f06007e372ec"
  ],
  [
    "brainboard-aws-costs-monitoring",
    292,
    "AWS costs monitoring",
    "6e651e34-318d-41e2-b229-86d30aa0520f"
  ],
  [
    "brainboard-aws-ecs-fargate",
    280,
    "AWS ECS with Fargate",
    "18b7b40a-8493-4ebb-ad21-0eb85f6ae257"
  ],
  [
    "brainboard-aws-multi-account-management",
    220,
    "AWS multi-account management",
    "a432a178-bbcb-4353-a6e4-fd6a557941e6"
  ],
  [
    "brainboard-aws-elastic-beanstalk",
    216,
    "AWS Elastic Beanstalk",
    "eb84baae-e3a7-4d39-b80d-a22466e5ea16"
  ],
  ["brainboard-aws-rds", 203, "AWS RDS", "f588fabc-5991-44de-b9cc-5afd1d74e710"],
  ["brainboard-aws-fsx", 68, "AWS FSX architecture", "a1a4b134-bc00-4f97-82b8-46346da8ecde"],
  [
    "brainboard-cross-account-aws-s3",
    68,
    "Cross account AWS S3",
    "6e3d35f1-eeb7-4015-9814-c3959928a3ac"
  ],
  [
    "brainboard-aws-iam-users",
    56,
    "AWS IAM users creation",
    "46009873-0596-40b3-bcf4-b466428c54b4"
  ],
  [
    "brainboard-aws-dashcam-video-pipeline",
    38,
    "AWS Dashcam Video Processing Pipeline",
    "4e26a41a-78e5-43df-8c32-e6f1e47e40cb"
  ],
  [
    "brainboard-aws-secure-s3-bucket",
    0,
    "AWS secure S3 bucket",
    "83a63920-3c99-4e86-9f42-a46de416e124"
  ]
] as const;

test("Brainboard manifest exposes the exact 24-item download-descending order", () => {
  const manifest = contract.brainboardTemplateManifest;

  assert.ok(manifest);
  assert.deepEqual(
    manifest.map(({ id, downloads, title, sourceTemplateId }) => [
      id,
      downloads,
      title,
      sourceTemplateId
    ]),
    EXPECTED_MANIFEST
  );
  assert.deepEqual(
    contract.BRAINBOARD_TEMPLATE_IDS,
    EXPECTED_MANIFEST.map(([id]) => id)
  );
  assert.equal(new Set(manifest.map(({ id }) => id)).size, 24);
  assert.equal(new Set(manifest.map(({ sourceTemplateId }) => sourceTemplateId)).size, 24);
  assert.ok(manifest.every(({ author }) => author === "Chafik Belhaoues"));
  assert.ok(manifest.every(({ provider }) => provider === "aws"));
  assert.ok(
    manifest.every(
      (entry, index) => index === 0 || entry.downloads <= manifest[index - 1]!.downloads
    )
  );
  assert.deepEqual(manifest.at(-1), {
    id: "brainboard-aws-secure-s3-bucket",
    sourceTemplateId: "83a63920-3c99-4e86-9f42-a46de416e124",
    title: "AWS secure S3 bucket",
    author: "Chafik Belhaoues",
    provider: "aws",
    downloads: 0
  });
});

test("Brainboard IDs remain separate from the six repository recommendation IDs", () => {
  assert.equal(contract.TEMPLATE_IDS?.length, 6);
  assert.ok(contract.BRAINBOARD_TEMPLATE_IDS?.every((id) => !contract.TEMPLATE_IDS?.includes(id)));
});

test("source contract preserves viewport, ordered graph evidence, Terraform identity, and file order", () => {
  const source = makeValidSource();
  const result = requireValidator()(source);

  assert.deepEqual(result, { valid: true, errors: [] });
  assert.equal(source.nodes[0]?.rawTransform, "translate(100, 200), rotate(-90 30 30)");
  assert.equal(source.nodes[0]?.rotation, -90);
  assert.deepEqual(source.edges[0]?.sourcePoint, source.edges[0]?.waypoints[0]);
  assert.deepEqual(source.edges[0]?.targetPoint, source.edges[0]?.waypoints.at(-1));
});

test("validator accepts a finite -90 degree node rotation", () => {
  const source = makeValidSource();
  source.nodes[0]!.rotation = -90;

  assert.deepEqual(requireValidator()(source), { valid: true, errors: [] });
});

test("validator rejects every non-finite node rotation with a dedicated error", () => {
  const cases = [
    ["NaN", Number.NaN],
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["negative infinity", Number.NEGATIVE_INFINITY]
  ] as const;

  for (const [label, rotation] of cases) {
    const source = makeValidSource();
    source.nodes[0]!.rotation = rotation;

    assert.deepEqual(
      requireValidator()(source),
      {
        valid: false,
        errors: [
          {
            code: "brainboard.source.non_finite_rotation",
            path: "nodes[0].rotation",
            message: "Node bucket rotation must be a finite number."
          }
        ]
      },
      label
    );
  }
});

test("failed capture evidence is discriminated from complete graph and Terraform sources", () => {
  type CompleteStatusExcludesFailed = Extract<
    BrainboardTemplateCaptureStatus,
    "failed"
  > extends never
    ? true
    : false;
  const completeStatusExcludesFailed: CompleteStatusExcludesFailed = true;
  const evidence = {
    id: "brainboard-aws-instance-db-multiple-networks",
    captureStatus: "failed",
    title: "AWS instance and DB with multiple networks",
    provider: "aws",
    attemptedAt: "2026-07-14",
    error: "Brainboard template clone failed with HTTP 400",
    attempts: [
      {
        architectureName: "#381 09fd3420",
        project: "Project 1",
        environment: "Development",
        result: "HTTP 400 ERR_BAD_REQUEST"
      }
    ],
    origin: {
      platform: "brainboard",
      author: "Chafik Belhaoues",
      sourceTemplateId: "09fd3420-d8f0-409c-a1cc-694dba97443f",
      sourceUrl: "https://app.brainboard.co/templates/09fd3420-d8f0-409c-a1cc-694dba97443f",
      previewUrl:
        "https://s3.us-east-2.amazonaws.com/brainboard-screenshots-prod/architecture/09fd3420-d8f0-409c-a1cc-694dba97443f.webp",
      previewWidth: 3840,
      previewHeight: 2160,
      downloads: 460
    }
  } satisfies BrainboardFailedCaptureEvidence;
  const templateEvidence: BrainboardTemplateEvidence = evidence;

  assert.equal(completeStatusExcludesFailed, true);
  assert.equal(templateEvidence.captureStatus, "failed");
  assert.equal(templateEvidence.attempts.length, 1);
  assert.equal(templateEvidence.origin.previewWidth, 3840);
  assert.equal("nodes" in templateEvidence, false);
  assert.equal("edges" in templateEvidence, false);
  assert.equal("terraform" in templateEvidence, false);
});

test("validator reports duplicate node, edge, DOM order, address, and file entries separately", () => {
  const source = makeValidSource();
  const secondEdge = {
    ...source.edges[0]!,
    sourceEdgeId: "edge-2"
  };
  source.nodes.push({
    ...source.nodes[1]!,
    sourceNodeId: "region-copy"
  });
  source.nodes.push({ ...source.nodes[0]! });
  source.edges.push(secondEdge, { ...source.edges[0]! });
  source.terraform.resourceAddresses.push(source.terraform.resourceAddresses[0]!);
  source.terraform.files.push({ ...source.terraform.files[0]! });

  const errors = requireValidator()(source).errors;
  assert.deepEqual(
    errors.map(({ code, path }) => ({ code, path })),
    [
      { code: "brainboard.source.duplicate_node_id", path: "nodes[3].sourceNodeId" },
      { code: "brainboard.source.duplicate_edge_id", path: "edges[2].sourceEdgeId" },
      { code: "brainboard.source.duplicate_node_order", path: "nodes[2].domOrder" },
      { code: "brainboard.source.duplicate_node_order", path: "nodes[3].domOrder" },
      { code: "brainboard.source.duplicate_edge_order", path: "edges[1].domOrder" },
      { code: "brainboard.source.duplicate_edge_order", path: "edges[2].domOrder" },
      {
        code: "brainboard.source.duplicate_resource_address",
        path: "terraform.resourceAddresses[1]"
      },
      { code: "brainboard.source.duplicate_file_name", path: "terraform.files[1].fileName" }
    ]
  );
  assert.ok(errors.every(({ message }) => message.length > 0));
});

test("validator does not count commented or heredoc Terraform text as resource blocks", () => {
  for (const code of [
    `# resource "aws_s3_bucket" "example" {\n# }\n`,
    `locals {\n  rendered = <<-HCL\nresource "aws_s3_bucket" "example" {\n}\nHCL\n}\n`,
    `locals {\n  resource = ["aws_s3_bucket", "example", {}]\n}\n`
  ]) {
    const source = makeValidSource();
    source.terraform.files[0]!.code = code;
    source.terraform.files[0]!.sha256 = sha256(code);

    assert.deepEqual(errorCodes(source), ["brainboard.source.missing_resource_block"]);
  }
});

test("validator reports malformed source resource addresses instead of skipping them", () => {
  const source = makeValidSource();
  source.terraform.resourceAddresses.push("not-an-address");

  assert.deepEqual(errorCodes(source), ["brainboard.source.invalid_resource_address"]);
});

test("validator reports dangling parents and both dangling edge endpoints", () => {
  const source = makeValidSource();
  source.nodes[0]!.parentSourceNodeId = "missing-parent";
  source.edges[0]!.sourceNodeId = "missing-source";
  source.edges[0]!.targetNodeId = "missing-target";

  assert.deepEqual(errorCodes(source), [
    "brainboard.source.dangling_edge_source",
    "brainboard.source.dangling_edge_target",
    "brainboard.source.dangling_parent"
  ]);
});

test("validator reports parent cycles", () => {
  const source = makeValidSource();
  source.nodes[0]!.parentSourceNodeId = "region";
  source.nodes[1]!.parentSourceNodeId = "bucket";

  assert.deepEqual(errorCodes(source), ["brainboard.source.parent_cycle"]);
});

test("validator reports SHA-256 mismatches and missing resource blocks", () => {
  const source = makeValidSource();
  source.terraform.files[0]!.sha256 = "0".repeat(64);
  source.nodes[0]!.resourceName = "missing_bucket";

  assert.deepEqual(errorCodes(source), [
    "brainboard.source.missing_resource_address",
    "brainboard.source.missing_resource_block",
    "brainboard.source.sha256_mismatch",
    "brainboard.source.unmapped_resource_address"
  ]);
});

test("validator rejects clone UUID leakage only from workspace seed files", () => {
  const source = makeValidSource();
  const cloneVariables = `architecture_id = "${source.origin.cloneArchitectureId}"\n`;
  source.terraform.files.push({
    fileName: "terraform.tfvars",
    code: cloneVariables,
    sha256: sha256(cloneVariables),
    includeInWorkspace: false
  });

  assert.deepEqual(errorCodes(source), []);

  source.terraform.files[1]!.includeInWorkspace = true;
  assert.deepEqual(errorCodes(source), ["brainboard.source.clone_uuid_leak"]);
});

test("validator requires every Terraform address to map to exactly one resource visual", () => {
  const source = makeValidSource();
  source.nodes.push({
    ...source.nodes[0]!,
    sourceNodeId: "bucket-copy",
    domOrder: 2
  });

  assert.deepEqual(errorCodes(source), ["brainboard.source.duplicate_resource_node_address"]);

  source.nodes.pop();
  source.nodes[0]!.resourceName = "not-the-source-address";
  assert.deepEqual(errorCodes(source), [
    "brainboard.source.missing_resource_address",
    "brainboard.source.missing_resource_block",
    "brainboard.source.unmapped_resource_address"
  ]);
});

test("validator accepts reviewed aliases and rejects aliases without a catalog or source address", () => {
  const source = makeValidSource();
  const presentation = source.nodes[1]!;
  assert.equal(presentation.kind, "presentation");
  presentation.aliasOf = "aws_s3_bucket.example";

  assert.deepEqual(errorCodes(source), []);

  presentation.catalogId = null;
  assert.deepEqual(errorCodes(source), ["brainboard.source.invalid_presentation_alias"]);

  presentation.catalogId = "aws-s3-bucket";
  presentation.aliasOf = "aws_s3_bucket.missing";
  assert.deepEqual(errorCodes(source), ["brainboard.source.invalid_presentation_alias"]);
});

test("validator proves workspace seeds remove only exact reviewed source fragments", () => {
  const source = makeValidSource();
  const file = source.terraform.files[0]!;
  const omittedLine = `  architecture_uuid = "${source.origin.cloneArchitectureId}"\n`;
  file.code = file.code.replace("}\n", `${omittedLine}}\n`);
  file.sha256 = sha256(file.code);
  const sanitizedCode = file.code.replace(omittedLine, "");
  file.workspaceSeed = {
    code: sanitizedCode,
    sha256: sha256(sanitizedCode),
    omissions: [{ reason: "brainboard-architecture-uuid", sourceText: omittedLine }]
  };

  assert.deepEqual(errorCodes(source), []);

  const overBroadFragment = `${omittedLine}}\n`;
  file.workspaceSeed.code = file.code.replace(overBroadFragment, "");
  file.workspaceSeed.sha256 = sha256(file.workspaceSeed.code);
  file.workspaceSeed.omissions = [
    { reason: "brainboard-architecture-uuid", sourceText: overBroadFragment }
  ];
  assert.deepEqual(errorCodes(source), ["brainboard.source.invalid_workspace_seed"]);

  file.workspaceSeed.omissions = [
    { reason: "brainboard-architecture-uuid", sourceText: omittedLine }
  ];
  file.workspaceSeed.code = `${sanitizedCode}\n`;
  file.workspaceSeed.sha256 = sha256(file.workspaceSeed.code);
  assert.deepEqual(errorCodes(source), ["brainboard.source.invalid_workspace_seed"]);

  file.workspaceSeed.code = sanitizedCode;
  file.workspaceSeed.sha256 = "0".repeat(64);
  assert.deepEqual(errorCodes(source), ["brainboard.source.workspace_sha256_mismatch"]);
});

function requireValidator(): NonNullable<PublicContract["validateBrainboardTemplateSource"]> {
  assert.equal(typeof contract.validateBrainboardTemplateSource, "function");
  return contract.validateBrainboardTemplateSource!;
}

function errorCodes(source: ReturnType<typeof makeValidSource>): string[] {
  return [...new Set(requireValidator()(source).errors.map(({ code }) => code))].sort();
}

function makeValidSource() {
  const mainCode = `# 원본 UTF-8 코드\nresource "aws_s3_bucket" "example" {\n  bucket = "example"\n}\n`;

  return {
    id: "brainboard-training-aws-onboarding",
    origin: {
      platform: "brainboard",
      author: "Chafik Belhaoues",
      sourceTemplateId: "d71155af-5339-44f1-ae11-2bcd29411c2d",
      sourceUrl: "https://example.test/templates/d71155af-5339-44f1-ae11-2bcd29411c2d",
      cloneArchitectureId: "d7477ade-5761-43a8-93c6-42af16a67a39",
      downloads: 19_855,
      capturedAt: "2026-07-14T00:00:00.000Z"
    },
    captureStatus: "captured",
    title: "[Training] AWS onboarding",
    description: "Source contract fixture",
    provider: "aws",
    viewport: { x: -10, y: 20, width: 1280, height: 720 },
    nodes: [
      {
        kind: "resource",
        sourceNodeId: "bucket",
        domOrder: 0,
        label: "Bucket",
        position: { x: 100, y: 200 },
        size: { width: 60, height: 60 },
        parentSourceNodeId: null as string | null,
        zIndex: 2,
        rawTransform: "translate(100, 200), rotate(-90 30 30)",
        rotation: -90 as number,
        terraformBlockType: "resource",
        terraformResourceType: "aws_s3_bucket",
        resourceName: "example",
        fileName: "main.tf",
        addressMapping: "exact-title",
        valuesResolution: "resolved",
        values: { bucket: "example", tags: { Environment: "training" } }
      },
      {
        kind: "presentation",
        sourceNodeId: "region",
        domOrder: 1,
        label: "AWS Cloud",
        position: { x: 0, y: 0 },
        size: { width: 800, height: 600 },
        parentSourceNodeId: null as string | null,
        zIndex: 0,
        rawTransform: "translate(0, 0), rotate(0 400 300)",
        rotation: 0,
        rawResourceType: "region",
        catalogId: "aws-cloud" as string | null,
        aliasOf: null as string | null,
        style: null
      }
    ],
    edges: [
      {
        sourceEdgeId: "edge-1",
        domOrder: 0,
        zIndex: 0,
        sourceNodeId: "region",
        targetNodeId: "bucket",
        sourcePort: "right",
        targetPort: "left",
        svgPath: "M 60 60 L 100 200",
        sourcePoint: { x: 60, y: 60 },
        targetPoint: { x: 100, y: 200 },
        waypoints: [
          { x: 60, y: 60 },
          { x: 100, y: 200 }
        ],
        arrowDirection: "source-to-target",
        arrowAngle: 45,
        rawArrow: {
          points: "55,55 60,60 55,65",
          transform: "rotate(45, 100, 200)"
        }
      }
    ],
    terraform: {
      files: [
        {
          fileName: "main.tf",
          code: mainCode,
          sha256: sha256(mainCode),
          includeInWorkspace: true as boolean
        }
      ],
      resourceAddresses: ["aws_s3_bucket.example"]
    }
  } satisfies BrainboardTemplateSource;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
