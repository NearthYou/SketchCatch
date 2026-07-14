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

type FixtureSpec = {
  readonly exportName: string;
  readonly generatedFileName: string;
  readonly rawFileName: string;
  readonly rawSha256: string;
  readonly parentRepairs: ReadonlyMap<string, string | null>;
  readonly mappings: readonly ExpectedResourceMapping[];
  readonly presentationIdentities: readonly (readonly [
    sourceNodeId: string,
    rawResourceType: string,
    catalogId: string | null,
    label: string
  ])[];
  readonly workspaceUuidLine: string;
};

const captureDirectory = new URL(
  "../../../../../docs/gg/feat-infrastructure-template/brainboard-captures/",
  import.meta.url
);

const specs = [
  {
    exportName: "awsVpcSubnetsSecurityGroups2azSource",
    generatedFileName: "aws-vpc-subnets-security-groups-2az.ts",
    rawFileName: "aws-vpc-subnets-security-groups-2az.json",
    rawSha256: "7f8cab683561c674b9fc5d0e89d24bcdd217c16388ec0e8f566e2092aa089f47",
    parentRepairs: new Map([
      ["c04395a7-7955-4329-8709-f8b44efa1c63", null],
      ["9c59c668-cb0a-4287-9087-1de1045fcb1b", "c04395a7-7955-4329-8709-f8b44efa1c63"]
    ]),
    mappings: [
      ["9c59c668-cb0a-4287-9087-1de1045fcb1b", "aws_vpc.vpc", "exact-title"],
      ["0c447118-80a7-4c77-8f95-fd3b24c1e6b5", "aws_subnet.private_snet_a", "reviewed-override"],
      ["7e83f2a2-2457-44da-a0d4-1a2bc608f345", "aws_subnet.public_snet_a", "reviewed-override"],
      ["8fd53908-23f1-4273-807e-e411dc2ea765", "aws_subnet.snet4", "reviewed-override"],
      ["9b86c789-0127-44b3-948b-30ebb28037bb", "aws_subnet.snet3", "reviewed-override"],
      ["2b3e06b2-3efa-41da-8190-8c81c6d4f348", "aws_security_group.sg", "exact-title"],
      ["8a050109-a5cd-47b0-9642-47e0e1883e9c", "aws_security_group.sg2", "exact-title"],
      ["2bc95caf-a0bb-4685-9dae-7d75f194eeec", "aws_route_table.rt", "single-residual"],
      ["3adee551-ee50-4677-8522-b9a993879e9f", "aws_internet_gateway.internet_gw", "single-residual"],
      ["5174b7c6-a695-4aa6-9bec-37eb301fe69e", "aws_eip.eip", "reviewed-override"],
      ["c11cf78b-2d86-4665-b1ef-999b2b91594f", "aws_eip.eip2", "reviewed-override"],
      ["3fa3abcc-3366-4d29-a95d-a1848a4d07f6", "aws_route_table_association.rt_association2", "reviewed-override"],
      ["4bab5c05-8edd-4533-a61a-8d2c2f8ac570", "aws_route_table_association.rt_association", "reviewed-override"],
      ["56cdee29-d69c-46f1-860c-478c80ab361b", "aws_network_acl.network_acl2", "reviewed-override"],
      ["90bf2724-6fb1-4e87-bb8d-36d492603b71", "aws_nat_gateway.nat_gw2", "reviewed-override"],
      ["a3af7c5b-b9b8-44a8-bf85-e3098cadb82b", "aws_nat_gateway.nat_gw", "reviewed-override"],
      ["ab9cd657-4f34-49a7-9c75-174de1e73de2", "aws_network_acl.network_acl", "reviewed-override"]
    ],
    presentationIdentities: [
      ["c04395a7-7955-4329-8709-f8b44efa1c63", "region", "aws-region", "US East (N. Virginia)"],
      ["20c1e4c2-a928-42a3-901a-121551b1f07f", "availability_zone", "aws-availability-zone", "us-east-1a"],
      ["bc1b025f-86b0-4df7-8405-29f7eba77ced", "availability_zone", "aws-availability-zone", "us-east-1b"],
      ["dab3e0f4-ca73-4759-985b-b2bb84bce2f3", "brainboard_icon", "design-user-client", "users"]
    ],
    workspaceUuidLine: '    archuuid = "a9b3f02c-a950-4153-92d2-47905dd8ffd3"\n'
  },
  {
    exportName: "awsServerlessCdnSource",
    generatedFileName: "aws-serverless-cdn.ts",
    rawFileName: "aws-serverless-cdn.json",
    rawSha256: "871de7784b1e76bb9fed3d230b9205d7842e9590e36dfc6917ce6990beffcb46",
    parentRepairs: new Map(),
    mappings: [
      ["04926feb-4622-439a-b228-cfc9e415e98e", "aws_apigatewayv2_api.apigwv2_api", "exact-title"],
      ["0c2d3032-4148-4e80-bae8-9cfb63f6ec6e", "aws_route53_record.www", "exact-title"],
      ["372d8cce-6e53-4d81-a7d5-5337d826b75b", "aws_s3_bucket.website_bucket", "exact-title"],
      ["3afa58d4-2389-47e3-af6d-197aa176ca4a", "aws_s3_bucket_versioning.s3_bucket_versioning", "exact-title"],
      ["3e80ddec-93fc-4732-8e32-ec2d48a5956f", "aws_cognito_user_pool.cognito_user_pool", "exact-title"],
      ["46b1dd16-edd2-49f2-b3b6-b228d6838314", "aws_iam_role.iam_role", "exact-title"],
      ["48e4d8e3-8e35-4e2b-9d9a-3bd6309ce560", "aws_lambda_function.lambda_function", "exact-title"],
      ["58851a9c-d1ed-4576-8636-e8c2de255585", "aws_s3_bucket.public_content", "exact-title"],
      ["913fcb3c-08dd-487b-9f34-7a0e3aded6b6", "aws_dynamodb_global_table.dynamodb_global_table", "exact-title"],
      ["96f0a15e-0305-405a-b9e9-eee46aed63e0", "aws_s3_object.error", "exact-title"],
      ["97ab46f5-02c0-4d3e-8d23-73e7cf4d9936", "aws_route53_zone.route53_zone", "exact-title"],
      ["9c5f4598-f184-4890-bdd0-1899be4e8cf7", "aws_s3_object.index", "exact-title"],
      ["a9812863-e435-4e22-8ead-21024b258441", "aws_cloudfront_distribution.website_distribution", "exact-title"],
      ["b90b246d-aeeb-4e30-aa60-7929ecace81d", "aws_ses_email_identity.ses_email_identity", "exact-title"],
      ["ceb49680-3cb4-41d8-9e9d-34f674391bb4", "aws_lambda_function.lambda_function3", "exact-title"],
      ["d0fc5fc8-4e65-463c-96a9-abb6c4abd050", "aws_cloudfront_origin_access_identity.origin_access_identity", "exact-title"],
      ["ddbce9f8-63fd-43a9-a133-86dda6fed0e9", "aws_s3_bucket_website_configuration.s3_bucket_website_configuration", "exact-title"],
      ["e608c4e1-a9bf-4675-be19-e67f7bde4f98", "aws_s3_bucket_acl.s3_bucket_acl", "exact-title"],
      ["ed57ef8a-ac66-4a30-a586-09a0f3c4406a", "aws_lambda_function.lambda_function2", "exact-title"]
    ],
    presentationIdentities: [
      ["a7275a97-1cba-448c-b797-76cf925ac3d5", "region", "aws-region", "US East (N. Virginia)"],
      ["675bd894-0771-422e-947d-b7c25fad993f", "brainboard_icon", "design-user-client", "users"]
    ],
    workspaceUuidLine: '    archuuid = "45191152-00cd-443d-a7f5-9a7295120e48"\n'
  },
  {
    exportName: "awsEc2VpcSubnetSource",
    generatedFileName: "aws-ec2-vpc-subnet.ts",
    rawFileName: "aws-ec2-vpc-subnet.json",
    rawSha256: "ea7fab45ba1758e5537d7df5dc2045d513c3e9c1ba74cb08ce81950685582e1e",
    parentRepairs: new Map([
      ["411a1488-c6f1-4708-be6c-91844746b580", null],
      ["3704567b-d0d1-49f3-9215-bf83a1df977a", "411a1488-c6f1-4708-be6c-91844746b580"],
      ["818d32cf-1a97-4f1c-8f60-92faf5dc7c0e", "3704567b-d0d1-49f3-9215-bf83a1df977a"]
    ]),
    mappings: [
      ["3704567b-d0d1-49f3-9215-bf83a1df977a", "aws_vpc.vpc", "exact-title"],
      ["8c044337-0d96-4095-b3a4-89d844d1c129", "aws_subnet.snet", "exact-title"],
      ["8fbaeef4-cb2d-473e-8885-2b1fb5161e59", "aws_instance.vm", "single-residual"],
      ["f6a2e88c-0606-4841-8438-05473a0719d3", "aws_network_interface.default", "single-residual"]
    ],
    presentationIdentities: [
      ["411a1488-c6f1-4708-be6c-91844746b580", "region", "aws-region", "US East (N. Virginia)"],
      ["818d32cf-1a97-4f1c-8f60-92faf5dc7c0e", "availability_zone", "aws-availability-zone", "us-east-1a"],
      ["4a830da1-bf0a-4bfe-8cd4-2c0c595869bf", "text", null, ""]
    ],
    workspaceUuidLine: '    archuuid = "9009bff8-8177-4022-ad39-6035ad4acd05"\n'
  },
  {
    exportName: "awsAsgLoadBalancerVpcSource",
    generatedFileName: "aws-asg-load-balancer-vpc.ts",
    rawFileName: "aws-asg-load-balancer-vpc.json",
    rawSha256: "ae4dbd0f6977eb4ab3d26d50b8cb71a5daeeccd47d5a95a2f2fcdcfdfcc3fcb5",
    parentRepairs: new Map([
      ["c8302f50-a584-4e73-bf3f-efca40fae066", null],
      ["4ccb83f3-67ac-497f-bcfd-4ce5691f8e73", "f5024a0a-d5e3-4403-a70f-d07a5402a90c"],
      ["8720b1c9-ad44-42e7-a8f2-aa43ebee2449", "f5024a0a-d5e3-4403-a70f-d07a5402a90c"]
    ]),
    mappings: [
      ["f5024a0a-d5e3-4403-a70f-d07a5402a90c", "aws_vpc.vpc", "exact-title"],
      ["af851fdf-0467-46fb-a990-ae069729728c", "aws_subnet.snet2", "exact-title"],
      ["dedbf41c-255d-4b77-b246-a9ba0de7d9fe", "aws_security_group.default", "exact-title"],
      ["a514bd55-a14d-45a0-a047-4220529bd4e2", "aws_security_group.ec2", "exact-title"],
      ["cd499b89-a918-4f50-a93a-2b865f961e60", "aws_launch_configuration.default", "exact-title"],
      ["d75efaba-a405-4bf0-9cf0-929116e2c267", "aws_autoscaling_group.web", "exact-title"],
      ["ff98d607-abd3-49b8-bf7f-f5dae753e5c8", "aws_subnet.snet", "exact-title"],
      ["478775af-5d74-4733-9750-fbe7e051cdcb", "aws_internet_gateway.internet_gw", "exact-title"],
      ["739e74c1-d7e8-4318-879c-d8551ead85da", "aws_route_table.rt", "exact-title"],
      ["d67cbec1-5217-44ea-95e8-93c2bae28504", "aws_elb.clb_9", "exact-title"],
      ["30a33276-f2ed-4578-90f4-3fd2ee58da38", "aws_route_table_association.rt_association", "exact-title"],
      ["779fbe96-abee-444a-be06-a8e7647cefab", "aws_cloudwatch_metric_alarm.web_cpu_alarm_up", "reviewed-override"],
      ["859e7225-86d1-4b45-a900-ecfbb9e2a60b", "aws_cloudwatch_metric_alarm.web_cpu_alarm_down", "reviewed-override"],
      ["a4eeb4d5-0d6c-44fe-9dd7-2fec572dc954", "aws_autoscaling_policy.default", "reviewed-override"],
      ["c7a4f916-1ccf-4d20-a6db-bd672f5aebe2", "aws_autoscaling_policy.web_policy_down", "reviewed-override"],
      ["e2bbe386-707f-478f-8d80-25a84ae7df25", "aws_route_table_association.rt_association2", "exact-title"]
    ],
    presentationIdentities: [
      ["c8302f50-a584-4e73-bf3f-efca40fae066", "region", "aws-region", "US East (N. Virginia)"],
      ["4ccb83f3-67ac-497f-bcfd-4ce5691f8e73", "availability_zone", "aws-availability-zone", "us-east-1a"],
      ["8720b1c9-ad44-42e7-a8f2-aa43ebee2449", "availability_zone", "aws-availability-zone", "us-east-1a"]
    ],
    workspaceUuidLine: '    archuuid = "f161f840-d697-4651-aa8d-6ec05b981a79"\n'
  }
] as const satisfies readonly FixtureSpec[];

