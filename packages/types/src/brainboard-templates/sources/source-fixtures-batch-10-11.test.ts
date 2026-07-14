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
  readonly origin: {
    readonly author: "Chafik Belhaoues";
    readonly capturedAt: string;
    readonly cloneBoardUrl: string;
    readonly downloads: number;
    readonly platform: "brainboard";
    readonly sourceTemplateId: string;
    readonly sourceUrl: string;
  };
  readonly provider: "aws";
  readonly status: "captured";
  readonly title: string;
  readonly viewport: { readonly viewBox: string };
  readonly nodes: readonly RawNode[];
  readonly edges: readonly RawEdge[];
  readonly terraform: {
    readonly files: readonly (BrainboardTerraformFile & { readonly lineCount: number })[];
    readonly resourceAddresses: readonly string[];
  };
};

type ExpectedResourceMapping = readonly [
  sourceNodeId: string,
  address: string,
  strategy: "exact-title" | "single-residual" | "reviewed-override"
];

type ExpectedPresentation = readonly [
  sourceNodeId: string,
  rawResourceType: string,
  catalogId: string | null,
  aliasOf: string | null,
  label: string
];

type FixtureSpec = {
  readonly exportName: string;
  readonly generatedFileName: string;
  readonly rawFileName: string;
  readonly rawSha256: string;
  readonly parentRepairs: ReadonlyMap<string, string | null>;
  readonly mappings: readonly ExpectedResourceMapping[];
  readonly presentations: readonly ExpectedPresentation[];
  readonly workspaceUuidLine: string;
};

const captureDirectory = new URL(
  "../../../../../docs/gg/feat-infrastructure-template/brainboard-captures/",
  import.meta.url
);

