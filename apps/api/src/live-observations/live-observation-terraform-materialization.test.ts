import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DeploymentLiveObservationManifestRecord,
  DeploymentLiveObservationManifestV2,
  InfrastructureGraph
} from "@sketchcatch/types";
import { renderTerraformFromInfrastructureGraph } from "../services/terraform/diagram-to-terraform.js";
import type { DeploymentLiveObservationManifestRepository } from "./live-observation-manifest-repository.js";
import { materializeDeploymentLiveObservationManifest } from "./live-observation-manifest-materializer.js";

const DEPLOYMENT_ID = "123e4567-e89b-42d3-a456-426614174000";
const CONNECTION_ID = "abcdef12-3456-4789-8abc-def012345678";

test("ASG graph outputs and successful approved evidence materialize a valid manifest", async () => {
  const graph = createBaseGraph([
    node("aws_autoscaling_group", "api", {}),
    node("aws_autoscaling_policy", "requests", {
      autoscalingGroupName: "aws_autoscaling_group.api.name"
    }),
    node("aws_cloudwatch_metric_alarm", "requests", {
      metricName: "RequestCountPerTarget",
      threshold: 60,
      alarmActions: ["aws_autoscaling_policy.requests.arn"],
      dimensions: {
        LoadBalancer: "aws_lb.platform.arn_suffix",
        TargetGroup: "aws_lb_target_group.api.arn_suffix"
      }
    })
  ]);

  const record = await materializeGraph(graph, {
    asg_name: "customer-platform-asg"
  });

  assert.equal(record.status, "valid");
  assert.equal(record.manifest?.adapter.version, 2);
  assert.deepEqual(
    record.manifest?.adapter.version === 2
      ? record.manifest.adapter.payload.capacityTarget
      : null,
    { kind: "asg", autoScalingGroupName: "customer-platform-asg" }
  );
});

test("ECS Fargate graph outputs and successful approved evidence materialize a valid manifest", async () => {
  const graph = createBaseGraph([
    node("aws_ecs_cluster", "platform", {}),
    node("aws_ecs_service", "api", {
      cluster: "aws_ecs_cluster.platform.id",
      loadBalancer: { targetGroupArn: "aws_lb_target_group.api.arn" }
    }),
    node("aws_appautoscaling_target", "api", {
      maxCapacity: 4,
      resourceId:
        "service/${aws_ecs_cluster.platform.name}/${aws_ecs_service.api.name}"
    }),
    node("aws_appautoscaling_policy", "requests", {
      resourceId: "aws_appautoscaling_target.api.resource_id",
      targetTrackingScalingPolicyConfiguration: {
        targetValue: 60,
        predefinedMetricSpecification: {
          predefinedMetricType: "ALBRequestCountPerTarget",
          resourceLabel: "${aws_lb.platform.arn_suffix}/${aws_lb_target_group.api.arn_suffix}"
        }
      }
    })
  ]);

  const record = await materializeGraph(graph, {
    ecs_cluster_name: "customer-platform",
    ecs_service_name: "api",
    max_capacity: 4
  });

  assert.equal(record.status, "valid");
  assert.deepEqual(
    record.manifest?.adapter.version === 2
      ? record.manifest.adapter.payload.capacityTarget
      : null,
    {
      kind: "ecs_fargate",
      clusterName: "customer-platform",
      serviceName: "api",
      maxCapacity: 4
    }
  );
});

test("HTTP-only ALB graph emits no traffic target and is ineligible", async () => {
  const graph: InfrastructureGraph = {
    nodes: [
      node("aws_lb", "platform", {}),
      node("aws_lb_target_group", "api", {}),
      node("aws_lb_listener", "http", {
        loadBalancerArn: "aws_lb.platform.arn",
        port: 80,
        protocol: "HTTP",
        defaultAction: {
          type: "forward",
          targetGroupArn: "aws_lb_target_group.api.arn"
        }
      }),
      node("aws_autoscaling_group", "api", {}),
      node("aws_cloudwatch_metric_alarm", "requests", {
        metricName: "RequestCountPerTarget",
        threshold: 60
      })
    ],
    edges: []
  };
  const terraform = renderTerraformFromInfrastructureGraph(graph);
  assert.doesNotMatch(terraform, /output "traffic_url"/);

  const repository = new MemoryManifestRepository();
  const result = await materializeDeploymentLiveObservationManifest(
    {
      audienceBaseUrl: "https://audience.example.com",
      deployment: {
        id: DEPLOYMENT_ID,
        status: "SUCCESS",
        awsConnectionId: CONNECTION_ID,
        approvedTerraformArtifactHash: "0123456789abcdef".repeat(4),
        approvedAwsAccountId: "123456789012",
        approvedAwsRegion: "ap-northeast-2"
      },
      connection: {
        id: CONNECTION_ID,
        accountId: "123456789012",
        region: "ap-northeast-2",
        status: "verified",
        lastVerifiedAt: "2026-07-11T00:00:00.000Z"
      },
      outputs: {}
    },
    repository
  );
  assert.equal(result.status, "manifest_invalid");
});