const sources = await Promise.all(specs.map(loadGeneratedSource));

test("ranks 3-6 expose four independently generated captured sources", () => {
  assert.ok(sources.every((source) => source !== null), "all four generated source fixtures must exist");
  assert.deepEqual(
    sources.map((source) => source?.id),
    [
      "brainboard-aws-vpc-subnets-security-groups-2az",
      "brainboard-aws-serverless-cdn",
      "brainboard-aws-ec2-vpc-subnet",
      "brainboard-aws-asg-lb-vpc-subnets"
    ]
  );
  assert.deepEqual(
    sources.map((source) => source?.captureStatus),
    ["captured", "captured", "captured", "captured"]
  );
});

test("ranks 3-6 preserve exact raw bytes, normalized graphs, authored routes, and Terraform files", () => {
  for (const [index, spec] of specs.entries()) {
    verifyFixture(requireSource(index), spec);
  }

  assert.equal(sources.reduce((sum, source) => sum + (source?.nodes.length ?? 0), 0), 68);
  assert.equal(sources.reduce((sum, source) => sum + (source?.edges.length ?? 0), 0), 35);
  assert.equal(sources.reduce((sum, source) => sum + (source?.terraform.files.length ?? 0), 0), 28);
  assert.equal(
    sources.reduce((sum, source) => sum + (source?.terraform.resourceAddresses.length ?? 0), 0),
    56
  );
});