const specs = [
  {
    exportName: "awsThreeTierDatabaseSource",
    generatedFileName: "aws-three-tier-database.ts",
    rawFileName: "aws-three-tier-web-app.json",
    rawSha256: "e1d7cc935b5833e9c3d6ee8f966417364d07feabccd76be4e16e4ceb301764dd",
    parentRepairs: new Map([
      ["cea766af-7b78-4329-8483-aa94f972ead5", null],
      ["4c5c5291-683f-4364-88a1-09dc5d885de3", "afe878e0-c406-499d-ba2c-c76a7ba9ed00"],
      ["e045ce90-bb03-4d17-8184-40474d73bdda", "afe878e0-c406-499d-ba2c-c76a7ba9ed00"]
    ]),
    mappings: [
      [
        "2f8fe703-8781-4e1d-afb9-8b41aa88cb4e",
        "aws_launch_template.launch_template",
        "exact-title"
      ],
      ["afe878e0-c406-499d-ba2c-c76a7ba9ed00", "aws_vpc.main", "single-residual"],
      ["0ba0b6ac-5652-4698-9c34-622056feec30", "aws_autoscaling_group.web", "exact-title"],
      ["95f6fcc3-863d-4859-81fc-19bb52b136f1", "aws_autoscaling_group.app", "exact-title"],
      [
        "ad311bd8-eb8c-4b09-ac61-b818cccb630d",
        "aws_db_subnet_group.aws_db_subnet_group_18",
        "single-residual"
      ],
      ["02eb7678-c7b3-496c-8f2e-864b8752639a", "aws_subnet.web_b", "reviewed-override"],
      ["2de9df0c-ca00-47b9-adc8-c9bedfbb8a56", "aws_subnet.web_a", "reviewed-override"],
      ["2e727aab-c78f-47d3-ad08-15ab55425c05", "aws_subnet.db_b", "reviewed-override"],
      ["44023200-da2c-4dd0-a42f-e155df3eebf8", "aws_subnet.db_a", "reviewed-override"],
      ["5c70cc8e-00c1-40aa-9579-f774354c3de4", "aws_subnet.app_a", "reviewed-override"],
      ["d1bbba94-5f95-4e6e-ba67-d968459db06c", "aws_subnet.app_b", "reviewed-override"],
      ["0f77fb2f-97d3-4562-89b4-36bd1d3eb6b2", "aws_route53_record.a_record", "reviewed-override"],
      ["10899cec-fe58-405a-b610-379fc832e90f", "aws_waf_web_acl.waf_web_acl", "single-residual"],
      [
        "283de881-4574-4a4c-95b9-f12b34d9087d",
        "aws_s3_bucket_versioning.default",
        "single-residual"
      ],
      ["3cd01172-fce2-4b44-9829-238c8a8fbde6", "aws_s3_bucket.default", "single-residual"],
      ["43af3152-6e4e-4144-9c44-b4496e6c00c7", "aws_waf_rule.aws_waf_rule_10", "single-residual"],
      ["8cc81941-dca9-431b-bb7a-b6a24cd2ba32", "aws_route53_record.cname", "reviewed-override"],
      [
        "91e71162-3ab7-4638-b2d0-974e34879a4f",
        "aws_route53_zone.aws_route53_zone_6",
        "single-residual"
      ],
      ["c6e0203e-f336-4b67-bace-94a51d09f617", "aws_waf_ipset.aws_waf_ipset_11", "single-residual"],
      ["4c5ee754-3e97-4d3e-8ad5-5466eac8840c", "aws_internet_gateway.igw", "single-residual"],
      ["732af918-f8b1-43e9-a3ea-a9b583c1fb45", "aws_elb.web", "exact-title"],
      ["89409729-7427-4813-a81b-274de912ec4a", "aws_elb.app", "exact-title"],
      ["b1c5fe40-f4ea-4435-979e-55a7011ac6e2", "aws_eip.web_a", "exact-title"],
      ["f22651e0-1d69-417f-b33c-e2e1e5e82cb8", "aws_eip.web_b", "exact-title"],
      ["14b312b8-59be-4b2b-8b62-d422fa392e41", "aws_nat_gateway.web_b", "reviewed-override"],
      [
        "84a9b330-9c06-4a61-85b8-00f4db547d21",
        "aws_rds_cluster.aws_rds_cluster_19",
        "single-residual"
      ],
      ["9f288d70-3c85-4204-acc7-9543bc9d38f6", "aws_nat_gateway.web_a", "reviewed-override"]
    ],
    presentations: [
      [
        "cea766af-7b78-4329-8483-aa94f972ead5",
        "region",
        "aws-region",
        null,
        "US East (N. Virginia)"
      ],
      [
        "4c5c5291-683f-4364-88a1-09dc5d885de3",
        "availability_zone",
        "aws-availability-zone",
        null,
        "us-east-1b"
      ],
      [
        "e045ce90-bb03-4d17-8184-40474d73bdda",
        "availability_zone",
        "aws-availability-zone",
        null,
        "us-east-1a"
      ],
      [
        "c2b68a8b-d2de-47d6-a48d-de1200d2cc00",
        "aws_cloudfront_distribution",
        "aws-cloudfront-distribution",
        null,
        "cloudfront_distribution"
      ],
      ["3c2e57a3-326f-4fe9-aab7-ecb2c7a41e8f", "text", null, null, ""],
      ["83f8b4db-3937-4bcb-8707-cf55e4749ea3", "text", null, null, ""],
      ["cf263726-f3f8-471f-94ee-0229644bc7b4", "text", null, null, ""],
      ["ec823e04-54e9-4c9c-9ac4-a7b939ec22bf", "text", null, null, ""],
      [
        "3d3c925d-b665-4a01-b2e4-b928b6f3ab31",
        "aws_instance",
        "aws-ec2-instance",
        "aws_autoscaling_group.web",
        "Web servers"
      ],
      [
        "4952ad77-6b67-4d60-ba48-399fb1da6ca6",
        "aws_rds_cluster",
        "aws-rds-cluster",
        "aws_rds_cluster.aws_rds_cluster_19",
        "Read-only replica"
      ],
      [
        "a4c5b76d-069d-4e57-b11d-aead846a2201",
        "aws_instance",
        "aws-ec2-instance",
        "aws_autoscaling_group.web",
        "Web servers"
      ],
      [
        "c07e1ce3-dd7c-4a9c-82c8-752a10ea5fba",
        "aws_instance",
        "aws-ec2-instance",
        "aws_autoscaling_group.app",
        "EC2 web servers"
      ],
      [
        "dc04ec1e-665b-45ab-ba9f-290b55340c7b",
        "aws_instance",
        "aws-ec2-instance",
        "aws_autoscaling_group.app",
        "EC2 web servers"
      ]
    ],
    workspaceUuidLine: '    archuuid = "fb2334bf-3291-40db-a779-1e4e56df27dd"\n'
  },
  {
    exportName: "awsBastionSource",
    generatedFileName: "aws-bastion.ts",
    rawFileName: "aws-bastion.json",
    rawSha256: "f523f0e224781749054638d576fe2b73f4748bdfc9f1daabd09f70bb81e863d6",
    parentRepairs: new Map([
      ["4b4447a5-92a0-40b4-bf63-538a19399886", null],
      ["7912ce6d-b224-4055-84c0-e847e7ca1224", "4b4447a5-92a0-40b4-bf63-538a19399886"],
      ["3cbdd739-7b62-4824-ae49-25f7863bd970", "7912ce6d-b224-4055-84c0-e847e7ca1224"]
    ]),
    mappings: [
      ["7912ce6d-b224-4055-84c0-e847e7ca1224", "aws_vpc.default_vpc", "exact-title"],
      ["0b578f07-26c1-42ea-8bd0-952dd4b45ebf", "aws_subnet.default_subnet", "exact-title"],
      [
        "6ef194ca-02bc-4039-8ca5-a61e1d285bae",
        "aws_security_group.default_security_group",
        "exact-title"
      ],
      [
        "8810f656-c698-416c-b42b-14221f124aa0",
        "aws_internet_gateway.default_gtw",
        "single-residual"
      ],
      ["d555e514-a657-43d3-9435-f3962064d36f", "aws_route_table.default_route", "single-residual"],
      [
        "80489bad-1f77-4035-97ed-0939be2815cf",
        "aws_route_table_association.default_route_table_association",
        "single-residual"
      ],
      [
        "edd96c50-6a71-4db7-b23f-f7f21465b74f",
        "aws_network_acl.default_network_acl",
        "exact-title"
      ],
      ["f91e8491-f010-457d-b966-7cd53de8e7e3", "aws_key_pair.default_key_pair", "exact-title"],
      [
        "decc2f66-4950-4338-89fa-7eda35c53e60",
        "aws_security_group_rule.sg_rule_ingress_all",
        "reviewed-override"
      ],
      [
        "202d02a1-538d-45fe-b8e5-26aa1753d5d1",
        "aws_security_group_rule.sg_rule_ingress_ssh",
        "reviewed-override"
      ],
      [
        "941b992f-e911-4533-baff-396fed3cd614",
        "aws_security_group_rule.sg_rule_egress_all",
        "reviewed-override"
      ],
      ["3fbf05b5-5729-4f4e-88f7-92ee41797b38", "aws_instance.t2-bastion", "reviewed-override"],
      ["9e820b53-18b3-407e-be69-6fda71a19f67", "aws_instance.t2-7ff2172e", "reviewed-override"]
    ],
    presentations: [
      [
        "4b4447a5-92a0-40b4-bf63-538a19399886",
        "region",
        "aws-region",
        null,
        "US East (N. Virginia)"
      ],
      [
        "3cbdd739-7b62-4824-ae49-25f7863bd970",
        "availability_zone",
        "aws-availability-zone",
        null,
        "us-east-1a"
      ],
      ["c9e3634d-acaa-4ff9-9471-47f286144125", "text", null, null, ""],
      [
        "ff83642d-55bb-4725-9972-e3eef3b98077",
        "brainboard_icon",
        "design-user-client",
        null,
        "Authorized users"
      ]
    ],
    workspaceUuidLine: '    archuuid = "130f8091-21a4-4e8b-8b39-2373cb720d72"\n'
  }
] as const satisfies readonly FixtureSpec[];

