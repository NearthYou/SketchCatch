import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson } from "../../../../packages/types/src";
import { isAreaNode } from "../diagram-editor/area-nodes";
import {
  applyTemplateToDiagramWithBackup,
  filterBoardTemplates,
  listBoardTemplateTags,
  listBoardTemplates,
  readTemplateOverwriteBackups,
  TEMPLATE_OVERWRITE_BACKUP_STORAGE_KEY
} from "./template-library";

test("filterBoardTemplates searches title, description, and tags", () => {
  const templates = listBoardTemplates();

  assert.deepEqual(
    filterBoardTemplates(templates, { query: "CloudFront", sort: "recommended", tag: "all" }).map(
      (template) => template.id
    ),
    ["template-static-website"]
  );
});

test("filterBoardTemplates combines tag filtering and resource sorting", () => {
  const templates = listBoardTemplates();
  const filtered = filterBoardTemplates(templates, {
    query: "",
    sort: "resources",
    tag: "RDS"
  });

  assert.deepEqual(filtered.map((template) => template.id), ["template-3tier", "template-api-db"]);
});

test("listBoardTemplateTags returns unique sorted tags", () => {
  const tags = listBoardTemplateTags(listBoardTemplates());

  assert.equal(tags.filter((tag) => tag === "RDS").length, 1);
  assert.deepEqual(tags, [...tags].sort((left, right) => left.localeCompare(right, "ko-KR")));
});

test("listBoardTemplates returns templates with DiagramJson so page and board modal can share them", () => {
  const templates = listBoardTemplates();

  assert.ok(templates.length >= 2);
  assert.ok(templates.every((template) => template.diagramJson.nodes.length > 0));
});

test("board templates use 48px geometry for ordinary icons while preserving Area sizes", () => {
  const templates = listBoardTemplates();
  const ordinaryNodes = templates.flatMap((template) =>
    template.diagramJson.nodes.filter((node) => node.kind === "resource" && !isAreaNode(node))
  );

  assert.ok(ordinaryNodes.length > 0);
  for (const node of ordinaryNodes) {
    assert.deepEqual(node.size, { width: 48, height: 48 }, node.id);
  }

  const apiTemplate = templates.find((template) => template.id === "template-api-db");
  const apiVPC = apiTemplate?.diagramJson.nodes.find((node) => node.id === "template-api-vpc");
  const apiSubnet = apiTemplate?.diagramJson.nodes.find((node) => node.id === "template-api-subnet");

  assert.deepEqual(apiVPC?.size, { width: 680, height: 420 });
  assert.deepEqual(apiSubnet?.size, { width: 520, height: 240 });
});

test("Live Observation template carries the same ASG pressure resources as the demo deployment", () => {
  const template = listBoardTemplates().find(
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
  const targetGroup = nodesByType.get("aws_lb_target_group");
  const listener = nodesByType.get("aws_lb_listener");
  const audienceObject = template.diagramJson.nodes.find(
    (node) => node.parameters?.resourceType === "aws_s3_object" && node.parameters.resourceName === "index"
  );

  assert.ok(asg);
  assert.ok(policy);
  assert.ok(alarm);
  assert.ok(launchTemplate);
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
  assert.match(
    Buffer.from(String(launchTemplate.parameters?.values.userData), "base64").toString("utf8"),
    /sketchcatch-demo-managed-user-data-sha256:[a-f0-9]{64}/
  );
  assert.match(String(audienceObject.parameters?.values.content), /\/api\/traffic/);
  assert.match(String(audienceObject.parameters?.values.content), /\/api\/live-observations\/public\//);
  assert.equal(policy.parameters?.values.policyType, "StepScaling");
  assert.equal(alarm.parameters?.values.metricName, "RequestCountPerTarget");
  assert.equal(alarm.parameters?.values.threshold, 60);
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

class FakeStorage implements Pick<Storage, "getItem" | "setItem"> {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