test("every Terraform address has exactly one reviewed same-type visual and no presentation alias", () => {
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
    assert.ok(source.nodes.filter(isPresentationNode).every(({ aliasOf }) => aliasOf === null));
  }
});

test("repeated visuals and rank 5 empty text remain present and unresolved", () => {
  const vpc = requireSource(0);
  const asg = requireSource(3);
  assert.equal(vpc.nodes.filter(({ label }) => label === "Route table association").length, 2);
  assert.equal(vpc.nodes.filter(({ label }) => label === "NAT gateway").length, 2);
  assert.equal(vpc.nodes.filter(({ label }) => label === "Net ACL").length, 2);
  assert.equal(asg.nodes.filter(({ label }) => label === "us-east-1a").length, 2);
  assert.equal(asg.nodes.filter(({ label }) => label === "default").length, 2);

  const emptyText = requireSource(2).nodes.find(
    ({ sourceNodeId }) => sourceNodeId === "4a830da1-bf0a-4bfe-8cd4-2c0c595869bf"
  );
  assert.ok(emptyText?.kind === "presentation");
  assert.equal(emptyText.label, "");
  assert.equal(emptyText.rawResourceType, "text");
  assert.equal(emptyText.catalogId, null);
  assert.equal(emptyText.aliasOf, null);
  assert.equal(emptyText.style, null);
  assert.equal("terraformResourceType" in emptyText, false);
});

