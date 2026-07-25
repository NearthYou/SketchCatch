import { isDeepStrictEqual } from "node:util";
import type {
  ArchitectureJson,
  DiagramJson,
  DiagramNode,
  ResourceNode
} from "@sketchcatch/types";
import {
  containsAwsArn,
  createAwsPublicDisplayName,
  createAwsPublicProviderResourceId,
  createAwsPublicResourceConfig
} from "./aws-provider-adapter.js";

type AwsProjectNodeIdentity = {
  readonly privateNodeId: string;
  readonly providerResourceId: string;
  readonly providerResourceType: string;
  readonly publicNodeId: string;
  readonly publicProviderResourceId: string;
};

const REVERSE_ENGINEERING_SOURCE_KEYS = [
  "reverseEngineeringSourceScanId",
  "reverseEngineeringDraftId",
  "reverseEngineeringSourceKind"
] as const;

const PROVIDER_TYPE_BY_ARCHITECTURE_TYPE: Readonly<Record<string, string>> = {
  IAM_INSTANCE_PROFILE: "AWS::IAM::InstanceProfile",
  IAM_POLICY: "AWS::IAM::Policy",
  IAM_ROLE: "AWS::IAM::Role",
  LAMBDA: "AWS::Lambda::Function",
  LAMBDA_PERMISSION: "AWS::Lambda::Permission"
};

/**
 * DB의 과거 Snapshot은 그대로 두고 Project detail 응답의 AWS Reverse Engineering node만
 * 현재 공개 경계로 복사합니다. 일반 node는 source/import marker가 없으면 손대지 않습니다.
 */
export function sanitizeAwsProjectArchitectureRead(
  architectureJson: ArchitectureJson,
  options: { readonly source?: string | undefined } = {}
): ArchitectureJson {
  const identities = architectureJson.nodes.flatMap((node) => {
    if (!isAwsReverseArchitectureNode(node, options.source)) {
      return [];
    }

    return [createArchitectureNodeIdentity(node)];
  });
  const referenceMap = createPublicReferenceMap(identities);
  const identityByNodeId = new Map(identities.map((identity) => [identity.privateNodeId, identity]));
  const nodes = architectureJson.nodes.map((node) => {
    const identity = identityByNodeId.get(node.id);

    return identity
      ? sanitizeArchitectureNode(node, identity, referenceMap)
      : node;
  });
  const edges = architectureJson.edges.map((edge) => {
    const publicEdge = {
      ...edge,
      id: rewriteStructuredReference(edge.id, referenceMap, "AWS::Project::Edge", "edge"),
      sourceId: referenceMap.get(edge.sourceId) ?? edge.sourceId,
      targetId: referenceMap.get(edge.targetId) ?? edge.targetId,
      ...(edge.label && containsAwsArn(edge.label) ? { label: "AWS Resource 관계" } : {})
    };

    return isDeepStrictEqual(publicEdge, edge) ? edge : publicEdge;
  });

  return nodes.every((node, index) => node === architectureJson.nodes[index]) &&
    edges.every((edge, index) => edge === architectureJson.edges[index])
    ? architectureJson
    : { ...architectureJson, nodes, edges };
}

/**
 * ProjectDraft GET의 공개 복사본만 정리합니다. marker 없는 일반 Board node의 값과 배치는
 * 보존하며, 변경된 AWS node를 가리키는 edge/variable reference만 함께 다시 연결합니다.
 */
