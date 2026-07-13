import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type {
  BrainboardSourceNode,
  BrainboardTemplateSource,
  BrainboardTerraformFile
} from "../source-types.js";

type PublicContract = {
  readonly brainboardTemplateSources?: readonly BrainboardTemplateSource[];
  readonly validateBrainboardTemplateSource?: (source: BrainboardTemplateSource) => {
    readonly valid: boolean;
    readonly errors: readonly unknown[];
  };
};

type RawNode = {
  readonly height: number;
  readonly order: number;
  readonly position: { readonly x: number; readonly y: number };
  readonly resourceType: string;
  readonly sourceNodeId: string;
  readonly title: string;
  readonly transform: string;
  readonly width: number;
  readonly parentSourceNodeId: string | null;
};

type RawEdge = {
  readonly arrow: { readonly points: string; readonly transform: string } | null;
  readonly id: string;
  readonly order: number;
  readonly svgPath: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly sourcePort: string;
  readonly targetPort: string;
  readonly sourcePoint: { readonly x: number; readonly y: number };
  readonly targetPoint: { readonly x: number; readonly y: number };
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

type ExpectedResourceMapping = readonly [
  sourceNodeId: string,
  address: string,
  fileName: string,
  strategy: "exact-title" | "single-residual" | "reviewed-override"
];

const contract = (await import("../../index.js")) as unknown as PublicContract;
const captureDirectory = new URL(
  "../../../../../docs/gg/feat-infrastructure-template/brainboard-captures/",
  import.meta.url
);

const TRAINING_PARENT_REPAIRS = new Map<string, string | null>([
  ["a9e7e1c4-6179-45d2-b7bc-885e61755ac2", null],
  ["2c258322-661f-471b-b0e6-85d49fd8e46b", "c7cf2dc9-4cc9-481f-b53f-9904151e2630"],
  ["dc0a5b25-308f-4bc2-871b-d5083cf2d0e2", "c7cf2dc9-4cc9-481f-b53f-9904151e2630"]
]);
const EKS_PARENT_REPAIRS = new Map<string, string | null>([
  ["839c066c-c756-4005-aeb5-67c1e8c34cf7", null],
  ["5adb3d4d-2c10-46fe-93f8-691ad10c863a", "5941a072-4406-4e02-ab93-560811155e88"],
  ["e88227bb-9f4f-4710-87a7-ad9ae751e7c0", "5941a072-4406-4e02-ab93-560811155e88"]
]);

const TRAINING_MAPPINGS = [
  ["c7cf2dc9-4cc9-481f-b53f-9904151e2630", "aws_security_group.cluster-sg", "main.tf", "exact-title"],
  ["3a7c40fe-8ca2-429b-a762-605aed1a0a33", "aws_vpc.default", "main.tf", "exact-title"],
  ["7fc5471e-298b-4fe8-b8dd-61c9e12374a6", "aws_subnet.snet1", "main.tf", "exact-title"],
  ["9647ef8e-ba33-4608-be6b-79271f103fe3", "aws_subnet.snet2", "main.tf", "exact-title"],
  ["1deba4c9-a88f-4b0e-995a-2e5dc304d167", "aws_iam_role_policy_attachment.node-AmazonEC2ContainerRegistryReadOnly", "main.tf", "reviewed-override"],
  ["548abc5b-922e-4cf6-95ea-4c34c2fe5459", "aws_iam_role.iam-cluster", "main.tf", "exact-title"],
  ["57b6aa35-9b3d-46bd-967d-07493b8aaa5e", "aws_iam_role_policy_attachment.node-AmazonEKS_CNI_Policy", "main.tf", "reviewed-override"],
  ["85d344cc-b877-4e92-a4fc-6ac1a7224135", "aws_iam_role.default-iam", "main.tf", "exact-title"],
  ["8a4bb82f-8ca2-4314-aa88-a7895bbe985d", "aws_iam_role_policy_attachment.node-AmazonEKSWorkerNodePolicy", "main.tf", "reviewed-override"],
  ["b1dff648-3242-4a8f-bde8-5a30459b5d09", "aws_iam_role_policy_attachment.cluster-AmazonEKSVPCResourceController", "main.tf", "reviewed-override"],
  ["bb5eb85d-fe0a-4239-affd-f34192d53c79", "aws_iam_role_policy_attachment.cluster-AmazonEKSClusterPolicy", "main.tf", "reviewed-override"],
  ["6c68b992-6afd-4fc8-b37c-45da1f674b4c", "aws_internet_gateway.gtw", "main.tf", "single-residual"],
  ["f76286ac-796e-463a-b5a7-1fd6bfdc6a7a", "aws_route_table.default", "main.tf", "single-residual"],
  ["0c5bbe79-b35c-46f0-8281-f9e02e95225a", "aws_eks_cluster.default", "main.tf", "single-residual"],
  ["22a6d153-9c4c-49d4-a5b8-3c2fbb29162b", "aws_eks_node_group.default", "main.tf", "single-residual"],
  ["78653b46-a7fb-490f-a677-70663c22cc5c", "aws_security_group_rule.cluster-ingress-workstation-https", "main.tf", "single-residual"],
  ["ea26b075-2ec2-4686-9450-92cebdeeee7b", "aws_route_table_association.route-association-3", "main.tf", "reviewed-override"],
  ["ee8367ce-4b1b-4b45-9fca-eeec80c852dd", "aws_route_table_association.route-association-2", "main.tf", "reviewed-override"]
] as const satisfies readonly ExpectedResourceMapping[];

const EKS_MAPPINGS = [
  ["37304ca4-7959-4553-802c-96b74972173a", "aws_vpc.default", "main.tf", "exact-title"],
  ["5941a072-4406-4e02-ab93-560811155e88", "aws_security_group.sg", "main.tf", "exact-title"],
  ["5b25dc4d-2481-4368-89be-255a3f450843", "aws_subnet.snet-1b", "main.tf", "exact-title"],
  ["c7985a34-a745-4fc3-8e0c-32ceec6626f8", "aws_subnet.snet-1a", "main.tf", "exact-title"],
  ["25376bca-5df7-479f-a809-cf06e64b7ca7", "aws_iam_role_policy_attachment.iam_role_policy_attachment", "iam.tf", "reviewed-override"],
  ["2d045230-f49c-49bc-87b8-88f700f6781a", "aws_iam_role_policy_attachment.iam_role_policy_attachment3", "iam.tf", "reviewed-override"],
  ["42135c8e-4923-4254-b4c1-b22be65e236b", "aws_iam_role.node_group", "iam.tf", "exact-title"],
  ["6f7256c8-2659-4d8d-865d-796e54991c87", "aws_iam_role_policy_attachment.iam_role_policy_attachment4", "iam.tf", "reviewed-override"],
  ["b99df77b-1e2f-4322-9e97-0b4d91671f96", "aws_iam_role.eks", "iam.tf", "exact-title"],
  ["c5930055-9371-4053-8473-91274baf223e", "aws_iam_role_policy_attachment.iam_role_policy_attachment2", "iam.tf", "reviewed-override"],
  ["cb3135b3-a5b2-4d99-a025-049c131c7ab1", "aws_iam_role_policy_attachment.iam_role_policy_attachment5", "iam.tf", "reviewed-override"],
  ["45cb2eaf-9c40-4235-aa0a-b588cd32fcb4", "aws_internet_gateway.internet_gw", "main.tf", "single-residual"],
  ["7928be85-4122-45f6-b424-fba82256c200", "aws_route_table.rt", "main.tf", "single-residual"],
  ["767c4506-e235-40be-b156-037382cf07a7", "aws_eks_node_group.eks_node_group", "cluster.tf", "single-residual"],
  ["c34dd495-8609-4ac1-9a14-ee10979fd664", "aws_security_group_rule.sg_rule", "main.tf", "single-residual"],
  ["fe650b89-3abf-433e-87d7-612606ec80df", "aws_eks_cluster.main", "cluster.tf", "single-residual"],
  ["228e33c2-8279-40e1-ad69-745eebcae150", "aws_route_table_association.rt_association2", "main.tf", "reviewed-override"],
  ["fa115f68-d3a4-433f-9f23-acba35012866", "aws_route_table_association.rt_association", "main.tf", "reviewed-override"]
] as const satisfies readonly ExpectedResourceMapping[];

test("source registry exposes only the first two captured templates in manifest order", () => {
  const sources = requireSources();

  assert.deepEqual(sources.map(({ id }) => id), [
    "brainboard-training-aws-onboarding",
    "brainboard-aws-kubernetes-native-cnis"
  ]);
  assert.deepEqual(sources.map(({ captureStatus }) => captureStatus), ["captured", "captured"]);
  assert.ok(sources.every(({ description }) => description === null));
});

test("Training fixture preserves normalized source graph and exact Terraform evidence", () => {
  verifyFixture({
    source: requireSources()[0]!,
    rawFileName: "training-aws-onboarding.json",
    rawCaptureSha256: "49ffce945cb51ef5d38a1b94ded4f5dd830805bbd553933d0885b4c58cb77a22",
    nodeCount: 22,
    edgeCount: 15,
    parentRepairs: TRAINING_PARENT_REPAIRS,
    mappings: TRAINING_MAPPINGS
  });
});

test("EKS fixture preserves normalized source graph and exact Terraform evidence", () => {
  verifyFixture({
    source: requireSources()[1]!,
    rawFileName: "aws-kubernetes-native-cnis.json",
    rawCaptureSha256: "f00dae01fe03ce34fae1a6544674caeb1282dee3063bad0e9ccfc8abb6670790",
    nodeCount: 22,
    edgeCount: 14,
    parentRepairs: EKS_PARENT_REPAIRS,
    mappings: EKS_MAPPINGS
  });
});

test("presentation mappings preserve raw types and leave the blank EKS icon unresolved", () => {
  const [training, eks] = requireSources();
  assert.ok(training && eks);

  assert.deepEqual(
    training.nodes.filter(isPresentationNode).map(presentationIdentity),
    [
      ["a9e7e1c4-6179-45d2-b7bc-885e61755ac2", "region", "aws-region", null, "US East (N. Virginia)"],
      ["2c258322-661f-471b-b0e6-85d49fd8e46b", "availability_zone", "aws-availability-zone", null, "us-east-1b"],
      ["dc0a5b25-308f-4bc2-871b-d5083cf2d0e2", "availability_zone", "aws-availability-zone", null, "us-east-1a"],
      ["e663734e-34c4-4211-825d-f7844e11c3e6", "brainboard_icon", "design-internet", null, "Internet"]
    ]
  );
  assert.deepEqual(
    eks.nodes.filter(isPresentationNode).map(presentationIdentity),
    [
      ["839c066c-c756-4005-aeb5-67c1e8c34cf7", "region", "aws-region", null, "US East (N. Virginia)"],
      ["5adb3d4d-2c10-46fe-93f8-691ad10c863a", "availability_zone", "aws-availability-zone", null, "us-east-1a"],
      ["e88227bb-9f4f-4710-87a7-ad9ae751e7c0", "availability_zone", "aws-availability-zone", null, "us-east-1b"],
      ["80d3a744-01c0-4e70-91e9-2186f7cdf201", "brainboard_icon", null, null, " "]
    ]
  );
  const blankIcon = eks.nodes.find(({ sourceNodeId }) => sourceNodeId === "80d3a744-01c0-4e70-91e9-2186f7cdf201");
  assert.ok(blankIcon?.kind === "presentation");
  assert.equal(blankIcon.style, null);
  assert.equal("terraformResourceType" in blankIcon, false);
});

test("Training keeps raw source files but sanitizes only UUID metadata in workspace seeds", () => {
  const training = requireSources()[0]!;
  const raw = readRawCapture("training-aws-onboarding.json");
  const expectedOmissions = new Map([
    ["main.tf", '    archUUID = "db83bcc0-696a-4f64-a6d5-fcc143caf3e2"\n'],
    ["variables.tf", '    archuuid = "d71155af-5339-44f1-ae11-2bcd29411c2d"\n']
  ]);

  for (const sourceFile of training.terraform.files) {
    const rawFile = raw.terraform.files.find(({ fileName }) => fileName === sourceFile.fileName);
    assert.ok(rawFile);
    assert.equal(sourceFile.code, rawFile.code, `${sourceFile.fileName} raw code`);
    assert.equal(sourceFile.sha256, rawFile.sha256, `${sourceFile.fileName} raw SHA`);
    const omittedLine = expectedOmissions.get(sourceFile.fileName);
    const workspaceSeed = sourceFile.workspaceSeed;
    if (omittedLine === undefined) {
      assert.equal(workspaceSeed, undefined, `${sourceFile.fileName} has no rewrite`);
      continue;
    }
    assert.ok(workspaceSeed, `${sourceFile.fileName} has a sanitized seed`);
    assert.equal(sourceFile.code.split(omittedLine).length, 2, `${sourceFile.fileName} exact omission`);
    const expectedCode = sourceFile.code.replace(omittedLine, "");
    assert.equal(workspaceSeed.code, expectedCode);
    assert.equal(workspaceSeed.sha256, sha256(expectedCode));
    assert.deepEqual(workspaceSeed.omissions, [
      {
        reason: "brainboard-architecture-uuid",
        sourceText: omittedLine,
        occurrenceCount: 1
      }
    ]);
  }
});

function verifyFixture({
  source,
  rawFileName,
  rawCaptureSha256,
  nodeCount,
  edgeCount,
  parentRepairs,
  mappings
}: {
  readonly source: BrainboardTemplateSource;
  readonly rawFileName: string;
  readonly rawCaptureSha256: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly parentRepairs: ReadonlyMap<string, string | null>;
  readonly mappings: readonly ExpectedResourceMapping[];
}): void {
  const rawText = readFileSync(new URL(rawFileName, captureDirectory), "utf8");
  const raw = JSON.parse(rawText) as RawCapture;
  assert.equal(sha256(rawText), rawCaptureSha256);
  assert.equal(source.id, raw.id);
  assert.equal(source.title, raw.title);
  assert.equal(source.captureStatus, raw.status);
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
  assert.equal(source.nodes.length, nodeCount);
  assert.equal(source.edges.length, edgeCount);
  assert.equal(source.nodes.filter(({ kind }) => kind === "resource").length, 18);
  assert.equal(source.nodes.filter(({ kind }) => kind === "presentation").length, 4);
  assert.deepEqual(contract.validateBrainboardTemplateSource?.(source), { valid: true, errors: [] });

  assert.deepEqual(
    source.nodes.map((node) => commonNodeProjection(node)),
    raw.nodes.map((node) => ({
      sourceNodeId: node.sourceNodeId,
      domOrder: node.order,
      label: node.title,
      position: node.position,
      size: { width: node.width, height: node.height },
      parentSourceNodeId: parentRepairs.has(node.sourceNodeId)
        ? parentRepairs.get(node.sourceNodeId)!
        : node.parentSourceNodeId,
      zIndex: node.order,
      rawTransform: node.transform,
      rotation: parseRotation(node.transform)
    }))
  );
  assert.deepEqual(
    source.edges,
    raw.edges.map((edge) => ({
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
    }))
  );
  assert.deepEqual(
    source.terraform.files.map(({ fileName, code, sha256: fileSha, includeInWorkspace }) => ({
      fileName,
      code,
      sha256: fileSha,
      includeInWorkspace
    })),
    raw.terraform.files.map(({ fileName, code, sha256: fileSha, includeInWorkspace }) => ({
      fileName,
      code,
      sha256: fileSha,
      includeInWorkspace
    }))
  );
  assert.deepEqual(source.terraform.resourceAddresses, raw.terraform.resourceAddresses);
  assert.deepEqual(
    source.nodes.filter(isResourceNode).map((node) => [
      node.sourceNodeId,
      resourceAddress(node),
      node.fileName,
      node.addressMapping
    ]),
    mappings
  );
  assert.ok(
    source.nodes.filter(isResourceNode).every((node) =>
      node.valuesResolution === "source-file-authoritative/unresolved" && !("values" in node)
    )
  );
  assert.equal(new Set(mappings.map(([, address]) => address)).size, 18);
  assert.deepEqual(new Set(mappings.map(([, address]) => address)), new Set(raw.terraform.resourceAddresses));
  assert.ok(source.nodes.filter(isPresentationNode).every(({ aliasOf }) => aliasOf === null));
  assert.deepEqual(findParentCycles(source.nodes), []);
}

function requireSources(): readonly BrainboardTemplateSource[] {
  assert.ok(contract.brainboardTemplateSources, "brainboardTemplateSources must be exported");
  assert.equal(typeof contract.validateBrainboardTemplateSource, "function");
  return contract.brainboardTemplateSources;
}

function readRawCapture(fileName: string): RawCapture {
  return JSON.parse(readFileSync(new URL(fileName, captureDirectory), "utf8")) as RawCapture;
}

function commonNodeProjection(node: BrainboardSourceNode) {
  const {
    sourceNodeId,
    domOrder,
    label,
    position,
    size,
    parentSourceNodeId,
    zIndex,
    rawTransform,
    rotation
  } = node;
  return {
    sourceNodeId,
    domOrder,
    label,
    position,
    size,
    parentSourceNodeId,
    zIndex,
    rawTransform,
    rotation
  };
}

function isResourceNode(node: BrainboardSourceNode): node is Extract<BrainboardSourceNode, { kind: "resource" }> {
  return node.kind === "resource";
}

function isPresentationNode(node: BrainboardSourceNode): node is Extract<BrainboardSourceNode, { kind: "presentation" }> {
  return node.kind === "presentation";
}

function presentationIdentity(node: Extract<BrainboardSourceNode, { kind: "presentation" }>) {
  return [node.sourceNodeId, node.rawResourceType, node.catalogId, node.aliasOf, node.label];
}

function resourceAddress(node: Extract<BrainboardSourceNode, { kind: "resource" }>): string {
  return `${node.terraformBlockType === "data" ? "data." : ""}${node.terraformResourceType}.${node.resourceName}`;
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
  if (center.x === edge.targetPoint.x && center.y === edge.targetPoint.y) return "source-to-target";
  return "target-to-source";
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
      current = current.parentSourceNodeId === null
        ? undefined
        : nodesById.get(current.parentSourceNodeId);
    }
  }
  return cycles;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