const sources = await Promise.all(specs.map(loadGeneratedSource));

test("ranks 10-11 expose two independently generated captured sources", () => {
  assert.ok(
    sources.every((source) => source !== null),
    "both generated source fixtures must exist"
  );
  assert.deepEqual(
    sources.map((source) => source?.id),
    ["brainboard-aws-three-tier-database", "brainboard-aws-bastion"]
  );
});

test("ranks 10-11 preserve exact raw graphs, authored edges, Terraform files, and batch totals", () => {
  for (const [index, spec] of specs.entries()) verifyFixture(requireSource(index), spec);

  assert.equal(
    sum((source) => source.nodes.length),
    57
  );
  assert.equal(
    sum((source) => source.edges.length),
    26
  );
  assert.equal(
    sum((source) => source.terraform.files.length),
    14
  );
  assert.equal(
    sum((source) => source.terraform.resourceAddresses.length),
    40
  );
  assert.equal(
    specs.reduce((total, spec) => total + spec.parentRepairs.size, 0),
    6
  );
});

test("all 40 Terraform addresses map to exactly one same-type resource without address inflation", () => {
  for (const source of sources.map((_, index) => requireSource(index))) {
    const resourceNodes = source.nodes.filter(isResourceNode);
    const addressCounts = new Map<string, number>();
    for (const node of resourceNodes) {
      const address = resourceAddress(node);
      addressCounts.set(address, (addressCounts.get(address) ?? 0) + 1);
      assert.equal(node.valuesResolution, "source-file-authoritative/unresolved");
      assert.equal("values" in node, false);
    }
    assert.deepEqual(
      [...addressCounts.entries()].sort(([left], [right]) => left.localeCompare(right, "en")),
      source.terraform.resourceAddresses
        .map((address) => [address, 1] as const)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
    );
  }
});

