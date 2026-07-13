import type {
  InfrastructureGraph,
  InfrastructureGraphNode,
  TerraformBlockType
} from "@sketchcatch/types";
import { isSupportedTerraformFunctionExpression } from "./terraform-function-expressions.js";
import {
  isGenericTerraformNestedBlock,
  isTerraformNestedBlockAttribute
} from "./terraform-nested-blocks.js";

const DEFAULT_TERRAFORM_BLOCK_TYPE: TerraformBlockType = "resource";
const INDENT_UNIT = "  ";
export const TERRAFORM_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
const TERRAFORM_REFERENCE_PATTERN =
  /^(?:var|local|each|count|path|terraform)\.[a-zA-Z_][a-zA-Z0-9_]*$|^module\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$|^(?:aws|kubernetes)_[a-zA-Z0-9_]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$|^data\.[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$/;
const TERRAFORM_RESOURCE_ADDRESS_PATTERN =
  /^(?:(?:aws|kubernetes)_[a-zA-Z0-9_]+\.[a-zA-Z0-9_-]+|module\.[a-zA-Z0-9_-]+)$/;

export class TerraformDiagramValidationError extends Error {
  readonly reason = "invalid_identifier";

  constructor(label: string, value: string) {
    super(`Invalid Terraform ${label}: ${value}`);
    this.name = "TerraformDiagramValidationError";
  }
}

export function renderTerraformFromInfrastructureGraph(graph: InfrastructureGraph): string {
  const resourceBlocks = graph.nodes.flatMap((node) => [
    renderBlock(node),
    ...renderCompanionBlocks(node)
  ]);

  return [...resourceBlocks, ...renderLiveObservationOutputs(graph)].join("\n\n");
}

function renderCompanionBlocks(node: InfrastructureGraphNode): string[] {
  return hasInlineLambdaSource(node) ? [renderInlineLambdaArchive(node)] : [];
}

function createRenderableResourceConfig(node: InfrastructureGraphNode): Record<string, unknown> {
  const config = { ...node.config };
  if (!hasInlineLambdaSource(node)) return config;

  delete config["inlineSource"];
  const archiveAddress = `data.archive_file.${node.iac.resourceName}_bundle`;
  config["filename"] = `${archiveAddress}.output_path`;
  config["sourceCodeHash"] = `${archiveAddress}.output_base64sha256`;
  return config;
}

function hasInlineLambdaSource(node: InfrastructureGraphNode): boolean {
  return node.iac.resourceType === "aws_lambda_function" &&
    typeof node.config["inlineSource"] === "string" &&
    node.config["inlineSource"].length > 0;
}

function renderInlineLambdaArchive(node: InfrastructureGraphNode): string {
  const source = node.config["inlineSource"];
  if (typeof source !== "string") return "";
  const archiveName = `${node.iac.resourceName}_bundle`;
  return [
    `data "archive_file" "${archiveName}" {`,
    `${INDENT_UNIT}type = "zip"`,
    `${INDENT_UNIT}source_content = ${JSON.stringify(source)}`,
    `${INDENT_UNIT}source_content_filename = "index.mjs"`,
    `${INDENT_UNIT}output_path = "\${path.module}/${archiveName}.zip"`,
    "}"
  ].join("\n");
}

function renderLiveObservationOutputs(graph: InfrastructureGraph): string[] {
  const topology = resolveLiveObservationTopology(graph);
  if (!topology) return [];

  const { loadBalancer, targetGroup, trafficRecord } = topology;
  const loadBalancerAddress = `aws_lb.${loadBalancer.iac.resourceName}`;
  const targetGroupAddress = `aws_lb_target_group.${targetGroup.iac.resourceName}`;
  const trafficRecordAddress = `aws_route53_record.${trafficRecord.iac.resourceName}`;
  const commonOutputs = [
    renderOutput("traffic_url", `"https://\${${trafficRecordAddress}.name}/traffic"`),
    renderOutput("traffic_hostname", `${trafficRecordAddress}.name`),
    renderOutput("load_balancer_dns_name", `${loadBalancerAddress}.dns_name`),
    renderOutput("load_balancer_arn", `${loadBalancerAddress}.arn`),
    renderOutput("target_group_arn", `${targetGroupAddress}.arn`),
    ...renderLiveObservationLogGroupOutputs(topology.logGroups)
  ];

  if (topology.capacity.kind === "asg") {
    const { autoScalingGroup, alarm } = topology.capacity;
    const autoScalingGroupAddress = `aws_autoscaling_group.${autoScalingGroup.iac.resourceName}`;

    return [
      ...commonOutputs,
      renderOutput("asg_name", `${autoScalingGroupAddress}.name`),
      renderOutput("scale_out_threshold", String(alarm.config["threshold"]))
    ];
  }

  const { ecsCluster, ecsService, applicationScalingTarget } = topology.capacity;
  const maxCapacity = applicationScalingTarget.config["maxCapacity"] as number;

  const ecsClusterAddress = `aws_ecs_cluster.${ecsCluster.iac.resourceName}`;
  const ecsServiceAddress = `aws_ecs_service.${ecsService.iac.resourceName}`;

  const requestThreshold = findAlbRequestCountTargetValue(
    graph,
    loadBalancerAddress,
    targetGroupAddress,
    applicationScalingTarget
  );

  return [
    ...commonOutputs,
    renderOutput("ecs_cluster_name", `${ecsClusterAddress}.name`),
    renderOutput("ecs_service_name", `${ecsServiceAddress}.name`),
    renderOutput("max_capacity", String(maxCapacity)),
    ...(requestThreshold === null
      ? []
      : [renderOutput("scale_out_threshold", String(requestThreshold))])
  ];
}

type LiveObservationTopology = {
  loadBalancer: InfrastructureGraphNode;
  targetGroup: InfrastructureGraphNode;
  trafficRecord: InfrastructureGraphNode;
  logGroups: InfrastructureGraphNode[];
  capacity:
    | {
        kind: "asg";
        autoScalingGroup: InfrastructureGraphNode;
        alarm: InfrastructureGraphNode;
      }
    | {
        kind: "ecs_fargate";
        ecsCluster: InfrastructureGraphNode;
        ecsService: InfrastructureGraphNode;
        applicationScalingTarget: InfrastructureGraphNode;
      };
};

type RuntimeCandidate =
  | { kind: "asg"; node: InfrastructureGraphNode }
  | { kind: "ecs_fargate"; node: InfrastructureGraphNode };

function resolveLiveObservationTopology(
  graph: InfrastructureGraph
): LiveObservationTopology | null {
  const topologies: LiveObservationTopology[] = [];
  for (const listener of resourceNodes(graph, "aws_lb_listener")) {
    if (listener.config["protocol"] !== "HTTPS" || listener.config["port"] !== 443) {
      continue;
    }

    const loadBalancer = findUniqueReferencedNode(
      graph,
      listener.config["loadBalancerArn"],
      "aws_lb",
      ["arn"]
    );
    const certificate = findUniqueReferencedNode(
      graph,
      listener.config["certificateArn"],
      "aws_acm_certificate",
      ["arn"]
    );
    if (!loadBalancer || !certificate) continue;

    const targetGroupReferences = forwardTargetGroupReferences(listener);
    if (targetGroupReferences.length !== 1) continue;
    const targetGroup = findUniqueReferencedNode(
      graph,
      targetGroupReferences[0],
      "aws_lb_target_group",
      ["arn"]
    );
    if (!targetGroup) continue;
    const trafficRecords = findValidatedTrafficRecords(
      graph,
      terraformAddress(loadBalancer),
      certificate
    );
    if (trafficRecords.length !== 1) continue;

    const runtime = resolveRuntimeTopology(graph, targetGroup);
    if (!runtime) continue;
    topologies.push({
      loadBalancer,
      targetGroup,
      trafficRecord: trafficRecords[0]!,
      logGroups: runtime.logGroups,
      capacity: runtime.capacity
    });
  }

  return topologies.length === 1 ? topologies[0]! : null;
}

function resolveRuntimeTopology(
  graph: InfrastructureGraph,
  targetGroup: InfrastructureGraphNode
): Pick<LiveObservationTopology, "capacity" | "logGroups"> | null {
  const runtimes: RuntimeCandidate[] = [
    ...resourceNodes(graph, "aws_autoscaling_group").map(
      (node): RuntimeCandidate => ({ kind: "asg", node })
    ),
    ...resourceNodes(graph, "aws_ecs_service").map(
      (node): RuntimeCandidate => ({ kind: "ecs_fargate", node })
    )
  ];
  const targetGroupAddress = terraformAddress(targetGroup);
  const attached = runtimes.filter((runtime) =>
    runtimeReferencesTargetGroup(graph, runtime, targetGroup, targetGroupAddress)
  );

  let selected: RuntimeCandidate;
  let legacySingleRuntime = false;
  if (attached.length === 1) {
    selected = attached[0]!;
  } else if (
    attached.length === 0 &&
    runtimes.length === 1 &&
    resourceNodes(graph, "aws_lb").length === 1 &&
    resourceNodes(graph, "aws_lb_target_group").length === 1 &&
    !runtimeHasAnotherTargetGroupLink(graph, runtimes[0]!)
  ) {
    selected = runtimes[0]!;
    legacySingleRuntime = true;
  } else {
    return null;
  }

  const logGroups = resolveRuntimeLogGroups(graph, selected, legacySingleRuntime);
  if (logGroups === null) return null;

  if (selected.kind === "asg") {
    const alarm = resolveAsgPressureAlarm(graph, selected.node, legacySingleRuntime);
    if (!alarm) return null;
    return {
      capacity: {
        kind: "asg",
        autoScalingGroup: selected.node,
        alarm
      },
      logGroups
    };
  }

  const ecsCluster = findUniqueReferencedNode(
    graph,
    selected.node.config["cluster"],
    "aws_ecs_cluster",
    ["id", "arn", "name"]
  ) ?? (legacySingleRuntime ? onlyNode(resourceNodes(graph, "aws_ecs_cluster")) : null);
  const applicationScalingTargets = resourceNodes(graph, "aws_appautoscaling_target")
    .filter((node) =>
      containsTerraformReference(
        node.config["resourceId"],
        terraformAddress(selected.node),
        ["name"]
      )
    );
  const applicationScalingTarget = onlyNode(applicationScalingTargets);
  if (
    !ecsCluster ||
    !applicationScalingTarget ||
    typeof applicationScalingTarget.config["maxCapacity"] !== "number"
  ) {
    return null;
  }

  return {
    capacity: {
      kind: "ecs_fargate",
      ecsCluster,
      ecsService: selected.node,
      applicationScalingTarget
    },
    logGroups
  };
}

function runtimeReferencesTargetGroup(
  graph: InfrastructureGraph,
  runtime: RuntimeCandidate,
  targetGroup: InfrastructureGraphNode,
  targetGroupAddress: string
): boolean {
  const configValue = runtime.kind === "asg"
    ? runtime.node.config["targetGroupArns"]
    : runtime.node.config["loadBalancer"];
  return containsTerraformReferenceOfType(
    configValue,
    "aws_lb_target_group",
    "arn"
  )
    ? containsTerraformReference(configValue, targetGroupAddress, ["arn"])
    : nodesDirectlyConnected(graph, runtime.node, targetGroup);
}

function runtimeHasAnotherTargetGroupLink(
  graph: InfrastructureGraph,
  runtime: RuntimeCandidate
): boolean {
  const configValue = runtime.kind === "asg"
    ? runtime.node.config["targetGroupArns"]
    : runtime.node.config["loadBalancer"];
  if (containsTerraformReferenceOfType(configValue, "aws_lb_target_group", "arn")) {
    return true;
  }
  return resourceNodes(graph, "aws_lb_target_group").some(
    (targetGroup) =>
      nodesDirectlyConnected(graph, runtime.node, targetGroup)
  );
}

function resolveRuntimeLogGroups(
  graph: InfrastructureGraph,
  runtime: RuntimeCandidate,
  legacySingleRuntime: boolean
): InfrastructureGraphNode[] | null {
  const owners = runtime.kind === "ecs_fargate"
    ? resolveEcsLogOwners(graph, runtime.node)
    : resolveAsgLogOwners(graph, runtime.node);
  if (!owners) return null;

  const logGroups = resourceNodes(graph, "aws_cloudwatch_log_group");
  const referenced = logGroups.filter((logGroup) =>
    owners.some((owner) =>
      containsTerraformReference(owner.config, terraformAddress(logGroup), ["name", "arn"])
    )
  );
  if (
    owners.some((owner) =>
      containsTerraformReferenceOfTypeForAttributes(
        owner.config,
        "aws_cloudwatch_log_group",
        ["name", "arn"]
      )
    ) && referenced.length === 0
  ) {
    return null;
  }
  const explicit = uniqueNodes([
    ...referenced,
    ...owners.flatMap((owner) => outgoingNodes(graph, owner, "aws_cloudwatch_log_group"))
  ]);
  const allLogGroups = resourceNodes(graph, "aws_cloudwatch_log_group");
  const selected = explicit.length > 0
    ? explicit
    : legacySingleRuntime && allLogGroups.length <= 1
      ? allLogGroups
      : [];
  return selected.length <= 10 ? selected : null;
}

function resolveEcsLogOwners(
  graph: InfrastructureGraph,
  service: InfrastructureGraphNode
): InfrastructureGraphNode[] | null {
  const taskDefinition = resolveOwnedSupportNode(
    graph,
    service,
    service.config["taskDefinition"],
    "aws_ecs_task_definition",
    ["arn", "id"]
  );
  return taskDefinition === null
    ? null
    : taskDefinition
      ? [service, taskDefinition]
      : [service];
}

function resolveAsgLogOwners(
  graph: InfrastructureGraph,
  autoScalingGroup: InfrastructureGraphNode
): InfrastructureGraphNode[] | null {
  const owners = [autoScalingGroup];
  const launchTemplate = resolveOwnedSupportNode(
    graph,
    autoScalingGroup,
    autoScalingGroup.config["launchTemplate"],
    "aws_launch_template",
    ["id", "name", "arn"]
  );
  if (launchTemplate === null) return null;
  if (!launchTemplate) return owners;
  owners.push(launchTemplate);

  const instanceProfile = resolveOwnedSupportNode(
    graph,
    launchTemplate,
    launchTemplate.config["iamInstanceProfile"],
    "aws_iam_instance_profile",
    ["name", "arn", "id"]
  );
  if (instanceProfile === null) return null;
  if (!instanceProfile) return owners;
  owners.push(instanceProfile);

  const role = resolveOwnedSupportNode(
    graph,
    instanceProfile,
    instanceProfile.config["role"],
    "aws_iam_role",
    ["name", "arn", "id"]
  );
  if (role === null) return null;
  if (!role) return owners;
  owners.push(role);

  for (const resourceType of ["aws_iam_role_policy", "aws_iam_policy"] as const) {
    owners.push(...resourceNodes(graph, resourceType).filter((policy) =>
      containsTerraformReference(policy.config["role"], terraformAddress(role), ["name", "id", "arn"]) ||
      graph.edges.some((edge) => edge.sourceId === role.id && edge.targetId === policy.id)
    ));
  }
  return uniqueNodes(owners);
}

function resolveOwnedSupportNode(
  graph: InfrastructureGraph,
  owner: InfrastructureGraphNode,
  referenceValue: unknown,
  resourceType: string,
  attributes: readonly string[]
): InfrastructureGraphNode | null | undefined {
  const candidates = resourceNodes(graph, resourceType);
  const referenced = candidates.filter((candidate) =>
    containsTerraformReference(referenceValue, terraformAddress(candidate), attributes)
  );
  if (referenced.length > 0) return onlyNode(referenced);
  if (containsTerraformReferenceOfTypeForAttributes(referenceValue, resourceType, attributes)) {
    return null;
  }
  const outgoing = outgoingNodes(graph, owner, resourceType);
  return outgoing.length === 0 ? undefined : onlyNode(outgoing);
}

function outgoingNodes(
  graph: InfrastructureGraph,
  source: InfrastructureGraphNode,
  resourceType: string
): InfrastructureGraphNode[] {
  const targetIds = new Set(
    graph.edges
      .filter((edge) => edge.sourceId === source.id)
      .map((edge) => edge.targetId)
  );
  return resourceNodes(graph, resourceType).filter((node) => targetIds.has(node.id));
}

function resolveAsgPressureAlarm(
  graph: InfrastructureGraph,
  autoScalingGroup: InfrastructureGraphNode,
  legacySingleRuntime: boolean
): InfrastructureGraphNode | null {
  const autoScalingGroups = resourceNodes(graph, "aws_autoscaling_group");
  const candidates = resourceNodes(graph, "aws_cloudwatch_metric_alarm").filter(
    (node) =>
      node.config["metricName"] === "RequestCountPerTarget" &&
      typeof node.config["threshold"] === "number"
  );
  const validCandidates = candidates.filter((alarm) => {
    const actionOwner = resolveAlarmActionAutoScalingGroup(
      graph,
      alarm,
      autoScalingGroups
    );
    if (actionOwner === null || (actionOwner && actionOwner.id !== autoScalingGroup.id)) {
      return false;
    }

    const dimensionOwners = autoScalingGroups.filter((candidate) =>
      containsTerraformReference(
        alarm.config["dimensions"],
        terraformAddress(candidate),
        ["name"]
      )
    );
    const hasDimensionReference = containsTerraformReferenceOfType(
      alarm.config["dimensions"],
      "aws_autoscaling_group",
      "name"
    );
    const directlyLinked = hasDimensionReference
      ? onlyNode(dimensionOwners)?.id === autoScalingGroup.id
      : nodesDirectlyConnected(graph, alarm, autoScalingGroup);
    return directlyLinked || actionOwner?.id === autoScalingGroup.id;
  });
  const linked = onlyNode(validCandidates);
  if (linked) return linked;
  if (validCandidates.length > 1 || !legacySingleRuntime) return null;

  const legacyCandidates = candidates.filter(
    (alarm) => resolveAlarmActionAutoScalingGroup(graph, alarm, autoScalingGroups) !== null
  );
  return onlyNode(legacyCandidates);
}

function resolveAlarmActionAutoScalingGroup(
  graph: InfrastructureGraph,
  alarm: InfrastructureGraphNode,
  autoScalingGroups: readonly InfrastructureGraphNode[]
): InfrastructureGraphNode | null | undefined {
  const alarmActions = alarm.config["alarmActions"];
  const hasPolicyReference = containsTerraformReferenceOfTypeForAttributes(
    alarmActions,
    "aws_autoscaling_policy",
    ["arn", "id", "name"]
  );
  if (!hasPolicyReference) return undefined;

  const policies = resourceNodes(graph, "aws_autoscaling_policy").filter((policy) =>
    containsTerraformReference(alarmActions, terraformAddress(policy), ["arn", "id", "name"])
  );
  const policy = onlyNode(policies);
  if (!policy) return null;

  const policyOwners = autoScalingGroups.filter((candidate) =>
    containsTerraformReference(
      policy.config["autoscalingGroupName"],
      terraformAddress(candidate),
      ["name"]
    )
  );
  if (
    !containsTerraformReferenceOfType(
      policy.config["autoscalingGroupName"],
      "aws_autoscaling_group",
      "name"
    )
  ) {
    return null;
  }
  return onlyNode(policyOwners);
}

function renderLiveObservationLogGroupOutputs(
  logGroups: readonly InfrastructureGraphNode[]
): string[] {
  const addresses = logGroups
    .map((node) => `aws_cloudwatch_log_group.${node.iac.resourceName}.name`);

  if (addresses.length === 0) return [];
  if (addresses.length === 1) {
    return [renderOutput("log_group_name", addresses[0]!)];
  }

  return [renderOutput("log_group_names", `[${addresses.join(", ")}]`)];
}

function findValidatedTrafficRecords(
  graph: InfrastructureGraph,
  loadBalancerAddress: string,
  certificate: InfrastructureGraphNode
): InfrastructureGraphNode[] {
  const certificateDomainName = certificate.config["domainName"];
  if (typeof certificateDomainName !== "string" || certificateDomainName.length === 0) {
    return [];
  }

  return graph.nodes.filter((node) => {
    if (
      node.iac.terraformBlockType !== "resource" ||
      node.iac.resourceType !== "aws_route53_record" ||
      node.config["name"] !== certificateDomainName ||
      node.config["type"] !== "CNAME"
    ) {
      return false;
    }

    const records = node.config["records"];
    return (
      Array.isArray(records) &&
      records.length === 1 &&
      records[0] === `${loadBalancerAddress}.dns_name`
    );
  });
}

function forwardTargetGroupReferences(listener: InfrastructureGraphNode): unknown[] {
  const defaultAction = listener.config["defaultAction"];
  const actions = Array.isArray(defaultAction) ? defaultAction : [defaultAction];
  return actions.flatMap((action) =>
    isRecord(action) && action["type"] === "forward"
      ? [action["targetGroupArn"]]
      : []
  );
}

function findAlbRequestCountTargetValue(
  graph: InfrastructureGraph,
  loadBalancerAddress: string,
  targetGroupAddress: string,
  applicationScalingTarget: InfrastructureGraphNode
): number | null {
  const scalingTargetAddress = terraformAddress(applicationScalingTarget);
  for (const policy of graph.nodes) {
    if (
      policy.iac.terraformBlockType !== "resource" ||
      policy.iac.resourceType !== "aws_appautoscaling_policy" ||
      !containsTerraformReference(
        policy.config["resourceId"],
        scalingTargetAddress,
        ["resource_id"]
      )
    ) continue;

    const configuration = policy.config["targetTrackingScalingPolicyConfiguration"];
    if (!isRecord(configuration) || typeof configuration["targetValue"] !== "number") continue;

    const specificationValue = configuration["predefinedMetricSpecification"];
    const specification = Array.isArray(specificationValue)
      ? specificationValue.find(isRecord)
      : isRecord(specificationValue)
        ? specificationValue
        : undefined;
    if (
      specification?.["predefinedMetricType"] !== "ALBRequestCountPerTarget" ||
      typeof specification["resourceLabel"] !== "string"
    ) continue;

    const resourceLabel = specification["resourceLabel"];
    if (
      resourceLabel.includes(`${loadBalancerAddress}.arn_suffix`) &&
      resourceLabel.includes(`${targetGroupAddress}.arn_suffix`)
    ) {
      return configuration["targetValue"];
    }
  }

  return null;
}

function resourceNodes(
  graph: InfrastructureGraph,
  resourceType: string
): InfrastructureGraphNode[] {
  return graph.nodes.filter(
    (node) =>
      node.iac.terraformBlockType === "resource" && node.iac.resourceType === resourceType
  );
}

function findUniqueReferencedNode(
  graph: InfrastructureGraph,
  value: unknown,
  resourceType: string,
  attributes: readonly string[]
): InfrastructureGraphNode | null {
  return onlyNode(
    resourceNodes(graph, resourceType).filter((node) =>
      containsTerraformReference(value, terraformAddress(node), attributes)
    )
  );
}

function containsTerraformReference(
  value: unknown,
  address: string,
  attributes: readonly string[]
): boolean {
  if (typeof value === "string") {
    return attributes.some((attribute) => {
      const reference = `${address}.${attribute}`;
      return value === reference || value.includes(`\${${reference}}`);
    });
  }
  if (Array.isArray(value)) {
    return value.some((candidate) =>
      containsTerraformReference(candidate, address, attributes)
    );
  }
  return isRecord(value) && Object.values(value).some((candidate) =>
    containsTerraformReference(candidate, address, attributes)
  );
}

function containsTerraformReferenceOfType(
  value: unknown,
  resourceType: string,
  attribute: string
): boolean {
  if (typeof value === "string") {
    const escapedResourceType = resourceType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `${escapedResourceType}\\.[a-zA-Z_][a-zA-Z0-9_-]*\\.${escapedAttribute}(?:[^a-zA-Z0-9_]|$)`
    ).test(value);
  }
  if (Array.isArray(value)) {
    return value.some((candidate) =>
      containsTerraformReferenceOfType(candidate, resourceType, attribute)
    );
  }
  return isRecord(value) && Object.values(value).some((candidate) =>
    containsTerraformReferenceOfType(candidate, resourceType, attribute)
  );
}

