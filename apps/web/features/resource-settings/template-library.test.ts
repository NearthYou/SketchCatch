import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson } from "../../../../packages/types/src";
import { TEMPLATE_IDS } from "../../../../packages/types/src";
import { isAreaNode } from "../diagram-editor/area-nodes";
import {
  applyTemplateToDiagramWithBackup,
  buildBoardTemplateDiagram,
  filterBoardTemplates,
  getBoardTemplateRelationshipCount,
  getBoardTemplateResourceCount,
  listBoardTemplateTags,
  listBoardTemplates,
  listLegacyBoardTemplates,
  readTemplateOverwriteBackups,
  TEMPLATE_OVERWRITE_BACKUP_STORAGE_KEY
} from "./template-library";

test("buildBoardTemplateDiagram materializes Repository Analysis TemplateDefinition IDs", () => {
  const diagram = buildBoardTemplateDiagram("static-web-hosting", {
    projectSlug: "analysis-qa",
    shortId: "workspace"
  });

  assert.ok(diagram);
  assert.equal(diagram.nodes.length, 8);
  assert.equal(diagram.nodes.filter((node) => node.kind === "resource").length, 6);
  assert.equal(diagram.nodes.filter((node) => node.kind === "design").length, 2);
  assert.ok(
    diagram.nodes
      .filter((node) => node.kind === "design")
      .every((node) => typeof node.metadata?.presentationCatalogItemId === "string")
  );
  assert.equal(
    buildBoardTemplateDiagram("unsupported-template", {
      projectSlug: "analysis-qa",
      shortId: "workspace"
    }),
    undefined
  );
});

test("buildBoardTemplateDiagram maps public Repository Analysis template IDs to board templates", () => {
  const diagram = buildBoardTemplateDiagram("template-api-db", {
    projectSlug: "analysis-qa",
    shortId: "repository"
  });

  assert.ok(diagram);
  assert.equal(
    diagram.nodes.some((node) => node.type === "aws_db_instance"),
    true
  );
  assert.equal(
    diagram.nodes.some((node) => node.type === "aws_lb"),
    true
  );
  assert.equal(
    diagram.nodes.some((node) => node.type === "aws_autoscaling_group"),
    true
  );
});

test("filterBoardTemplates searches title, description, and tags", () => {
  const templates = listBoardTemplates();

  assert.deepEqual(
    filterBoardTemplates(templates, { query: "CloudFront", sort: "recommended", tag: "all" }).map(
      (template) => template.id
    ),
    ["static-web-hosting"]
  );
});

test("filterBoardTemplates combines tag filtering and resource sorting", () => {
  const templates = listBoardTemplates();
  const filtered = filterBoardTemplates(templates, {
    query: "",
    sort: "resources",
    tag: "RDS"
  });

  assert.deepEqual(
    filtered.map((template) => template.id),
    ["three-tier-web-app"]
  );
});

test("listBoardTemplateTags returns unique sorted tags", () => {
  const tags = listBoardTemplateTags(listBoardTemplates());

  assert.equal(tags.filter((tag) => tag === "RDS").length, 1);
  assert.deepEqual(
    tags,
    [...tags].sort((left, right) => left.localeCompare(right, "ko-KR"))
  );
});

test("listBoardTemplates exposes exactly the six deployable TemplateDefinitions", () => {
  const templates = listBoardTemplates();

  assert.deepEqual(
    templates.map((template) => template.id),
    [...TEMPLATE_IDS]
  );
  assert.ok(templates.every((template) => template.diagramJson.nodes.length > 0));
  assert.equal(
    templates.reduce((count, template) => count + getBoardTemplateResourceCount(template), 0),
    103
  );
});

