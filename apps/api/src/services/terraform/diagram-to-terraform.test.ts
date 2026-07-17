import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DiagramJson, InfrastructureGraph } from "@sketchcatch/types";
import {
  TerraformDiagramValidationError,
  renderTerraformFromInfrastructureGraph
} from "./diagram-to-terraform.js";
import { buildInfrastructureGraphFromDiagramJson } from "./infrastructure-graph.js";

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

test("renders managed web bucket versioning and protects release-managed bootstrap content", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      {
        id: "web-bucket",
        label: "web_assets",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_s3_bucket",
          resourceName: "web_assets",
          fileName: "storage"
        },
        config: {
          bucketPrefix: "demo-web-",
          versioningEnabled: true
        }
      },
      {
        id: "bootstrap-index",
        label: "bootstrap_index",
        iac: {
          provider: "aws",
          terraformBlockType: "resource",
          resourceType: "aws_s3_object",
          resourceName: "bootstrap_index",
          fileName: "storage"
        },
        config: {
          bucket: "aws_s3_bucket.web_assets.id",
          key: "index.html",
          content: "bootstrap",
          contentType: "text/html",
          releaseManagedContent: true
        }
      }
    ],
    edges: []
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /resource "aws_s3_bucket_versioning" "web_assets_versioning"/);
  assert.match(terraform, /versioning_configuration \{[\s\S]*status = "Enabled"/);
  assert.match(
    terraform,
    /resource "aws_s3_object" "bootstrap_index"[\s\S]*lifecycle \{[\s\S]*ignore_changes = \[content, content_type, cache_control, etag, source\]/
  );
  assert.doesNotMatch(terraform, /versioning_enabled|release_managed_content/);
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
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      ...createHttpsAlbListenerNodes(),
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
      createLiveObservationNode("aws_ecs_service", "api", {
        loadBalancer: {
          targetGroupArn: "aws_lb_target_group.api.arn",
          containerName: "api",
          containerPort: 3000
        }
      }),
      createLiveObservationNode("aws_ecs_task_definition", "api", {})
    ],
    edges: []
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /output "static_site_url"[\s\S]*aws_cloudfront_distribution\.web\.domain_name/);
  assert.match(terraform, /output "api_base_url"[\s\S]*aws_cloudfront_distribution\.web\.domain_name/);
  assert.match(terraform, /output "static_site_bucket_name"[\s\S]*aws_s3_bucket\.web_assets\.bucket/);
  assert.match(terraform, /output "cloudfront_distribution_id"[\s\S]*aws_cloudfront_distribution\.web\.id/);
  assert.match(terraform, /output "cloudfront_domain_name"[\s\S]*aws_cloudfront_distribution\.web\.domain_name/);
  assert.match(terraform, /output "cloudfront_url"[\s\S]*https:\/\//);
  assert.match(terraform, /output "static_bucket_name"[\s\S]*aws_s3_bucket\.web_assets\.bucket/);
  assert.match(terraform, /output "ecr_repository_name"[\s\S]*aws_ecr_repository\.api_image\.name/);
  assert.match(terraform, /output "ecr_repository_arn"[\s\S]*aws_ecr_repository\.api_image\.arn/);
  assert.match(terraform, /output "ecr_repository_url"[\s\S]*aws_ecr_repository\.api_image\.repository_url/);
  assert.match(terraform, /output "ecs_task_family"[\s\S]*aws_ecs_task_definition\.api\.family/);
  assert.match(terraform, /output "ecs_task_definition_arn"[\s\S]*aws_ecs_task_definition\.api\.arn/);
  assert.match(terraform, /output "ecs_task_role_arn"[\s\S]*aws_ecs_task_definition\.api\.task_role_arn/);
  assert.match(terraform, /output "ecs_execution_role_arn"[\s\S]*aws_ecs_task_definition\.api\.execution_role_arn/);
  assert.match(terraform, /output "ecs_cluster_name"[\s\S]*aws_ecs_cluster\.demo\.name/);
  assert.match(terraform, /output "ecs_service_name"[\s\S]*aws_ecs_service\.api\.name/);
  assert.match(terraform, /output "ecs_container_name"[\s\S]*"api"/);
  assert.match(terraform, /output "ecs_container_port"[\s\S]*3000/);
  assert.match(terraform, /output "alb_arn"[\s\S]*aws_lb\.demo\.arn/);
  assert.match(terraform, /output "alb_dns_name"[\s\S]*aws_lb\.demo\.dns_name/);
  assert.match(terraform, /output "target_group_arn"[\s\S]*aws_lb_target_group\.api\.arn/);
  assert.match(terraform, /output "api_origin_url"[\s\S]*aws_lb\.demo\.dns_name/);
  assert.doesNotMatch(terraform, /output "max_capacity"/);
});