function containsTerraformReferenceOfTypeForAttributes(
  value: unknown,
  resourceType: string,
  attributes: readonly string[]
): boolean {
  return attributes.some((attribute) =>
    containsTerraformReferenceOfType(value, resourceType, attribute)
  );
}

function nodesDirectlyConnected(
  graph: InfrastructureGraph,
  left: InfrastructureGraphNode,
  right: InfrastructureGraphNode
): boolean {
  return graph.edges.some(
    (edge) =>
      (edge.sourceId === left.id && edge.targetId === right.id) ||
      (edge.sourceId === right.id && edge.targetId === left.id)
  );
}

function terraformAddress(node: InfrastructureGraphNode): string {
  return `${node.iac.resourceType}.${node.iac.resourceName}`;
}

function onlyNode<T>(nodes: readonly T[]): T | null {
  return nodes.length === 1 ? nodes[0]! : null;
}

function uniqueNodes(nodes: readonly InfrastructureGraphNode[]): InfrastructureGraphNode[] {
  return [...new Map(nodes.map((node) => [node.id, node])).values()];
}

function renderOutput(name: string, valueExpression: string): string {
  return [`output "${name}" {`, `${INDENT_UNIT}value = ${valueExpression}`, "}"].join("\n");
}

// resource/data block 하나를 만든다. 예: resource "aws_vpc" "main" { ... }
function renderBlock(node: InfrastructureGraphNode): string {
  const terraformBlockType = node.iac.terraformBlockType ?? DEFAULT_TERRAFORM_BLOCK_TYPE;
  assertTerraformIdentifier(node.iac.resourceType, "resource type");
  assertTerraformIdentifier(node.iac.resourceName, "resource name");

  const body = Object.entries(createRenderableResourceConfig(node)).flatMap(([key, value]) =>
    renderBodyEntry(node.iac.resourceType, key, value, 1)
  );

  return [
    `${terraformBlockType} "${node.iac.resourceType}" "${node.iac.resourceName}" {`,
    ...body,
    "}"
  ].join("\n");
}

