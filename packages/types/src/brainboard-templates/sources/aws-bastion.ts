import { defineCapturedBrainboardTemplate } from "./define-source.js";

export const awsBastionSource = defineCapturedBrainboardTemplate(
{
  "id": "brainboard-aws-bastion",
  "origin": {
    "platform": "brainboard",
    "author": "Chafik Belhaoues",
    "sourceTemplateId": "130f8091-21a4-4e8b-8b39-2373cb720d72",
    "sourceUrl": "https://app.brainboard.co/templates/130f8091-21a4-4e8b-8b39-2373cb720d72",
    "cloneArchitectureId": "c5052a14-6389-43f3-904e-873202387f84",
    "downloads": 485,
    "capturedAt": "2026-07-14"
  },
  "captureStatus": "captured",
  "title": "AWS Bastion",
  "description": null,
  "provider": "aws",
  "viewport": {
    "x": -982.39,
    "y": -654.88,
    "width": 4357.935483870968,
    "height": 2384.7591397849465
  },
  "nodes": [
    {
      "sourceNodeId": "4b4447a5-92a0-40b4-bf63-538a19399886",
      "domOrder": 0,
      "label": "US East (N. Virginia)",
      "position": {
        "x": 385,
        "y": 100
      },
      "size": {
        "width": 1490,
        "height": 855
      },
      "parentSourceNodeId": null,
      "zIndex": 0,
      "rawTransform": "translate(385, 100), rotate(0 745 427.5)",
      "rotation": 0,
      "rawResourceType": "region"
    },
    {
      "sourceNodeId": "7912ce6d-b224-4055-84c0-e847e7ca1224",
      "domOrder": 1,
      "label": "default_vpc",
      "position": {
        "x": 470,
        "y": 180
      },
      "size": {
        "width": 1340,
        "height": 700
      },
      "parentSourceNodeId": "4b4447a5-92a0-40b4-bf63-538a19399886",
      "zIndex": 1,
      "rawTransform": "translate(470, 180), rotate(0 670 350)",
      "rotation": 0,
      "rawResourceType": "aws_vpc"
    },
    {
      "sourceNodeId": "3cbdd739-7b62-4824-ae49-25f7863bd970",
      "domOrder": 2,
      "label": "us-east-1a",
      "position": {
        "x": 1030,
        "y": 210
      },
      "size": {
        "width": 685,
        "height": 655
      },
      "parentSourceNodeId": "7912ce6d-b224-4055-84c0-e847e7ca1224",
      "zIndex": 2,
      "rawTransform": "translate(1030, 210), rotate(0 342.5 327.5)",
      "rotation": 0,
      "rawResourceType": "availability_zone"
    },
    {
      "sourceNodeId": "0b578f07-26c1-42ea-8bd0-952dd4b45ebf",
      "domOrder": 3,
      "label": "default_subnet",
      "position": {
        "x": 1150,
        "y": 260
      },
      "size": {
        "width": 520,
        "height": 590
      },
      "parentSourceNodeId": "3cbdd739-7b62-4824-ae49-25f7863bd970",
      "zIndex": 3,
      "rawTransform": "translate(1150, 260), rotate(0 260 295)",
      "rotation": 0,
      "rawResourceType": "aws_subnet"
    },
    {
      "sourceNodeId": "6ef194ca-02bc-4039-8ca5-a61e1d285bae",
      "domOrder": 4,
      "label": "default_security_group",
      "position": {
        "x": 1190,
        "y": 320
      },
      "size": {
        "width": 440,
        "height": 480
      },
      "parentSourceNodeId": "0b578f07-26c1-42ea-8bd0-952dd4b45ebf",
      "zIndex": 4,
      "rawTransform": "translate(1190, 320), rotate(0 220 240)",
      "rotation": 0,
      "rawResourceType": "aws_security_group"
    },
    {
      "sourceNodeId": "8810f656-c698-416c-b42b-14221f124aa0",
      "domOrder": 5,
      "label": "Internet gateway",
      "position": {
        "x": 440,
        "y": 470
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "7912ce6d-b224-4055-84c0-e847e7ca1224",
      "zIndex": 5,
      "rawTransform": "translate(440, 470), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_internet_gateway"
    },
    {
      "sourceNodeId": "d555e514-a657-43d3-9435-f3962064d36f",
      "domOrder": 6,
      "label": "Route table",
      "position": {
        "x": 660,
        "y": 470
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "7912ce6d-b224-4055-84c0-e847e7ca1224",
      "zIndex": 6,
      "rawTransform": "translate(660, 470), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_route_table"
    },
    {
      "sourceNodeId": "80489bad-1f77-4035-97ed-0939be2815cf",
      "domOrder": 7,
      "label": "Route table association",
      "position": {
        "x": 910,
        "y": 470
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "7912ce6d-b224-4055-84c0-e847e7ca1224",
      "zIndex": 7,
      "rawTransform": "translate(910, 470), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_route_table_association"
    },
    {
      "sourceNodeId": "edd96c50-6a71-4db7-b23f-f7f21465b74f",
      "domOrder": 8,
      "label": "default_network_acl",
      "position": {
        "x": 910,
        "y": 610
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "7912ce6d-b224-4055-84c0-e847e7ca1224",
      "zIndex": 8,
      "rawTransform": "translate(910, 610), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_network_acl"
    },
    {
      "sourceNodeId": "f91e8491-f010-457d-b966-7cd53de8e7e3",
      "domOrder": 9,
      "label": "default_key_pair",
      "position": {
        "x": 1510,
        "y": 460
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "0b578f07-26c1-42ea-8bd0-952dd4b45ebf",
      "zIndex": 9,
      "rawTransform": "translate(1510, 460), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_key_pair"
    },
    {
      "sourceNodeId": "decc2f66-4950-4338-89fa-7eda35c53e60",
      "domOrder": 10,
      "label": "SG rule ingress",
      "position": {
        "x": 1240,
        "y": 680
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "0b578f07-26c1-42ea-8bd0-952dd4b45ebf",
      "zIndex": 10,
      "rawTransform": "translate(1240, 680), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_security_group_rule"
    },
    {
      "sourceNodeId": "202d02a1-538d-45fe-b8e5-26aa1753d5d1",
      "domOrder": 11,
      "label": "SG rule SSH",
      "position": {
        "x": 1380,
        "y": 680
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "0b578f07-26c1-42ea-8bd0-952dd4b45ebf",
      "zIndex": 11,
      "rawTransform": "translate(1380, 680), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_security_group_rule"
    },
    {
      "sourceNodeId": "941b992f-e911-4533-baff-396fed3cd614",
      "domOrder": 12,
      "label": "SG rule egress",
      "position": {
        "x": 1510,
        "y": 680
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "0b578f07-26c1-42ea-8bd0-952dd4b45ebf",
      "zIndex": 12,
      "rawTransform": "translate(1510, 680), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_security_group_rule"
    },
    {
      "sourceNodeId": "3fbf05b5-5729-4f4e-88f7-92ee41797b38",
      "domOrder": 13,
      "label": "SSH bastion",
      "position": {
        "x": 1270,
        "y": 390
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "0b578f07-26c1-42ea-8bd0-952dd4b45ebf",
      "zIndex": 13,
      "rawTransform": "translate(1270, 390), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_instance"
    },
    {
      "sourceNodeId": "9e820b53-18b3-407e-be69-6fda71a19f67",
      "domOrder": 14,
      "label": "Private T2 instance",
      "position": {
        "x": 1270,
        "y": 530
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "0b578f07-26c1-42ea-8bd0-952dd4b45ebf",
      "zIndex": 14,
      "rawTransform": "translate(1270, 530), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_instance"
    },
    {
      "sourceNodeId": "c9e3634d-acaa-4ff9-9471-47f286144125",
      "domOrder": 15,
      "label": "",
      "position": {
        "x": 510,
        "y": 300
      },
      "size": {
        "width": 498.83831787109375,
        "height": 60
      },
      "parentSourceNodeId": "7912ce6d-b224-4055-84c0-e847e7ca1224",
      "zIndex": 15,
      "rawTransform": "translate(510, 300), rotate(0 249.41915893554688 30)",
      "rotation": 0,
      "rawResourceType": "text"
    },
    {
      "sourceNodeId": "ff83642d-55bb-4725-9972-e3eef3b98077",
      "domOrder": 16,
      "label": "Authorized users",
      "position": {
        "x": 270,
        "y": 470
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": null,
      "zIndex": 16,
      "rawTransform": "translate(270, 470), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "brainboard_icon"
    }
  ],
  "edges": [
    {
      "sourceEdgeId": "1953b9c4-f65d-4ce2-a45f-74567a060ac5",
      "domOrder": 0,
      "zIndex": 0,
      "sourceNodeId": "80489bad-1f77-4035-97ed-0939be2815cf",
      "targetNodeId": "d555e514-a657-43d3-9435-f3962064d36f",
      "sourcePort": "left",
      "targetPort": "right",
      "svgPath": "M910,500 L720,500",
      "sourcePoint": {
        "x": 910,
        "y": 500
      },
      "targetPoint": {
        "x": 720,
        "y": 500
      },
      "waypoints": [
        {
          "x": 910,
          "y": 500
        },
        {
          "x": 720,
          "y": 500
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 180,
      "rawArrow": {
        "points": "\n            715,495\n            720,500\n            715,505\n          ",
        "transform": "rotate(180, 720, 500)"
      }
    },
    {
      "sourceEdgeId": "2f24b9e5-85a3-4522-a15e-a791469b4d18",
      "domOrder": 1,
      "zIndex": 1,
      "sourceNodeId": "3fbf05b5-5729-4f4e-88f7-92ee41797b38",
      "targetNodeId": "f91e8491-f010-457d-b966-7cd53de8e7e3",
      "sourcePort": "right",
      "targetPort": "left",
      "svgPath": "M1330,420 L1412,420 Q1420,420 1420,428 L1420,482 Q1420,490 1428,490 L1510,490",
      "sourcePoint": {
        "x": 1330,
        "y": 420
      },
      "targetPoint": {
        "x": 1510,
        "y": 490
      },
      "waypoints": [
        {
          "x": 1330,
          "y": 420
        },
        {
          "x": 1412,
          "y": 420
        },
        {
          "x": 1420,
          "y": 420
        },
        {
          "x": 1420,
          "y": 428
        },
        {
          "x": 1420,
          "y": 482
        },
        {
          "x": 1420,
          "y": 490
        },
        {
          "x": 1428,
          "y": 490
        },
        {
          "x": 1510,
          "y": 490
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 0,
      "rawArrow": {
        "points": "\n            1505,485\n            1510,490\n            1505,495\n          ",
        "transform": "rotate(0, 1510, 490)"
      }
    },
    {
      "sourceEdgeId": "4659ea06-be02-4242-8ed9-21591be93453",
      "domOrder": 2,
      "zIndex": 2,
      "sourceNodeId": "9e820b53-18b3-407e-be69-6fda71a19f67",
      "targetNodeId": "f91e8491-f010-457d-b966-7cd53de8e7e3",
      "sourcePort": "right",
      "targetPort": "left",
      "svgPath": "M1330,560 L1412,560 Q1420,560 1420,552 L1420,498 Q1420,490 1428,490 L1510,490",
      "sourcePoint": {
        "x": 1330,
        "y": 560
      },
      "targetPoint": {
        "x": 1510,
        "y": 490
      },
      "waypoints": [
        {
          "x": 1330,
          "y": 560
        },
        {
          "x": 1412,
          "y": 560
        },
        {
          "x": 1420,
          "y": 560
        },
        {
          "x": 1420,
          "y": 552
        },
        {
          "x": 1420,
          "y": 498
        },
        {
          "x": 1420,
          "y": 490
        },
        {
          "x": 1428,
          "y": 490
        },
        {
          "x": 1510,
          "y": 490
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 0,
      "rawArrow": {
        "points": "\n            1505,485\n            1510,490\n            1505,495\n          ",
        "transform": "rotate(0, 1510, 490)"
      }
    },
    {
      "sourceEdgeId": "75c19ae9-b3ca-4dfc-9ec6-3446aa67f968",
      "domOrder": 3,
      "zIndex": 3,
      "sourceNodeId": "80489bad-1f77-4035-97ed-0939be2815cf",
      "targetNodeId": "0b578f07-26c1-42ea-8bd0-952dd4b45ebf",
      "sourcePort": "right",
      "targetPort": "left",
      "svgPath": "M970,500 L1150,555",
      "sourcePoint": {
        "x": 970,
        "y": 500
      },
      "targetPoint": {
        "x": 1150,
        "y": 555
      },
      "waypoints": [
        {
          "x": 970,
          "y": 500
        },
        {
          "x": 1150,
          "y": 555
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 16.990823291986167,
      "rawArrow": {
        "points": "\n            1145,550\n            1150,555\n            1145,560\n          ",
        "transform": "rotate(16.990823291986167, 1150, 555)"
      }
    },
    {
      "sourceEdgeId": "9d14e2f8-b99c-49eb-8797-21459f98fab7",
      "domOrder": 4,
      "zIndex": 4,
      "sourceNodeId": "edd96c50-6a71-4db7-b23f-f7f21465b74f",
      "targetNodeId": "0b578f07-26c1-42ea-8bd0-952dd4b45ebf",
      "sourcePort": "right",
      "targetPort": "left",
      "svgPath": "M970,640 L1145,560",
      "sourcePoint": {
        "x": 970,
        "y": 640
      },
      "targetPoint": {
        "x": 1145,
        "y": 560
      },
      "waypoints": [
        {
          "x": 970,
          "y": 640
        },
        {
          "x": 1145,
          "y": 560
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": -24.567171320601318,
      "rawArrow": {
        "points": "\n            1140,555\n            1145,560\n            1140,565\n          ",
        "transform": "rotate(-24.567171320601318, 1145, 560)"
      }
    },
    {
      "sourceEdgeId": "9f08bde2-ae88-4ddc-871e-a643acd6e0f0",
      "domOrder": 5,
      "zIndex": 5,
      "sourceNodeId": "d555e514-a657-43d3-9435-f3962064d36f",
      "targetNodeId": "8810f656-c698-416c-b42b-14221f124aa0",
      "sourcePort": "left",
      "targetPort": "right",
      "svgPath": "M660,500 L500,500",
      "sourcePoint": {
        "x": 660,
        "y": 500
      },
      "targetPoint": {
        "x": 500,
        "y": 500
      },
      "waypoints": [
        {
          "x": 660,
          "y": 500
        },
        {
          "x": 500,
          "y": 500
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 180,
      "rawArrow": {
        "points": "\n            495,495\n            500,500\n            495,505\n          ",
        "transform": "rotate(180, 500, 500)"
      }
    },
    {
      "sourceEdgeId": "df05f8f7-d30b-4f83-b5be-cd054a2f2e86",
      "domOrder": 6,
      "zIndex": 6,
      "sourceNodeId": "ff83642d-55bb-4725-9972-e3eef3b98077",
      "targetNodeId": "8810f656-c698-416c-b42b-14221f124aa0",
      "sourcePort": "right",
      "targetPort": "left",
      "svgPath": "M330,500 L440,500",
      "sourcePoint": {
        "x": 330,
        "y": 500
      },
      "targetPoint": {
        "x": 440,
        "y": 500
      },
      "waypoints": [
        {
          "x": 330,
          "y": 500
        },
        {
          "x": 440,
          "y": 500
        }
      ],
      "arrowDirection": "target-to-source",
      "arrowAngle": 180,
      "rawArrow": {
        "points": "\n            325,495\n            330,500\n            325,505\n          ",
        "transform": "rotate(180, 330, 500)"
      }
    }
  ],
  "terraform": {
    "files": [
      {
        "fileName": "main.tf",
        "code": "resource \"aws_instance\" \"t2-7ff2172e\" {\n  user_data                   = <<-EOF\n  #!/bin/bash\n  sudo apt-get update\n  sudo apt install docker\nEOF\n  subnet_id                   = aws_subnet.default_subnet.id\n  private_ip                  = \"192.168.0.28\"\n  monitoring                  = false\n  key_name                    = aws_key_pair.default_key_pair.id\n  instance_type               = \"t2.medium\"\n  ebs_optimized               = false\n  availability_zone           = \"us-east-1a\"\n  associate_public_ip_address = false\n  ami                         = var.debian_ami\n\n  root_block_device {\n    volume_type           = \"gp2\"\n    volume_size           = 8\n    delete_on_termination = true\n  }\n\n  tags = {\n    \"Brainboard Template\" = \"true\"\n  }\n\n  vpc_security_group_ids = [\n    aws_security_group.default_security_group.id,\n  ]\n}\n\nresource \"aws_instance\" \"t2-bastion\" {\n  subnet_id                   = aws_subnet.default_subnet.id\n  source_dest_check           = true\n  monitoring                  = true\n  key_name                    = aws_key_pair.default_key_pair.id\n  instance_type               = \"t2.medium\"\n  ebs_optimized               = false\n  availability_zone           = \"us-east-1a\"\n  associate_public_ip_address = true\n  ami                         = var.debian_ami\n\n  root_block_device {\n    volume_type           = \"gp2\"\n    volume_size           = 8\n    delete_on_termination = true\n  }\n\n  tags = {\n    \"Brainboard Template\" = \"true\"\n  }\n\n  vpc_security_group_ids = [\n    aws_security_group.default_security_group.id,\n  ]\n}\n\nresource \"aws_internet_gateway\" \"default_gtw\" {\n  vpc_id = aws_vpc.default_vpc.id\n\n  tags = {\n    \"Brainboard Template\" = \"true\"\n  }\n}\n\nresource \"aws_key_pair\" \"default_key_pair\" {\n  public_key = var.public_key\n\n  tags = {\n    \"Brainboard Template\" = \"true\"\n  }\n}\n\nresource \"aws_network_acl\" \"default_network_acl\" {\n  vpc_id = aws_vpc.default_vpc.id\n\n  egress {\n    to_port    = 0\n    rule_no    = 100\n    protocol   = \"-1\"\n    from_port  = 0\n    cidr_block = \"0.0.0.0/0\"\n    action     = \"allow\"\n  }\n\n  ingress {\n    to_port    = 0\n    rule_no    = 100\n    protocol   = \"-1\"\n    from_port  = 0\n    cidr_block = \"0.0.0.0/0\"\n    action     = \"allow\"\n  }\n\n  subnet_ids = [\n    aws_subnet.default_subnet.id,\n  ]\n\n  tags = {\n    \"Brainboard Template\" = \"true\"\n  }\n}\n\nresource \"aws_route_table\" \"default_route\" {\n  vpc_id = aws_vpc.default_vpc.id\n\n  route {\n    gateway_id = aws_internet_gateway.default_gtw.id\n    cidr_block = \"0.0.0.0/0\"\n  }\n\n  tags = {\n    \"Brainboard Template\" = \"true\"\n  }\n}\n\nresource \"aws_route_table_association\" \"default_route_table_association\" {\n  subnet_id      = aws_subnet.default_subnet.id\n  route_table_id = aws_route_table.default_route.id\n}\n\nresource \"aws_security_group\" \"default_security_group\" {\n  vpc_id      = aws_vpc.default_vpc.id\n  name        = \"default_security_group\"\n  description = \"Allow whitelisted IP in\"\n\n  tags = {\n    \"Brainboard Template\" = \"true\"\n  }\n}\n\nresource \"aws_security_group_rule\" \"sg_rule_egress_all\" {\n  type              = \"egress\"\n  to_port           = 0\n  security_group_id = aws_security_group.default_security_group.id\n  protocol          = \"-1\"\n  from_port         = 0\n\n  cidr_blocks = [\n    \"0.0.0.0/0\",\n  ]\n}\n\nresource \"aws_security_group_rule\" \"sg_rule_ingress_all\" {\n  type              = \"ingress\"\n  to_port           = 0\n  security_group_id = aws_security_group.default_security_group.id\n  protocol          = \"-1\"\n  from_port         = 0\n\n  cidr_blocks = [\n    \"${var.ip}/32\",\n  ]\n}\n\nresource \"aws_security_group_rule\" \"sg_rule_ingress_ssh\" {\n  type              = \"ingress\"\n  to_port           = 22\n  self              = true\n  security_group_id = aws_security_group.default_security_group.id\n  protocol          = \"tcp\"\n  from_port         = 22\n}\n\nresource \"aws_subnet\" \"default_subnet\" {\n  vpc_id                  = aws_vpc.default_vpc.id\n  map_public_ip_on_launch = false\n  cidr_block              = \"192.168.0.0/24\"\n  availability_zone       = \"us-east-1a\"\n\n  tags = {\n    \"Brainboard Template\" = \"true\"\n  }\n}\n\nresource \"aws_vpc\" \"default_vpc\" {\n  instance_tenancy     = \"default\"\n  enable_dns_support   = true\n  enable_dns_hostnames = true\n  cidr_block           = \"192.168.0.0/24\"\n\n  tags = {\n    \"Brainboard Template\" = \"true\"\n  }\n}\n\n",
        "sha256": "d21adc835aa2aae548951f4fe1aeb1e218b6efff98ab607b1bff40815e66815b",
        "includeInWorkspace": true
      },
      {
        "fileName": "backend.tf",
        "code": "# This architecture uses Brainboard managed storage\n",
        "sha256": "9bd86a80fa787dddd0ec09ee56ad995ddc8e504826d124a2fa09717444751c31",
        "includeInWorkspace": false
      },
      {
        "fileName": "locals.tf",
        "code": "locals {\n}\n",
        "sha256": "0b88e8de9a5058ee4a8129450c5c0561b6a0d9306f454517271927ccdcc347f5",
        "includeInWorkspace": true
      },
      {
        "fileName": "outputs.tf",
        "code": "",
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "includeInWorkspace": true
      },
      {
        "fileName": "providers.tf",
        "code": "terraform {\n  required_providers {\n    aws = {\n      version = \"= 5.52.0\"\n    }\n  }\n}\n\nprovider \"aws\" {\n  region = \"us-east-1\"\n}\n",
        "sha256": "48a1ad8474f71e7904ac0639c3460b7a75ce71df8f5720658e9f012904229dfd",
        "includeInWorkspace": true
      },
      {
        "fileName": "terraform.tfvars",
        "code": "# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = \"c5052a14-6389-43f3-904e-873202387f84\"\n  env      = \"Production\"\n}\n",
        "sha256": "b4c0225107c9b4291555ab79214b9342d4a756cb6eee97ba0351f5c102880733",
        "includeInWorkspace": false
      },
      {
        "fileName": "variables.tf",
        "code": "variable \"debian_ami\" {\n  description = \"Default Debian ami for region Frankfurt\"\n  type        = string\n  default     = \"ami-0adb6517915458bdb\"\n}\n\nvariable \"ip\" {\n  description = \"Authorized IP\"\n  type        = string\n  default     = \"0.0.0.0\"\n}\n\nvariable \"public_key\" {\n  description = \"Public key\"\n  type        = string\n  default     = \"your_public_key\"\n}\n\nvariable \"tags\" {\n  description = \"Default tags to apply to all resources.\"\n  type        = map(any)\n  default = {\n    archuuid = \"130f8091-21a4-4e8b-8b39-2373cb720d72\"\n    env      = \"Development\"\n  }\n}\n\n",
        "sha256": "69495222c0eda507c06ccb99244e99d6aeabf6c773baf92e4605e40af1666acd",
        "includeInWorkspace": true,
        "workspaceSeed": {
          "code": "variable \"debian_ami\" {\n  description = \"Default Debian ami for region Frankfurt\"\n  type        = string\n  default     = \"ami-0adb6517915458bdb\"\n}\n\nvariable \"ip\" {\n  description = \"Authorized IP\"\n  type        = string\n  default     = \"0.0.0.0\"\n}\n\nvariable \"public_key\" {\n  description = \"Public key\"\n  type        = string\n  default     = \"your_public_key\"\n}\n\nvariable \"tags\" {\n  description = \"Default tags to apply to all resources.\"\n  type        = map(any)\n  default = {\n    env      = \"Development\"\n  }\n}\n\n",
          "sha256": "c2719eee0f4129ab00e529e5792fcf5ed6f5811a0448a2f5cd4ca775063102a6",
          "omissions": [
            {
              "reason": "brainboard-architecture-uuid",
              "sourceText": "    archuuid = \"130f8091-21a4-4e8b-8b39-2373cb720d72\"\n",
              "occurrenceCount": 1
            }
          ]
        }
      }
    ],
    "resourceAddresses": [
      "aws_instance.t2-7ff2172e",
      "aws_instance.t2-bastion",
      "aws_internet_gateway.default_gtw",
      "aws_key_pair.default_key_pair",
      "aws_network_acl.default_network_acl",
      "aws_route_table.default_route",
      "aws_route_table_association.default_route_table_association",
      "aws_security_group.default_security_group",
      "aws_security_group_rule.sg_rule_egress_all",
      "aws_security_group_rule.sg_rule_ingress_all",
      "aws_security_group_rule.sg_rule_ingress_ssh",
      "aws_subnet.default_subnet",
      "aws_vpc.default_vpc"
    ]
  },
  "bindings": {
    "4b4447a5-92a0-40b4-bf63-538a19399886": {
      "kind": "presentation",
      "catalogId": "aws-region",
      "aliasOf": null,
      "style": null
    },
    "7912ce6d-b224-4055-84c0-e847e7ca1224": {
      "kind": "resource",
      "address": "aws_vpc.default_vpc",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "3cbdd739-7b62-4824-ae49-25f7863bd970": {
      "kind": "presentation",
      "catalogId": "aws-availability-zone",
      "aliasOf": null,
      "style": null
    },
    "0b578f07-26c1-42ea-8bd0-952dd4b45ebf": {
      "kind": "resource",
      "address": "aws_subnet.default_subnet",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "6ef194ca-02bc-4039-8ca5-a61e1d285bae": {
      "kind": "resource",
      "address": "aws_security_group.default_security_group",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "8810f656-c698-416c-b42b-14221f124aa0": {
      "kind": "resource",
      "address": "aws_internet_gateway.default_gtw",
      "fileName": "main.tf",
      "addressMapping": "single-residual"
    },
    "d555e514-a657-43d3-9435-f3962064d36f": {
      "kind": "resource",
      "address": "aws_route_table.default_route",
      "fileName": "main.tf",
      "addressMapping": "single-residual"
    },
    "80489bad-1f77-4035-97ed-0939be2815cf": {
      "kind": "resource",
      "address": "aws_route_table_association.default_route_table_association",
      "fileName": "main.tf",
      "addressMapping": "single-residual"
    },
    "edd96c50-6a71-4db7-b23f-f7f21465b74f": {
      "kind": "resource",
      "address": "aws_network_acl.default_network_acl",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "f91e8491-f010-457d-b966-7cd53de8e7e3": {
      "kind": "resource",
      "address": "aws_key_pair.default_key_pair",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "decc2f66-4950-4338-89fa-7eda35c53e60": {
      "kind": "resource",
      "address": "aws_security_group_rule.sg_rule_ingress_all",
      "fileName": "main.tf",
      "addressMapping": "reviewed-override"
    },
    "202d02a1-538d-45fe-b8e5-26aa1753d5d1": {
      "kind": "resource",
      "address": "aws_security_group_rule.sg_rule_ingress_ssh",
      "fileName": "main.tf",
      "addressMapping": "reviewed-override"
    },
    "941b992f-e911-4533-baff-396fed3cd614": {
      "kind": "resource",
      "address": "aws_security_group_rule.sg_rule_egress_all",
      "fileName": "main.tf",
      "addressMapping": "reviewed-override"
    },
    "3fbf05b5-5729-4f4e-88f7-92ee41797b38": {
      "kind": "resource",
      "address": "aws_instance.t2-bastion",
      "fileName": "main.tf",
      "addressMapping": "reviewed-override"
    },
    "9e820b53-18b3-407e-be69-6fda71a19f67": {
      "kind": "resource",
      "address": "aws_instance.t2-7ff2172e",
      "fileName": "main.tf",
      "addressMapping": "reviewed-override"
    },
    "c9e3634d-acaa-4ff9-9471-47f286144125": {
      "kind": "presentation",
      "catalogId": null,
      "aliasOf": null,
      "style": null
    },
    "ff83642d-55bb-4725-9972-e3eef3b98077": {
      "kind": "presentation",
      "catalogId": "design-user-client",
      "aliasOf": null,
      "style": null
    }
  }
}
);