test("does not emit an ECS request threshold from a CPU target tracking policy", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      ...createHttpsAlbListenerNodes(),
      createLiveObservationNode("aws_ecs_cluster", "demo", {}),
      createLiveObservationNode("aws_ecs_service", "api", {
        cluster: "aws_ecs_cluster.demo.id",
        loadBalancer: { targetGroupArn: "aws_lb_target_group.api.arn" }
      }),
      createLiveObservationNode("aws_appautoscaling_target", "api", {
        maxCapacity: 2,
        resourceId: "service/${aws_ecs_cluster.demo.name}/${aws_ecs_service.api.name}"
      }),
      createLiveObservationNode("aws_appautoscaling_policy", "api_cpu", {
        resourceId: "aws_appautoscaling_target.api.resource_id",
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

test("ECS request threshold rejects duplicate matching policies in either graph order", () => {
  const policies = [
    createEcsRequestPolicy("first", 60, "api"),
    createEcsRequestPolicy("second", 75, "api")
  ];

  for (const orderedPolicies of [policies, [...policies].reverse()]) {
    const graph = createEcsThresholdGraph(orderedPolicies);
    const terraform = renderTerraformFromInfrastructureGraph(graph);

    assert.match(terraform, /output "ecs_service_name"/);
    assert.doesNotMatch(terraform, /output "scale_out_threshold"/);
  }
});

test("ECS request threshold rejects a contradictory selected-target policy", () => {
  const graph = createEcsThresholdGraph([
    createEcsRequestPolicy("valid", 60, "api"),
    createEcsRequestPolicy("contradictory", 75, "sibling")
  ], true);

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

test("renders Live Observation outputs only for an explicit HTTPS ALB topology", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      ...createHttpsAlbListenerNodes(),
      createLiveObservationNode("aws_autoscaling_group", "api", {}),
      createLiveObservationNode("aws_cloudwatch_log_group", "api", {
        name: "/aws/ec2/api"
      }),
      createLiveObservationNode("aws_autoscaling_policy", "scale_out", {
        autoscalingGroupName: "aws_autoscaling_group.api.name"
      }),
      createLiveObservationNode("aws_cloudwatch_metric_alarm", "scale_out", {
        metricName: "RequestCountPerTarget",
        threshold: 60,
        alarmActions: ["aws_autoscaling_policy.scale_out.arn"],
        dimensions: {
          LoadBalancer: "aws_lb.demo.arn_suffix",
          TargetGroup: "aws_lb_target_group.api.arn_suffix"
        }
      })
    ],
    edges: []
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /output "traffic_url"[\s\S]*https:\/\/\$\{aws_route53_record\.api\.name\}\/traffic/);
  assert.match(terraform, /output "traffic_hostname"[\s\S]*aws_route53_record\.api\.name/);
  assert.match(terraform, /output "load_balancer_dns_name"[\s\S]*aws_lb\.demo\.dns_name/);
  assert.match(terraform, /output "load_balancer_arn"[\s\S]*aws_lb\.demo\.arn/);
  assert.match(terraform, /output "target_group_arn"[\s\S]*aws_lb_target_group\.api\.arn/);
  assert.match(terraform, /output "log_group_name"[\s\S]*aws_cloudwatch_log_group\.api\.name/);
  assert.match(terraform, /output "asg_name"/);
  assert.doesNotMatch(terraform, /output "static_site_url"/);
  assert.doesNotMatch(terraform, /output "api_base_url"/);
  assert.match(terraform, /output "scale_out_threshold"[\s\S]*value = 60/);
});

test("Live Observation selects the explicitly linked ECS runtime instead of unrelated first nodes", () => {
  const unrelated = createEcsObservationRuntime("other", "other", "other", "other", 9);
  const selected = createEcsObservationRuntime("api", "api", "api", "api", 2);
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_lb", "other", {}),
      createLiveObservationNode("aws_lb_target_group", "other", {}),
      ...unrelated.nodes,
      createLiveObservationNode("aws_lb", "selected", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      createLiveObservationNode("aws_acm_certificate", "selected", {
        domainName: "selected.example.com"
      }),
      createLiveObservationNode("aws_lb_listener", "selected", {
        loadBalancerArn: "aws_lb.selected.arn",
        port: 443,
        protocol: "HTTPS",
        certificateArn: "aws_acm_certificate.selected.arn",
        defaultAction: {
          type: "forward",
          targetGroupArn: "aws_lb_target_group.api.arn"
        }
      }),
      createLiveObservationNode("aws_route53_record", "selected", {
        name: "selected.example.com",
        type: "CNAME",
        records: ["aws_lb.selected.dns_name"]
      }),
      ...selected.nodes
    ],
    edges: [...unrelated.edges, ...selected.edges]
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /output "load_balancer_arn"[\s\S]*aws_lb\.selected\.arn/);
  assert.match(terraform, /output "target_group_arn"[\s\S]*aws_lb_target_group\.api\.arn/);
  assert.match(terraform, /output "ecs_cluster_name"[\s\S]*aws_ecs_cluster\.api\.name/);
  assert.match(terraform, /output "ecs_service_name"[\s\S]*aws_ecs_service\.api\.name/);
  assert.match(terraform, /output "max_capacity"[\s\S]*value = 2/);
  assert.match(terraform, /output "log_group_name"[\s\S]*aws_cloudwatch_log_group\.api\.name/);
  assert.doesNotMatch(terraform, /output "ecs_service_name"[\s\S]*aws_ecs_service\.other\.name/);
  assert.doesNotMatch(terraform, /output "log_group_name"[\s\S]*aws_cloudwatch_log_group\.other\.name/);
});

test("Live Observation does not cross a shared ECS task into a sibling service log", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      createLiveObservationNode("aws_lb_target_group", "sibling", {}),
      ...createHttpsAlbListenerNodes(),
      createLiveObservationNode("aws_ecs_cluster", "shared", {}),
      createLiveObservationNode("aws_ecs_task_definition", "shared", {}),
      createLiveObservationNode("aws_ecs_service", "selected", {
        cluster: "aws_ecs_cluster.shared.id",
        taskDefinition: "aws_ecs_task_definition.shared.arn",
        loadBalancer: { targetGroupArn: "aws_lb_target_group.api.arn" }
      }),
      createLiveObservationNode("aws_ecs_service", "sibling", {
        cluster: "aws_ecs_cluster.shared.id",
        taskDefinition: "aws_ecs_task_definition.shared.arn",
        loadBalancer: { targetGroupArn: "aws_lb_target_group.sibling.arn" }
      }),
      createLiveObservationNode("aws_appautoscaling_target", "selected", {
        maxCapacity: 3,
        resourceId:
          "service/${aws_ecs_cluster.shared.name}/${aws_ecs_service.selected.name}"
      }),
      createLiveObservationNode("aws_cloudwatch_log_group", "selected", {}),
      createLiveObservationNode("aws_cloudwatch_log_group", "sibling", {})
    ],
    edges: [
      {
        id: "selected-task",
        sourceId: "aws_ecs_service-selected",
        targetId: "aws_ecs_task_definition-shared"
      },
      {
        id: "selected-log",
        sourceId: "aws_ecs_task_definition-shared",
        targetId: "aws_cloudwatch_log_group-selected"
      },
      {
        id: "sibling-task",
        sourceId: "aws_ecs_task_definition-shared",
        targetId: "aws_ecs_service-sibling"
      },
      {
        id: "sibling-log",
        sourceId: "aws_ecs_service-sibling",
        targetId: "aws_cloudwatch_log_group-sibling"
      }
    ]
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /output "log_group_name"[\s\S]*aws_cloudwatch_log_group\.selected\.name/);
  assert.doesNotMatch(terraform, /aws_cloudwatch_log_group\.sibling\.name/);
});

