import { defineCapturedBrainboardTemplate } from "./define-source.js";

export const awsEc2VpcSubnetSource = defineCapturedBrainboardTemplate(
{
  "id": "brainboard-aws-ec2-vpc-subnet",
  "origin": {
    "platform": "brainboard",
    "author": "Chafik Belhaoues",
    "sourceTemplateId": "9009bff8-8177-4022-ad39-6035ad4acd05",
    "sourceUrl": "https://app.brainboard.co/templates/9009bff8-8177-4022-ad39-6035ad4acd05",
    "cloneArchitectureId": "b5d56c37-98c6-473a-8b61-deec27895355",
    "downloads": 684,
    "capturedAt": "2026-07-14"
  },
  "captureStatus": "captured",
  "title": "AWS EC2 instance inside VPC & Subnet",
  "description": null,
  "provider": "aws",
  "viewport": {
    "x": -564.9,
    "y": 2328.15,
    "width": 3286.967741935484,
    "height": 1798.7017921146953
  },
  "nodes": [
    {
      "sourceNodeId": "411a1488-c6f1-4708-be6c-91844746b580",
      "domOrder": 0,
      "label": "US East (N. Virginia)",
      "position": {
        "x": 390,
        "y": 2790
      },
      "size": {
        "width": 1190,
        "height": 925
      },
      "parentSourceNodeId": null,
      "zIndex": 0,
      "rawTransform": "translate(390, 2790), rotate(0 595 462.5)",
      "rotation": 0,
      "rawResourceType": "region"
    },
    {
      "sourceNodeId": "3704567b-d0d1-49f3-9215-bf83a1df977a",
      "domOrder": 1,
      "label": "vpc",
      "position": {
        "x": 467.5,
        "y": 2872.5
      },
      "size": {
        "width": 1050,
        "height": 780
      },
      "parentSourceNodeId": "411a1488-c6f1-4708-be6c-91844746b580",
      "zIndex": 1,
      "rawTransform": "translate(467.5, 2872.5), rotate(0 525 390)",
      "rotation": 0,
      "rawResourceType": "aws_vpc"
    },
    {
      "sourceNodeId": "818d32cf-1a97-4f1c-8f60-92faf5dc7c0e",
      "domOrder": 2,
      "label": "us-east-1a",
      "position": {
        "x": 540,
        "y": 2947.5
      },
      "size": {
        "width": 915,
        "height": 655
      },
      "parentSourceNodeId": "3704567b-d0d1-49f3-9215-bf83a1df977a",
      "zIndex": 2,
      "rawTransform": "translate(540, 2947.5), rotate(0 457.5 327.5)",
      "rotation": 0,
      "rawResourceType": "availability_zone"
    },
    {
      "sourceNodeId": "8c044337-0d96-4095-b3a4-89d844d1c129",
      "domOrder": 3,
      "label": "snet",
      "position": {
        "x": 637.5,
        "y": 3067.5
      },
      "size": {
        "width": 720,
        "height": 430
      },
      "parentSourceNodeId": "818d32cf-1a97-4f1c-8f60-92faf5dc7c0e",
      "zIndex": 3,
      "rawTransform": "translate(637.5, 3067.5), rotate(0 360 215)",
      "rotation": 0,
      "rawResourceType": "aws_subnet"
    },
    {
      "sourceNodeId": "4a830da1-bf0a-4bfe-8cd4-2c0c595869bf",
      "domOrder": 4,
      "label": "",
      "position": {
        "x": 845,
        "y": 2720
      },
      "size": {
        "width": 315,
        "height": 70
      },
      "parentSourceNodeId": null,
      "zIndex": 4,
      "rawTransform": "translate(845, 2720), rotate(0 157.5 35)",
      "rotation": 0,
      "rawResourceType": "text"
    },
    {
      "sourceNodeId": "8fbaeef4-cb2d-473e-8885-2b1fb5161e59",
      "domOrder": 5,
      "label": "t3a instance",
      "position": {
        "x": 781.8345757922517,
        "y": 3252.5
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "8c044337-0d96-4095-b3a4-89d844d1c129",
      "zIndex": 5,
      "rawTransform": "translate(781.8345757922517, 3252.5), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_instance"
    },
    {
      "sourceNodeId": "f6a2e88c-0606-4841-8438-05473a0719d3",
      "domOrder": 6,
      "label": "network interface",
      "position": {
        "x": 1158.5575473905592,
        "y": 3252.5
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "8c044337-0d96-4095-b3a4-89d844d1c129",
      "zIndex": 6,
      "rawTransform": "translate(1158.5575473905592, 3252.5), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_network_interface"
    }
  ],
  "edges": [
    {
      "sourceEdgeId": "8037a2c1-781d-4bc5-a526-c1dc37dc8a6d",
      "domOrder": 0,
      "zIndex": 0,
      "sourceNodeId": "8fbaeef4-cb2d-473e-8885-2b1fb5161e59",
      "targetNodeId": "f6a2e88c-0606-4841-8438-05473a0719d3",
      "sourcePort": "right",
      "targetPort": "left",
      "svgPath": "M841.8345757922517,3282.5 L1158.5575473905592,3282.5",
      "sourcePoint": {
        "x": 841.8345757922517,
        "y": 3282.5
      },
      "targetPoint": {
        "x": 1158.5575473905592,
        "y": 3282.5
      },
      "waypoints": [
        {
          "x": 841.8345757922517,
          "y": 3282.5
        },
        {
          "x": 1158.5575473905592,
          "y": 3282.5
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 0,
      "rawArrow": {
        "points": "\n            1153.5575473905592,3277.5\n            1158.5575473905592,3282.5\n            1153.5575473905592,3287.5\n          ",
        "transform": "rotate(0, 1158.5575473905592, 3282.5)"
      }
    }
  ],
  "terraform": {
    "files": [
      {
        "fileName": "main.tf",
        "code": "resource \"aws_network_interface\" \"default\" {\n  tags      = merge(var.tags, {})\n  subnet_id = aws_subnet.snet.id\n}\n\nresource \"aws_subnet\" \"snet\" {\n  vpc_id                  = aws_vpc.vpc.id\n  tags                    = merge(var.tags, {})\n  map_public_ip_on_launch = true\n  cidr_block              = \"172.16.10.0/24\"\n  availability_zone       = \"us-east-1a\"\n}\n\nresource \"aws_instance\" \"vm\" {\n  tags              = merge(var.tags, {})\n  subnet_id         = aws_subnet.snet.id\n  instance_type     = \"t3a.medium\"\n  availability_zone = \"us-east-1a\"\n  ami               = var.ami\n}\n\nresource \"aws_vpc\" \"vpc\" {\n  tags       = merge(var.tags, {})\n  cidr_block = \"172.16.0.0/16\"\n}\n\n",
        "sha256": "616bc99626ad3a3686f8a9a5033ef4003fdaa7a817ab48ce79e708e42efc50cb",
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
        "code": "# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = \"b5d56c37-98c6-473a-8b61-deec27895355\"\n  env      = \"Production\"\n}\n",
        "sha256": "bc3ae5a7cd3f43185a1d6b71447e83f2eb2e93f194b1e5535a096ed10d7a7a90",
        "includeInWorkspace": false
      },
      {
        "fileName": "variables.tf",
        "code": "variable \"ami\" {\n  type    = string\n  default = \"ami-06dd4c7a255f8cd49\"\n}\n\nvariable \"tags\" {\n  description = \"Default tags to apply to all resources.\"\n  type        = map(any)\n  default = {\n    archuuid = \"9009bff8-8177-4022-ad39-6035ad4acd05\"\n    env      = \"Security\"\n  }\n}\n\n",
        "sha256": "464c7bcc57701fe328aeb57f495668ed23eaaec7c2d2918401f6bd7253f6d16a",
        "includeInWorkspace": true,
        "workspaceSeed": {
          "code": "variable \"ami\" {\n  type    = string\n  default = \"ami-06dd4c7a255f8cd49\"\n}\n\nvariable \"tags\" {\n  description = \"Default tags to apply to all resources.\"\n  type        = map(any)\n  default = {\n    env      = \"Security\"\n  }\n}\n\n",
          "sha256": "55dad696f3504f46889c459f2d87c889299a2c88844e6d77307a61d6a557bebb",
          "omissions": [
            {
              "reason": "brainboard-architecture-uuid",
              "sourceText": "    archuuid = \"9009bff8-8177-4022-ad39-6035ad4acd05\"\n",
              "occurrenceCount": 1
            }
          ]
        }
      }
    ],
    "resourceAddresses": [
      "aws_network_interface.default",
      "aws_subnet.snet",
      "aws_instance.vm",
      "aws_vpc.vpc"
    ]
  },
  "bindings": {
    "411a1488-c6f1-4708-be6c-91844746b580": {
      "kind": "presentation",
      "catalogId": "aws-region",
      "aliasOf": null,
      "style": null
    },
    "3704567b-d0d1-49f3-9215-bf83a1df977a": {
      "kind": "resource",
      "address": "aws_vpc.vpc",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "818d32cf-1a97-4f1c-8f60-92faf5dc7c0e": {
      "kind": "presentation",
      "catalogId": "aws-availability-zone",
      "aliasOf": null,
      "style": null
    },
    "8c044337-0d96-4095-b3a4-89d844d1c129": {
      "kind": "resource",
      "address": "aws_subnet.snet",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "4a830da1-bf0a-4bfe-8cd4-2c0c595869bf": {
      "kind": "presentation",
      "catalogId": null,
      "aliasOf": null,
      "style": null
    },
    "8fbaeef4-cb2d-473e-8885-2b1fb5161e59": {
      "kind": "resource",
      "address": "aws_instance.vm",
      "fileName": "main.tf",
      "addressMapping": "single-residual"
    },
    "f6a2e88c-0606-4841-8438-05473a0719d3": {
      "kind": "resource",
      "address": "aws_network_interface.default",
      "fileName": "main.tf",
      "addressMapping": "single-residual"
    }
  }
}
);