test("rank 10 keeps six extra AWS visuals as reviewed aliases or explicit visual-only presentation", () => {
  const source = requireSource(0);
  const awsPresentations = source.nodes.filter(
    (node) => isPresentationNode(node) && node.rawResourceType.startsWith("aws_")
  );
  assert.equal(awsPresentations.length, 6);
  assert.deepEqual(
    awsPresentations.map((node) => [node.sourceNodeId, node.catalogId, node.aliasOf]),
    [
      ["c2b68a8b-d2de-47d6-a48d-de1200d2cc00", "aws-cloudfront-distribution", null],
      ["3d3c925d-b665-4a01-b2e4-b928b6f3ab31", "aws-ec2-instance", "aws_autoscaling_group.web"],
      [
        "4952ad77-6b67-4d60-ba48-399fb1da6ca6",
        "aws-rds-cluster",
        "aws_rds_cluster.aws_rds_cluster_19"
      ],
      ["a4c5b76d-069d-4e57-b11d-aead846a2201", "aws-ec2-instance", "aws_autoscaling_group.web"],
      ["c07e1ce3-dd7c-4a9c-82c8-752a10ea5fba", "aws-ec2-instance", "aws_autoscaling_group.app"],
      ["dc04ec1e-665b-45ab-ba9f-290b55340c7b", "aws-ec2-instance", "aws_autoscaling_group.app"]
    ]
  );
  assert.equal(
    source.nodes.filter(
      (node) => isPresentationNode(node) && node.aliasOf === "aws_rds_cluster.aws_rds_cluster_19"
    ).length,
    1
  );
});

test("rotations, negative coordinates, and five empty text nodes remain explicit source evidence", () => {
  const threeTier = requireSource(0);
  assert.deepEqual(
    threeTier.nodes
      .filter(({ rotation }) => rotation === -90)
      .map(({ sourceNodeId }) => sourceNodeId),
    [
      "3c2e57a3-326f-4fe9-aab7-ecb2c7a41e8f",
      "83f8b4db-3937-4bcb-8707-cf55e4749ea3",
      "b1c5fe40-f4ea-4435-979e-55a7011ac6e2",
      "cf263726-f3f8-471f-94ee-0229644bc7b4",
      "f22651e0-1d69-417f-b33c-e2e1e5e82cb8"
    ]
  );
  assert.deepEqual(threeTier.nodes[0]?.position, { x: -770, y: -390 });

  const emptyTexts = sources
    .flatMap((source) => source?.nodes ?? [])
    .filter(
      (node) => isPresentationNode(node) && node.rawResourceType === "text" && node.label === ""
    );
  assert.equal(emptyTexts.length, 5);
  assert.ok(
    emptyTexts.every(
      (node) => node.catalogId === null && node.aliasOf === null && node.style === null
    )
  );
});

test("workspace seeds remove exactly one reviewed UUID occurrence and preserve immutable source bytes", () => {
  for (const [index, spec] of specs.entries()) {
    const source = requireSource(index);
    const raw = readRawCapture(spec.rawFileName);
    for (const sourceFile of source.terraform.files) {
      const rawFile = raw.terraform.files.find(({ fileName }) => fileName === sourceFile.fileName);
      assert.ok(rawFile);
      assert.equal(sourceFile.code, rawFile.code);
      assert.equal(sourceFile.sha256, rawFile.sha256);
      assert.equal(sha256(sourceFile.code), sourceFile.sha256);
      if (sourceFile.fileName !== "variables.tf") {
        assert.equal(sourceFile.workspaceSeed, undefined);
        continue;
      }
      assert.equal(sourceFile.code.split(spec.workspaceUuidLine).length - 1, 1);
      const expectedWorkspaceCode = sourceFile.code.replace(spec.workspaceUuidLine, "");
      assert.deepEqual(sourceFile.workspaceSeed, {
        code: expectedWorkspaceCode,
        sha256: sha256(expectedWorkspaceCode),
        omissions: [
          {
            reason: "brainboard-architecture-uuid",
            sourceText: spec.workspaceUuidLine,
            occurrenceCount: 1
          }
        ]
      });
    }
  }
});