test("Live Observation does not cross a shared ASG IAM chain into a sibling log", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      createLiveObservationNode("aws_lb_target_group", "sibling", {}),
      ...createHttpsAlbListenerNodes(),
      createLiveObservationNode("aws_autoscaling_group", "selected", {
        targetGroupArns: ["aws_lb_target_group.api.arn"],
        launchTemplate: { id: "aws_launch_template.selected.id" }
      }),
      createLiveObservationNode("aws_autoscaling_group", "sibling", {
        targetGroupArns: ["aws_lb_target_group.sibling.arn"],
        launchTemplate: { id: "aws_launch_template.sibling.id" }
      }),
      createLiveObservationNode("aws_launch_template", "selected", {
        iamInstanceProfile: { name: "aws_iam_instance_profile.shared.name" }
      }),
      createLiveObservationNode("aws_launch_template", "sibling", {
        iamInstanceProfile: { name: "aws_iam_instance_profile.shared.name" }
      }),
      createLiveObservationNode("aws_iam_instance_profile", "shared", {
        role: "aws_iam_role.shared.name"
      }),
      createLiveObservationNode("aws_iam_role", "shared", {}),
      createLiveObservationNode("aws_cloudwatch_log_group", "selected", {}),
      createLiveObservationNode("aws_cloudwatch_log_group", "sibling", {}),
      createLiveObservationNode("aws_autoscaling_policy", "selected", {
        autoscalingGroupName: "aws_autoscaling_group.selected.name"
      }),
      createLiveObservationNode("aws_cloudwatch_metric_alarm", "selected", {
        metricName: "RequestCountPerTarget",
        threshold: 60,
        alarmActions: ["aws_autoscaling_policy.selected.arn"],
        dimensions: {
          AutoScalingGroupName: "aws_autoscaling_group.selected.name",
          LoadBalancer: "aws_lb.demo.arn_suffix",
          TargetGroup: "aws_lb_target_group.api.arn_suffix"
        }
      })
    ],
    edges: [
      { id: "selected-lt", sourceId: "aws_autoscaling_group-selected", targetId: "aws_launch_template-selected" },
      { id: "selected-profile", sourceId: "aws_launch_template-selected", targetId: "aws_iam_instance_profile-shared" },
      { id: "shared-role", sourceId: "aws_iam_instance_profile-shared", targetId: "aws_iam_role-shared" },
      { id: "sibling-profile", sourceId: "aws_iam_instance_profile-shared", targetId: "aws_launch_template-sibling" },
      { id: "sibling-lt", sourceId: "aws_launch_template-sibling", targetId: "aws_autoscaling_group-sibling" },
      { id: "selected-log", sourceId: "aws_launch_template-selected", targetId: "aws_cloudwatch_log_group-selected" },
      { id: "sibling-log", sourceId: "aws_autoscaling_group-sibling", targetId: "aws_cloudwatch_log_group-sibling" }
    ]
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /output "log_group_name"[\s\S]*aws_cloudwatch_log_group\.selected\.name/);
  assert.doesNotMatch(terraform, /aws_cloudwatch_log_group\.sibling\.name/);
});

test("Live Observation resolves an ASG alarm through its scaling policy action", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      createLiveObservationNode("aws_lb_target_group", "sibling", {}),
      ...createHttpsAlbListenerNodes(),
      createLiveObservationNode("aws_autoscaling_group", "selected", {
        targetGroupArns: ["aws_lb_target_group.api.arn"]
      }),
      createLiveObservationNode("aws_autoscaling_group", "sibling", {
        targetGroupArns: ["aws_lb_target_group.sibling.arn"]
      }),
      createLiveObservationNode("aws_autoscaling_policy", "selected", {
        autoscalingGroupName: "aws_autoscaling_group.selected.name"
      }),
      createLiveObservationNode("aws_cloudwatch_metric_alarm", "selected", {
        metricName: "RequestCountPerTarget",
        threshold: 75,
        alarmActions: ["aws_autoscaling_policy.selected.arn"],
        dimensions: {
          LoadBalancer: "aws_lb.demo.arn_suffix",
          TargetGroup: "aws_lb_target_group.api.arn_suffix"
        }
      })
    ],
    edges: []
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /output "asg_name"[\s\S]*aws_autoscaling_group\.selected\.name/);
  assert.match(terraform, /output "scale_out_threshold"[\s\S]*value = 75/);
});

test("Live Observation rejects an ASG alarm with an unresolved extra action", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      ...createHttpsAlbListenerNodes(),
      createLiveObservationNode("aws_autoscaling_group", "selected", {
        targetGroupArns: ["aws_lb_target_group.api.arn"]
      }),
      createLiveObservationNode("aws_autoscaling_policy", "selected", {
        autoscalingGroupName: "aws_autoscaling_group.selected.name"
      }),
      createLiveObservationNode("aws_cloudwatch_metric_alarm", "selected", {
        metricName: "RequestCountPerTarget",
        threshold: 75,
        alarmActions: [
          "aws_autoscaling_policy.selected.arn",
          "aws_autoscaling_policy.missing.arn"
        ],
        dimensions: {
          LoadBalancer: "aws_lb.demo.arn_suffix",
          TargetGroup: "aws_lb_target_group.api.arn_suffix"
        }
      })
    ],
    edges: []
  };

  assert.doesNotMatch(
    renderTerraformFromInfrastructureGraph(graph),
    /output "traffic_url"/
  );
});

