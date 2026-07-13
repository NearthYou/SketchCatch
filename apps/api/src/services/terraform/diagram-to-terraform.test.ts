import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { InfrastructureGraph } from "@sketchcatch/types";
import {
  TerraformDiagramValidationError,
  renderTerraformFromInfrastructureGraph
} from "./diagram-to-terraform.js";

test("renders Terraform code from InfrastructureGraph nodes", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "node-1",
        label: "main_vpc",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_vpc",
          resourceName: "main",
          fileName: "main"
        },
        config: {
          cidrBlock: "10.0.0.0/16",
          enableDnsSupport: true,
          enableDnsHostnames: true,
          tags: {
            Name: "main-vpc"
          }
        }
      },
      {
        id: "node-2",
        label: "public_subnet",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_subnet",
          resourceName: "public",
          fileName: "main"
        },
        config: {
          vpcId: "aws_vpc.main.id",
          cidrBlock: "10.0.1.0/24",
          availabilityZone: "ap-northeast-2a",
          mapPublicIpOnLaunch: true,
          tags: {
            Name: "public-subnet",
            "kubernetes.io/cluster/main": "owned"
          }
        }
      }
    ],
    edges: [
      {
        id: "edge-1",
        sourceId: "node-1",
        targetId: "node-2"
      }
    ]
  };

  assert.equal(
    renderTerraformFromInfrastructureGraph(graph),
    `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  enable_dns_support = true
  enable_dns_hostnames = true
  tags = {
    Name = "main-vpc"
  }
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
  availability_zone = "ap-northeast-2a"
  map_public_ip_on_launch = true
  tags = {
    Name = "public-subnet"
    "kubernetes.io/cluster/main" = "owned"
  }
}`
  );
});

test("renders S3 buckets without synthetic companion resources", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "bucket-1",
        label: "service_bucket",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_s3_bucket",
          resourceName: "service_bucket",
          fileName: "storage"
        },
        config: {
          bucket: "service-bucket"
        }
      }
    ],
    edges: []
  };

  assert.equal(
    renderTerraformFromInfrastructureGraph(graph),
    `resource "aws_s3_bucket" "service_bucket" {
  bucket = "service-bucket"
}`
  );
});

test("renders an explicit S3 public access block once", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "bucket-1",
        label: "service_bucket",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_s3_bucket",
          resourceName: "service_bucket",
          fileName: "storage"
        },
        config: {
          bucket: "service-bucket"
        }
      },
      {
        id: "bucket-public-access-1",
        label: "service_bucket_public_access",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_s3_bucket_public_access_block",
          resourceName: "service_bucket_public_access",
          fileName: "storage"
        },
        config: {
          bucket: "aws_s3_bucket.service_bucket.id",
          blockPublicAcls: true,
          blockPublicPolicy: true,
          ignorePublicAcls: true,
          restrictPublicBuckets: true
        }
      }
    ],
    edges: []
  };

  const terraformCode = renderTerraformFromInfrastructureGraph(graph);

  assert.equal(
    terraformCode.match(/resource "aws_s3_bucket_public_access_block"/g)?.length,
    1
  );
  assert.match(terraformCode, /resource "aws_s3_bucket_public_access_block" "service_bucket_public_access"/);
});

test("renders Security Group ingress and egress as Terraform nested blocks", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "security-group-1",
        label: "web_security_group",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_security_group",
          resourceName: "web",
          fileName: "network"
        },
        config: {
          name: "web",
          vpcId: "aws_vpc.main.id",
          ingress: [
            {
              fromPort: 443,
              toPort: 443,
              protocol: "tcp",
              cidrBlocks: ["10.0.0.0/16"]
            }
          ],
          egress: [
            {
              fromPort: 0,
              toPort: 0,
              protocol: "-1",
              cidrBlocks: ["0.0.0.0/0"]
            }
          ]
        }
      }
    ],
    edges: []
  };

  assert.equal(
    renderTerraformFromInfrastructureGraph(graph),
    `resource "aws_security_group" "web" {
  name = "web"
  vpc_id = aws_vpc.main.id
  ingress {
    from_port = 443
    to_port = 443
    protocol = "tcp"
    cidr_blocks = [
      "10.0.0.0/16",
    ]
  }
  egress {
    from_port = 0
    to_port = 0
    protocol = "-1"
    cidr_blocks = [
      "0.0.0.0/0",
    ]
  }
}`
  );
});

