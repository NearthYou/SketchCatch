import type { DiagramJson } from "@sketchcatch/types";

export const AUDIENCE_LIVE_CHECK_MANUAL_DIAGRAM: DiagramJson = {
  "edges": [],
  "nodes": [
    {
      "id": "terraform-az-ap-northeast-2a",
      "kind": "resource",
      "size": {
        "width": 760,
        "height": 840
      },
      "type": "aws_availability_zone",
      "label": "ap_northeast_2a",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Architecture-Group-Icons_07312025/AWS-Cloud_32.svg",
      "metadata": {
        "parentAreaNodeId": "authored-audience-live-check-aws_vpc-vpc_fixed_template_ecs_fargate_container_app"
      },
      "position": {
        "x": 504,
        "y": 288
      },
      "parameters": {
        "values": {
          "awsAvailabilityZone": "ap-northeast-2a"
        },
        "fileName": "main.tf",
        "resourceName": "ap_northeast_2a",
        "resourceType": "aws_availability_zone"
      }
    },
    {
      "id": "terraform-az-ap-northeast-2b",
      "kind": "resource",
      "size": {
        "width": 760,
        "height": 843
      },
      "type": "aws_availability_zone",
      "label": "ap_northeast_2b",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Architecture-Group-Icons_07312025/AWS-Cloud_32.svg",
      "metadata": {
        "parentAreaNodeId": "authored-audience-live-check-aws_vpc-vpc_fixed_template_ecs_fargate_container_app"
      },
      "position": {
        "x": 1320,
        "y": 288
      },
      "parameters": {
        "values": {
          "awsAvailabilityZone": "ap-northeast-2b"
        },
        "fileName": "main.tf",
        "resourceName": "ap_northeast_2b",
        "resourceType": "aws_availability_zone"
      }
    },
    {
      "id": "authored-audience-live-check-aws_vpc-vpc_fixed_template_ecs_fargate_container_app",
      "kind": "resource",
      "size": {
        "width": 1700,
        "height": 1000
      },
      "type": "aws_vpc",
      "label": "vpc",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Amazon-Virtual-Private-Cloud_64.svg",
      "position": {
        "x": 440,
        "y": 180
      },
      "parameters": {
        "values": {
          "cidrBlock": "10.30.0.0/16",
          "instanceTenancy": "default",
          "enableDnsSupport": true,
          "enableDnsHostnames": true
        },
        "fileName": "main.tf",
        "resourceName": "vpc",
        "resourceType": "aws_vpc"
      }
    },
    {
      "id": "authored-audience-live-check-aws_subnet-subnet_fixed_template_ecs_fargate_container_app_a",
      "kind": "resource",
      "size": {
        "width": 303,
        "height": 575
      },
      "type": "aws_subnet",
      "label": "subnet_a",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Architecture-Group-Icons_07312025/Private-subnet_32.svg",
      "metadata": {
        "parentAreaNodeId": "terraform-az-ap-northeast-2a"
      },
      "position": {
        "x": 561,
        "y": 368
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id",
          "cidrBlock": "10.30.1.0/24",
          "availabilityZone": "ap-northeast-2a",
          "mapPublicIpOnLaunch": true
        },
        "fileName": "main.tf",
        "resourceName": "subnet_a",
        "resourceType": "aws_subnet",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "authored-audience-live-check-aws_subnet-subnet_fixed_template_ecs_fargate_container_app_b",
      "kind": "resource",
      "size": {
        "width": 328,
        "height": 581
      },
      "type": "aws_subnet",
      "label": "subnet_b",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Architecture-Group-Icons_07312025/Private-subnet_32.svg",
      "metadata": {
        "parentAreaNodeId": "terraform-az-ap-northeast-2b"
      },
      "position": {
        "x": 1352,
        "y": 368
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id",
          "cidrBlock": "10.30.2.0/24",
          "availabilityZone": "ap-northeast-2b",
          "mapPublicIpOnLaunch": true
        },
        "fileName": "main.tf",
        "resourceName": "subnet_b",
        "resourceType": "aws_subnet",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "authored-audience-live-check-aws_internet_gateway-igw_fixed_template_ecs_fargate_container_app",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_internet_gateway",
      "label": "igw",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-VPC_Internet-Gateway_48.svg",
      "metadata": {
        "parentAreaNodeId": "authored-audience-live-check-aws_vpc-vpc_fixed_template_ecs_fargate_container_app"
      },
      "position": {
        "x": 384,
        "y": 312
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id"
        },
        "fileName": "main.tf",
        "resourceName": "igw",
        "resourceType": "aws_internet_gateway",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "authored-audience-live-check-aws_route_table-rt_fixed_template_ecs_fargate_container_app",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_route_table",
      "label": "rt",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-VPC_Router_48.svg",
      "metadata": {
        "parentAreaNodeId": "authored-audience-live-check-aws_vpc-vpc_fixed_template_ecs_fargate_container_app"
      },
      "position": {
        "x": 1152,
        "y": 180
      },
      "parameters": {
        "values": {
          "route": [
            {
              "cidrBlock": "0.0.0.0/0",
              "gatewayId": "aws_internet_gateway.igw.id"
            }
          ],
          "vpcId": "aws_vpc.vpc.id"
        },
        "fileName": "main.tf",
        "resourceName": "rt",
        "resourceType": "aws_route_table",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "authored-audience-live-check-aws_route_table_association-rta_fixed_template_ecs_fargate_container_app_a",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_route_table_association",
      "label": "rta_a",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-VPC_Router_48.svg",
      "position": {
        "x": 1400,
        "y": 540
      },
      "parameters": {
        "values": {
          "subnetId": "aws_subnet.subnet_a.id",
          "routeTableId": "aws_route_table.rt.id"
        },
        "fileName": "main.tf",
        "resourceName": "rta_a",
        "resourceType": "aws_route_table_association"
      }
    },
    {
      "id": "authored-audience-live-check-aws_route_table_association-rta_fixed_template_ecs_fargate_container_app_b",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_route_table_association",
      "label": "rta_b",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-VPC_Router_48.svg",
      "position": {
        "x": 1540,
        "y": 540
      },
      "parameters": {
        "values": {
          "subnetId": "aws_subnet.subnet_b.id",
          "routeTableId": "aws_route_table.rt.id"
        },
        "fileName": "main.tf",
        "resourceName": "rta_b",
        "resourceType": "aws_route_table_association"
      }
    },
    {
      "id": "authored-audience-live-check-aws_ecs_cluster-ecs_cluster_fixed_template_fargate_container_app",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_ecs_cluster",
      "label": "ecs_cluster",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Containers/64/Arch_Amazon-Elastic-Container-Service_64.svg",
      "metadata": {
        "parentAreaNodeId": "authored-audience-live-check-aws_subnet-subnet_private_app_a"
      },
      "position": {
        "x": 928,
        "y": 784
      },
      "parameters": {
        "values": {
          "name": "audience-live-check-cluster"
        },
        "fileName": "main.tf",
        "resourceName": "ecs_cluster",
        "resourceType": "aws_ecs_cluster"
      }
    },
    {
      "id": "authored-audience-live-check-aws_security_group-sg_fixed_template_ecs_fargate_container_app_alb",
      "kind": "resource",
      "size": {
        "width": 280,
        "height": 189
      },
      "type": "aws_security_group",
      "label": "sg_alb",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_General-Icons/Res_48_Light/Res_Firewall_48_Light.svg",
      "position": {
        "x": 560,
        "y": 510
      },
      "parameters": {
        "values": {
          "name": "audience-live-check-alb-sg",
          "vpcId": "aws_vpc.vpc.id",
          "egress": [
            {
              "toPort": 0,
              "fromPort": 0,
              "protocol": "-1",
              "cidrBlocks": [
                "0.0.0.0/0"
              ]
            }
          ],
          "ingress": [
            {
              "toPort": 80,
              "fromPort": 80,
              "protocol": "tcp",
              "cidrBlocks": [
                "0.0.0.0/0"
              ]
            }
          ],
          "description": "Allow CloudFront origin HTTP while CloudFront terminates public TLS"
        },
        "fileName": "main.tf",
        "resourceName": "sg_alb",
        "resourceType": "aws_security_group"
      }
    },
    {
      "id": "authored-audience-live-check-aws_security_group-sg_fixed_template_ecs_fargate_container_app_task",
      "kind": "resource",
      "size": {
        "width": 260,
        "height": 300
      },
      "type": "aws_security_group",
      "label": "sg_task",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_General-Icons/Res_48_Light/Res_Firewall_48_Light.svg",
      "position": {
        "x": 920,
        "y": 420
      },
      "parameters": {
        "values": {
          "name": "audience-live-check-task-sg",
          "vpcId": "aws_vpc.vpc.id",
          "egress": [
            {
              "toPort": 0,
              "fromPort": 0,
              "protocol": "-1",
              "cidrBlocks": [
                "0.0.0.0/0"
              ]
            }
          ],
          "ingress": [
            {
              "toPort": 8080,
              "fromPort": 8080,
              "protocol": "tcp",
              "securityGroups": [
                "aws_security_group.sg_alb.id"
              ]
            }
          ],
          "description": "Allow ALB traffic to the API on port 8080"
        },
        "fileName": "main.tf",
        "resourceName": "sg_task",
        "resourceType": "aws_security_group"
      }
    },
    {
      "id": "authored-audience-live-check-aws_iam_role-role_fixed_template_ecs_fargate_container_app_execution",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_iam_role",
      "label": "role_execution",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Role_48.svg",
      "position": {
        "x": 2350,
        "y": 250
      },
      "parameters": {
        "values": {
          "name": "audience-live-check-ecs-execution",
          "assumeRolePolicy": "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
        },
        "fileName": "main.tf",
        "resourceName": "role_execution",
        "resourceType": "aws_iam_role"
      }
    },
    {
      "id": "authored-audience-live-check-aws_iam_role_policy_attachment-fixed_template_ecs_fargate_container_app_execution_policy",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_iam_policy",
      "label": "execution_policy",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Permissions_48.svg",
      "position": {
        "x": 2500,
        "y": 250
      },
      "parameters": {
        "values": {
          "role": "aws_iam_role.role_execution.name",
          "policyArn": "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
        },
        "fileName": "main.tf",
        "resourceName": "execution_policy",
        "resourceType": "aws_iam_role_policy_attachment"
      }
    },
    {
      "id": "authored-audience-live-check-aws_iam_role-role_fixed_template_ecs_fargate_container_app_task",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_iam_role",
      "label": "role_task",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Role_48.svg",
      "position": {
        "x": 2200,
        "y": 390
      },
      "parameters": {
        "values": {
          "name": "audience-live-check-ecs-task",
          "assumeRolePolicy": "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
        },
        "fileName": "main.tf",
        "resourceName": "role_task",
        "resourceType": "aws_iam_role"
      }
    },
    {
      "id": "authored-audience-live-check-aws_lb-alb_fixed_template_ecs_fargate_container_app",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_lb",
      "label": "alb",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Elastic-Load-Balancing_64.svg",
      "position": {
        "x": 590,
        "y": 550
      },
      "parameters": {
        "values": {
          "name": "audience-live-check-alb",
          "subnets": [
            "aws_subnet.subnet_a.id",
            "aws_subnet.subnet_b.id"
          ],
          "securityGroups": [
            "aws_security_group.sg_alb.id"
          ],
          "loadBalancerType": "application"
        },
        "fileName": "main.tf",
        "resourceName": "alb",
        "resourceType": "aws_lb"
      }
    },
    {
      "id": "authored-audience-live-check-aws_lb_target_group-tg_fixed_template_ecs_fargate_container_app",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_lb_target_group",
      "label": "tg",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Elastic-Load-Balancing_Application-Load-Balancer_48.svg",
      "position": {
        "x": 720,
        "y": 550
      },
      "parameters": {
        "values": {
          "name": "audience-live-check-api",
          "port": 8080,
          "vpcId": "aws_vpc.vpc.id",
          "protocol": "HTTP",
          "targetType": "ip",
          "healthCheck": {
            "path": "/health",
            "matcher": "200-399"
          }
        },
        "fileName": "main.tf",
        "resourceName": "tg",
        "resourceType": "aws_lb_target_group"
      }
    },
    {
      "id": "authored-audience-live-check-aws_lb_listener-listener_fixed_template_ecs_fargate_container_app",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_lb_listener",
      "label": "listener",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Elastic-Load-Balancing_Application-Load-Balancer_48.svg",
      "metadata": {
        "parentAreaNodeId": "authored-audience-live-check-aws_subnet-subnet_fixed_template_ecs_fargate_container_app_a"
      },
      "position": {
        "x": 628,
        "y": 748
      },
      "parameters": {
        "values": {
          "port": 80,
          "protocol": "HTTP",
          "defaultAction": [
            {
              "type": "forward",
              "targetGroupArn": "aws_lb_target_group.tg.arn"
            }
          ],
          "loadBalancerArn": "aws_lb.alb.arn"
        },
        "fileName": "main.tf",
        "resourceName": "listener",
        "resourceType": "aws_lb_listener"
      }
    },
    {
      "id": "authored-audience-live-check-aws_ecs_task_definition-task_fixed_template_fargate_container_app",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_ecs_task_definition",
      "label": "task",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Containers/Res_Amazon-Elastic-Container-Service_Task_48.svg",
      "metadata": {
        "parentAreaNodeId": "authored-audience-live-check-aws_subnet-subnet_private_app_a"
      },
      "position": {
        "x": 952,
        "y": 484
      },
      "parameters": {
        "values": {
          "cpu": 256,
          "family": "audience-live-check-api",
          "memory": 512,
          "dependsOn": [
            "aws_cloudwatch_log_group.logs_ecs",
            "aws_secretsmanager_secret_version.check_in_signing",
            "aws_iam_role_policy.check_in_signing_read"
          ],
          "networkMode": "awsvpc",
          "taskRoleArn": "aws_iam_role.role_task.arn",
          "executionRoleArn": "aws_iam_role.role_execution.arn",
          "containerDefinitions": "[{\"name\":\"api\",\"image\":\"public.ecr.aws/docker/library/nginx:1.27-alpine\",\"essential\":true,\"entryPoint\":[\"/bin/sh\",\"-c\"],\"command\":[\"printf '%s\\\\n' 'server {' '  listen 8080;' '  default_type text/plain;' '  location = /health { return 200 ok; }' '  location / { return 200 SketchCatch-deployment-smoke; }' '}' > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'\"],\"portMappings\":[{\"containerPort\":8080,\"hostPort\":8080,\"protocol\":\"tcp\"}],\"environment\":[{\"name\":\"PORT\",\"value\":\"8080\"},{\"name\":\"WEB_ORIGIN\",\"value\":\"https://${aws_cloudfront_distribution.cdn_web.domain_name}\"},{\"name\":\"INSTANCE_ID\",\"value\":\"fargate\"}],\"logConfiguration\":{\"logDriver\":\"awslogs\",\"options\":{\"awslogs-group\":\"/ecs/audience-live-check-api\",\"awslogs-region\":\"ap-northeast-2\",\"awslogs-stream-prefix\":\"api\"}},\"secrets\":[{\"name\":\"CHECK_IN_SIGNING_SECRET\",\"valueFrom\":\"${aws_secretsmanager_secret.check_in_signing.arn}\"}]}]",
          "requiresCompatibilities": [
            "FARGATE"
          ]
        },
        "fileName": "main.tf",
        "resourceName": "task",
        "resourceType": "aws_ecs_task_definition"
      }
    },
    {
      "id": "authored-audience-live-check-aws_ecs_service-ecs_service_fixed_template_fargate_container_app",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_ecs_service",
      "label": "ecs_service",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Containers/Res_Amazon-Elastic-Container-Service_Service_48.svg",
      "metadata": {
        "parentAreaNodeId": "authored-audience-live-check-aws_subnet-subnet_private_app_a"
      },
      "position": {
        "x": 940,
        "y": 616
      },
      "parameters": {
        "values": {
          "name": "audience-live-check-service",
          "cluster": "aws_ecs_cluster.ecs_cluster.id",
          "dependsOn": [
            "aws_lb_listener.listener"
          ],
          "lifecycle": {
            "ignoreChanges": [
              "desired_count"
            ]
          },
          "launchType": "FARGATE",
          "desiredCount": 1,
          "loadBalancer": [
            {
              "containerName": "api",
              "containerPort": 8080,
              "targetGroupArn": "aws_lb_target_group.tg.arn"
            }
          ],
          "taskDefinition": "aws_ecs_task_definition.task.arn",
          "networkConfiguration": [
            {
              "subnets": [
                "aws_subnet.subnet_private_app_a.id",
                "aws_subnet.subnet_private_app_b.id"
              ],
              "assignPublicIp": false,
              "securityGroups": [
                "aws_security_group.sg_task.id"
              ]
            }
          ],
          "healthCheckGracePeriodSeconds": 30
        },
        "fileName": "main.tf",
        "resourceName": "ecs_service",
        "resourceType": "aws_ecs_service"
      }
    },
    {
      "id": "authored-audience-live-check-aws_appautoscaling_policy-ecs_service_requests",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_appautoscaling_policy",
      "label": "ecs_service_requests",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Compute/Res_Amazon-EC2_Auto-Scaling_48.svg",
      "position": {
        "x": 1870,
        "y": 430
      },
      "parameters": {
        "values": {
          "name": "audience-live-check-request-scaling",
          "policyType": "TargetTrackingScaling",
          "resourceId": "service/${aws_ecs_cluster.ecs_cluster.name}/${aws_ecs_service.ecs_service.name}",
          "serviceNamespace": "ecs",
          "scalableDimension": "ecs:service:DesiredCount",
          "targetTrackingScalingPolicyConfiguration": [
            {
              "targetValue": 50,
              "scaleInCooldown": 300,
              "scaleOutCooldown": 30,
              "predefinedMetricSpecification": [
                {
                  "resourceLabel": "${aws_lb.alb.arn_suffix}/${aws_lb_target_group.tg.arn_suffix}",
                  "predefinedMetricType": "ALBRequestCountPerTarget"
                }
              ]
            }
          ]
        },
        "fileName": "main.tf",
        "resourceName": "ecs_service_requests",
        "resourceType": "aws_appautoscaling_policy"
      }
    },
    {
      "id": "authored-audience-live-check-aws_subnet-subnet_private_app_a",
      "kind": "resource",
      "size": {
        "width": 320,
        "height": 580
      },
      "type": "aws_subnet",
      "label": "subnet_private_app_a",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Architecture-Group-Icons_07312025/Private-subnet_32.svg",
      "metadata": {
        "parentAreaNodeId": "terraform-az-ap-northeast-2a"
      },
      "position": {
        "x": 894,
        "y": 368
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id",
          "cidrBlock": "10.30.11.0/24",
          "availabilityZone": "ap-northeast-2a",
          "mapPublicIpOnLaunch": false
        },
        "fileName": "main.tf",
        "resourceName": "subnet_private_app_a",
        "resourceType": "aws_subnet",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "authored-audience-live-check-aws_subnet-subnet_private_app_b",
      "kind": "resource",
      "size": {
        "width": 320,
        "height": 580
      },
      "type": "aws_subnet",
      "label": "subnet_private_app_b",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Architecture-Group-Icons_07312025/Private-subnet_32.svg",
      "metadata": {
        "parentAreaNodeId": "terraform-az-ap-northeast-2b"
      },
      "position": {
        "x": 1710,
        "y": 368
      },
      "parameters": {
        "values": {
          "vpcId": "aws_vpc.vpc.id",
          "cidrBlock": "10.30.12.0/24",
          "availabilityZone": "ap-northeast-2b",
          "mapPublicIpOnLaunch": false
        },
        "fileName": "main.tf",
        "resourceName": "subnet_private_app_b",
        "resourceType": "aws_subnet",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "authored-audience-live-check-aws_eip-eip_nat",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_eip",
      "label": "eip_nat",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Compute/Res_Amazon-EC2_Elastic-IP-Address_48.svg",
      "position": {
        "x": 1400,
        "y": 410
      },
      "parameters": {
        "values": {
          "domain": "vpc"
        },
        "fileName": "main.tf",
        "resourceName": "eip_nat",
        "resourceType": "aws_eip"
      }
    },
    {
      "id": "authored-audience-live-check-aws_nat_gateway-nat_private_egress",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_nat_gateway",
      "label": "nat_private_egress",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-VPC_NAT-Gateway_48.svg",
      "position": {
        "x": 1535,
        "y": 410
      },
      "parameters": {
        "values": {
          "subnetId": "aws_subnet.subnet_a.id",
          "allocationId": "aws_eip.eip_nat.id"
        },
        "fileName": "main.tf",
        "resourceName": "nat_private_egress",
        "resourceType": "aws_nat_gateway"
      }
    },
    {
      "id": "authored-audience-live-check-aws_route_table-rt_private_app",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_route_table",
      "label": "rt_private_app",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-VPC_Router_48.svg",
      "metadata": {
        "parentAreaNodeId": "authored-audience-live-check-aws_vpc-vpc_fixed_template_ecs_fargate_container_app"
      },
      "position": {
        "x": 1284,
        "y": 180
      },
      "parameters": {
        "values": {
          "route": [
            {
              "cidrBlock": "0.0.0.0/0",
              "natGatewayId": "aws_nat_gateway.nat_private_egress.id"
            }
          ],
          "vpcId": "aws_vpc.vpc.id"
        },
        "fileName": "main.tf",
        "resourceName": "rt_private_app",
        "resourceType": "aws_route_table",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "authored-audience-live-check-aws_route_table_association-rta_private_app_a",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_route_table_association",
      "label": "rta_private_app_a",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-VPC_Router_48.svg",
      "metadata": {
        "parentAreaNodeId": "authored-audience-live-check-aws_subnet-subnet_private_app_a"
      },
      "position": {
        "x": 1872,
        "y": 600
      },
      "parameters": {
        "values": {
          "subnetId": "aws_subnet.subnet_private_app_a.id",
          "routeTableId": "aws_route_table.rt_private_app.id"
        },
        "fileName": "main.tf",
        "resourceName": "rta_private_app_a",
        "resourceType": "aws_route_table_association",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "authored-audience-live-check-aws_route_table_association-rta_private_app_b",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_route_table_association",
      "label": "rta_private_app_b",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Networking-Content-Delivery/Res_Amazon-VPC_Router_48.svg",
      "metadata": {
        "parentAreaNodeId": "authored-audience-live-check-aws_subnet-subnet_private_app_b"
      },
      "position": {
        "x": 1740,
        "y": 604
      },
      "parameters": {
        "values": {
          "subnetId": "aws_subnet.subnet_private_app_b.id",
          "routeTableId": "aws_route_table.rt_private_app.id"
        },
        "fileName": "main.tf",
        "resourceName": "rta_private_app_b",
        "resourceType": "aws_route_table_association",
        "terraformBlockType": "resource"
      }
    },
    {
      "id": "authored-audience-live-check-aws_s3_bucket-bucket_web_assets",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_s3_bucket",
      "label": "bucket_web_assets",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Storage/Res_Amazon-Simple-Storage-Service_Bucket_48.svg",
      "position": {
        "x": 50,
        "y": 390
      },
      "parameters": {
        "values": {
          "bucketPrefix": "audience-live-check-web-",
          "forceDestroy": true
        },
        "fileName": "main.tf",
        "resourceName": "bucket_web_assets",
        "resourceType": "aws_s3_bucket"
      }
    },
    {
      "id": "authored-audience-live-check-aws_s3_bucket_versioning-bucket_web_assets_versioning",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_s3_bucket",
      "label": "bucket_web_assets_versioning",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Storage/Res_Amazon-Simple-Storage-Service_Bucket_48.svg",
      "position": {
        "x": 200,
        "y": 520
      },
      "parameters": {
        "values": {
          "bucket": "aws_s3_bucket.bucket_web_assets.id",
          "versioningConfiguration": [
            {
              "status": "Enabled"
            }
          ]
        },
        "fileName": "main.tf",
        "resourceName": "bucket_web_assets_versioning",
        "resourceType": "aws_s3_bucket_versioning"
      }
    },
    {
      "id": "authored-audience-live-check-aws_s3_bucket_public_access_block-web_public_access",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_s3_bucket",
      "label": "web_public_access",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Storage/Res_Amazon-Simple-Storage-Service_Bucket_48.svg",
      "position": {
        "x": 50,
        "y": 650
      },
      "parameters": {
        "values": {
          "bucket": "aws_s3_bucket.bucket_web_assets.id",
          "blockPublicAcls": true,
          "ignorePublicAcls": true,
          "blockPublicPolicy": true,
          "restrictPublicBuckets": true
        },
        "fileName": "main.tf",
        "resourceName": "web_public_access",
        "resourceType": "aws_s3_bucket_public_access_block"
      }
    },
    {
      "id": "authored-audience-live-check-aws_s3_object-web_bootstrap_index",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_s3_bucket",
      "label": "web_bootstrap_index",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Storage/Res_Amazon-Simple-Storage-Service_Bucket_48.svg",
      "position": {
        "x": 200,
        "y": 650
      },
      "parameters": {
        "values": {
          "key": "index.html",
          "bucket": "aws_s3_bucket.bucket_web_assets.id",
          "content": "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Application deployment ready</title><body><main><h1>Application deployment ready</h1><p>GitHub Actions will replace this bootstrap document with apps/web/dist.</p></main></body></html>",
          "lifecycle": {
            "ignoreChanges": [
              "content",
              "content_type",
              "cache_control",
              "etag",
              "source"
            ]
          },
          "contentType": "text/html; charset=utf-8"
        },
        "fileName": "main.tf",
        "resourceName": "web_bootstrap_index",
        "resourceType": "aws_s3_object"
      }
    },
    {
      "id": "authored-audience-live-check-aws_cloudfront_origin_access_control-web_oac",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_cloudfront_distribution",
      "label": "web_oac",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Amazon-CloudFront_64.svg",
      "position": {
        "x": 200,
        "y": 390
      },
      "parameters": {
        "values": {
          "name": "audience-live-check-web-oac",
          "signingBehavior": "always",
          "signingProtocol": "sigv4",
          "originAccessControlOriginType": "s3"
        },
        "fileName": "main.tf",
        "resourceName": "web_oac",
        "resourceType": "aws_cloudfront_origin_access_control"
      }
    },
    {
      "id": "authored-audience-live-check-aws_cloudfront_distribution-cdn_web",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_cloudfront_distribution",
      "label": "cdn_web",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Amazon-CloudFront_64.svg",
      "position": {
        "x": 50,
        "y": 250
      },
      "parameters": {
        "values": {
          "origin": [
            {
              "originId": "web-assets",
              "domainName": "aws_s3_bucket.bucket_web_assets.bucket_regional_domain_name",
              "originAccessControlId": "aws_cloudfront_origin_access_control.web_oac.id"
            },
            {
              "originId": "api-alb",
              "domainName": "aws_lb.alb.dns_name",
              "customOriginConfig": [
                {
                  "httpPort": 80,
                  "httpsPort": 443,
                  "originSslProtocols": [
                    "TLSv1.2"
                  ],
                  "originProtocolPolicy": "http-only"
                }
              ]
            }
          ],
          "enabled": true,
          "priceClass": "PriceClass_100",
          "restrictions": [
            {
              "geoRestriction": [
                {
                  "restrictionType": "none"
                }
              ]
            }
          ],
          "defaultRootObject": "index.html",
          "viewerCertificate": [
            {
              "cloudfrontDefaultCertificate": true
            }
          ],
          "defaultCacheBehavior": [
            {
              "cachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
              "cachedMethods": [
                "GET",
                "HEAD"
              ],
              "allowedMethods": [
                "GET",
                "HEAD"
              ],
              "targetOriginId": "web-assets",
              "viewerProtocolPolicy": "redirect-to-https"
            }
          ],
          "orderedCacheBehavior": [
            {
              "pathPattern": "/api/*",
              "cachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
              "cachedMethods": [
                "GET",
                "HEAD"
              ],
              "allowedMethods": [
                "DELETE",
                "GET",
                "HEAD",
                "OPTIONS",
                "PATCH",
                "POST",
                "PUT"
              ],
              "targetOriginId": "api-alb",
              "viewerProtocolPolicy": "redirect-to-https",
              "originRequestPolicyId": "b689b0a8-53d0-40ab-baf2-68738e2966ac"
            },
            {
              "pathPattern": "/health",
              "cachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
              "cachedMethods": [
                "GET",
                "HEAD"
              ],
              "allowedMethods": [
                "DELETE",
                "GET",
                "HEAD",
                "OPTIONS",
                "PATCH",
                "POST",
                "PUT"
              ],
              "targetOriginId": "api-alb",
              "viewerProtocolPolicy": "redirect-to-https",
              "originRequestPolicyId": "b689b0a8-53d0-40ab-baf2-68738e2966ac"
            }
          ]
        },
        "fileName": "main.tf",
        "resourceName": "cdn_web",
        "resourceType": "aws_cloudfront_distribution"
      }
    },
    {
      "id": "authored-audience-live-check-aws_s3_bucket_policy-web_cloudfront_read",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_s3_bucket",
      "label": "web_cloudfront_read",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Storage/Res_Amazon-Simple-Storage-Service_Bucket_48.svg",
      "position": {
        "x": 50,
        "y": 520
      },
      "parameters": {
        "values": {
          "bucket": "aws_s3_bucket.bucket_web_assets.id",
          "policy": "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"AllowCloudFrontServicePrincipalReadOnly\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"cloudfront.amazonaws.com\"},\"Action\":\"s3:GetObject\",\"Resource\":\"${aws_s3_bucket.bucket_web_assets.arn}/*\",\"Condition\":{\"StringEquals\":{\"AWS:SourceArn\":\"${aws_cloudfront_distribution.cdn_web.arn}\"}}}]}",
          "dependsOn": [
            "aws_s3_bucket_public_access_block.web_public_access"
          ]
        },
        "fileName": "main.tf",
        "resourceName": "web_cloudfront_read",
        "resourceType": "aws_s3_bucket_policy"
      }
    },
    {
      "id": "authored-audience-live-check-aws_ecr_repository-ecr_api_image",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_ecr_repository",
      "label": "ecr_api_image",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Containers/Res_Amazon-Elastic-Container-Registry_Registry_48.svg",
      "position": {
        "x": 2200,
        "y": 250
      },
      "parameters": {
        "values": {
          "name": "audience-live-check-api",
          "forceDelete": true,
          "imageTagMutability": "IMMUTABLE",
          "imageScanningConfiguration": [
            {
              "scanOnPush": true
            }
          ]
        },
        "fileName": "main.tf",
        "resourceName": "ecr_api_image",
        "resourceType": "aws_ecr_repository"
      }
    },
    {
      "id": "authored-audience-live-check-aws_cloudwatch_log_group-logs_ecs",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_cloudwatch_log_group",
      "label": "logs_ecs",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Management-Governance/Res_Amazon-CloudWatch_Logs_48.svg",
      "position": {
        "x": 2350,
        "y": 390
      },
      "parameters": {
        "values": {
          "name": "/ecs/audience-live-check-api",
          "retentionInDays": 30
        },
        "fileName": "main.tf",
        "resourceName": "logs_ecs",
        "resourceType": "aws_cloudwatch_log_group"
      }
    },
    {
      "id": "authored-audience-live-check-aws_secretsmanager_secret-check_in_signing",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_secretsmanager_secret",
      "label": "check_in_signing",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Security-Identity-Compliance/64/Arch_AWS-Secrets-Manager_64.svg",
      "position": {
        "x": 2500,
        "y": 390
      },
      "parameters": {
        "values": {
          "namePrefix": "audience-live-check/check-in-signing-",
          "recoveryWindowInDays": 0
        },
        "fileName": "main.tf",
        "resourceName": "check_in_signing",
        "resourceType": "aws_secretsmanager_secret"
      }
    },
    {
      "id": "authored-audience-live-check-aws_secretsmanager_secret_version-check_in_signing",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_secretsmanager_secret",
      "label": "check_in_signing",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Architecture-Service-Icons_07312025/Arch_Security-Identity-Compliance/64/Arch_AWS-Secrets-Manager_64.svg",
      "position": {
        "x": 2200,
        "y": 530
      },
      "parameters": {
        "values": {
          "secretId": "aws_secretsmanager_secret.check_in_signing.id",
          "secretString": "random_password.check_in_signing.result"
        },
        "fileName": "main.tf",
        "resourceName": "check_in_signing",
        "resourceType": "aws_secretsmanager_secret_version"
      }
    },
    {
      "id": "authored-audience-live-check-aws_iam_role_policy-check_in_signing_read",
      "kind": "resource",
      "size": {
        "width": 124,
        "height": 96
      },
      "type": "aws_iam_policy",
      "label": "check_in_signing_read",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 0,
      "iconUrl": "/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Permissions_48.svg",
      "position": {
        "x": 2350,
        "y": 530
      },
      "parameters": {
        "values": {
          "name": "audience-live-check-check-in-signing-read",
          "role": "aws_iam_role.role_execution.id",
          "policy": "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"ReadCheckInSigningSecret\",\"Effect\":\"Allow\",\"Action\":[\"secretsmanager:GetSecretValue\"],\"Resource\":\"${aws_secretsmanager_secret.check_in_signing.arn}\"}]}"
        },
        "fileName": "main.tf",
        "resourceName": "check_in_signing_read",
        "resourceType": "aws_iam_role_policy"
      }
    },
    {
      "id": "node-mrtn5hw7-1fo2wf",
      "kind": "resource",
      "size": {
        "width": 2391,
        "height": 1208
      },
      "type": "aws_region",
      "label": "Region",
      "style": {
        "textColor": "#172033",
        "borderColor": "#2f6db3"
      },
      "locked": false,
      "zIndex": 1,
      "iconUrl": "/Architecture-Group-Icons_07312025/Region_32.svg",
      "position": {
        "x": 336,
        "y": 48
      },
      "parameters": {
        "values": {
          "awsRegion": "ap-northeast-2"
        },
        "fileName": "main",
        "resourceName": "ap_northeast_2",
        "resourceType": "aws_region"
      }
    }
  ],
  "viewport": {
    "x": -111.39119063623684,
    "y": 160.46833447588995,
    "zoom": 0.636076365085627
  },
  "presentation": {
    "geometryPolicy": "source-exact",
    "terraformSourceFingerprint": "{\"nodes\":[{\"id\":\"terraform-az-ap-northeast-2a\",\"kind\":\"resource\",\"type\":\"aws_availability_zone\",\"label\":\"ap_northeast_2a\",\"metadata\":{\"parentAreaNodeId\":\"authored-audience-live-check-aws_vpc-vpc_fixed_template_ecs_fargate_container_app\"},\"parameters\":{\"values\":{\"awsAvailabilityZone\":\"ap-northeast-2a\"},\"fileName\":\"main.tf\",\"resourceName\":\"ap_northeast_2a\",\"resourceType\":\"aws_availability_zone\"}},{\"id\":\"terraform-az-ap-northeast-2b\",\"kind\":\"resource\",\"type\":\"aws_availability_zone\",\"label\":\"ap_northeast_2b\",\"metadata\":{\"parentAreaNodeId\":\"authored-audience-live-check-aws_vpc-vpc_fixed_template_ecs_fargate_container_app\"},\"parameters\":{\"values\":{\"awsAvailabilityZone\":\"ap-northeast-2b\"},\"fileName\":\"main.tf\",\"resourceName\":\"ap_northeast_2b\",\"resourceType\":\"aws_availability_zone\"}},{\"id\":\"authored-audience-live-check-aws_vpc-vpc_fixed_template_ecs_fargate_container_app\",\"kind\":\"resource\",\"type\":\"aws_vpc\",\"label\":\"vpc\",\"parameters\":{\"values\":{\"cidrBlock\":\"10.30.0.0/16\",\"instanceTenancy\":\"default\",\"enableDnsSupport\":true,\"enableDnsHostnames\":true},\"fileName\":\"main.tf\",\"resourceName\":\"vpc\",\"resourceType\":\"aws_vpc\"}},{\"id\":\"authored-audience-live-check-aws_subnet-subnet_fixed_template_ecs_fargate_container_app_a\",\"kind\":\"resource\",\"type\":\"aws_subnet\",\"label\":\"subnet_a\",\"metadata\":{\"parentAreaNodeId\":\"terraform-az-ap-northeast-2a\"},\"parameters\":{\"values\":{\"vpcId\":\"aws_vpc.vpc.id\",\"cidrBlock\":\"10.30.1.0/24\",\"availabilityZone\":\"ap-northeast-2a\",\"mapPublicIpOnLaunch\":true},\"fileName\":\"main.tf\",\"resourceName\":\"subnet_a\",\"resourceType\":\"aws_subnet\",\"terraformBlockType\":\"resource\"}},{\"id\":\"authored-audience-live-check-aws_subnet-subnet_fixed_template_ecs_fargate_container_app_b\",\"kind\":\"resource\",\"type\":\"aws_subnet\",\"label\":\"subnet_b\",\"metadata\":{\"parentAreaNodeId\":\"terraform-az-ap-northeast-2b\"},\"parameters\":{\"values\":{\"vpcId\":\"aws_vpc.vpc.id\",\"cidrBlock\":\"10.30.2.0/24\",\"availabilityZone\":\"ap-northeast-2b\",\"mapPublicIpOnLaunch\":true},\"fileName\":\"main.tf\",\"resourceName\":\"subnet_b\",\"resourceType\":\"aws_subnet\",\"terraformBlockType\":\"resource\"}},{\"id\":\"authored-audience-live-check-aws_internet_gateway-igw_fixed_template_ecs_fargate_container_app\",\"kind\":\"resource\",\"type\":\"aws_internet_gateway\",\"label\":\"igw\",\"metadata\":{\"parentAreaNodeId\":\"authored-audience-live-check-aws_vpc-vpc_fixed_template_ecs_fargate_container_app\"},\"parameters\":{\"values\":{\"vpcId\":\"aws_vpc.vpc.id\"},\"fileName\":\"main.tf\",\"resourceName\":\"igw\",\"resourceType\":\"aws_internet_gateway\",\"terraformBlockType\":\"resource\"}},{\"id\":\"authored-audience-live-check-aws_route_table-rt_fixed_template_ecs_fargate_container_app\",\"kind\":\"resource\",\"type\":\"aws_route_table\",\"label\":\"rt\",\"metadata\":{\"parentAreaNodeId\":\"authored-audience-live-check-aws_vpc-vpc_fixed_template_ecs_fargate_container_app\"},\"parameters\":{\"values\":{\"route\":[{\"cidrBlock\":\"0.0.0.0/0\",\"gatewayId\":\"aws_internet_gateway.igw.id\"}],\"vpcId\":\"aws_vpc.vpc.id\"},\"fileName\":\"main.tf\",\"resourceName\":\"rt\",\"resourceType\":\"aws_route_table\",\"terraformBlockType\":\"resource\"}},{\"id\":\"authored-audience-live-check-aws_route_table_association-rta_fixed_template_ecs_fargate_container_app_a\",\"kind\":\"resource\",\"type\":\"aws_route_table_association\",\"label\":\"rta_a\",\"parameters\":{\"values\":{\"subnetId\":\"aws_subnet.subnet_a.id\",\"routeTableId\":\"aws_route_table.rt.id\"},\"fileName\":\"main.tf\",\"resourceName\":\"rta_a\",\"resourceType\":\"aws_route_table_association\"}},{\"id\":\"authored-audience-live-check-aws_route_table_association-rta_fixed_template_ecs_fargate_container_app_b\",\"kind\":\"resource\",\"type\":\"aws_route_table_association\",\"label\":\"rta_b\",\"parameters\":{\"values\":{\"subnetId\":\"aws_subnet.subnet_b.id\",\"routeTableId\":\"aws_route_table.rt.id\"},\"fileName\":\"main.tf\",\"resourceName\":\"rta_b\",\"resourceType\":\"aws_route_table_association\"}},{\"id\":\"authored-audience-live-check-aws_ecs_cluster-ecs_cluster_fixed_template_fargate_container_app\",\"kind\":\"resource\",\"type\":\"aws_ecs_cluster\",\"label\":\"ecs_cluster\",\"metadata\":{\"parentAreaNodeId\":\"authored-audience-live-check-aws_subnet-subnet_private_app_a\"},\"parameters\":{\"values\":{\"name\":\"audience-live-check-cluster\"},\"fileName\":\"main.tf\",\"resourceName\":\"ecs_cluster\",\"resourceType\":\"aws_ecs_cluster\"}},{\"id\":\"authored-audience-live-check-aws_security_group-sg_fixed_template_ecs_fargate_container_app_alb\",\"kind\":\"resource\",\"type\":\"aws_security_group\",\"label\":\"sg_alb\",\"parameters\":{\"values\":{\"name\":\"audience-live-check-alb-sg\",\"vpcId\":\"aws_vpc.vpc.id\",\"egress\":[{\"toPort\":0,\"fromPort\":0,\"protocol\":\"-1\",\"cidrBlocks\":[\"0.0.0.0/0\"]}],\"ingress\":[{\"toPort\":80,\"fromPort\":80,\"protocol\":\"tcp\",\"cidrBlocks\":[\"0.0.0.0/0\"]}],\"description\":\"Allow CloudFront origin HTTP while CloudFront terminates public TLS\"},\"fileName\":\"main.tf\",\"resourceName\":\"sg_alb\",\"resourceType\":\"aws_security_group\"}},{\"id\":\"authored-audience-live-check-aws_security_group-sg_fixed_template_ecs_fargate_container_app_task\",\"kind\":\"resource\",\"type\":\"aws_security_group\",\"label\":\"sg_task\",\"parameters\":{\"values\":{\"name\":\"audience-live-check-task-sg\",\"vpcId\":\"aws_vpc.vpc.id\",\"egress\":[{\"toPort\":0,\"fromPort\":0,\"protocol\":\"-1\",\"cidrBlocks\":[\"0.0.0.0/0\"]}],\"ingress\":[{\"toPort\":8080,\"fromPort\":8080,\"protocol\":\"tcp\",\"securityGroups\":[\"aws_security_group.sg_alb.id\"]}],\"description\":\"Allow ALB traffic to the API on port 8080\"},\"fileName\":\"main.tf\",\"resourceName\":\"sg_task\",\"resourceType\":\"aws_security_group\"}},{\"id\":\"authored-audience-live-check-aws_iam_role-role_fixed_template_ecs_fargate_container_app_execution\",\"kind\":\"resource\",\"type\":\"aws_iam_role\",\"label\":\"role_execution\",\"parameters\":{\"values\":{\"name\":\"audience-live-check-ecs-execution\",\"assumeRolePolicy\":\"{\\\"Version\\\":\\\"2012-10-17\\\",\\\"Statement\\\":[{\\\"Effect\\\":\\\"Allow\\\",\\\"Principal\\\":{\\\"Service\\\":\\\"ecs-tasks.amazonaws.com\\\"},\\\"Action\\\":\\\"sts:AssumeRole\\\"}]}\"},\"fileName\":\"main.tf\",\"resourceName\":\"role_execution\",\"resourceType\":\"aws_iam_role\"}},{\"id\":\"authored-audience-live-check-aws_iam_role_policy_attachment-fixed_template_ecs_fargate_container_app_execution_policy\",\"kind\":\"resource\",\"type\":\"aws_iam_policy\",\"label\":\"execution_policy\",\"parameters\":{\"values\":{\"role\":\"aws_iam_role.role_execution.name\",\"policyArn\":\"arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy\"},\"fileName\":\"main.tf\",\"resourceName\":\"execution_policy\",\"resourceType\":\"aws_iam_role_policy_attachment\"}},{\"id\":\"authored-audience-live-check-aws_iam_role-role_fixed_template_ecs_fargate_container_app_task\",\"kind\":\"resource\",\"type\":\"aws_iam_role\",\"label\":\"role_task\",\"parameters\":{\"values\":{\"name\":\"audience-live-check-ecs-task\",\"assumeRolePolicy\":\"{\\\"Version\\\":\\\"2012-10-17\\\",\\\"Statement\\\":[{\\\"Effect\\\":\\\"Allow\\\",\\\"Principal\\\":{\\\"Service\\\":\\\"ecs-tasks.amazonaws.com\\\"},\\\"Action\\\":\\\"sts:AssumeRole\\\"}]}\"},\"fileName\":\"main.tf\",\"resourceName\":\"role_task\",\"resourceType\":\"aws_iam_role\"}},{\"id\":\"authored-audience-live-check-aws_lb-alb_fixed_template_ecs_fargate_container_app\",\"kind\":\"resource\",\"type\":\"aws_lb\",\"label\":\"alb\",\"parameters\":{\"values\":{\"name\":\"audience-live-check-alb\",\"subnets\":[\"aws_subnet.subnet_a.id\",\"aws_subnet.subnet_b.id\"],\"securityGroups\":[\"aws_security_group.sg_alb.id\"],\"loadBalancerType\":\"application\"},\"fileName\":\"main.tf\",\"resourceName\":\"alb\",\"resourceType\":\"aws_lb\"}},{\"id\":\"authored-audience-live-check-aws_lb_target_group-tg_fixed_template_ecs_fargate_container_app\",\"kind\":\"resource\",\"type\":\"aws_lb_target_group\",\"label\":\"tg\",\"parameters\":{\"values\":{\"name\":\"audience-live-check-api\",\"port\":8080,\"vpcId\":\"aws_vpc.vpc.id\",\"protocol\":\"HTTP\",\"targetType\":\"ip\",\"healthCheck\":{\"path\":\"/health\",\"matcher\":\"200-399\"}},\"fileName\":\"main.tf\",\"resourceName\":\"tg\",\"resourceType\":\"aws_lb_target_group\"}},{\"id\":\"authored-audience-live-check-aws_lb_listener-listener_fixed_template_ecs_fargate_container_app\",\"kind\":\"resource\",\"type\":\"aws_lb_listener\",\"label\":\"listener\",\"metadata\":{\"parentAreaNodeId\":\"authored-audience-live-check-aws_subnet-subnet_fixed_template_ecs_fargate_container_app_a\"},\"parameters\":{\"values\":{\"port\":80,\"protocol\":\"HTTP\",\"defaultAction\":[{\"type\":\"forward\",\"targetGroupArn\":\"aws_lb_target_group.tg.arn\"}],\"loadBalancerArn\":\"aws_lb.alb.arn\"},\"fileName\":\"main.tf\",\"resourceName\":\"listener\",\"resourceType\":\"aws_lb_listener\"}},{\"id\":\"authored-audience-live-check-aws_ecs_task_definition-task_fixed_template_fargate_container_app\",\"kind\":\"resource\",\"type\":\"aws_ecs_task_definition\",\"label\":\"task\",\"metadata\":{\"parentAreaNodeId\":\"authored-audience-live-check-aws_subnet-subnet_private_app_a\"},\"parameters\":{\"values\":{\"cpu\":256,\"family\":\"audience-live-check-api\",\"memory\":512,\"dependsOn\":[\"aws_cloudwatch_log_group.logs_ecs\",\"aws_secretsmanager_secret_version.check_in_signing\",\"aws_iam_role_policy.check_in_signing_read\"],\"networkMode\":\"awsvpc\",\"taskRoleArn\":\"aws_iam_role.role_task.arn\",\"executionRoleArn\":\"aws_iam_role.role_execution.arn\",\"containerDefinitions\":\"[{\\\"name\\\":\\\"api\\\",\\\"image\\\":\\\"public.ecr.aws/docker/library/nginx:1.27-alpine\\\",\\\"essential\\\":true,\\\"entryPoint\\\":[\\\"/bin/sh\\\",\\\"-c\\\"],\\\"command\\\":[\\\"printf '%s\\\\\\\\n' 'server {' '  listen 8080;' '  default_type text/plain;' '  location = /health { return 200 ok; }' '  location / { return 200 SketchCatch-deployment-smoke; }' '}' > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'\\\"],\\\"portMappings\\\":[{\\\"containerPort\\\":8080,\\\"hostPort\\\":8080,\\\"protocol\\\":\\\"tcp\\\"}],\\\"environment\\\":[{\\\"name\\\":\\\"PORT\\\",\\\"value\\\":\\\"8080\\\"},{\\\"name\\\":\\\"WEB_ORIGIN\\\",\\\"value\\\":\\\"https://${aws_cloudfront_distribution.cdn_web.domain_name}\\\"},{\\\"name\\\":\\\"INSTANCE_ID\\\",\\\"value\\\":\\\"fargate\\\"}],\\\"logConfiguration\\\":{\\\"logDriver\\\":\\\"awslogs\\\",\\\"options\\\":{\\\"awslogs-group\\\":\\\"/ecs/audience-live-check-api\\\",\\\"awslogs-region\\\":\\\"ap-northeast-2\\\",\\\"awslogs-stream-prefix\\\":\\\"api\\\"}},\\\"secrets\\\":[{\\\"name\\\":\\\"CHECK_IN_SIGNING_SECRET\\\",\\\"valueFrom\\\":\\\"${aws_secretsmanager_secret.check_in_signing.arn}\\\"}]}]\",\"requiresCompatibilities\":[\"FARGATE\"]},\"fileName\":\"main.tf\",\"resourceName\":\"task\",\"resourceType\":\"aws_ecs_task_definition\"}},{\"id\":\"authored-audience-live-check-aws_ecs_service-ecs_service_fixed_template_fargate_container_app\",\"kind\":\"resource\",\"type\":\"aws_ecs_service\",\"label\":\"ecs_service\",\"metadata\":{\"parentAreaNodeId\":\"authored-audience-live-check-aws_subnet-subnet_private_app_a\"},\"parameters\":{\"values\":{\"name\":\"audience-live-check-service\",\"cluster\":\"aws_ecs_cluster.ecs_cluster.id\",\"dependsOn\":[\"aws_lb_listener.listener\"],\"lifecycle\":{\"ignoreChanges\":[\"desired_count\"]},\"launchType\":\"FARGATE\",\"desiredCount\":1,\"loadBalancer\":[{\"containerName\":\"api\",\"containerPort\":8080,\"targetGroupArn\":\"aws_lb_target_group.tg.arn\"}],\"taskDefinition\":\"aws_ecs_task_definition.task.arn\",\"networkConfiguration\":[{\"subnets\":[\"aws_subnet.subnet_private_app_a.id\",\"aws_subnet.subnet_private_app_b.id\"],\"assignPublicIp\":false,\"securityGroups\":[\"aws_security_group.sg_task.id\"]}],\"healthCheckGracePeriodSeconds\":30},\"fileName\":\"main.tf\",\"resourceName\":\"ecs_service\",\"resourceType\":\"aws_ecs_service\"}},{\"id\":\"authored-audience-live-check-aws_appautoscaling_policy-ecs_service_requests\",\"kind\":\"resource\",\"type\":\"aws_appautoscaling_policy\",\"label\":\"ecs_service_requests\",\"parameters\":{\"values\":{\"name\":\"audience-live-check-request-scaling\",\"policyType\":\"TargetTrackingScaling\",\"resourceId\":\"service/${aws_ecs_cluster.ecs_cluster.name}/${aws_ecs_service.ecs_service.name}\",\"serviceNamespace\":\"ecs\",\"scalableDimension\":\"ecs:service:DesiredCount\",\"targetTrackingScalingPolicyConfiguration\":[{\"targetValue\":50,\"scaleInCooldown\":300,\"scaleOutCooldown\":30,\"predefinedMetricSpecification\":[{\"resourceLabel\":\"${aws_lb.alb.arn_suffix}/${aws_lb_target_group.tg.arn_suffix}\",\"predefinedMetricType\":\"ALBRequestCountPerTarget\"}]}]},\"fileName\":\"main.tf\",\"resourceName\":\"ecs_service_requests\",\"resourceType\":\"aws_appautoscaling_policy\"}},{\"id\":\"authored-audience-live-check-aws_subnet-subnet_private_app_a\",\"kind\":\"resource\",\"type\":\"aws_subnet\",\"label\":\"subnet_private_app_a\",\"metadata\":{\"parentAreaNodeId\":\"terraform-az-ap-northeast-2a\"},\"parameters\":{\"values\":{\"vpcId\":\"aws_vpc.vpc.id\",\"cidrBlock\":\"10.30.11.0/24\",\"availabilityZone\":\"ap-northeast-2a\",\"mapPublicIpOnLaunch\":false},\"fileName\":\"main.tf\",\"resourceName\":\"subnet_private_app_a\",\"resourceType\":\"aws_subnet\",\"terraformBlockType\":\"resource\"}},{\"id\":\"authored-audience-live-check-aws_subnet-subnet_private_app_b\",\"kind\":\"resource\",\"type\":\"aws_subnet\",\"label\":\"subnet_private_app_b\",\"metadata\":{\"parentAreaNodeId\":\"terraform-az-ap-northeast-2b\"},\"parameters\":{\"values\":{\"vpcId\":\"aws_vpc.vpc.id\",\"cidrBlock\":\"10.30.12.0/24\",\"availabilityZone\":\"ap-northeast-2b\",\"mapPublicIpOnLaunch\":false},\"fileName\":\"main.tf\",\"resourceName\":\"subnet_private_app_b\",\"resourceType\":\"aws_subnet\",\"terraformBlockType\":\"resource\"}},{\"id\":\"authored-audience-live-check-aws_eip-eip_nat\",\"kind\":\"resource\",\"type\":\"aws_eip\",\"label\":\"eip_nat\",\"parameters\":{\"values\":{\"domain\":\"vpc\"},\"fileName\":\"main.tf\",\"resourceName\":\"eip_nat\",\"resourceType\":\"aws_eip\"}},{\"id\":\"authored-audience-live-check-aws_nat_gateway-nat_private_egress\",\"kind\":\"resource\",\"type\":\"aws_nat_gateway\",\"label\":\"nat_private_egress\",\"parameters\":{\"values\":{\"subnetId\":\"aws_subnet.subnet_a.id\",\"allocationId\":\"aws_eip.eip_nat.id\"},\"fileName\":\"main.tf\",\"resourceName\":\"nat_private_egress\",\"resourceType\":\"aws_nat_gateway\"}},{\"id\":\"authored-audience-live-check-aws_route_table-rt_private_app\",\"kind\":\"resource\",\"type\":\"aws_route_table\",\"label\":\"rt_private_app\",\"metadata\":{\"parentAreaNodeId\":\"authored-audience-live-check-aws_vpc-vpc_fixed_template_ecs_fargate_container_app\"},\"parameters\":{\"values\":{\"route\":[{\"cidrBlock\":\"0.0.0.0/0\",\"natGatewayId\":\"aws_nat_gateway.nat_private_egress.id\"}],\"vpcId\":\"aws_vpc.vpc.id\"},\"fileName\":\"main.tf\",\"resourceName\":\"rt_private_app\",\"resourceType\":\"aws_route_table\",\"terraformBlockType\":\"resource\"}},{\"id\":\"authored-audience-live-check-aws_route_table_association-rta_private_app_a\",\"kind\":\"resource\",\"type\":\"aws_route_table_association\",\"label\":\"rta_private_app_a\",\"metadata\":{\"parentAreaNodeId\":\"authored-audience-live-check-aws_subnet-subnet_private_app_a\"},\"parameters\":{\"values\":{\"subnetId\":\"aws_subnet.subnet_private_app_a.id\",\"routeTableId\":\"aws_route_table.rt_private_app.id\"},\"fileName\":\"main.tf\",\"resourceName\":\"rta_private_app_a\",\"resourceType\":\"aws_route_table_association\",\"terraformBlockType\":\"resource\"}},{\"id\":\"authored-audience-live-check-aws_route_table_association-rta_private_app_b\",\"kind\":\"resource\",\"type\":\"aws_route_table_association\",\"label\":\"rta_private_app_b\",\"metadata\":{\"parentAreaNodeId\":\"authored-audience-live-check-aws_subnet-subnet_private_app_b\"},\"parameters\":{\"values\":{\"subnetId\":\"aws_subnet.subnet_private_app_b.id\",\"routeTableId\":\"aws_route_table.rt_private_app.id\"},\"fileName\":\"main.tf\",\"resourceName\":\"rta_private_app_b\",\"resourceType\":\"aws_route_table_association\",\"terraformBlockType\":\"resource\"}},{\"id\":\"authored-audience-live-check-aws_s3_bucket-bucket_web_assets\",\"kind\":\"resource\",\"type\":\"aws_s3_bucket\",\"label\":\"bucket_web_assets\",\"parameters\":{\"values\":{\"bucketPrefix\":\"audience-live-check-web-\",\"forceDestroy\":true},\"fileName\":\"main.tf\",\"resourceName\":\"bucket_web_assets\",\"resourceType\":\"aws_s3_bucket\"}},{\"id\":\"authored-audience-live-check-aws_s3_bucket_versioning-bucket_web_assets_versioning\",\"kind\":\"resource\",\"type\":\"aws_s3_bucket\",\"label\":\"bucket_web_assets_versioning\",\"parameters\":{\"values\":{\"bucket\":\"aws_s3_bucket.bucket_web_assets.id\",\"versioningConfiguration\":[{\"status\":\"Enabled\"}]},\"fileName\":\"main.tf\",\"resourceName\":\"bucket_web_assets_versioning\",\"resourceType\":\"aws_s3_bucket_versioning\"}},{\"id\":\"authored-audience-live-check-aws_s3_bucket_public_access_block-web_public_access\",\"kind\":\"resource\",\"type\":\"aws_s3_bucket\",\"label\":\"web_public_access\",\"parameters\":{\"values\":{\"bucket\":\"aws_s3_bucket.bucket_web_assets.id\",\"blockPublicAcls\":true,\"ignorePublicAcls\":true,\"blockPublicPolicy\":true,\"restrictPublicBuckets\":true},\"fileName\":\"main.tf\",\"resourceName\":\"web_public_access\",\"resourceType\":\"aws_s3_bucket_public_access_block\"}},{\"id\":\"authored-audience-live-check-aws_s3_object-web_bootstrap_index\",\"kind\":\"resource\",\"type\":\"aws_s3_bucket\",\"label\":\"web_bootstrap_index\",\"parameters\":{\"values\":{\"key\":\"index.html\",\"bucket\":\"aws_s3_bucket.bucket_web_assets.id\",\"content\":\"<!doctype html><html lang=\\\"en\\\"><meta charset=\\\"utf-8\\\"><title>Application deployment ready</title><body><main><h1>Application deployment ready</h1><p>GitHub Actions will replace this bootstrap document with apps/web/dist.</p></main></body></html>\",\"lifecycle\":{\"ignoreChanges\":[\"content\",\"content_type\",\"cache_control\",\"etag\",\"source\"]},\"contentType\":\"text/html; charset=utf-8\"},\"fileName\":\"main.tf\",\"resourceName\":\"web_bootstrap_index\",\"resourceType\":\"aws_s3_object\"}},{\"id\":\"authored-audience-live-check-aws_cloudfront_origin_access_control-web_oac\",\"kind\":\"resource\",\"type\":\"aws_cloudfront_distribution\",\"label\":\"web_oac\",\"parameters\":{\"values\":{\"name\":\"audience-live-check-web-oac\",\"signingBehavior\":\"always\",\"signingProtocol\":\"sigv4\",\"originAccessControlOriginType\":\"s3\"},\"fileName\":\"main.tf\",\"resourceName\":\"web_oac\",\"resourceType\":\"aws_cloudfront_origin_access_control\"}},{\"id\":\"authored-audience-live-check-aws_cloudfront_distribution-cdn_web\",\"kind\":\"resource\",\"type\":\"aws_cloudfront_distribution\",\"label\":\"cdn_web\",\"parameters\":{\"values\":{\"origin\":[{\"originId\":\"web-assets\",\"domainName\":\"aws_s3_bucket.bucket_web_assets.bucket_regional_domain_name\",\"originAccessControlId\":\"aws_cloudfront_origin_access_control.web_oac.id\"},{\"originId\":\"api-alb\",\"domainName\":\"aws_lb.alb.dns_name\",\"customOriginConfig\":[{\"httpPort\":80,\"httpsPort\":443,\"originSslProtocols\":[\"TLSv1.2\"],\"originProtocolPolicy\":\"http-only\"}]}],\"enabled\":true,\"priceClass\":\"PriceClass_100\",\"restrictions\":[{\"geoRestriction\":[{\"restrictionType\":\"none\"}]}],\"defaultRootObject\":\"index.html\",\"viewerCertificate\":[{\"cloudfrontDefaultCertificate\":true}],\"defaultCacheBehavior\":[{\"cachePolicyId\":\"658327ea-f89d-4fab-a63d-7e88639e58f6\",\"cachedMethods\":[\"GET\",\"HEAD\"],\"allowedMethods\":[\"GET\",\"HEAD\"],\"targetOriginId\":\"web-assets\",\"viewerProtocolPolicy\":\"redirect-to-https\"}],\"orderedCacheBehavior\":[{\"pathPattern\":\"/api/*\",\"cachePolicyId\":\"4135ea2d-6df8-44a3-9df3-4b5a84be39ad\",\"cachedMethods\":[\"GET\",\"HEAD\"],\"allowedMethods\":[\"DELETE\",\"GET\",\"HEAD\",\"OPTIONS\",\"PATCH\",\"POST\",\"PUT\"],\"targetOriginId\":\"api-alb\",\"viewerProtocolPolicy\":\"redirect-to-https\",\"originRequestPolicyId\":\"b689b0a8-53d0-40ab-baf2-68738e2966ac\"},{\"pathPattern\":\"/health\",\"cachePolicyId\":\"4135ea2d-6df8-44a3-9df3-4b5a84be39ad\",\"cachedMethods\":[\"GET\",\"HEAD\"],\"allowedMethods\":[\"DELETE\",\"GET\",\"HEAD\",\"OPTIONS\",\"PATCH\",\"POST\",\"PUT\"],\"targetOriginId\":\"api-alb\",\"viewerProtocolPolicy\":\"redirect-to-https\",\"originRequestPolicyId\":\"b689b0a8-53d0-40ab-baf2-68738e2966ac\"}]},\"fileName\":\"main.tf\",\"resourceName\":\"cdn_web\",\"resourceType\":\"aws_cloudfront_distribution\"}},{\"id\":\"authored-audience-live-check-aws_s3_bucket_policy-web_cloudfront_read\",\"kind\":\"resource\",\"type\":\"aws_s3_bucket\",\"label\":\"web_cloudfront_read\",\"parameters\":{\"values\":{\"bucket\":\"aws_s3_bucket.bucket_web_assets.id\",\"policy\":\"{\\\"Version\\\":\\\"2012-10-17\\\",\\\"Statement\\\":[{\\\"Sid\\\":\\\"AllowCloudFrontServicePrincipalReadOnly\\\",\\\"Effect\\\":\\\"Allow\\\",\\\"Principal\\\":{\\\"Service\\\":\\\"cloudfront.amazonaws.com\\\"},\\\"Action\\\":\\\"s3:GetObject\\\",\\\"Resource\\\":\\\"${aws_s3_bucket.bucket_web_assets.arn}/*\\\",\\\"Condition\\\":{\\\"StringEquals\\\":{\\\"AWS:SourceArn\\\":\\\"${aws_cloudfront_distribution.cdn_web.arn}\\\"}}}]}\",\"dependsOn\":[\"aws_s3_bucket_public_access_block.web_public_access\"]},\"fileName\":\"main.tf\",\"resourceName\":\"web_cloudfront_read\",\"resourceType\":\"aws_s3_bucket_policy\"}},{\"id\":\"authored-audience-live-check-aws_ecr_repository-ecr_api_image\",\"kind\":\"resource\",\"type\":\"aws_ecr_repository\",\"label\":\"ecr_api_image\",\"parameters\":{\"values\":{\"name\":\"audience-live-check-api\",\"forceDelete\":true,\"imageTagMutability\":\"IMMUTABLE\",\"imageScanningConfiguration\":[{\"scanOnPush\":true}]},\"fileName\":\"main.tf\",\"resourceName\":\"ecr_api_image\",\"resourceType\":\"aws_ecr_repository\"}},{\"id\":\"authored-audience-live-check-aws_cloudwatch_log_group-logs_ecs\",\"kind\":\"resource\",\"type\":\"aws_cloudwatch_log_group\",\"label\":\"logs_ecs\",\"parameters\":{\"values\":{\"name\":\"/ecs/audience-live-check-api\",\"retentionInDays\":30},\"fileName\":\"main.tf\",\"resourceName\":\"logs_ecs\",\"resourceType\":\"aws_cloudwatch_log_group\"}},{\"id\":\"authored-audience-live-check-aws_secretsmanager_secret-check_in_signing\",\"kind\":\"resource\",\"type\":\"aws_secretsmanager_secret\",\"label\":\"check_in_signing\",\"parameters\":{\"values\":{\"namePrefix\":\"audience-live-check/check-in-signing-\",\"recoveryWindowInDays\":0},\"fileName\":\"main.tf\",\"resourceName\":\"check_in_signing\",\"resourceType\":\"aws_secretsmanager_secret\"}},{\"id\":\"authored-audience-live-check-aws_secretsmanager_secret_version-check_in_signing\",\"kind\":\"resource\",\"type\":\"aws_secretsmanager_secret\",\"label\":\"check_in_signing\",\"parameters\":{\"values\":{\"secretId\":\"aws_secretsmanager_secret.check_in_signing.id\",\"secretString\":\"random_password.check_in_signing.result\"},\"fileName\":\"main.tf\",\"resourceName\":\"check_in_signing\",\"resourceType\":\"aws_secretsmanager_secret_version\"}},{\"id\":\"authored-audience-live-check-aws_iam_role_policy-check_in_signing_read\",\"kind\":\"resource\",\"type\":\"aws_iam_policy\",\"label\":\"check_in_signing_read\",\"parameters\":{\"values\":{\"name\":\"audience-live-check-check-in-signing-read\",\"role\":\"aws_iam_role.role_execution.id\",\"policy\":\"{\\\"Version\\\":\\\"2012-10-17\\\",\\\"Statement\\\":[{\\\"Sid\\\":\\\"ReadCheckInSigningSecret\\\",\\\"Effect\\\":\\\"Allow\\\",\\\"Action\\\":[\\\"secretsmanager:GetSecretValue\\\"],\\\"Resource\\\":\\\"${aws_secretsmanager_secret.check_in_signing.arn}\\\"}]}\"},\"fileName\":\"main.tf\",\"resourceName\":\"check_in_signing_read\",\"resourceType\":\"aws_iam_role_policy\"}},{\"id\":\"node-mrtn5hw7-1fo2wf\",\"kind\":\"resource\",\"type\":\"aws_region\",\"label\":\"Region\",\"parameters\":{\"values\":{\"awsRegion\":\"ap-northeast-2\"},\"fileName\":\"main\",\"resourceName\":\"ap_northeast_2\",\"resourceType\":\"aws_region\"}}],\"edges\":[]}"
  }
};