test("Live Observation rejects conflicting sibling ASG ownership evidence", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      createLiveObservationNode("aws_lb_target_group", "sibling", {}),
      ...createHttpsAlbListenerNodes(),
      createLiveObservationNode("aws_autoscaling_group", "selected", {
        targetGroupArns: ["aws_lb_target_group.api.arn"]
      }),
      createLiveObservationNode("aws_autoscaling_group", "sibling", {
        targetGroupArns: ["aws_lb_target_group.sibling.arn"]
      }),
      createLiveObservationNode("aws_autoscaling_policy", "selected", {
        autoscalingGroupName: "aws_autoscaling_group.selected.name"
      }),
      createLiveObservationNode("aws_cloudwatch_metric_alarm", "selected", {
        metricName: "RequestCountPerTarget",
        threshold: 75,
        alarmActions: ["aws_autoscaling_policy.selected.arn"],
        dimensions: {
          LoadBalancer: "aws_lb.demo.arn_suffix",
          TargetGroup: "aws_lb_target_group.api.arn_suffix"
        }
      })
    ],
    edges: [
      {
        id: "conflicting-sibling-owner",
        sourceId: "aws_cloudwatch_metric_alarm-selected",
        targetId: "aws_autoscaling_group-sibling"
      }
    ]
  };

  assert.doesNotMatch(
    renderTerraformFromInfrastructureGraph(graph),
    /output "traffic_url"/
  );
});

test("Live Observation rejects an ASG request alarm scoped to another target group", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      createLiveObservationNode("aws_lb_target_group", "sibling", {}),
      ...createHttpsAlbListenerNodes(),
      createLiveObservationNode("aws_autoscaling_group", "selected", {
        targetGroupArns: ["aws_lb_target_group.api.arn"]
      }),
      createLiveObservationNode("aws_autoscaling_policy", "selected", {
        autoscalingGroupName: "aws_autoscaling_group.selected.name"
      }),
      createLiveObservationNode("aws_cloudwatch_metric_alarm", "selected", {
        metricName: "RequestCountPerTarget",
        threshold: 75,
        alarmActions: ["aws_autoscaling_policy.selected.arn"],
        dimensions: {
          LoadBalancer: "aws_lb.demo.arn_suffix",
          TargetGroup: "aws_lb_target_group.sibling.arn_suffix"
        }
      })
    ],
    edges: []
  };

  assert.doesNotMatch(
    renderTerraformFromInfrastructureGraph(graph),
    /output "traffic_url"/
  );
});

test("Live Observation rejects an ASG alarm with an ambiguous scaling policy action", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      ...createHttpsAlbListenerNodes(),
      createLiveObservationNode("aws_autoscaling_group", "selected", {
        targetGroupArns: ["aws_lb_target_group.api.arn"]
      }),
      createLiveObservationNode("aws_autoscaling_policy", "first", {
        autoscalingGroupName: "aws_autoscaling_group.selected.name"
      }),
      createLiveObservationNode("aws_autoscaling_policy", "second", {
        autoscalingGroupName: "aws_autoscaling_group.selected.name"
      }),
      createLiveObservationNode("aws_cloudwatch_metric_alarm", "ambiguous", {
        metricName: "RequestCountPerTarget",
        threshold: 75,
        alarmActions: [
          "aws_autoscaling_policy.first.arn",
          "aws_autoscaling_policy.second.arn"
        ]
      })
    ],
    edges: [
      {
        id: "stale-direct-alarm",
        sourceId: "aws_cloudwatch_metric_alarm-ambiguous",
        targetId: "aws_autoscaling_group-selected"
      }
    ]
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.doesNotMatch(terraform, /output "traffic_url"/);
  assert.doesNotMatch(terraform, /output "asg_name"/);
});

test("Live Observation blocks a target group attached to multiple runtimes", () => {
  const first = createEcsObservationRuntime("first", "api", "shared", "first", 2);
  const second = createEcsObservationRuntime("second", "api", "shared", "second", 3);
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      ...createHttpsAlbListenerNodes(),
      ...first.nodes,
      ...second.nodes
    ],
    edges: [...first.edges, ...second.edges]
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.doesNotMatch(terraform, /output "traffic_url"/);
  assert.doesNotMatch(terraform, /output "ecs_service_name"/);
});

test("Live Observation does not use a legacy fallback when multiple runtimes are unlinked", () => {
  const first = createEcsObservationRuntime("first", "other-a", "shared", "first", 2);
  const second = createEcsObservationRuntime("second", "other-b", "shared", "second", 3);
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      ...createHttpsAlbListenerNodes(),
      ...first.nodes,
      ...second.nodes
    ],
    edges: [...first.edges, ...second.edges]
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.doesNotMatch(terraform, /output "traffic_url"/);
  assert.doesNotMatch(terraform, /output "ecs_service_name"/);
});

test("Live Observation rejects a stale edge that contradicts the runtime target reference", () => {
  const runtime = createEcsObservationRuntime("api", "other", "api", "api", 2);
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      ...createHttpsAlbListenerNodes(),
      ...runtime.nodes
    ],
    edges: [
      ...runtime.edges,
      {
        id: "stale-api-target",
        sourceId: "aws_lb_target_group-api",
        targetId: "aws_ecs_service-api"
      }
    ]
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.doesNotMatch(terraform, /output "traffic_url"/);
});

test("Live Observation rejects a listener with more than one forward action", () => {
  const runtime = createEcsObservationRuntime("api", "api", "demo", "api", 2);
  const listenerNodes = createHttpsAlbListenerNodes().map((node) =>
    node.iac.resourceType === "aws_lb_listener"
      ? {
          ...node,
          config: {
            ...node.config,
            defaultAction: [
              { type: "forward", targetGroupArn: "aws_lb_target_group.api.arn" },
              { type: "forward" }
            ]
          }
        }
      : node
  );
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      ...listenerNodes,
      ...runtime.nodes
    ],
    edges: runtime.edges
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.doesNotMatch(terraform, /output "traffic_url"/);
});