test("renders Listener default_action with an unquoted target group reference", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "listener-1",
        label: "https_listener",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_lb_listener",
          resourceName: "https",
          fileName: "load-balancer"
        },
        config: {
          loadBalancerArn: "aws_lb.app.arn",
          port: 443,
          protocol: "HTTPS",
          defaultAction: [
            {
              type: "forward",
              targetGroupArn: "aws_lb_target_group.app.arn"
            }
          ]
        }
      }
    ],
    edges: []
  };

  assert.equal(
    renderTerraformFromInfrastructureGraph(graph),
    `resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.app.arn
  port = 443
  protocol = "HTTPS"
  default_action {
    type = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}`
  );
});

test("renders Autoscaling Policy nested target tracking configuration", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "autoscaling-policy-1",
        label: "cpu_target",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_autoscaling_policy",
          resourceName: "cpu_target",
          fileName: "compute"
        },
        config: {
          name: "cpu-target",
          autoscalingGroupName: "aws_autoscaling_group.app.name",
          policyType: "TargetTrackingScaling",
          targetTrackingConfiguration: {
            targetValue: 70,
            disableScaleIn: false,
            predefinedMetricSpecification: [
              {
                predefinedMetricType: "ALBRequestCountPerTarget",
                resourceLabel: "${aws_lb.load_balancer.arn_suffix}/${aws_lb_target_group.target_group.arn_suffix}"
              }
            ]
          }
        }
      }
    ],
    edges: []
  };

  assert.equal(
    renderTerraformFromInfrastructureGraph(graph),
    `resource "aws_autoscaling_policy" "cpu_target" {
  name = "cpu-target"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type = "TargetTrackingScaling"
  target_tracking_configuration {
    target_value = 70
    disable_scale_in = false
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label = "\${aws_lb.load_balancer.arn_suffix}/\${aws_lb_target_group.target_group.arn_suffix}"
    }
  }
}`
  );
});

test("renders ECS Fargate Live Observation outputs and Application Auto Scaling blocks", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_s3_bucket_website_configuration", "site", {}),
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      createLiveObservationNode("aws_ecs_cluster", "demo", { name: "demo-cluster" }),
      createLiveObservationNode("aws_ecs_service", "api", {
        cluster: "aws_ecs_cluster.demo.id",
        name: "demo-service"
      }),
      createLiveObservationNode("aws_appautoscaling_target", "api", {
        maxCapacity: 2,
        minCapacity: 1,
        resourceId: "service/${aws_ecs_cluster.demo.name}/${aws_ecs_service.api.name}",
        scalableDimension: "ecs:service:DesiredCount",
        serviceNamespace: "ecs"
      }),
      createLiveObservationNode("aws_appautoscaling_policy", "api_requests", {
        policyType: "TargetTrackingScaling",
        resourceId: "aws_appautoscaling_target.api.resource_id",
        scalableDimension: "aws_appautoscaling_target.api.scalable_dimension",
        serviceNamespace: "aws_appautoscaling_target.api.service_namespace",
        targetTrackingScalingPolicyConfiguration: {
          targetValue: 60,
          predefinedMetricSpecification: [{
            predefinedMetricType: "ALBRequestCountPerTarget",
            resourceLabel: "${aws_lb.demo.arn_suffix}/${aws_lb_target_group.api.arn_suffix}"
          }]
        }
      })
    ],
    edges: []
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /resource "aws_appautoscaling_policy" "api_requests"/);
  assert.match(terraform, /target_tracking_scaling_policy_configuration \{/);
  assert.match(terraform, /predefined_metric_specification \{/);
  assert.match(terraform, /output "ecs_cluster_name" \{[\s\S]*aws_ecs_cluster\.demo\.name/);
  assert.match(terraform, /output "ecs_service_name" \{[\s\S]*aws_ecs_service\.api\.name/);
  assert.match(terraform, /output "max_capacity" \{[\s\S]*value = 2/);
  assert.match(terraform, /output "scale_out_threshold" \{[\s\S]*value = 60/);
  assert.doesNotMatch(terraform, /output "asg_name"/);
});

test("renders application delivery outputs for a single-task Fargate topology", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_s3_bucket", "web_assets", {}),
      createLiveObservationNode("aws_cloudfront_distribution", "web", {
        orderedCacheBehavior: [{ pathPattern: "/api/*" }]
      }),
      createLiveObservationNode("aws_ecr_repository", "api_image", {}),
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      createLiveObservationNode("aws_ecs_cluster", "demo", {}),
      createLiveObservationNode("aws_ecs_service", "api", {}),
      createLiveObservationNode("aws_ecs_task_definition", "api", {})
    ],
    edges: []
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /output "static_site_url"[\s\S]*aws_cloudfront_distribution\.web\.domain_name/);
  assert.match(terraform, /output "api_base_url"[\s\S]*aws_cloudfront_distribution\.web\.domain_name/);
  assert.match(terraform, /output "static_site_bucket_name"[\s\S]*aws_s3_bucket\.web_assets\.bucket/);
  assert.match(terraform, /output "cloudfront_distribution_id"[\s\S]*aws_cloudfront_distribution\.web\.id/);
  assert.match(terraform, /output "ecr_repository_url"[\s\S]*aws_ecr_repository\.api_image\.repository_url/);
  assert.match(terraform, /output "ecs_task_family"[\s\S]*aws_ecs_task_definition\.api\.family/);
  assert.match(terraform, /output "ecs_cluster_name"[\s\S]*aws_ecs_cluster\.demo\.name/);
  assert.match(terraform, /output "ecs_service_name"[\s\S]*aws_ecs_service\.api\.name/);
  assert.doesNotMatch(terraform, /output "max_capacity"/);
});

test("does not emit an ECS request threshold from a CPU target tracking policy", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_s3_bucket_website_configuration", "site", {}),
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      createLiveObservationNode("aws_ecs_cluster", "demo", {}),
      createLiveObservationNode("aws_ecs_service", "api", {}),
      createLiveObservationNode("aws_appautoscaling_target", "api", { maxCapacity: 2 }),
      createLiveObservationNode("aws_appautoscaling_policy", "api_cpu", {
        targetTrackingScalingPolicyConfiguration: {
          targetValue: 60,
          predefinedMetricSpecification: [{
            predefinedMetricType: "ECSServiceAverageCPUUtilization"
          }]
        }
      })
    ],
    edges: []
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /output "ecs_service_name"/);
  assert.doesNotMatch(terraform, /output "scale_out_threshold"/);
});