function renderBodyEntry(
  resourceType: string,
  key: string,
  value: unknown,
  indentLevel: number
): string[] {
  const normalizedValue = normalizeTopLevelValue(resourceType, key, value);

  if (shouldRenderNestedBlocks(resourceType, key, normalizedValue)) {
    return renderNestedBlocks(resourceType, key, normalizedValue, indentLevel, []);
  }

  return [renderAttribute(key, normalizedValue, indentLevel)];
}

function normalizeTopLevelValue(resourceType: string, key: string, value: unknown): unknown {
  if (
    resourceType === "aws_security_group" &&
    (key === "egress" || key === "ingress") &&
    Array.isArray(value)
  ) {
    return value.map((item) => (isRecord(item) ? normalizeSecurityGroupRuleBlock(item) : item));
  }

  return value;
}

function normalizeSecurityGroupRuleBlock(rule: Record<string, unknown>): Record<string, unknown> {
  const normalizedRule: Record<string, unknown> = {};
  const port = rule["port"];
  const cidr = rule["cidr"];
  const hasCidrBlocks = rule["cidrBlocks"] !== undefined || rule["cidr_blocks"] !== undefined;

  for (const [key, value] of Object.entries(rule)) {
    if (key !== "cidr" && key !== "port") {
      normalizedRule[key] = value;
    }
  }

  if (port !== undefined) {
    if (rule["fromPort"] === undefined && rule["from_port"] === undefined) {
      normalizedRule.fromPort = port;
    }

    if (rule["toPort"] === undefined && rule["to_port"] === undefined) {
      normalizedRule.toPort = port;
    }

    if (rule["protocol"] === undefined) {
      normalizedRule.protocol = "tcp";
    }
  }

  if (cidr !== undefined && !hasCidrBlocks) {
    normalizedRule.cidrBlocks = [cidr];
  }

  return normalizedRule;
}