test("HTTPS ALB graphs without exact ACM Route53 CNAME evidence are ineligible", () => {
  const baseNodes: InfrastructureGraph["nodes"] = [
    createLiveObservationNode("aws_lb", "demo", {}),
    createLiveObservationNode("aws_lb_target_group", "api", {}),
    createLiveObservationNode("aws_acm_certificate", "demo", {
      domainName: "api.example.com"
    }),
    createLiveObservationNode("aws_lb_listener", "https", {
      loadBalancerArn: "aws_lb.demo.arn",
      port: 443,
      protocol: "HTTPS",
      certificateArn: "aws_acm_certificate.demo.arn",
      defaultAction: {
        type: "forward",
        targetGroupArn: "aws_lb_target_group.api.arn"
      }
    }),
    createLiveObservationNode("aws_autoscaling_group", "api", {}),
    createLiveObservationNode("aws_cloudwatch_metric_alarm", "scale_out", {
      metricName: "RequestCountPerTarget",
      threshold: 60
    })
  ];
  const invalidDnsNodes = [
    [],
    [
      createLiveObservationNode("aws_route53_record", "api", {
        name: "other.example.com",
        type: "CNAME",
        records: ["aws_lb.demo.dns_name"]
      })
    ],
    [
      createLiveObservationNode("aws_route53_record", "api", {
        name: "api.example.com",
        type: "CNAME",
        records: ["aws_lb.other.dns_name"]
      })
    ]
  ];

  for (const dnsNodes of invalidDnsNodes) {
    const terraform = renderTerraformFromInfrastructureGraph({
      nodes: [...baseNodes, ...dnsNodes],
      edges: []
    });
    assert.doesNotMatch(terraform, /output "traffic_url"/);
  }
});

test("HTTP-only ALB graphs intentionally omit all Live Observation outputs", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      createLiveObservationNode("aws_lb_listener", "http", {
        loadBalancerArn: "aws_lb.demo.arn",
        port: 80,
        protocol: "HTTP",
        defaultAction: { type: "forward", targetGroupArn: "aws_lb_target_group.api.arn" }
      }),
      createLiveObservationNode("aws_autoscaling_group", "api", {}),
      createLiveObservationNode("aws_cloudwatch_metric_alarm", "scale_out", {
        metricName: "RequestCountPerTarget",
        threshold: 60
      })
    ],
    edges: []
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);
  assert.doesNotMatch(terraform, /output "traffic_url"/);
  assert.doesNotMatch(terraform, /output "load_balancer_dns_name"/);
  assert.doesNotMatch(terraform, /output "api_base_url"/);
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

function createEcsRequestPolicy(
  name: string,
  targetValue: number,
  targetGroupName: string
): InfrastructureGraph["nodes"][number] {
  return createLiveObservationNode("aws_appautoscaling_policy", name, {
    resourceId: "aws_appautoscaling_target.api.resource_id",
    targetTrackingScalingPolicyConfiguration: {
      targetValue,
      predefinedMetricSpecification: [{
        predefinedMetricType: "ALBRequestCountPerTarget",
        resourceLabel:
          "${aws_lb.demo.arn_suffix}/" +
          `\${aws_lb_target_group.${targetGroupName}.arn_suffix}`
      }]
    }
  });
}

function createEcsThresholdGraph(
  policies: InfrastructureGraph["nodes"],
  includeSiblingTargetGroup = false
): InfrastructureGraph {
  return {
    nodes: [
      createLiveObservationNode("aws_lb", "demo", {}),
      createLiveObservationNode("aws_lb_target_group", "api", {}),
      ...(includeSiblingTargetGroup
        ? [createLiveObservationNode("aws_lb_target_group", "sibling", {})]
        : []),
      ...createHttpsAlbListenerNodes(),
      createLiveObservationNode("aws_ecs_cluster", "demo", {}),
      createLiveObservationNode("aws_ecs_service", "api", {
        cluster: "aws_ecs_cluster.demo.id",
        loadBalancer: { targetGroupArn: "aws_lb_target_group.api.arn" }
      }),
      createLiveObservationNode("aws_appautoscaling_target", "api", {
        maxCapacity: 3,
        resourceId: "service/${aws_ecs_cluster.demo.name}/${aws_ecs_service.api.name}"
      }),
      ...policies
    ],
    edges: []
  };
}

function createHttpsAlbListenerNodes(): InfrastructureGraph["nodes"] {
  return [
    createLiveObservationNode("aws_acm_certificate", "demo", { domainName: "api.example.com" }),
    createLiveObservationNode("aws_lb_listener", "https", {
      loadBalancerArn: "aws_lb.demo.arn",
      port: 443,
      protocol: "HTTPS",
      certificateArn: "aws_acm_certificate.demo.arn",
      defaultAction: {
        type: "forward",
        targetGroupArn: "aws_lb_target_group.api.arn"
      }
    }),
    createLiveObservationNode("aws_route53_record", "api", {
      name: "api.example.com",
      type: "CNAME",
      records: ["aws_lb.demo.dns_name"]
    })
  ];
}