async function materializeGraph(
  graph: InfrastructureGraph,
  capacityValues: Record<string, unknown>
) {
  const terraform = renderTerraformFromInfrastructureGraph(graph);
  const declaredOutputs = new Set(
    [...terraform.matchAll(/output "([a-z0-9_]+)"/g)].flatMap((match) =>
      match[1] ? [match[1]] : []
    )
  );
  for (const required of [
    "traffic_url",
    "traffic_hostname",
    "load_balancer_dns_name",
    "load_balancer_arn",
    "target_group_arn",
    "scale_out_threshold"
  ]) {
    assert.equal(declaredOutputs.has(required), true, `missing graph output ${required}`);
  }

  const resolvedValues: Record<string, unknown> = {
    traffic_url: "https://api.example.com/traffic",
    traffic_hostname: "api.example.com",
    load_balancer_dns_name:
      "customer-platform-123456789.ap-northeast-2.elb.amazonaws.com",
    load_balancer_arn:
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/customer-platform/50dc6c495c0c9188",
    target_group_arn:
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/customer-api/6d0ecf831eec9f09",
    scale_out_threshold: 60,
    ...capacityValues
  };
  const outputs = Object.fromEntries(
    Object.entries(resolvedValues).filter(([name]) => declaredOutputs.has(name))
  );
  const repository = new MemoryManifestRepository();
  return materializeDeploymentLiveObservationManifest(
    {
      audienceBaseUrl: "https://audience.example.com",
      deployment: {
        id: DEPLOYMENT_ID,
        status: "SUCCESS",
        awsConnectionId: CONNECTION_ID,
        approvedTerraformArtifactHash: "0123456789abcdef".repeat(4),
        approvedAwsAccountId: "123456789012",
        approvedAwsRegion: "ap-northeast-2"
      },
      connection: {
        id: CONNECTION_ID,
        accountId: "123456789012",
        region: "ap-northeast-2",
        status: "verified",
        lastVerifiedAt: "2026-07-11T00:00:00.000Z"
      },
      outputs
    },
    repository
  );
}

function createBaseGraph(capacityNodes: InfrastructureGraph["nodes"]): InfrastructureGraph {
  return {
    nodes: [
      node("aws_lb", "platform", {}),
      node("aws_lb_target_group", "api", {}),
      node("aws_acm_certificate", "api", { domainName: "api.example.com" }),
      node("aws_lb_listener", "https", {
        loadBalancerArn: "aws_lb.platform.arn",
        port: 443,
        protocol: "HTTPS",
        certificateArn: "aws_acm_certificate.api.arn",
        defaultAction: {
          type: "forward",
          targetGroupArn: "aws_lb_target_group.api.arn"
        }
      }),
      node("aws_route53_record", "api", {
        name: "api.example.com",
        type: "CNAME",
        records: ["aws_lb.platform.dns_name"]
      }),
      ...capacityNodes
    ],
    edges: []
  };
}

function node(
  resourceType: string,
  resourceName: string,
  config: Record<string, unknown>
): InfrastructureGraph["nodes"][number] {
  return {
    id: `${resourceType}-${resourceName}`,
    label: resourceName,
    iac: {
      provider: "aws",
      terraformBlockType: "resource",
      resourceType,
      resourceName,
      fileName: "live-observation"
    },
    config
  };
}

class MemoryManifestRepository implements DeploymentLiveObservationManifestRepository {
  async findByDeploymentId() {
    return null;
  }

  async saveValid(manifest: DeploymentLiveObservationManifestV2) {
    return record("valid", manifest, null);
  }

  async saveInvalid() {
    return record("manifest_invalid", null, "Live Observation manifest verification failed.");
  }
}

function record(
  status: "valid" | "manifest_invalid",
  manifest: DeploymentLiveObservationManifestV2 | null,
  invalidReason: string | null
): DeploymentLiveObservationManifestRecord {
  return {
    deploymentId: DEPLOYMENT_ID,
    schemaVersion: 2,
    status,
    manifest,
    invalidReason,
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z"
  };
}