function shouldRenderNestedBlocks(
  resourceType: string,
  key: string,
  value: unknown
): value is Record<string, unknown> | Record<string, unknown>[] {
  return (
    isTerraformNestedBlockAttribute(resourceType, key) &&
    ((Array.isArray(value) && value.every(isRecord)) || isRecord(value))
  );
}

function renderNestedBlocks(
  resourceType: string,
  key: string,
  value: Record<string, unknown> | Record<string, unknown>[],
  indentLevel: number,
  parentPath: readonly string[]
): string[] {
  const blockName = toSnakeCase(key);
  const values = Array.isArray(value) ? value : [value];

  assertTerraformIdentifier(blockName, "nested block name");

  return values.map((value) =>
    [
      `${indent(indentLevel)}${blockName} {`,
      ...Object.entries(value).flatMap(([nestedKey, nestedValue]) =>
        renderNestedBlockEntry(
          resourceType,
          [...parentPath, key],
          nestedKey,
          nestedValue,
          indentLevel + 1
        )
      ),
      `${indent(indentLevel)}}`
    ].join("\n")
  );
}

function renderNestedBlockEntry(
  resourceType: string,
  parentPath: readonly string[],
  key: string,
  value: unknown,
  indentLevel: number
): string[] {
  if (
    (isTerraformNestedBlockAttribute(resourceType, key, parentPath) ||
      isGenericTerraformNestedBlock(key)) &&
    ((Array.isArray(value) && value.every(isRecord)) || isRecord(value))
  ) {
    return renderNestedBlocks(resourceType, key, value, indentLevel, parentPath);
  }

  return [renderAttribute(key, value, indentLevel)];
}