function createEcsObservationRuntime(
  name: string,
  targetGroupName: string,
  clusterName: string,
  logGroupName: string,
  maxCapacity: number
): { nodes: InfrastructureGraph["nodes"]; edges: InfrastructureGraph["edges"] } {
  const taskId = `aws_ecs_task_definition-${name}`;
  const serviceId = `aws_ecs_service-${name}`;
  const logId = `aws_cloudwatch_log_group-${logGroupName}`;
  const scalingTargetId = `aws_appautoscaling_target-${name}`;
  return {
    nodes: [
      createLiveObservationNode("aws_ecs_cluster", clusterName, {}),
      createLiveObservationNode("aws_ecs_task_definition", name, {}),
      createLiveObservationNode("aws_ecs_service", name, {
        cluster: `aws_ecs_cluster.${clusterName}.id`,
        taskDefinition: `aws_ecs_task_definition.${name}.arn`,
        loadBalancer: {
          targetGroupArn: `aws_lb_target_group.${targetGroupName}.arn`,
          containerName: name,
          containerPort: 8080
        }
      }),
      createLiveObservationNode("aws_appautoscaling_target", name, {
        maxCapacity,
        resourceId:
          `service/\${aws_ecs_cluster.${clusterName}.name}/` +
          `\${aws_ecs_service.${name}.name}`
      }),
      createLiveObservationNode("aws_appautoscaling_policy", name, {
        resourceId: `aws_appautoscaling_target.${name}.resource_id`,
        targetTrackingScalingPolicyConfiguration: {
          targetValue: 60,
          predefinedMetricSpecification: [{
            predefinedMetricType: "ALBRequestCountPerTarget",
            resourceLabel:
              "${aws_lb.selected.arn_suffix}/" +
              `\${aws_lb_target_group.${targetGroupName}.arn_suffix}`
          }]
        }
      }),
      createLiveObservationNode("aws_cloudwatch_log_group", logGroupName, {})
    ],
    edges: [
      { id: `${name}-target`, sourceId: `aws_lb_target_group-${targetGroupName}`, targetId: serviceId },
      { id: `${name}-task`, sourceId: taskId, targetId: serviceId },
      { id: `${name}-logs`, sourceId: taskId, targetId: logId },
      { id: `${name}-scales`, sourceId: serviceId, targetId: scalingTargetId }
    ]
  };
}

