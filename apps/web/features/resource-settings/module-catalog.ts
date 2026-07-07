import type {
  DiagramJson,
  DiagramNode,
  DiagramVariable,
  DiagramVariableBinding,
  ResourceItem
} from "../../../../packages/types/src";
import { createDiagramNodeFromPayload } from "../diagram-editor/diagram-utils";

export type CuratedModuleProvider = "aws" | "azure" | "gcp";
export type CuratedModuleCategory =
  | "compute"
  | "network"
  | "storage"
  | "database"
  | "security-identity";

type CuratedModuleResource = {
  readonly resourceItemId: string;
  readonly resourceName: string;
  readonly offset: DiagramNode["position"];
  readonly values: (names: Record<string, string>) => Record<string, unknown>;
  readonly variableBindings?: readonly {
    readonly name: string;
    readonly parameterKey: string;
  }[] | undefined;
};

export type CuratedModuleDefinition = {
  readonly id: string;
  readonly name: string;
  readonly provider: CuratedModuleProvider;
  readonly category: CuratedModuleCategory;
  readonly version: string;
  readonly description: string;
  readonly resources: readonly CuratedModuleResource[];
  readonly variables: readonly Omit<DiagramVariable, "bindings" | "id" | "source">[];
};

export const curatedModules: readonly CuratedModuleDefinition[] = [
  {
    id: "aws-network-vpc",
    name: "VPC network",
    provider: "aws",
    category: "network",
    version: "1.0.0",
    description: "VPC, public subnet, and internet gateway baseline.",
    variables: [createTagsVariable()],
    resources: [
      {
        resourceItemId: "aws-vpc",
        resourceName: "module_vpc",
        offset: { x: 0, y: 0 },
        values: () => ({
          cidrBlock: "10.0.0.0/16",
          tags: "var.tags"
        }),
        variableBindings: [{ name: "tags", parameterKey: "tags" }]
      },
      {
        resourceItemId: "aws-subnet",
        resourceName: "module_public_subnet",
        offset: { x: 280, y: 24 },
        values: (names) => ({
          cidrBlock: "10.0.1.0/24",
          vpcId: `aws_vpc.${names.module_vpc}.id`,
          tags: "var.tags"
        }),
        variableBindings: [{ name: "tags", parameterKey: "tags" }]
      },
      {
        resourceItemId: "aws-internet-gateway",
        resourceName: "module_igw",
        offset: { x: 520, y: 52 },
        values: (names) => ({
          vpcId: `aws_vpc.${names.module_vpc}.id`,
          tags: "var.tags"
        }),
        variableBindings: [{ name: "tags", parameterKey: "tags" }]
      }
    ]
  },
  {
    id: "aws-compute-ec2",
    name: "EC2 app host",
    provider: "aws",
    category: "compute",
    version: "1.0.0",
    description: "A small EC2 host with a security group boundary.",
    variables: [createTagsVariable(), { name: "ami_id", type: "string", value: "ami-1234567890abcdef0" }],
    resources: [
      {
        resourceItemId: "aws-vpc",
        resourceName: "module_compute_vpc",
        offset: { x: 0, y: 0 },
        values: () => ({ cidrBlock: "10.20.0.0/16", tags: "var.tags" }),
        variableBindings: [{ name: "tags", parameterKey: "tags" }]
      },
      {
        resourceItemId: "aws-security-group",
        resourceName: "module_app_sg",
        offset: { x: 300, y: 28 },
        values: (names) => ({
          description: "Application ingress boundary",
          name: "module-app-sg",
          vpcId: `aws_vpc.${names.module_compute_vpc}.id`,
          tags: "var.tags"
        }),
        variableBindings: [{ name: "tags", parameterKey: "tags" }]
      },
      {
        resourceItemId: "aws-ec2-instance",
        resourceName: "module_app_instance",
        offset: { x: 560, y: 48 },
        values: (names) => ({
          ami: "var.ami_id",
          instanceType: "t3.micro",
          vpcSecurityGroupIds: [`aws_security_group.${names.module_app_sg}.id`],
          tags: "var.tags"
        }),
        variableBindings: [
          { name: "ami_id", parameterKey: "ami" },
          { name: "tags", parameterKey: "tags" }
        ]
      }
    ]
  },
  {
    id: "aws-storage-s3",
    name: "S3 storage",
    provider: "aws",
    category: "storage",
    version: "1.0.0",
    description: "Private S3 bucket baseline with shared tags.",
    variables: [createTagsVariable(), { name: "bucket_name", type: "string", value: "sketchcatch-module-bucket" }],
    resources: [
      {
        resourceItemId: "aws-s3-bucket",
        resourceName: "module_bucket",
        offset: { x: 0, y: 0 },
        values: () => ({
          bucket: "var.bucket_name",
          tags: "var.tags"
        }),
        variableBindings: [
          { name: "bucket_name", parameterKey: "bucket" },
          { name: "tags", parameterKey: "tags" }
        ]
      }
    ]
  },
  {
    id: "aws-database-table",
    name: "DynamoDB table",
    provider: "aws",
    category: "database",
    version: "1.0.0",
    description: "Serverless key-value table starter.",
    variables: [createTagsVariable(), { name: "table_name", type: "string", value: "sketchcatch-module-table" }],
    resources: [
      {
        resourceItemId: "aws-dynamodb-table",
        resourceName: "module_table",
        offset: { x: 0, y: 0 },
        values: () => ({
          name: "var.table_name",
          billingMode: "PAY_PER_REQUEST",
          hashKey: "id",
          attribute: [{ name: "id", type: "S" }],
          tags: "var.tags"
        }),
        variableBindings: [
          { name: "table_name", parameterKey: "name" },
          { name: "tags", parameterKey: "tags" }
        ]
      }
    ]
  },
  {
    id: "aws-security-boundary",
    name: "Security boundary",
    provider: "aws",
    category: "security-identity",
    version: "1.0.0",
    description: "VPC plus security group starter.",
    variables: [createTagsVariable()],
    resources: [
      {
        resourceItemId: "aws-vpc",
        resourceName: "module_security_vpc",
        offset: { x: 0, y: 0 },
        values: () => ({ cidrBlock: "10.30.0.0/16", tags: "var.tags" }),
        variableBindings: [{ name: "tags", parameterKey: "tags" }]
      },
      {
        resourceItemId: "aws-security-group",
        resourceName: "module_security_group",
        offset: { x: 300, y: 28 },
        values: (names) => ({
          description: "Least-privilege starter security group",
          name: "module-security-group",
          vpcId: `aws_vpc.${names.module_security_vpc}.id`,
          tags: "var.tags"
        }),
        variableBindings: [{ name: "tags", parameterKey: "tags" }]
      }
    ]
  }
];