test("renders CloudWatch Alarm dimensions and Autoscaling Policy action reference", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "alarm-1",
        label: "cpu_alarm",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_cloudwatch_metric_alarm",
          resourceName: "cpu_high",
          fileName: "monitoring"
        },
        config: {
          alarmName: "cpu-high",
          comparisonOperator: "GreaterThanThreshold",
          evaluationPeriods: 2,
          metricName: "CPUUtilization",
          namespace: "AWS/EC2",
          period: 60,
          statistic: "Average",
          threshold: 80,
          dimensions: {
            AutoScalingGroupName: "app-asg"
          },
          alarmActions: ["aws_autoscaling_policy.cpu_target.arn"]
        }
      }
    ],
    edges: []
  };

  assert.equal(
    renderTerraformFromInfrastructureGraph(graph),
    `resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name = "cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods = 2
  metric_name = "CPUUtilization"
  namespace = "AWS/EC2"
  period = 60
  statistic = "Average"
  threshold = 80
  dimensions = {
    AutoScalingGroupName = "app-asg"
  }
  alarm_actions = [
    aws_autoscaling_policy.cpu_target.arn,
  ]
}`
  );
});

test("renders Live Observation outputs for the complete demo topology", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_s3_bucket_website_configuration", "site", {}),
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      createLiveObservationNode("aws_autoscaling_group", "api", {}),
      createLiveObservationNode("aws_cloudwatch_metric_alarm", "scale_out", {
        metricName: "RequestCountPerTarget",
        threshold: 60
      })
    ],
    edges: []
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /output "static_site_url"/);
  assert.match(terraform, /aws_s3_bucket_website_configuration\.site\.website_endpoint/);
  assert.match(terraform, /output "api_base_url"/);
  assert.match(terraform, /aws_lb\.demo\.dns_name/);
  assert.match(terraform, /output "asg_name"/);
  assert.match(terraform, /output "alb_arn_suffix"/);
  assert.match(terraform, /output "target_group_arn_suffix"/);
  assert.match(terraform, /output "scale_out_threshold"[\s\S]*value = 60/);
});