export function sanitizeAwsProjectDiagramRead(diagramJson: DiagramJson): DiagramJson {
  const identities = diagramJson.nodes.flatMap((node) => {
    if (!isAwsReverseDiagramNode(node)) {
      return [];
    }

    return [createDiagramNodeIdentity(node)];
  });
  const referenceMap = createPublicReferenceMap(identities);
  const identityByNodeId = new Map(identities.map((identity) => [identity.privateNodeId, identity]));
  const nodes = diagramJson.nodes.map((node) => {
    const identity = identityByNodeId.get(node.id);
    const sanitizedNode = identity
      ? sanitizeDiagramNode(node, identity, referenceMap)
      : node;
    const publicParentAreaNodeId = sanitizedNode.metadata?.parentAreaNodeId
      ? referenceMap.get(sanitizedNode.metadata.parentAreaNodeId) ??
        sanitizedNode.metadata.parentAreaNodeId
      : undefined;

    if (
      publicParentAreaNodeId === undefined ||
      publicParentAreaNodeId === sanitizedNode.metadata?.parentAreaNodeId
    ) {
      return sanitizedNode;
    }

    return {
      ...sanitizedNode,
      metadata: {
        ...sanitizedNode.metadata,
        parentAreaNodeId: publicParentAreaNodeId
      }
    };
  });
  const edges = diagramJson.edges.map((edge) => {
    const publicEdge = {
      ...edge,
      id: rewriteStructuredReference(edge.id, referenceMap, "AWS::Project::DiagramEdge", "edge"),
      sourceNodeId: referenceMap.get(edge.sourceNodeId) ?? edge.sourceNodeId,
      targetNodeId: referenceMap.get(edge.targetNodeId) ?? edge.targetNodeId,
      ...(edge.label && containsAwsArn(edge.label) ? { label: "AWS Resource 관계" } : {})
    };

    return isDeepStrictEqual(publicEdge, edge) ? edge : publicEdge;
  });
  const variables = diagramJson.variables?.map((variable) => {
    const bindings = variable.bindings.map((binding) => {
      const publicNodeId = referenceMap.get(binding.nodeId) ?? binding.nodeId;

      return publicNodeId === binding.nodeId ? binding : { ...binding, nodeId: publicNodeId };
    });

    return bindings.every((binding, index) => binding === variable.bindings[index])
      ? variable
      : { ...variable, bindings };
  });
  const variablesUnchanged =
    variables === undefined ||
    variables.every((variable, index) => variable === diagramJson.variables?.[index]);

  return nodes.every((node, index) => node === diagramJson.nodes[index]) &&
    edges.every((edge, index) => edge === diagramJson.edges[index]) &&
    variablesUnchanged
    ? diagramJson
    : {
        ...diagramJson,
        nodes,
        edges,
        ...(variables ? { variables } : {})
      };
}

function sanitizeArchitectureNode(
  node: ResourceNode,
  identity: AwsProjectNodeIdentity,
  referenceMap: ReadonlyMap<string, string>
): ResourceNode {
  const publicConfig = createPublicProjectConfig(node.config, identity, referenceMap);
  const publicNode = {
    ...node,
    id: identity.publicNodeId,
    label: node.label
      ? createAwsPublicDisplayName(identity, node.label)
      : node.label,
    config: publicConfig
  };

  return isDeepStrictEqual(publicNode, node) ? node : publicNode;
}

function sanitizeDiagramNode(
  node: DiagramNode,
  identity: AwsProjectNodeIdentity,
  referenceMap: ReadonlyMap<string, string>
): DiagramNode {
  const parameters = node.parameters;
  const publicParameters = parameters
    ? {
        ...parameters,
        resourceName: rewriteTerraformResourceName(parameters.resourceName, referenceMap),
        values: createPublicProjectConfig(parameters.values, identity, referenceMap)
      }
    : parameters;
  const publicNode = {
    ...node,
    id: identity.publicNodeId,
    label: createAwsPublicDisplayName(identity, node.label),
    ...(publicParameters ? { parameters: publicParameters } : {})
  };

  return isDeepStrictEqual(publicNode, node) ? node : publicNode;
}

function createPublicProjectConfig(
  config: Record<string, unknown>,
  identity: AwsProjectNodeIdentity,
  referenceMap: ReadonlyMap<string, string>
): Record<string, unknown> {
  const publicConfig = createAwsPublicResourceConfig({
    providerResourceType: identity.providerResourceType,
    config
  });
  const sourceFields = Object.fromEntries(
    REVERSE_ENGINEERING_SOURCE_KEYS.flatMap((key) => {
      const value = config[key];

      return typeof value === "string" && value.length > 0
        ? [[key, rewriteStructuredReference(value, referenceMap, "AWS::Project::Source", key)]]
        : [];
    })
  );

  return {
    ...publicConfig,
    ...sourceFields,
    providerResourceType: identity.providerResourceType,
    providerResourceId: identity.publicProviderResourceId,
    ...(typeof config["analysisExcluded"] === "boolean"
      ? { analysisExcluded: config["analysisExcluded"] }
      : {})
  };
}

function createArchitectureNodeIdentity(node: ResourceNode): AwsProjectNodeIdentity {
  const providerResourceType =
    readNonEmptyString(node.config["providerResourceType"]) ??
    PROVIDER_TYPE_BY_ARCHITECTURE_TYPE[node.type] ??
    `AWS::${node.type}`;
  const providerResourceId =
    readNonEmptyString(node.config["providerResourceId"]) ??
    (node.label && containsAwsArn(node.label) ? node.label : node.id);

  return createProjectNodeIdentity(node.id, providerResourceType, providerResourceId);
}

function createDiagramNodeIdentity(node: DiagramNode): AwsProjectNodeIdentity {
  const values = node.parameters?.values ?? {};
  const providerResourceType =
    readNonEmptyString(values["providerResourceType"]) ?? inferDiagramProviderResourceType(node);
  const providerResourceId =
    readNonEmptyString(values["providerResourceId"]) ??
    (containsAwsArn(node.label) ? node.label : node.id);

  return createProjectNodeIdentity(node.id, providerResourceType, providerResourceId);
}