function renderAttribute(key: string, value: unknown, indentLevel: number): string {
  const attributeName = toSnakeCase(key);
  assertTerraformIdentifier(attributeName, "attribute name");

  const renderedValue =
    attributeName === "depends_on"
      ? renderDependencyList(value, indentLevel)
      : renderValue(value, indentLevel);

  return `${indent(indentLevel)}${attributeName} = ${renderedValue}`;
}

function renderDependencyList(value: unknown, indentLevel: number): string {
  if (!Array.isArray(value)) {
    return renderValue(value, indentLevel);
  }

  if (value.length === 0) {
    return "[]";
  }

  return [
    "[",
    ...value.map((dependency) => {
      const renderedDependency =
        typeof dependency === "string" && TERRAFORM_RESOURCE_ADDRESS_PATTERN.test(dependency)
          ? dependency
          : renderValue(dependency, indentLevel + 1);

      return `${indent(indentLevel + 1)}${renderedDependency},`;
    }),
    `${indent(indentLevel)}]`
  ].join("\n");
}

// JavaScript 값을 Terraform HCL 값 표현으로 바꾼다.
function renderValue(value: unknown, indentLevel: number): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return isTerraformReference(value) || isSupportedTerraformFunctionExpression(value)
      ? value
      : JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return renderArray(value, indentLevel);
  }

  if (isRecord(value)) {
    return renderObject(value, indentLevel);
  }

  return JSON.stringify(String(value));
}