export function expandCuratedModuleIntoDiagram(input: {
  readonly diagram: DiagramJson;
  readonly moduleId: string;
  readonly resources: readonly ResourceItem[];
}): DiagramJson {
  const moduleDefinition = curatedModules.find((module) => module.id === input.moduleId);

  if (!moduleDefinition || moduleDefinition.provider !== "aws") {
    return input.diagram;
  }

  const resourceItemsById = new Map(input.resources.map((resource) => [resource.id, resource]));
  const expandedAt = new Date().toISOString();
  const basePosition = getNextModulePosition(input.diagram.nodes);
  const usedNames = getUsedResourceNames(input.diagram.nodes);
  const names: Record<string, string> = {};

  for (const moduleResource of moduleDefinition.resources) {
    names[moduleResource.resourceName] = createUniqueResourceName(moduleResource.resourceName, usedNames);
  }

  const nextNodes: DiagramNode[] = [];

  for (const [index, moduleResource] of moduleDefinition.resources.entries()) {
    const resourceItem = resourceItemsById.get(moduleResource.resourceItemId);

    if (!resourceItem) {
      continue;
    }

    const node = createDiagramNodeFromPayload(
      { source: "resource-settings-panel", item: resourceItem },
      {
        x: basePosition.x + moduleResource.offset.x,
        y: basePosition.y + moduleResource.offset.y
      },
      getNextZIndex(input.diagram.nodes, nextNodes, index),
      [...input.diagram.nodes, ...nextNodes]
    );
    const resourceName = names[moduleResource.resourceName] ?? moduleResource.resourceName;
    const values = moduleResource.values(names);

    nextNodes.push({
      ...node,
      metadata: {
        ...node.metadata,
        moduleSource: {
          expandedAt,
          moduleId: moduleDefinition.id,
          moduleVersion: moduleDefinition.version
        }
      },
      parameters: node.parameters
        ? {
            ...node.parameters,
            resourceName,
            values
          }
        : node.parameters
    });
  }

  return {
    ...input.diagram,
    nodes: [...input.diagram.nodes, ...nextNodes],
    variables: mergeModuleVariables({
      currentVariables: input.diagram.variables ?? [],
      moduleDefinition,
      nodes: nextNodes
    })
  };
}