test("renders Step Scaling adjustments as nested Terraform blocks", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_autoscaling_policy", "scale_out", {
        policyType: "StepScaling",
        stepAdjustment: [{ metricIntervalLowerBound: 0, scalingAdjustment: 1 }]
      })
    ],
    edges: []
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /step_adjustment \{/);
  assert.match(terraform, /metric_interval_lower_bound = 0/);
  assert.match(terraform, /scaling_adjustment = 1/);
});

test("rejects unsafe Terraform identifiers while rendering InfrastructureGraph", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "node-1",
        label: "web",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_instance",
          resourceName: `web" {\n}\nresource "aws_s3_bucket" "owned`,
          fileName: "main"
        },
        config: {
          ami: "ami-1234567890abcdef0"
        }
      }
    ],
    edges: []
  };

  assert.throws(
    () => renderTerraformFromInfrastructureGraph(graph),
    TerraformDiagramValidationError
  );
});

test("renders ECS Application Auto Scaling target tracking resources", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "ecs-scaling-target",
        label: "ecs_scaling_target",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_appautoscaling_target",
          resourceName: "ecs_scaling_target",
          fileName: "compute"
        },
        config: {
          minCapacity: 2,
          maxCapacity: 10,
          resourceId: "service/${aws_ecs_cluster.app.name}/${aws_ecs_service.app.name}",
          scalableDimension: "ecs:service:DesiredCount",
          serviceNamespace: "ecs"
        }
      },
      {
        id: "ecs-scaling-policy",
        label: "ecs_scaling_policy",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_appautoscaling_policy",
          resourceName: "ecs_scaling_policy",
          fileName: "compute"
        },
        config: {
          name: "ecs-cpu-target",
          policyType: "TargetTrackingScaling",
          resourceId: "aws_appautoscaling_target.ecs_scaling_target.resource_id",
          scalableDimension: "aws_appautoscaling_target.ecs_scaling_target.scalable_dimension",
          serviceNamespace: "aws_appautoscaling_target.ecs_scaling_target.service_namespace",
          targetTrackingScalingPolicyConfiguration: {
            targetValue: 60,
            predefinedMetricSpecification: [
              { predefinedMetricType: "ECSServiceAverageCPUUtilization" }
            ]
          }
        }
      }
    ],
    edges: []
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /resource "aws_appautoscaling_target" "ecs_scaling_target"/);
  assert.match(
    terraform,
    /resource_id = "service\/\$\{aws_ecs_cluster\.app\.name\}\/\$\{aws_ecs_service\.app\.name\}"/
  );
  assert.match(terraform, /resource "aws_appautoscaling_policy" "ecs_scaling_policy"/);
  assert.match(terraform, /target_tracking_scaling_policy_configuration \{/);
  assert.match(terraform, /predefined_metric_type = "ECSServiceAverageCPUUtilization"/);
});

test("renders deployable ECS service network, load balancer, and rollback blocks", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "ecs-service",
        label: "app",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_ecs_service",
          resourceName: "app"
        },
        config: {
          name: "app",
          cluster: "aws_ecs_cluster.app.id",
          taskDefinition: "aws_ecs_task_definition.app.arn",
          desiredCount: 2,
          launchType: "FARGATE",
          deploymentCircuitBreaker: { enable: true, rollback: true },
          networkConfiguration: {
            assignPublicIp: false,
            subnets: ["aws_subnet.private_a.id", "aws_subnet.private_b.id"],
            securityGroups: ["aws_security_group.app.id"]
          },
          loadBalancer: {
            targetGroupArn: "aws_lb_target_group.app.arn",
            containerName: "app",
            containerPort: 8080
          }
        }
      }
    ],
    edges: []
  };
  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /deployment_circuit_breaker \{/);
  assert.match(terraform, /network_configuration \{/);
  assert.match(terraform, /assign_public_ip = false/);
  assert.match(terraform, /load_balancer \{/);
  assert.match(terraform, /target_group_arn = aws_lb_target_group\.app\.arn/);
});

test("diagram-to-terraform renderer does not import diagram projection concerns", () => {
  const source = readFileSync(new URL("./diagram-to-terraform.ts", import.meta.url), "utf8");

  assert.equal(source.includes("DiagramJson"), false);
  assert.equal(source.includes("buildInfrastructureGraphFromDiagramJson"), false);
});

function createLiveObservationNode(
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