test("Template counts use deployable Terraform identity instead of visual node kind alone", () => {
  const visualResourceArea = createCountNode("visual-vpc", "resource", true);
  const parameterlessResource = createCountNode("parameterless-resource", "resource", false);
  const parameterizedDesign = createCountNode("design-region", "design", true);
  const template = {
    id: "count-contract",
    title: "Count contract",
    description: "Count contract fixture",
    tags: [],
    diagramJson: {
      nodes: [visualResourceArea, parameterlessResource, parameterizedDesign],
      edges: [
        {
          id: "semantic-self",
          sourceNodeId: visualResourceArea.id,
          targetNodeId: visualResourceArea.id
        },
        {
          id: "presentation-edge",
          sourceNodeId: parameterizedDesign.id,
          targetNodeId: visualResourceArea.id
        }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    }
  };

  assert.equal(getBoardTemplateResourceCount(template), 1);
  assert.equal(getBoardTemplateRelationshipCount(template), 1);
});

test("board templates use 48px geometry and compact Area bounds around direct children", () => {
  const templates = listBoardTemplates();
  const ordinaryNodes = templates.flatMap((template) =>
    template.diagramJson.nodes.filter((node) => node.kind === "resource" && !isAreaNode(node))
  );

  assert.ok(ordinaryNodes.length > 0);
  for (const node of ordinaryNodes) {
    assert.deepEqual(node.size, { width: 48, height: 48 }, node.id);
  }

  const apiTemplate = templates.find((template) => template.id === "three-tier-web-app");
  const apiVPC = apiTemplate?.diagramJson.nodes.find(
    (node) => node.id === "template-three-tier-web-app-vpc"
  );
  const apiSubnet = apiTemplate?.diagramJson.nodes.find(
    (node) => node.id === "template-three-tier-web-app-public-subnet-a"
  );

  assert.ok(apiVPC);
  assert.ok(apiSubnet);
  assert.ok(apiVPC.size.width > 0 && apiVPC.size.height > 0);
  assert.ok(apiSubnet.size.width > 0 && apiSubnet.size.height > 0);
  assert.ok(apiSubnet.position.x >= apiVPC.position.x);
  assert.ok(apiSubnet.position.y >= apiVPC.position.y);
  assert.ok(apiSubnet.position.x + apiSubnet.size.width <= apiVPC.position.x + apiVPC.size.width);
  assert.ok(apiSubnet.position.y + apiSubnet.size.height <= apiVPC.position.y + apiVPC.size.height);
});

test("Live Observation template carries the same ASG pressure resources as the demo deployment", () => {
  const template = listLegacyBoardTemplates().find(
    (candidate) => candidate.id === "template-live-observation"
  );

  assert.ok(template);
  const nodesByType = new Map(template.diagramJson.nodes.map((node) => [node.type, node]));
  const asg = nodesByType.get("aws_autoscaling_group");
  const policy = nodesByType.get("aws_autoscaling_policy");
  const alarm = nodesByType.get("aws_cloudwatch_metric_alarm");

  for (const resourceType of [
    "aws_vpc",
    "aws_internet_gateway",
    "aws_subnet",
    "aws_route_table",
    "aws_route_table_association",
    "aws_security_group",
    "aws_s3_bucket",
    "aws_s3_bucket_public_access_block",
    "aws_s3_bucket_policy",
    "aws_s3_bucket_website_configuration",
    "aws_s3_object",
    "aws_ami",
    "aws_cloudwatch_log_group",
    "aws_iam_role",
    "aws_iam_role_policy_attachment",
    "aws_iam_instance_profile",
    "aws_launch_template",
    "aws_lb",
    "aws_lb_listener",
    "aws_lb_target_group",
    "aws_autoscaling_group",
    "aws_autoscaling_policy",
    "aws_cloudwatch_metric_alarm"
  ]) {
    assert.ok(nodesByType.has(resourceType), `${resourceType} is missing`);
  }

  const launchTemplate = nodesByType.get("aws_launch_template");
  const agentRole = nodesByType.get("aws_iam_role");
  const agentPolicy = nodesByType.get("aws_iam_role_policy_attachment");
  const agentProfile = nodesByType.get("aws_iam_instance_profile");
  const logGroup = nodesByType.get("aws_cloudwatch_log_group");
  const targetGroup = nodesByType.get("aws_lb_target_group");
  const listener = nodesByType.get("aws_lb_listener");
  const audienceObject = template.diagramJson.nodes.find(
    (node) =>
      node.parameters?.resourceType === "aws_s3_object" && node.parameters.resourceName === "index"
  );

  assert.ok(asg);
  assert.ok(policy);
  assert.ok(alarm);
  assert.ok(launchTemplate);
  assert.ok(agentRole);
  assert.ok(agentPolicy);
  assert.ok(agentProfile);
  assert.ok(logGroup);
  assert.ok(targetGroup);
  assert.ok(listener);
  assert.ok(audienceObject);
  assert.deepEqual(asg.parameters?.values, {
    defaultInstanceWarmup: 60,
    desiredCapacity: 1,
    healthCheckGracePeriod: 120,
    healthCheckType: "ELB",
    launchTemplate: { id: "aws_launch_template.api.id", version: "$Latest" },
    maxSize: 2,
    minSize: 1,
    namePrefix: "sc-lo-asg-",
    targetGroupArns: ["aws_lb_target_group.api.arn"],
    vpcZoneIdentifier: ["aws_subnet.public_a.id", "aws_subnet.public_c.id"]
  });
  assert.deepEqual(targetGroup.parameters?.values.healthCheck, {
    healthyThreshold: 2,
    interval: 15,
    matcher: "200",
    path: "/api/health",
    unhealthyThreshold: 2
  });
  assert.deepEqual(listener.parameters?.values.defaultAction, {
    targetGroupArn: "aws_lb_target_group.api.arn",
    type: "forward"
  });
  assert.equal(launchTemplate.parameters?.values.imageId, "data.aws_ami.al2023.id");
  assert.deepEqual(launchTemplate.parameters?.values.iamInstanceProfile, {
    name: "aws_iam_instance_profile.api_agent.name"
  });
  assert.equal(agentPolicy.parameters?.values.role, "aws_iam_role.api_agent.name");
  assert.equal(
    agentPolicy.parameters?.values.policyArn,
    "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
  );
  assert.equal(agentProfile.parameters?.values.role, "aws_iam_role.api_agent.name");
  assert.equal(logGroup.parameters?.values.retentionInDays, 1);
  assert.match(
    Buffer.from(String(launchTemplate.parameters?.values.userData), "base64").toString("utf8"),
    /sketchcatch-demo-managed-user-data-sha256:[a-f0-9]{64}/
  );
  assert.doesNotMatch(String(audienceObject.parameters?.values.content), /URLSearchParams|fetch\(/);
  assert.doesNotMatch(
    String(audienceObject.parameters?.values.content),
    /\/api\/live-observations\/public\//
  );
  assert.equal(policy.parameters?.values.policyType, "StepScaling");
  assert.equal(alarm.parameters?.values.metricName, "RequestCountPerTarget");
  assert.equal(alarm.parameters?.values.threshold, 60);

  const vpc = template.diagramJson.nodes.find((node) => node.id === "template-live-vpc");
  const audienceSite = template.diagramJson.nodes.find((node) => node.id === "template-live-site");
  const audienceEndpoint = template.diagramJson.nodes.find(
    (node) => node.id === "template-live-site-config"
  );
  const alb = template.diagramJson.nodes.find((node) => node.id === "template-live-alb");
  const audienceEdge = template.diagramJson.edges.find(
    (edge) => edge.id === "template-live-site-flow"
  );
  assert.ok(vpc);
  assert.ok(audienceSite);
  assert.ok(audienceEndpoint);
  assert.ok(alb);
  assert.ok(targetGroup);
  assert.ok(audienceEdge);
  assert.equal(audienceEdge.sourceNodeId, "template-live-site-config");
  assert.equal(template.diagramJson.nodes.length, 26);
  assert.ok(
    vpc.size.height < 800,
    "dense VPC resources should form compact columns, not one tall stack"
  );
  assert.ok(audienceSite.position.x < vpc.position.x);
  assert.ok(alb.position.x < targetGroup.position.x);
  assert.ok(targetGroup.position.x < asg.position.x);

  const curatedNodeIds = [
    "template-live-vpc",
    "template-live-igw",
    "template-live-route-table",
    "template-live-subnet-a",
    "template-live-subnet-c",
    "template-live-alb-sg",
    "template-live-api-sg",
    "template-live-listener",
    "template-live-alb",
    "template-live-target-group",
    "template-live-asg",
    "template-live-policy",
    "template-live-alarm",
    "template-live-site",
    "template-live-site-config"
  ];
  const curatedNodes = curatedNodeIds.map((nodeId) => {
    const node = template.diagramJson.nodes.find((candidate) => candidate.id === nodeId);
    assert.ok(node, `${nodeId} is missing`);
    return node;
  });

  for (const node of curatedNodes) {
    assert.equal(node.position.x % 40, 0, `${node.id} x must use the 40px grid`);
    assert.equal(node.position.y % 40, 0, `${node.id} y must use the 40px grid`);
  }

  for (const areaNodeId of [
    "template-live-vpc",
    "template-live-subnet-a",
    "template-live-subnet-c",
    "template-live-alb-sg",
    "template-live-api-sg",
    "template-live-asg"
  ]) {
    const areaNode = curatedNodes.find((node) => node.id === areaNodeId);
    assert.ok(areaNode);
    assert.equal(areaNode.size.width % 40, 0, `${areaNode.id} width must use the 40px grid`);
    assert.equal(areaNode.size.height % 40, 0, `${areaNode.id} height must use the 40px grid`);
  }

  assert.ok(audienceEndpoint.position.x < alb.position.x);
  assert.equal(alb.position.y, targetGroup.position.y);
  assert.equal(policy.position.x, alarm.position.x);
});

test("applyTemplateToDiagramWithBackup backs up the current board and returns the template board", () => {
  const storage = new FakeStorage();
  const currentDiagram = createDiagram("current-node");
  const template = listBoardTemplates()[0];
  assert.ok(template);

  const result = applyTemplateToDiagramWithBackup({
    currentDiagram,
    nowIso: "2026-07-07T06:00:00.000Z",
    storage,
    template
  });
  const backups = readTemplateOverwriteBackups(storage);

  assert.deepEqual(result, template.diagramJson);
  assert.ok(
    result.nodes
      .filter((node) => node.kind === "design")
      .every((node) => !Object.prototype.hasOwnProperty.call(node, "parameters"))
  );
  assert.equal(backups.length, 1);
  assert.equal(backups[0]?.templateId, template.id);
  assert.deepEqual(backups[0]?.diagramJson, currentDiagram);
  assert.ok(storage.getItem(TEMPLATE_OVERWRITE_BACKUP_STORAGE_KEY));
});

function createDiagram(nodeId: string): DiagramJson {
  return {
    nodes: [
      {
        id: nodeId,
        kind: "resource",
        label: nodeId,
        locked: false,
        position: { x: 0, y: 0 },
        size: { height: 120, width: 120 },
        type: "aws_instance",
        zIndex: 1
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

// Count fixtures deliberately vary Resource kind and Terraform parameter presence independently.
function createCountNode(
  id: string,
  kind: DiagramJson["nodes"][number]["kind"],
  withParameters: boolean
): DiagramJson["nodes"][number] {
  return {
    id,
    kind,
    label: id,
    locked: false,
    position: { x: 0, y: 0 },
    size: { height: 120, width: 120 },
    type: "aws_vpc",
    zIndex: 1,
    ...(withParameters
      ? {
          parameters: {
            fileName: "main.tf",
            resourceName: id.replaceAll("-", "_"),
            resourceType: "aws_vpc",
            terraformBlockType: "resource" as const,
            values: {}
          }
        }
      : {})
  };
}

class FakeStorage implements Pick<Storage, "getItem" | "setItem"> {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