function verifyFixture(source: BrainboardTemplateSource, spec: FixtureSpec): void {
  const rawBytes = readFileSync(new URL(spec.rawFileName, captureDirectory));
  const raw = JSON.parse(rawBytes.toString("utf8")) as RawCapture;
  assert.equal(sha256(rawBytes), spec.rawSha256);
  assert.equal(source.id, raw.id);
  assert.equal(source.title, raw.title);
  assert.equal(source.description, null);
  assert.equal(source.provider, raw.provider);
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
      parentSourceNodeId: spec.parentRepairs.has(node.sourceNodeId)
        ? spec.parentRepairs.get(node.sourceNodeId)!
        : node.parentSourceNodeId,
      zIndex: node.order,
      rawTransform: node.transform,
      rotation: parseRotation(node.transform)
    }))
  );
  assert.deepEqual(source.edges, raw.edges.map(normalizeRawEdge));
  assert.deepEqual(
    source.terraform.files.map(rawFileProjection),
    raw.terraform.files.map(rawFileProjection)
  );
  assert.deepEqual(source.terraform.resourceAddresses, raw.terraform.resourceAddresses);
  for (const node of source.nodes.filter(isResourceNode)) {
    const rawNode = raw.nodes.find(({ sourceNodeId }) => sourceNodeId === node.sourceNodeId);
    assert.equal(node.terraformResourceType, rawNode?.resourceType);
    assert.equal(node.fileName, "main.tf");
  }
  assert.deepEqual(
    source.nodes
      .filter(isResourceNode)
      .map((node) => [node.sourceNodeId, resourceAddress(node), node.addressMapping]),
    spec.mappings
  );
  assert.deepEqual(
    source.nodes
      .filter(isPresentationNode)
      .map((node) => [
        node.sourceNodeId,
        node.rawResourceType,
        node.catalogId,
        node.aliasOf,
        node.label
      ]),
    spec.presentations
  );
}

async function loadGeneratedSource(spec: FixtureSpec): Promise<BrainboardTemplateSource | null> {
  const module = (await import(new URL(spec.generatedFileName, import.meta.url).href).catch(
    () => null
  )) as Record<string, unknown> | null;
  const source = module?.[spec.exportName];
  return source && typeof source === "object" ? (source as BrainboardTemplateSource) : null;
}

function requireSource(index: number): BrainboardTemplateSource {
  const source = sources[index];
  assert.ok(source, `${specs[index]?.generatedFileName ?? index} must be generated`);
  return source;
}

function readRawCapture(fileName: string): RawCapture {
  return JSON.parse(readFileSync(new URL(fileName, captureDirectory), "utf8")) as RawCapture;
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
    rotation: node.rotation
  };
}

function normalizeRawEdge(edge: RawEdge): BrainboardSourceEdge {
  const arrow = edge.arrow;
  let arrowDirection: BrainboardSourceEdge["arrowDirection"] = "none";
  let arrowAngle = 0;
  if (arrow !== null) {
    const [, rawAngle, rawX, rawY] =
      /^\s*rotate\(\s*([-+\d.eE]+)[\s,]+([-+\d.eE]+)[\s,]+([-+\d.eE]+)\s*\)\s*$/u.exec(
        arrow.transform
      ) ?? [];
    arrowAngle = Number(rawAngle);
    const arrowCenter = { x: Number(rawX), y: Number(rawY) };
    arrowDirection =
      arrowCenter.x === edge.targetPoint.x && arrowCenter.y === edge.targetPoint.y
        ? "source-to-target"
        : "target-to-source";
  }
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
    arrowDirection,
    arrowAngle,
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

function resourceAddress(node: Extract<BrainboardSourceNode, { kind: "resource" }>): string {
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

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sum(select: (source: BrainboardTemplateSource) => number): number {
  return sources.reduce((total, source) => total + (source === null ? 0 : select(source)), 0);
}