function mergeModuleVariables(input: {
  readonly currentVariables: readonly DiagramVariable[];
  readonly moduleDefinition: CuratedModuleDefinition;
  readonly nodes: readonly DiagramNode[];
}): DiagramVariable[] {
  const variablesByName = new Map(input.currentVariables.map((variable) => [variable.name, variable]));

  for (const moduleVariable of input.moduleDefinition.variables) {
    const bindings = getModuleVariableBindings(input.moduleDefinition, input.nodes, moduleVariable.name);
    const currentVariable = variablesByName.get(moduleVariable.name);

    variablesByName.set(
      moduleVariable.name,
      currentVariable
        ? {
            ...currentVariable,
            bindings: mergeVariableBindings(currentVariable.bindings, bindings)
          }
        : {
            ...moduleVariable,
            bindings,
            id: createVariableId(moduleVariable.name),
            source: "module"
          }
    );
  }

  return Array.from(variablesByName.values());
}

function getModuleVariableBindings(
  moduleDefinition: CuratedModuleDefinition,
  nodes: readonly DiagramNode[],
  variableName: string
): DiagramVariableBinding[] {
  return moduleDefinition.resources.flatMap((resource, index) =>
    (resource.variableBindings ?? [])
      .filter((binding) => binding.name === variableName)
      .map((binding) => ({
        nodeId: nodes[index]?.id ?? "",
        parameterKey: binding.parameterKey
      }))
      .filter((binding) => binding.nodeId.length > 0)
  );
}

function mergeVariableBindings(
  currentBindings: readonly DiagramVariableBinding[],
  nextBindings: readonly DiagramVariableBinding[]
): DiagramVariableBinding[] {
  const merged = new Map(currentBindings.map((binding) => [`${binding.nodeId}:${binding.parameterKey}`, binding]));

  for (const binding of nextBindings) {
    merged.set(`${binding.nodeId}:${binding.parameterKey}`, binding);
  }

  return Array.from(merged.values());
}

function createTagsVariable(): Omit<DiagramVariable, "bindings" | "id" | "source"> {
  return {
    name: "tags",
    type: "map(string)",
    value: {
      ManagedBy: "SketchCatch",
      Environment: "practice"
    }
  };
}

function getNextModulePosition(nodes: readonly DiagramNode[]): DiagramNode["position"] {
  if (nodes.length === 0) {
    return { x: 120, y: 120 };
  }

  const rightMost = Math.max(...nodes.map((node) => node.position.x + node.size.width));

  return {
    x: rightMost + 96,
    y: 120
  };
}

function getUsedResourceNames(nodes: readonly DiagramNode[]): Set<string> {
  return new Set(
    nodes
      .map((node) => node.parameters?.resourceName)
      .filter((name): name is string => Boolean(name))
  );
}

function createUniqueResourceName(baseName: string, usedNames: Set<string>): string {
  let candidateName = baseName;
  let suffix = 2;

  while (usedNames.has(candidateName)) {
    candidateName = `${baseName}_${suffix}`;
    suffix += 1;
  }

  usedNames.add(candidateName);
  return candidateName;
}

function getNextZIndex(
  currentNodes: readonly DiagramNode[],
  nextNodes: readonly DiagramNode[],
  offset: number
): number {
  return Math.max(0, ...currentNodes.map((node) => node.zIndex), ...nextNodes.map((node) => node.zIndex)) + offset + 1;
}

function createVariableId(name: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `var-${name}-${crypto.randomUUID()}`;
  }

  return `var-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
