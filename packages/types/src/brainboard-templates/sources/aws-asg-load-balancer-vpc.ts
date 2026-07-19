import { defineCapturedBrainboardTemplate } from "./define-source.ts";

export const awsAsgLoadBalancerVpcSource = defineCapturedBrainboardTemplate({
  id: "brainboard-aws-asg-lb-vpc-subnets",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "f161f840-d697-4651-aa8d-6ec05b981a79",
    sourceUrl: "https://app.brainboard.co/templates/f161f840-d697-4651-aa8d-6ec05b981a79",
    cloneArchitectureId: "0e3b4d03-bd46-4172-9be4-bb5bf3f6b3da",
    downloads: 655,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS ASG and LB with VPC & subnets",
  description: null,
  provider: "aws",
  viewport: {
    x: -895.49,
    y: 2415.54,
    width: 4603.096774193548,
    height: 2518.9168458781364
  },
  nodes: [
    {
      sourceNodeId: "c8302f50-a584-4e73-bf3f-efca40fae066",
      domOrder: 0,
      label: "US East (N. Virginia)",
      position: {
        x: 425,
        y: 2980
      },
      size: {
        width: 1700,
        height: 1370
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(425, 2980), rotate(0 850 685)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "4ccb83f3-67ac-497f-bcfd-4ce5691f8e73",
      domOrder: 1,
      label: "AZ us-east-1a",
      position: {
        x: 1480,
        y: 3270
      },
      size: {
        width: 480,
        height: 980
      },
      parentSourceNodeId: "f5024a0a-d5e3-4403-a70f-d07a5402a90c",
      zIndex: 1,
      rawTransform: "translate(1480, 3270), rotate(0 240 490)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "f5024a0a-d5e3-4403-a70f-d07a5402a90c",
      domOrder: 2,
      label: "Web VPC",
      position: {
        x: 515,
        y: 3070
      },
      size: {
        width: 1535,
        height: 1250
      },
      parentSourceNodeId: "c8302f50-a584-4e73-bf3f-efca40fae066",
      zIndex: 2,
      rawTransform: "translate(515, 3070), rotate(0 767.5 625)",
      rotation: 0,
      rawResourceType: "aws_vpc"
    },
    {
      sourceNodeId: "8720b1c9-ad44-42e7-a8f2-aa43ebee2449",
      domOrder: 3,
      label: "AZ us-east-1a",
      position: {
        x: 621.3702764744684,
        y: 3271.0155158741018
      },
      size: {
        width: 480,
        height: 980
      },
      parentSourceNodeId: "f5024a0a-d5e3-4403-a70f-d07a5402a90c",
      zIndex: 3,
      rawTransform: "translate(621.3702764744684, 3271.0155158741018), rotate(0 240 490)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "af851fdf-0467-46fb-a990-ae069729728c",
      domOrder: 4,
      label: "Public Subnet B",
      position: {
        x: 1510,
        y: 3380
      },
      size: {
        width: 420,
        height: 830
      },
      parentSourceNodeId: "4ccb83f3-67ac-497f-bcfd-4ce5691f8e73",
      zIndex: 4,
      rawTransform: "translate(1510, 3380), rotate(0 210 415)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "dedbf41c-255d-4b77-b246-a9ba0de7d9fe",
      domOrder: 5,
      label: "Web Public Security Group",
      position: {
        x: 542.5,
        y: 3919.066238679101
      },
      size: {
        width: 1480,
        height: 255
      },
      parentSourceNodeId: "f5024a0a-d5e3-4403-a70f-d07a5402a90c",
      zIndex: 5,
      rawTransform: "translate(542.5, 3919.066238679101), rotate(0 740 127.5)",
      rotation: 0,
      rawResourceType: "aws_security_group"
    },
    {
      sourceNodeId: "a514bd55-a14d-45a0-a047-4220529bd4e2",
      domOrder: 6,
      label: "EC2 SG",
      position: {
        x: 542.5,
        y: 3579.4688830166933
      },
      size: {
        width: 1480,
        height: 255
      },
      parentSourceNodeId: "f5024a0a-d5e3-4403-a70f-d07a5402a90c",
      zIndex: 6,
      rawTransform: "translate(542.5, 3579.4688830166933), rotate(0 740 127.5)",
      rotation: 0,
      rawResourceType: "aws_security_group"
    },
    {
      sourceNodeId: "cd499b89-a918-4f50-a93a-2b865f961e60",
      domOrder: 7,
      label: "Web Launch Configuration",
      position: {
        x: 1127.3114276037932,
        y: 4031.0385590190112
      },
      size: {
        width: 330,
        height: 130
      },
      parentSourceNodeId: "f5024a0a-d5e3-4403-a70f-d07a5402a90c",
      zIndex: 7,
      rawTransform: "translate(1127.3114276037932, 4031.0385590190112), rotate(0 165 65)",
      rotation: 0,
      rawResourceType: "aws_launch_configuration"
    },
    {
      sourceNodeId: "d75efaba-a405-4bf0-9cf0-929116e2c267",
      domOrder: 8,
      label: "Web Auto Scaling Group",
      position: {
        x: 693.2370052628482,
        y: 3597.5030857498527
      },
      size: {
        width: 1160,
        height: 221.08340795456795
      },
      parentSourceNodeId: "f5024a0a-d5e3-4403-a70f-d07a5402a90c",
      zIndex: 8,
      rawTransform:
        "translate(693.2370052628482, 3597.5030857498527), rotate(0 580 110.54170397728399)",
      rotation: 0,
      rawResourceType: "aws_autoscaling_group"
    },
    {
      sourceNodeId: "ff98d607-abd3-49b8-bf7f-f5dae753e5c8",
      domOrder: 9,
      label: "Public Subnet A",
      position: {
        x: 651.3702764744684,
        y: 3381.0155158741018
      },
      size: {
        width: 420,
        height: 830
      },
      parentSourceNodeId: "8720b1c9-ad44-42e7-a8f2-aa43ebee2449",
      zIndex: 9,
      rawTransform: "translate(651.3702764744684, 3381.0155158741018), rotate(0 210 415)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "478775af-5d74-4733-9750-fbe7e051cdcb",
      domOrder: 10,
      label: "Internet Gateway",
      position: {
        x: 1252.5,
        y: 3039.7979623110955
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "c8302f50-a584-4e73-bf3f-efca40fae066",
      zIndex: 10,
      rawTransform: "translate(1252.5, 3039.7979623110955), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_internet_gateway"
    },
    {
      sourceNodeId: "739e74c1-d7e8-4318-879c-d8551ead85da",
      domOrder: 11,
      label: "Public Route Table",
      position: {
        x: 1252.5,
        y: 3260
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "f5024a0a-d5e3-4403-a70f-d07a5402a90c",
      zIndex: 11,
      rawTransform: "translate(1252.5, 3260), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table"
    },
    {
      sourceNodeId: "d67cbec1-5217-44ea-95e8-93c2bae28504",
      domOrder: 12,
      label: "Web Classic Load Balancer",
      position: {
        x: 1244.6867490439472,
        y: 3933.163290451488
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "f5024a0a-d5e3-4403-a70f-d07a5402a90c",
      zIndex: 12,
      rawTransform: "translate(1244.6867490439472, 3933.1632904514877), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_elb"
    },
    {
      sourceNodeId: "30a33276-f2ed-4578-90f4-3fd2ee58da38",
      domOrder: 13,
      label: "Route Table Association - Public A",
      position: {
        x: 826.3702764744684,
        y: 3471.0155158741018
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "ff98d607-abd3-49b8-bf7f-f5dae753e5c8",
      zIndex: 13,
      rawTransform: "translate(826.3702764744684, 3471.0155158741018), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table_association"
    },
    {
      sourceNodeId: "779fbe96-abee-444a-be06-a8e7647cefab",
      domOrder: 14,
      label: "CPU Scale Out Alarm",
      position: {
        x: 1123.9829766018972,
        y: 3735.231136281579
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "f5024a0a-d5e3-4403-a70f-d07a5402a90c",
      zIndex: 14,
      rawTransform: "translate(1123.9829766018972, 3735.2311362815794), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_cloudwatch_metric_alarm"
    },
    {
      sourceNodeId: "859e7225-86d1-4b45-a900-ecfbb9e2a60b",
      domOrder: 15,
      label: "CPU Scale In Alarm",
      position: {
        x: 1364.6895076158446,
        y: 3733.7805404119617
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "f5024a0a-d5e3-4403-a70f-d07a5402a90c",
      zIndex: 15,
      rawTransform: "translate(1364.6895076158446, 3733.7805404119613), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_cloudwatch_metric_alarm"
    },
    {
      sourceNodeId: "a4eeb4d5-0d6c-44fe-9dd7-2fec572dc954",
      domOrder: 16,
      label: "ASG Scale Out Policy",
      position: {
        x: 1123.9829766018972,
        y: 3609.5351962681857
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "f5024a0a-d5e3-4403-a70f-d07a5402a90c",
      zIndex: 16,
      rawTransform: "translate(1123.9829766018972, 3609.5351962681852), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_autoscaling_policy"
    },
    {
      sourceNodeId: "c7a4f916-1ccf-4d20-a6db-bd672f5aebe2",
      domOrder: 17,
      label: "ASG Scale In Policy",
      position: {
        x: 1364.6895076158446,
        y: 3607.854822022028
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "f5024a0a-d5e3-4403-a70f-d07a5402a90c",
      zIndex: 17,
      rawTransform: "translate(1364.6895076158446, 3607.854822022028), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_autoscaling_policy"
    },
    {
      sourceNodeId: "e2bbe386-707f-478f-8d80-25a84ae7df25",
      domOrder: 18,
      label: "Route Table Association - Public B",
      position: {
        x: 1685,
        y: 3470
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "af851fdf-0467-46fb-a990-ae069729728c",
      zIndex: 18,
      rawTransform: "translate(1685, 3470), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table_association"
    }
  ],
  edges: [
    {
      sourceEdgeId: "71d21141-b5a3-4204-bc7d-9fa8cef75a09",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "e2bbe386-707f-478f-8d80-25a84ae7df25",
      targetNodeId: "739e74c1-d7e8-4318-879c-d8551ead85da",
      sourcePort: "left",
      targetPort: "right",
      svgPath:
        "M1685,3500 L1506.75,3500 Q1498.75,3500 1498.75,3492 L1498.75,3298 Q1498.75,3290 1490.75,3290 L1312.5,3290",
      sourcePoint: {
        x: 1685,
        y: 3500
      },
      targetPoint: {
        x: 1312.5,
        y: 3290
      },
      waypoints: [
        {
          x: 1685,
          y: 3500
        },
        {
          x: 1506.75,
          y: 3500
        },
        {
          x: 1498.75,
          y: 3500
        },
        {
          x: 1498.75,
          y: 3492
        },
        {
          x: 1498.75,
          y: 3298
        },
        {
          x: 1498.75,
          y: 3290
        },
        {
          x: 1490.75,
          y: 3290
        },
        {
          x: 1312.5,
          y: 3290
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points:
          "\n            1307.5,3285\n            1312.5,3290\n            1307.5,3295\n          ",
        transform: "rotate(180, 1312.5, 3290)"
      }
    },
    {
      sourceEdgeId: "c202ac8f-f48b-4ef8-abaa-5fe7f677c4c2",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "739e74c1-d7e8-4318-879c-d8551ead85da",
      targetNodeId: "478775af-5d74-4733-9750-fbe7e051cdcb",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M1282.5,3260 L1282.5,3099.7979623110955",
      sourcePoint: {
        x: 1282.5,
        y: 3260
      },
      targetPoint: {
        x: 1282.5,
        y: 3099.7979623110955
      },
      waypoints: [
        {
          x: 1282.5,
          y: 3260
        },
        {
          x: 1282.5,
          y: 3099.7979623110955
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points:
          "\n            1277.5,3094.7979623110955\n            1282.5,3099.7979623110955\n            1277.5,3104.7979623110955\n          ",
        transform: "rotate(-90, 1282.5, 3099.7979623110955)"
      }
    },
    {
      sourceEdgeId: "ca67b48e-6e1f-4fa9-a601-b9809cdf5dec",
      domOrder: 2,
      zIndex: 2,
      sourceNodeId: "859e7225-86d1-4b45-a900-ecfbb9e2a60b",
      targetNodeId: "c7a4f916-1ccf-4d20-a6db-bd672f5aebe2",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M1394.6895076158446,3733.7805404119613 L1394.6895076158446,3667.854822022028",
      sourcePoint: {
        x: 1394.6895076158446,
        y: 3733.7805404119613
      },
      targetPoint: {
        x: 1394.6895076158446,
        y: 3667.854822022028
      },
      waypoints: [
        {
          x: 1394.6895076158446,
          y: 3733.7805404119613
        },
        {
          x: 1394.6895076158446,
          y: 3667.854822022028
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points:
          "\n            1389.6895076158446,3662.854822022028\n            1394.6895076158446,3667.854822022028\n            1389.6895076158446,3672.854822022028\n          ",
        transform: "rotate(-90, 1394.6895076158446, 3667.854822022028)"
      }
    },
    {
      sourceEdgeId: "cdcc9c1e-b540-4138-83a2-f85863549b53",
      domOrder: 3,
      zIndex: 3,
      sourceNodeId: "d75efaba-a405-4bf0-9cf0-929116e2c267",
      targetNodeId: "d67cbec1-5217-44ea-95e8-93c2bae28504",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M1273.2370052628482,3818.5864937044207 L1274.6867490439472,3933.1632904514877",
      sourcePoint: {
        x: 1273.2370052628482,
        y: 3818.5864937044207
      },
      targetPoint: {
        x: 1274.6867490439472,
        y: 3933.1632904514877
      },
      waypoints: [
        {
          x: 1273.2370052628482,
          y: 3818.5864937044207
        },
        {
          x: 1274.6867490439472,
          y: 3933.1632904514877
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 89.27507340073257,
      rawArrow: {
        points:
          "\n            1269.6867490439472,3928.1632904514877\n            1274.6867490439472,3933.1632904514877\n            1269.6867490439472,3938.1632904514877\n          ",
        transform: "rotate(89.27507340073257, 1274.6867490439472, 3933.1632904514877)"
      }
    },
    {
      sourceEdgeId: "dd7af8f0-5ffd-4e67-88fd-2db554cee132",
      domOrder: 4,
      zIndex: 4,
      sourceNodeId: "779fbe96-abee-444a-be06-a8e7647cefab",
      targetNodeId: "a4eeb4d5-0d6c-44fe-9dd7-2fec572dc954",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M1153.9829766018972,3735.2311362815794 L1153.9829766018972,3669.5351962681852",
      sourcePoint: {
        x: 1153.9829766018972,
        y: 3735.2311362815794
      },
      targetPoint: {
        x: 1153.9829766018972,
        y: 3669.5351962681852
      },
      waypoints: [
        {
          x: 1153.9829766018972,
          y: 3735.2311362815794
        },
        {
          x: 1153.9829766018972,
          y: 3669.5351962681852
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points:
          "\n            1148.9829766018972,3664.5351962681852\n            1153.9829766018972,3669.5351962681852\n            1148.9829766018972,3674.5351962681852\n          ",
        transform: "rotate(-90, 1153.9829766018972, 3669.5351962681852)"
      }
    },
    {
      sourceEdgeId: "fe840d6e-7a5a-4fcc-a3d2-09df78e99223",
      domOrder: 5,
      zIndex: 5,
      sourceNodeId: "30a33276-f2ed-4578-90f4-3fd2ee58da38",
      targetNodeId: "739e74c1-d7e8-4318-879c-d8551ead85da",
      sourcePort: "right",
      targetPort: "left",
      svgPath:
        "M886.3702764744684,3501.0155158741018 L1061.4351382372342,3501.0155158741018 Q1069.4351382372342,3501.0155158741018 1069.4351382372342,3493.0155158741018 L1069.4351382372342,3298 Q1069.4351382372342,3290 1077.4351382372342,3290 L1252.5,3290",
      sourcePoint: {
        x: 886.3702764744684,
        y: 3501.0155158741018
      },
      targetPoint: {
        x: 1252.5,
        y: 3290
      },
      waypoints: [
        {
          x: 886.3702764744684,
          y: 3501.0155158741018
        },
        {
          x: 1061.4351382372342,
          y: 3501.0155158741018
        },
        {
          x: 1069.4351382372342,
          y: 3501.0155158741018
        },
        {
          x: 1069.4351382372342,
          y: 3493.0155158741018
        },
        {
          x: 1069.4351382372342,
          y: 3298
        },
        {
          x: 1069.4351382372342,
          y: 3290
        },
        {
          x: 1077.4351382372342,
          y: 3290
        },
        {
          x: 1252.5,
          y: 3290
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            1247.5,3285\n            1252.5,3290\n            1247.5,3295\n          ",
        transform: "rotate(0, 1252.5, 3290)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_autoscaling_group" "web" {\n  min_size             = 1\n  max_size             = 2\n  launch_configuration = aws_launch_configuration.default.name\n  health_check_type    = "ELB"\n  desired_capacity     = 1\n\n  enabled_metrics = [\n    "GroupMinSize",\n    "GroupMaxSize",\n    "GroupDesiredCapacity",\n    "GroupInServiceInstances",\n    "GroupTotalInstances",\n  ]\n\n  lifecycle {\n    create_before_destroy = true\n  }\n\n  load_balancers = [\n    aws_elb.clb_9.id,\n  ]\n\n  vpc_zone_identifier = [\n    aws_subnet.snet.id,\n    aws_subnet.snet2.id,\n  ]\n}\n\nresource "aws_elb" "clb_9" {\n  cross_zone_load_balancing = true\n\n  health_check {\n    unhealthy_threshold = 2\n    timeout             = 3\n    target              = "HTTP:80/"\n    interval            = 30\n    healthy_threshold   = 2\n  }\n\n  listener {\n    lb_protocol       = "http"\n    lb_port           = 80\n    instance_protocol = "http"\n    instance_port     = 80\n  }\n\n  security_groups = [\n    aws_security_group.default.id,\n  ]\n\n  subnets = [\n    aws_subnet.snet.id,\n    aws_subnet.snet2.id,\n  ]\n}\n\nresource "aws_cloudwatch_metric_alarm" "web_cpu_alarm_up" {\n  threshold           = 70\n  statistic           = "Average"\n  period              = 120\n  namespace           = "AWS/EC2"\n  metric_name         = "CPUUtilization"\n  evaluation_periods  = 2\n  comparison_operator = "GreaterThanOrEqualToThreshold"\n  alarm_name          = "web_cpu_alarm_up"\n\n  dimensions = {\n    AutoScalingGroupName = aws_autoscaling_group.web.name\n  }\n}\n\nresource "aws_route_table" "rt" {\n  vpc_id = aws_vpc.vpc.id\n  tags   = merge(var.tags, {})\n\n  route {\n    gateway_id = aws_internet_gateway.internet_gw.id\n    cidr_block = "0.0.0.0/0"\n  }\n}\n\nresource "aws_cloudwatch_metric_alarm" "web_cpu_alarm_down" {\n  threshold           = 30\n  statistic           = "Average"\n  period              = 120\n  namespace           = "AWS/EC2"\n  metric_name         = "CPUUtilization"\n  evaluation_periods  = 2\n  comparison_operator = "LessThanOrEqualToThreshold"\n  alarm_name          = "web_cpu_alarm_down"\n\n  dimensions = {\n    AutoScalingGroupName = aws_autoscaling_group.web.name\n  }\n}\n\nresource "aws_route_table_association" "rt_association" {\n  subnet_id      = aws_subnet.snet.id\n  route_table_id = aws_route_table.rt.id\n}\n\nresource "aws_autoscaling_policy" "default" {\n  scaling_adjustment     = 1\n  name                   = "web_policy_up"\n  cooldown               = 300\n  autoscaling_group_name = aws_autoscaling_group.web.name\n  adjustment_type        = "ChangeInCapacity"\n}\n\nresource "aws_internet_gateway" "internet_gw" {\n  vpc_id = aws_vpc.vpc.id\n  tags   = merge(var.tags, {})\n}\n\nresource "aws_subnet" "snet" {\n  vpc_id                  = aws_vpc.vpc.id\n  tags                    = merge(var.tags, {})\n  map_public_ip_on_launch = true\n  cidr_block              = var.subnet1\n  availability_zone       = "us-east-1a"\n}\n\nresource "aws_autoscaling_policy" "web_policy_down" {\n  scaling_adjustment     = -1\n  name                   = "web_policy_down"\n  cooldown               = 300\n  autoscaling_group_name = aws_autoscaling_group.web.name\n  adjustment_type        = "ChangeInCapacity"\n}\n\nresource "aws_subnet" "snet2" {\n  vpc_id                  = aws_vpc.vpc.id\n  tags                    = merge(var.tags, {})\n  map_public_ip_on_launch = true\n  cidr_block              = var.subnet2\n  availability_zone       = "us-east-1a"\n}\n\nresource "aws_security_group" "default" {\n  vpc_id = aws_vpc.vpc.id\n  tags   = merge(var.tags, {})\n}\n\nresource "aws_vpc" "vpc" {\n  tags = merge(var.tags, {})\n}\n\nresource "aws_security_group" "ec2" {\n  vpc_id = aws_vpc.vpc.id\n  tags   = merge(var.tags, {})\n  name   = "EC2 SG"\n\n  egress {\n    to_port   = 0\n    protocol  = "-1"\n    from_port = 0\n\n    cidr_blocks = [\n      "0.0.0.0/0",\n    ]\n  }\n\n  ingress {\n    to_port     = 80\n    protocol    = "tcp"\n    from_port   = 80\n    description = "HTTP from anywhere"\n\n    cidr_blocks = [\n      "0.0.0.0/0",\n    ]\n  }\n\n  ingress {\n    to_port     = 22\n    protocol    = "tcp"\n    from_port   = 22\n    description = "SSH access from anywhere"\n\n    cidr_blocks = [\n      "0.0.0.0/0",\n    ]\n  }\n\n  ingress {\n    to_port     = 443\n    protocol    = "tcp"\n    from_port   = 443\n    description = "HTTPS from anywhere"\n\n    cidr_blocks = [\n      "0.0.0.0/0",\n    ]\n  }\n}\n\nresource "aws_launch_configuration" "default" {\n  instance_type               = "t2.micro"\n  image_id                    = "ami-087c17d1fe0178315"\n  associate_public_ip_address = true\n\n  lifecycle {\n    create_before_destroy = true\n  }\n\n  security_groups = [\n    aws_security_group.default.id,\n  ]\n}\n\nresource "aws_route_table_association" "rt_association2" {\n  subnet_id      = aws_subnet.snet2.id\n  route_table_id = aws_route_table.rt.id\n}\n\n',
        sha256: "e49c0e1aff8b991e9b2cbce610437e2a70a9d63494f94167fc3a102403133003",
        includeInWorkspace: true
      },
      {
        fileName: "backend.tf",
        code: "# This architecture uses Brainboard managed storage\n",
        sha256: "9bd86a80fa787dddd0ec09ee56ad995ddc8e504826d124a2fa09717444751c31",
        includeInWorkspace: false
      },
      {
        fileName: "locals.tf",
        code: "locals {\n}\n",
        sha256: "0b88e8de9a5058ee4a8129450c5c0561b6a0d9306f454517271927ccdcc347f5",
        includeInWorkspace: true
      },
      {
        fileName: "outputs.tf",
        code: "",
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        includeInWorkspace: true
      },
      {
        fileName: "providers.tf",
        code: 'terraform {\n  required_providers {\n    aws = {\n      version = "= 5.52.0"\n    }\n  }\n}\n\nprovider "aws" {\n  region = "us-east-1"\n}\n',
        sha256: "48a1ad8474f71e7904ac0639c3460b7a75ce71df8f5720658e9f012904229dfd",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "0e3b4d03-bd46-4172-9be4-bb5bf3f6b3da"\n  env      = "Production"\n}\n',
        sha256: "98b240d4c4a58130befc1dd0d565ff8e8454f2e90223977bb9bec4ea84ef4d52",
        includeInWorkspace: false
      },
      {
        fileName: "variables.tf",
        code: 'variable "subnet1" {\n  type    = string\n  default = "10.0.1.0/24"\n}\n\nvariable "subnet2" {\n  type    = string\n  default = "10.0.2.0/24"\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    archuuid = "f161f840-d697-4651-aa8d-6ec05b981a79"\n    env      = "Staging"\n  }\n}\n\nvariable "vpc_cidr" {\n  type    = string\n  default = "10.0.0.0/16"\n}\n\n',
        sha256: "9b7c6501704b281e4e1cc7936a0f24844dd42aa711847501fb6b1b2a8331b15d",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'variable "subnet1" {\n  type    = string\n  default = "10.0.1.0/24"\n}\n\nvariable "subnet2" {\n  type    = string\n  default = "10.0.2.0/24"\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    env      = "Staging"\n  }\n}\n\nvariable "vpc_cidr" {\n  type    = string\n  default = "10.0.0.0/16"\n}\n\n',
          sha256: "e2f50be3b52738270ae7c073fd95364d4150abcbf878836560c720924a8e6dcc",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archuuid = "f161f840-d697-4651-aa8d-6ec05b981a79"\n',
              occurrenceCount: 1
            }
          ]
        }
      }
    ],
    resourceAddresses: [
      "aws_autoscaling_group.web",
      "aws_elb.clb_9",
      "aws_cloudwatch_metric_alarm.web_cpu_alarm_up",
      "aws_route_table.rt",
      "aws_cloudwatch_metric_alarm.web_cpu_alarm_down",
      "aws_route_table_association.rt_association",
      "aws_autoscaling_policy.default",
      "aws_internet_gateway.internet_gw",
      "aws_subnet.snet",
      "aws_autoscaling_policy.web_policy_down",
      "aws_subnet.snet2",
      "aws_security_group.default",
      "aws_vpc.vpc",
      "aws_security_group.ec2",
      "aws_launch_configuration.default",
      "aws_route_table_association.rt_association2"
    ]
  },
  bindings: {
    "c8302f50-a584-4e73-bf3f-efca40fae066": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "4ccb83f3-67ac-497f-bcfd-4ce5691f8e73": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "f5024a0a-d5e3-4403-a70f-d07a5402a90c": {
      kind: "resource",
      address: "aws_vpc.vpc",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "8720b1c9-ad44-42e7-a8f2-aa43ebee2449": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "af851fdf-0467-46fb-a990-ae069729728c": {
      kind: "resource",
      address: "aws_subnet.snet2",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "dedbf41c-255d-4b77-b246-a9ba0de7d9fe": {
      kind: "resource",
      address: "aws_security_group.default",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "a514bd55-a14d-45a0-a047-4220529bd4e2": {
      kind: "resource",
      address: "aws_security_group.ec2",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "cd499b89-a918-4f50-a93a-2b865f961e60": {
      kind: "resource",
      address: "aws_launch_configuration.default",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "d75efaba-a405-4bf0-9cf0-929116e2c267": {
      kind: "resource",
      address: "aws_autoscaling_group.web",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "ff98d607-abd3-49b8-bf7f-f5dae753e5c8": {
      kind: "resource",
      address: "aws_subnet.snet",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "478775af-5d74-4733-9750-fbe7e051cdcb": {
      kind: "resource",
      address: "aws_internet_gateway.internet_gw",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "739e74c1-d7e8-4318-879c-d8551ead85da": {
      kind: "resource",
      address: "aws_route_table.rt",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "d67cbec1-5217-44ea-95e8-93c2bae28504": {
      kind: "resource",
      address: "aws_elb.clb_9",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "30a33276-f2ed-4578-90f4-3fd2ee58da38": {
      kind: "resource",
      address: "aws_route_table_association.rt_association",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "779fbe96-abee-444a-be06-a8e7647cefab": {
      kind: "resource",
      address: "aws_cloudwatch_metric_alarm.web_cpu_alarm_up",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "859e7225-86d1-4b45-a900-ecfbb9e2a60b": {
      kind: "resource",
      address: "aws_cloudwatch_metric_alarm.web_cpu_alarm_down",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "a4eeb4d5-0d6c-44fe-9dd7-2fec572dc954": {
      kind: "resource",
      address: "aws_autoscaling_policy.default",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "c7a4f916-1ccf-4d20-a6db-bd672f5aebe2": {
      kind: "resource",
      address: "aws_autoscaling_policy.web_policy_down",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "e2bbe386-707f-478f-8d80-25a84ae7df25": {
      kind: "resource",
      address: "aws_route_table_association.rt_association2",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    }
  }
});