test("Reverse Engineering ALB와 CloudFront fixture는 AWS snapshot을 최소 Terraform 필드로 정규화한다", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_lb", "orders", {
        accountId: "123456789012",
        analysisExcluded: false,
        arn: "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one",
        availabilityZones: [
          { availabilityZone: "ap-northeast-2a", subnetId: "subnet-public-a" },
          { availabilityZone: "ap-northeast-2b", subnetId: "subnet-public-b" }
        ],
        dnsName: "orders-123.ap-northeast-2.elb.amazonaws.com",
        name: "orders",
        providerParameters: { rawSdkField: "must-not-render" },
        providerResourceId:
          "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/orders/one",
        providerResourceType: "AWS::ElasticLoadBalancingV2::LoadBalancer",
        ipAddressType: "dualstack",
        scheme: "internet-facing",
        securityGroupIds: ["sg-web"],
        subnetIds: ["subnet-public-a", "subnet-public-b"],
        type: "application",
        vpcId: "vpc-orders"
      }),
      createLiveObservationNode("aws_cloudfront_distribution", "orders", {
        accountId: "123456789012",
        arn: "arn:aws:cloudfront::123456789012:distribution/EDISTRIBUTION",
        comment: "orders entry",
        defaultCacheBehavior: {
          allowedMethods: ["GET", "HEAD"],
          cachedMethods: ["GET", "HEAD"],
          forwardedValues: { queryString: false, cookies: { forward: "none" } },
          targetOriginId: "orders-alb",
          viewerProtocolPolicy: "redirect-to-https"
        },
        domainName: "d111111abcdef8.cloudfront.net",
        enabled: true,
        id: "EDISTRIBUTION",
        origin: [
          {
            customOriginConfig: {
              httpPort: 80,
              httpsPort: 443,
              originProtocolPolicy: "https-only",
              originSslProtocols: ["TLSv1.2"]
            },
            domainName: "orders-123.ap-northeast-2.elb.amazonaws.com",
            originId: "orders-alb"
          }
        ],
        providerParameters: { rawSdkField: "must-not-render" },
        providerResourceType: "AWS::CloudFront::Distribution",
        restrictions: { geoRestriction: { restrictionType: "none" } },
        status: "Deployed",
        viewerCertificate: { cloudfrontDefaultCertificate: true }
      })
    ],
    edges: []
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /resource "aws_lb" "orders" \{/);
  assert.match(terraform, /name\s+= "orders"/);
  assert.match(terraform, /internal\s+= false/);
  assert.match(terraform, /load_balancer_type\s+= "application"/);
  assert.match(terraform, /ip_address_type\s+= "dualstack"/);
  assert.match(terraform, /security_groups = \[[\s\S]*"sg-web"/);
  assert.match(terraform, /subnets = \[[\s\S]*"subnet-public-a"[\s\S]*"subnet-public-b"/);
  assert.match(terraform, /resource "aws_cloudfront_distribution" "orders" \{/);
  assert.match(terraform, /origin \{[\s\S]*origin_id\s+= "orders-alb"/);
  assert.match(terraform, /default_cache_behavior \{[\s\S]*target_origin_id\s+= "orders-alb"/);
  assert.match(terraform, /restrictions \{[\s\S]*geo_restriction \{/);
  assert.match(terraform, /viewer_certificate \{[\s\S]*cloudfront_default_certificate = true/);
  assert.doesNotMatch(
    terraform,
    /^\s*(account_id|analysis_excluded|arn|availability_zones|dns_name|id|provider_parameters|provider_resource_id|provider_resource_type|scheme|status|type|vpc_id)\s*=/m
  );
  assert.equal(terraform.match(/^\s*domain_name\s*=/gm)?.length, 1);
  assert.doesNotMatch(terraform, /must-not-render/);
});

test("Reverse Engineering ECS fixture는 민감 환경 값 없이 최소 Cluster Service Task Definition을 만든다", () => {
  const clusterArn = "arn:aws:ecs:ap-northeast-2:123456789012:cluster/orders";
  const serviceArn = "arn:aws:ecs:ap-northeast-2:123456789012:service/orders/api";
  const taskDefinitionArn =
    "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/orders:7";
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_ecs_cluster", "orders", {
        arn: clusterArn,
        name: "orders",
        status: "ACTIVE",
        capacityProviders: ["FARGATE", "FARGATE_SPOT"],
        configuration: {
          executeCommandConfiguration: {
            logging: "OVERRIDE",
            logConfiguration: {
              s3BucketName: "orders-command-logs",
              s3EncryptionEnabled: true
            }
          }
        },
        providerParameters: { rawSdkField: "must-not-render" },
        providerResourceId: clusterArn,
        providerResourceType: "AWS::ECS::Cluster"
      }),
      createLiveObservationNode("aws_ecs_task_definition", "orders", {
        arn: taskDefinitionArn,
        family: "orders",
        revision: 7,
        networkMode: "awsvpc",
        requiresCompatibilities: ["FARGATE"],
        cpu: "512",
        memory: "1024",
        executionRoleArn: "arn:aws:iam::123456789012:role/ecs-execution",
        taskRoleArn: "arn:aws:iam::123456789012:role/orders-task",
        containerDefinitions: [
          {
            name: "api",
            image: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/orders:stable",
            essential: true,
            environment: [{ name: "API_TOKEN", value: "must-not-leak" }],
            secrets: [
              {
                name: "DATABASE_URL",
                valueFrom: "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:db"
              }
            ],
            portMappings: [{ containerPort: 4000, protocol: "tcp" }],
            rawSdkField: "must-not-render"
          }
        ],
        providerParameters: { rawSdkField: "must-not-render" },
        providerResourceId: taskDefinitionArn,
        providerResourceType: "AWS::ECS::TaskDefinition"
      }),
      createLiveObservationNode("aws_ecs_service", "api", {
        arn: serviceArn,
        name: "api",
        clusterArn,
        clusterName: "orders",
        taskDefinitionArn,
        desiredCount: 2,
        launchType: "FARGATE",
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets: ["subnet-private-a"],
            securityGroups: ["sg-api"],
            assignPublicIp: "DISABLED"
          }
        },
        loadBalancers: [
          {
            targetGroupArn:
              "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/api/one",
            containerName: "api",
            containerPort: 4000
          }
        ],
        providerParameters: { rawSdkField: "must-not-render" },
        providerResourceId: serviceArn,
        providerResourceType: "AWS::ECS::Service"
      })
    ],
    edges: []
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /resource "aws_ecs_cluster" "orders" \{/);
  assert.match(terraform, /name\s+= "orders"/);
  assert.match(
    terraform,
    /resource "aws_ecs_cluster_capacity_providers" "orders_capacity_providers" \{/
  );
  assert.match(terraform, /cluster_name\s+= aws_ecs_cluster\.orders\.name/);
  assert.match(terraform, /capacity_providers = \[[\s\S]*"FARGATE"[\s\S]*"FARGATE_SPOT"/);
  assert.match(
    terraform,
    /configuration \{[\s\S]*execute_command_configuration \{[\s\S]*logging\s+= "OVERRIDE"/
  );
  assert.match(terraform, /s3_bucket_encryption_enabled\s+= true/);
  assert.doesNotMatch(terraform, /s3_encryption_enabled\s+=/);
  assert.match(terraform, /resource "aws_ecs_task_definition" "orders" \{/);
  assert.match(terraform, /container_definitions\s+= jsonencode\(\[/);
  assert.match(terraform, /network_mode\s+= "awsvpc"/);
  assert.match(terraform, /requires_compatibilities = \[[\s\S]*"FARGATE"/);
  assert.match(terraform, /execution_role_arn\s+= "arn:aws:iam::123456789012:role\/ecs-execution"/);
  assert.match(terraform, /valueFrom = "arn:aws:secretsmanager:[^"]+:secret:db"/);
  assert.match(terraform, /resource "aws_ecs_service" "api" \{/);
  assert.match(terraform, new RegExp(`cluster\\s+= "${clusterArn}"`));
  assert.match(terraform, new RegExp(`task_definition\\s+= "${taskDefinitionArn}"`));
  assert.match(terraform, /desired_count\s+= 2/);
  assert.match(terraform, /launch_type\s+= "FARGATE"/);
  assert.match(
    terraform,
    /network_configuration \{[\s\S]*assign_public_ip\s+= false[\s\S]*security_groups = \[[\s\S]*"sg-api"/
  );
  assert.match(
    terraform,
    /load_balancer \{[\s\S]*target_group_arn\s+= "arn:aws:elasticloadbalancing:[^"]+:targetgroup\/api\/one"/
  );
  assert.doesNotMatch(terraform, /must-not-leak|must-not-render|provider_parameters|raw_sdk_field/);
  assert.doesNotMatch(terraform, /^\s*environment\s*=/m);
  assert.doesNotMatch(terraform, /^\s*cluster_name\s+= "orders"/m);
  assert.doesNotMatch(terraform, /^\s*(arn|cluster_arn|provider_resource_id|provider_resource_type|revision|status|task_definition_arn)\s*=/m);
});

test("Reverse Engineering ECS managed storage-only configuration은 KMS 값을 Terraform nested block으로 보존한다", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_ecs_cluster", "managed_storage", {
        name: "managed-storage",
        configuration: {
          managedStorageConfiguration: {
            kmsKeyId: "arn:aws:kms:ap-northeast-2:123456789012:key/11111111-2222-3333-4444-555555555555",
            fargateEphemeralStorageKmsKeyId:
              "arn:aws:kms:ap-northeast-2:123456789012:key/66666666-7777-8888-9999-000000000000"
          }
        },
        providerResourceId: "arn:aws:ecs:ap-northeast-2:123456789012:cluster/managed-storage",
        providerResourceType: "AWS::ECS::Cluster"
      })
    ],
    edges: []
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(terraform, /resource "aws_ecs_cluster" "managed_storage" \{/);
  assert.match(terraform, /configuration \{[\s\S]*managed_storage_configuration \{/);
  assert.match(
    terraform,
    /managed_storage_configuration \{[\s\S]*kms_key_id\s+= "arn:aws:kms:ap-northeast-2:123456789012:key\/11111111-2222-3333-4444-555555555555"/
  );
  assert.match(
    terraform,
    /managed_storage_configuration \{[\s\S]*fargate_ephemeral_storage_kms_key_id\s+= "arn:aws:kms:ap-northeast-2:123456789012:key\/66666666-7777-8888-9999-000000000000"/
  );
  assert.doesNotMatch(terraform, /execute_command_configuration/);
});

test("Reverse Engineering ECS Service는 classic ELB를 elb_name으로 렌더링하고 불완전한 binding은 생략한다", () => {
  const graph: InfrastructureGraph = {
    nodes: [
      createLiveObservationNode("aws_ecs_service", "classic", {
        name: "classic-api",
        clusterArn: "arn:aws:ecs:ap-northeast-2:123456789012:cluster/orders",
        taskDefinitionArn:
          "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/orders:7",
        desiredCount: 1,
        launchType: "EC2",
        loadBalancers: [
          {
            loadBalancerName: "orders-classic-elb",
            containerName: "api",
            containerPort: 4000
          }
        ],
        providerResourceType: "AWS::ECS::Service"
      }),
      createLiveObservationNode("aws_ecs_service", "incomplete", {
        name: "incomplete-api",
        clusterArn: "arn:aws:ecs:ap-northeast-2:123456789012:cluster/orders",
        taskDefinitionArn:
          "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/orders:7",
        desiredCount: 1,
        launchType: "EC2",
        loadBalancers: [
          { targetGroupArn: "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/api/one", containerName: "api" }
        ],
        providerResourceType: "AWS::ECS::Service"
      })
    ],
    edges: []
  };

  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.match(
    terraform,
    /resource "aws_ecs_service" "classic" \{[\s\S]*load_balancer \{[\s\S]*elb_name\s+= "orders-classic-elb"/
  );
  assert.match(terraform, /container_name\s+= "api"/);
  assert.match(terraform, /container_port\s+= 4000/);
  assert.doesNotMatch(terraform, /load_balancer_name\s+=/);
  assert.doesNotMatch(
    terraform,
    /resource "aws_ecs_service" "incomplete" \{[\s\S]*load_balancer \{/
  );
});

test("생성 필수값이 부족한 Reverse Engineering Resource는 Terraform block과 output에서 제외한다", () => {
  const terraform = renderTerraformFromInfrastructureGraph({
    nodes: [
      createLiveObservationNode("aws_lb", "incomplete", {
        arn: "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/incomplete/one",
        name: "incomplete",
        sketchcatchReferenceTerraform: true,
        terraformValidationMissingFields: ["scheme", "subnetIds"]
      }),
      createLiveObservationNode("aws_cloudfront_distribution", "incomplete", {
        enabled: true,
        id: "EINCOMPLETE",
        sketchcatchReferenceTerraform: true,
        terraformValidationMissingFields: ["origin", "defaultCacheBehavior"]
      })
    ],
    edges: []
  });

  assert.equal(terraform, "");
});

test("관계가 있는 Lambda와 관계 없는 IAM 검토 전용 marker는 Terraform 및 배포 후보가 되지 않는다", () => {
  const diagram: DiagramJson = {
    nodes: [
      {
        id: "vpc-task9",
        type: "aws_vpc",
        kind: "resource",
        label: "Orders VPC",
        position: { x: 0, y: 0 },
        size: { width: 240, height: 120 },
        locked: false,
        zIndex: 1,
        parameters: {
          resourceType: "aws_vpc",
          resourceName: "orders",
          fileName: "network.tf",
          values: { cidrBlock: "10.0.0.0/16", analysisExcluded: false }
        }
      },
      {
        id: "lambda-task9",
        type: "aws_lambda_function",
        kind: "resource",
        label: "확인 필요 · orders-handler",
        position: { x: 280, y: 0 },
        size: { width: 240, height: 120 },
        locked: false,
        zIndex: 2,
        parameters: {
          resourceType: "aws_lambda_function",
          resourceName: "orders_handler",
          fileName: "review-only.tf",
          values: { analysisExcluded: true }
        }
      },
      {
        id: "iam-role-task9",
        type: "aws_iam_role",
        kind: "resource",
        label: "orders-read-only",
        position: { x: 560, y: 0 },
        size: { width: 240, height: 120 },
        locked: false,
        zIndex: 3,
        parameters: {
          resourceType: "aws_iam_role",
          resourceName: "orders_read_only",
          fileName: "review-only.tf",
          values: { analysisExcluded: true }
        }
      }
    ],
    edges: [
      {
        id: "edge-vpc-lambda-task9",
        sourceNodeId: "vpc-task9",
        targetNodeId: "lambda-task9",
        label: "uses"
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const graph = buildInfrastructureGraphFromDiagramJson(diagram);
  const terraform = renderTerraformFromInfrastructureGraph(graph);

  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ["vpc-task9"]
  );
  assert.deepEqual(graph.edges, []);
  assert.match(terraform, /resource "aws_vpc" "orders"/);
  assert.doesNotMatch(
    terraform,
    /aws_lambda_function|aws_iam_role|orders_handler|orders_read_only/
  );
});

test("Reverse Engineering CloudFront VPC origin은 불완전한 Terraform origin block을 만들지 않는다", () => {
  const terraform = renderTerraformFromInfrastructureGraph({
    nodes: [
      createLiveObservationNode("aws_cloudfront_distribution", "private_origin", {
        providerResourceType: "AWS::CloudFront::Distribution",
        enabled: true,
        origin: [
          {
            originId: "private-origin",
            domainName: "internal.example.com",
            VpcOriginConfig: { VpcOriginId: "vo_0123456789abcdef0" }
          }
        ]
      })
    ],
    edges: []
  });

  assert.equal(terraform, "");
});