test("workspace seeds remove only the reviewed UUID line while immutable Terraform bytes stay exact", () => {
  for (const [index, spec] of specs.entries()) {
    const source = requireSource(index);
    const raw = readRawCapture(spec.rawFileName);
    for (const sourceFile of source.terraform.files) {
      const rawFile = raw.terraform.files.find(({ fileName }) => fileName === sourceFile.fileName);
      assert.ok(rawFile);
      assert.equal(sourceFile.code, rawFile.code);
      assert.equal(sourceFile.sha256, rawFile.sha256);
      if (sourceFile.fileName !== "variables.tf") {
        assert.equal(sourceFile.workspaceSeed, undefined);
        continue;
      }
      assert.equal(sourceFile.code.split(spec.workspaceUuidLine).length, 2);
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
  }
  assert.deepEqual(
    source.nodes.filter(isResourceNode).map((node) => [
      node.sourceNodeId,
      resourceAddress(node),
      node.addressMapping
    ]),
    spec.mappings
  );
  assert.deepEqual(
    source.nodes.filter(isPresentationNode).map((node) => [
      node.sourceNodeId,
      node.rawResourceType,
      node.catalogId,
      node.label
    ]),
    spec.presentationIdentities
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
  const [x, y, width, height] = viewBox.trim().split(/[\s,]+/u).map(Number);
  return { x, y, width, height };
}

function parseRotation(transform: string): number {
  return Number(/\brotate\(\s*([-+\d.eE]+)/u.exec(transform)?.[1]);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