function createProjectNodeIdentity(
  privateNodeId: string,
  providerResourceType: string,
  providerResourceId: string
): AwsProjectNodeIdentity {
  const publicProviderResourceId = createAwsPublicProviderResourceId({
    providerResourceType,
    providerResourceId
  });
  const publicNodeId =
    publicProviderResourceId !== providerResourceId
      ? `resource-${publicProviderResourceId}`
      : containsAwsArn(privateNodeId)
        ? `resource-${createAwsPublicProviderResourceId({
            providerResourceType,
            providerResourceId: privateNodeId
          })}`
        : privateNodeId;

  return {
    privateNodeId,
    providerResourceId,
    providerResourceType,
    publicNodeId,
    publicProviderResourceId
  };
}

function createPublicReferenceMap(
  identities: readonly AwsProjectNodeIdentity[]
): ReadonlyMap<string, string> {
  const referenceMap = new Map<string, string>();

  for (const identity of identities) {
    referenceMap.set(identity.privateNodeId, identity.publicNodeId);
    referenceMap.set(identity.providerResourceId, identity.publicNodeId);
    referenceMap.set(
      toTerraformIdentifier(identity.privateNodeId),
      toTerraformIdentifier(identity.publicNodeId)
    );
  }

  return referenceMap;
}

function rewriteStructuredReference(
  value: string,
  referenceMap: ReadonlyMap<string, string>,
  providerResourceType: string,
  prefix: string
): string {
  let publicValue = value;

  for (const [privateReference, publicReference] of [...referenceMap.entries()].sort(
    ([left], [right]) => right.length - left.length
  )) {
    if (privateReference.length > 0 && privateReference !== publicReference) {
      publicValue = publicValue.replaceAll(privateReference, publicReference);
    }
  }

  return containsAwsArn(publicValue)
    ? `${prefix}-${createAwsPublicProviderResourceId({
        providerResourceType,
        providerResourceId: publicValue
      })}`
    : publicValue;
}

function rewriteTerraformResourceName(
  value: string,
  referenceMap: ReadonlyMap<string, string>
): string {
  let publicValue = value;

  for (const [privateReference, publicReference] of referenceMap) {
    const privateTerraformReference = toTerraformIdentifier(privateReference);
    const publicTerraformReference = toTerraformIdentifier(publicReference);

    if (privateTerraformReference && privateTerraformReference !== publicTerraformReference) {
      publicValue = publicValue.replaceAll(privateTerraformReference, publicTerraformReference);
    }
  }

  return publicValue;
}

function isAwsReverseArchitectureNode(node: ResourceNode, architectureSource?: string): boolean {
  if (hasReverseEngineeringSource(node.config)) {
    return true;
  }

  if (architectureSource !== "imported") {
    return false;
  }

  const providerResourceType = readNonEmptyString(node.config["providerResourceType"]);
  const providerResourceId = readNonEmptyString(node.config["providerResourceId"]);

  return (
    providerResourceType?.startsWith("AWS::") === true ||
    (providerResourceId !== undefined && containsAwsArn(providerResourceId)) ||
    (node.label !== undefined && containsAwsArn(node.label)) ||
    node.id.startsWith("resource-arn-aws-")
  );
}

function isAwsReverseDiagramNode(node: DiagramNode): boolean {
  if (node.metadata?.reverseEngineering?.source === "aws_scan") {
    return true;
  }

  const values = node.parameters?.values;
  if (!values) {
    return false;
  }

  if (hasReverseEngineeringSource(values)) {
    return true;
  }

  const providerResourceType = readNonEmptyString(values["providerResourceType"]);
  const providerResourceId = readNonEmptyString(values["providerResourceId"]);

  return (
    providerResourceType?.startsWith("AWS::") === true &&
    ((providerResourceId !== undefined && containsAwsArn(providerResourceId)) ||
      node.id.startsWith("resource-arn-aws-"))
  );
}

function hasReverseEngineeringSource(config: Record<string, unknown>): boolean {
  return REVERSE_ENGINEERING_SOURCE_KEYS.some(
    (key) => typeof config[key] === "string" && String(config[key]).length > 0
  );
}

function inferDiagramProviderResourceType(node: DiagramNode): string {
  const providerTypesByTerraformType: Readonly<Record<string, string>> = {
    aws_iam_instance_profile: "AWS::IAM::InstanceProfile",
    aws_iam_policy: "AWS::IAM::Policy",
    aws_iam_role: "AWS::IAM::Role",
    aws_lambda_function: "AWS::Lambda::Function",
    aws_lambda_permission: "AWS::Lambda::Permission"
  };

  return providerTypesByTerraformType[node.parameters?.resourceType ?? node.type] ??
    "AWS::Unknown::Resource";
}

function toTerraformIdentifier(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