// 배열 값을 사람이 읽기 쉬운 여러 줄 Terraform list로 출력한다.
function renderArray(values: unknown[], indentLevel: number): string {
  if (values.length === 0) {
    return "[]";
  }

  return [
    "[",
    ...values.map((value) => `${indent(indentLevel + 1)}${renderValue(value, indentLevel + 1)},`),
    `${indent(indentLevel)}]`
  ].join("\n");
}

// object 값을 Terraform map/object 표현으로 바꾼다. tags 같은 nested key는 원래 이름을 유지한다.
function renderObject(value: Record<string, unknown>, indentLevel: number): string {
  const entries = Object.entries(value);

  if (entries.length === 0) {
    return "{}";
  }

  return [
    "{",
    ...entries.map(
      ([key, nestedValue]) =>
        `${indent(indentLevel + 1)}${renderObjectKey(key)} = ${renderValue(nestedValue, indentLevel + 1)}`
    ),
    `${indent(indentLevel)}}`
  ].join("\n");
}

function renderObjectKey(key: string): string {
  return TERRAFORM_IDENTIFIER_PATTERN.test(key) ? key : JSON.stringify(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Terraform reference는 따옴표 없이 출력해야 하므로 일반 문자열과 구분한다.
function isTerraformReference(value: string): boolean {
  return TERRAFORM_REFERENCE_PATTERN.test(value);
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

function indent(level: number): string {
  return INDENT_UNIT.repeat(level);
}

function assertTerraformIdentifier(value: string, label: string): void {
  if (TERRAFORM_IDENTIFIER_PATTERN.test(value)) {
    return;
  }

  throw new TerraformDiagramValidationError(label, value);
}
