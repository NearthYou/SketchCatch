import { defineCapturedBrainboardTemplate } from "./define-source.js";

export const awsLoadBalancerTargetGroupSource = defineCapturedBrainboardTemplate(
{
  "id": "brainboard-aws-load-balancer-target-group",
  "origin": {
    "platform": "brainboard",
    "author": "Chafik Belhaoues",
    "sourceTemplateId": "85dda071-ea16-4cbc-9d77-7cebe6ebaadd",
    "sourceUrl": "https://app.brainboard.co/templates/85dda071-ea16-4cbc-9d77-7cebe6ebaadd",
    "cloneArchitectureId": "b7c82e16-49c5-4ed8-bc5f-bd54a4ea8e27",
    "downloads": 300,
    "capturedAt": "2026-07-14"
  },
  "captureStatus": "captured",
  "title": "AWS load balancer with target group",
  "description": null,
  "provider": "aws",
  "viewport": {
    "x": -2485.61,
    "y": -1314.56,
    "width": 4009.5483870967737,
    "height": 2194.1139784946236
  },
  "nodes": [
    {
      "sourceNodeId": "c52a1a71-178d-4ae7-90bf-28a69b7d20a9",
      "domOrder": 0,
      "label": "US East (Ohio)",
      "position": {
        "x": -1330,
        "y": -825
      },
      "size": {
        "width": 1470,
        "height": 1195
      },
      "parentSourceNodeId": null,
      "zIndex": 0,
      "rawTransform": "translate(-1330, -825), rotate(0 735 597.5)",
      "rotation": 0,
      "rawResourceType": "region"
    },
    {
      "sourceNodeId": "595f9ca1-9786-4270-a86e-f584fd0dd78b",
      "domOrder": 1,
      "label": "default",
      "position": {
        "x": -1265,
        "y": -750
      },
      "size": {
        "width": 1340,
        "height": 1075
      },
      "parentSourceNodeId": "c52a1a71-178d-4ae7-90bf-28a69b7d20a9",
      "zIndex": 1,
      "rawTransform": "translate(-1265, -750), rotate(0 670 537.5)",
      "rotation": 0,
      "rawResourceType": "aws_vpc"
    },
    {
      "sourceNodeId": "c62807d5-e1bf-450d-a78e-bd44c7911496",
      "domOrder": 2,
      "label": "sg",
      "position": {
        "x": -1210,
        "y": -610
      },
      "size": {
        "width": 1240,
        "height": 890
      },
      "parentSourceNodeId": "595f9ca1-9786-4270-a86e-f584fd0dd78b",
      "zIndex": 2,
      "rawTransform": "translate(-1210, -610), rotate(0 620 445)",
      "rotation": 0,
      "rawResourceType": "aws_security_group"
    },
    {
      "sourceNodeId": "cb5d901c-6f13-45b6-8c28-708389c20c56",
      "domOrder": 3,
      "label": "us-east-2a",
      "position": {
        "x": -1140,
        "y": -550
      },
      "size": {
        "width": 665,
        "height": 765
      },
      "parentSourceNodeId": "c62807d5-e1bf-450d-a78e-bd44c7911496",
      "zIndex": 3,
      "rawTransform": "translate(-1140, -550), rotate(0 332.5 382.5)",
      "rotation": 0,
      "rawResourceType": "availability_zone"
    },
    {
      "sourceNodeId": "d5d05b1a-2611-4237-b99e-7e67ad204bcb",
      "domOrder": 4,
      "label": "us-east-2b",
      "position": {
        "x": -390,
        "y": -550
      },
      "size": {
        "width": 350,
        "height": 765
      },
      "parentSourceNodeId": "c62807d5-e1bf-450d-a78e-bd44c7911496",
      "zIndex": 4,
      "rawTransform": "translate(-390, -550), rotate(0 175 382.5)",
      "rotation": 0,
      "rawResourceType": "availability_zone"
    },
    {
      "sourceNodeId": "e275ea03-fd95-411d-bf68-9beda7afa0a5",
      "domOrder": 5,
      "label": "default",
      "position": {
        "x": -1070,
        "y": -460
      },
      "size": {
        "width": 540,
        "height": 625
      },
      "parentSourceNodeId": "cb5d901c-6f13-45b6-8c28-708389c20c56",
      "zIndex": 5,
      "rawTransform": "translate(-1070, -460), rotate(0 270 312.5)",
      "rotation": 0,
      "rawResourceType": "aws_subnet"
    },
    {
      "sourceNodeId": "71f7a4a8-0f10-4c27-ab01-6feb1e6279b4",
      "domOrder": 6,
      "label": "subnet2",
      "position": {
        "x": -320,
        "y": -460
      },
      "size": {
        "width": 220,
        "height": 600
      },
      "parentSourceNodeId": "d5d05b1a-2611-4237-b99e-7e67ad204bcb",
      "zIndex": 6,
      "rawTransform": "translate(-320, -460), rotate(0 110 300)",
      "rotation": 0,
      "rawResourceType": "aws_subnet"
    },
    {
      "sourceNodeId": "9976bc88-df75-470c-8d22-b9d110e98a1c",
      "domOrder": 7,
      "label": "LB listener",
      "position": {
        "x": -850,
        "y": -230
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "e275ea03-fd95-411d-bf68-9beda7afa0a5",
      "zIndex": 7,
      "rawTransform": "translate(-850, -230), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_lb_listener"
    },
    {
      "sourceNodeId": "b06847a7-437a-4d11-b271-28a83e9ff1c0",
      "domOrder": 8,
      "label": "LB target group",
      "position": {
        "x": -850,
        "y": -50
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "e275ea03-fd95-411d-bf68-9beda7afa0a5",
      "zIndex": 8,
      "rawTransform": "translate(-850, -50), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_lb_target_group"
    },
    {
      "sourceNodeId": "048a3f38-9205-4ca7-b6fa-5f37ce90c75f",
      "domOrder": 9,
      "label": "t3a_9",
      "position": {
        "x": -640,
        "y": 70
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "e275ea03-fd95-411d-bf68-9beda7afa0a5",
      "zIndex": 9,
      "rawTransform": "translate(-640, 70), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_instance"
    },
    {
      "sourceNodeId": "f18c57e0-c9a1-45c1-83f4-03b84924b7c8",
      "domOrder": 10,
      "label": "LB target group attachment",
      "position": {
        "x": -850,
        "y": 70
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "e275ea03-fd95-411d-bf68-9beda7afa0a5",
      "zIndex": 10,
      "rawTransform": "translate(-850, 70), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_lb_target_group_attachment"
    },
    {
      "sourceNodeId": "3548540e-5692-4cc2-914b-11b77e43085d",
      "domOrder": 11,
      "label": "alb",
      "position": {
        "x": -460,
        "y": -570
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "595f9ca1-9786-4270-a86e-f584fd0dd78b",
      "zIndex": 11,
      "rawTransform": "translate(-460, -570), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_lb"
    },
    {
      "sourceNodeId": "4882367c-117c-4af0-9957-4d6d466d7658",
      "domOrder": 12,
      "label": "aws_internet_gateway_12",
      "position": {
        "x": -460,
        "y": -780
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "595f9ca1-9786-4270-a86e-f584fd0dd78b",
      "zIndex": 12,
      "rawTransform": "translate(-460, -780), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_internet_gateway"
    }
  ],
  "edges": [
    {
      "sourceEdgeId": "2ad159bc-2eb3-456b-9fd0-cd9097d152e5",
      "domOrder": 0,
      "zIndex": 0,
      "sourceNodeId": "f18c57e0-c9a1-45c1-83f4-03b84924b7c8",
      "targetNodeId": "b06847a7-437a-4d11-b271-28a83e9ff1c0",
      "sourcePort": "top",
      "targetPort": "bottom",
      "svgPath": "M-820,70 L-820,10",
      "sourcePoint": {
        "x": -820,
        "y": 70
      },
      "targetPoint": {
        "x": -820,
        "y": 10
      },
      "waypoints": [
        {
          "x": -820,
          "y": 70
        },
        {
          "x": -820,
          "y": 10
        }
      ],
      "arrowDirection": "target-to-source",
      "arrowAngle": 90,
      "rawArrow": {
        "points": "\n            -825,65\n            -820,70\n            -825,75\n          ",
        "transform": "rotate(90, -820, 70)"
      }
    },
    {
      "sourceEdgeId": "41390d4c-557f-408b-88ee-2e17bf180491",
      "domOrder": 1,
      "zIndex": 1,
      "sourceNodeId": "f18c57e0-c9a1-45c1-83f4-03b84924b7c8",
      "targetNodeId": "048a3f38-9205-4ca7-b6fa-5f37ce90c75f",
      "sourcePort": "right",
      "targetPort": "left",
      "svgPath": "M-790,100 L-640,100",
      "sourcePoint": {
        "x": -790,
        "y": 100
      },
      "targetPoint": {
        "x": -640,
        "y": 100
      },
      "waypoints": [
        {
          "x": -790,
          "y": 100
        },
        {
          "x": -640,
          "y": 100
        }
      ],
      "arrowDirection": "target-to-source",
      "arrowAngle": 180,
      "rawArrow": {
        "points": "\n            -795,95\n            -790,100\n            -795,105\n          ",
        "transform": "rotate(180, -790, 100)"
      }
    },
    {
      "sourceEdgeId": "679bf958-4efb-40ee-8857-3f3dfae97c2a",
      "domOrder": 2,
      "zIndex": 2,
      "sourceNodeId": "9976bc88-df75-470c-8d22-b9d110e98a1c",
      "targetNodeId": "b06847a7-437a-4d11-b271-28a83e9ff1c0",
      "sourcePort": "bottom",
      "targetPort": "top",
      "svgPath": "M-820,-170 L-820,-50",
      "sourcePoint": {
        "x": -820,
        "y": -170
      },
      "targetPoint": {
        "x": -820,
        "y": -50
      },
      "waypoints": [
        {
          "x": -820,
          "y": -170
        },
        {
          "x": -820,
          "y": -50
        }
      ],
      "arrowDirection": "target-to-source",
      "arrowAngle": -90,
      "rawArrow": {
        "points": "\n            -825,-175\n            -820,-170\n            -825,-165\n          ",
        "transform": "rotate(-90, -820, -170)"
      }
    },
    {
      "sourceEdgeId": "afd07606-c5a2-4fa1-9764-a1a579c41c58",
      "domOrder": 3,
      "zIndex": 3,
      "sourceNodeId": "9976bc88-df75-470c-8d22-b9d110e98a1c",
      "targetNodeId": "3548540e-5692-4cc2-914b-11b77e43085d",
      "sourcePort": "right",
      "targetPort": "left",
      "svgPath": "M-790,-200 L-633,-200 Q-625,-200 -625,-208 L-625,-532 Q-625,-540 -617,-540 L-460,-540",
      "sourcePoint": {
        "x": -790,
        "y": -200
      },
      "targetPoint": {
        "x": -460,
        "y": -540
      },
      "waypoints": [
        {
          "x": -790,
          "y": -200
        },
        {
          "x": -633,
          "y": -200
        },
        {
          "x": -625,
          "y": -200
        },
        {
          "x": -625,
          "y": -208
        },
        {
          "x": -625,
          "y": -532
        },
        {
          "x": -625,
          "y": -540
        },
        {
          "x": -617,
          "y": -540
        },
        {
          "x": -460,
          "y": -540
        }
      ],
      "arrowDirection": "target-to-source",
      "arrowAngle": 180,
      "rawArrow": {
        "points": "\n            -795,-205\n            -790,-200\n            -795,-195\n          ",
        "transform": "rotate(180, -790, -200)"
      }
    }
  ],
  "terraform": {
    "files": [
      {
        "fileName": "main.tf",
        "code": "resource \"aws_vpc\" \"default\" {\n  cidr_block = \"10.0.0.0/16\"\n}\n\nresource \"aws_subnet\" \"default\" {\n  vpc_id            = aws_vpc.default.id\n  cidr_block        = var.subnet_cidr\n  availability_zone = \"us-east-2a\"\n}\n\nresource \"aws_subnet\" \"subnet2\" {\n  vpc_id            = aws_vpc.default.id\n  cidr_block        = var.subnet2_cidr\n  availability_zone = \"us-east-2b\"\n}\n\nresource \"aws_security_group\" \"sg\" {\n  vpc_id = aws_vpc.default.id\n}\n\nresource \"aws_lb_listener\" \"lb_listner\" {\n  port              = 8080\n  load_balancer_arn = aws_lb.alb.arn\n\n  default_action {\n    type             = \"forward\"\n    target_group_arn = aws_lb_target_group.aws_lb_target_group_8.arn\n  }\n}\n\nresource \"aws_lb_target_group\" \"aws_lb_target_group_8\" {\n  vpc_id   = aws_vpc.default.id\n  protocol = \"HTTP\"\n  port     = 8080\n  name     = \"target-group\"\n}\n\nresource \"aws_instance\" \"t3a_9\" {\n  subnet_id     = aws_subnet.default.id\n  instance_type = \"t3a.micro\"\n  ami           = \"ami-0c2a979b1dbc84003\"\n\n  security_groups = [\n    aws_security_group.sg.id,\n    aws_security_group.sg.id,\n    aws_security_group.sg.id,\n  ]\n}\n\nresource \"aws_lb_target_group_attachment\" \"aws_lb_target_group_attachment_10\" {\n  target_id        = aws_instance.t3a_9.id\n  target_group_arn = aws_lb_target_group.aws_lb_target_group_8.arn\n}\n\nresource \"aws_lb\" \"alb\" {\n  security_groups = [\n    aws_security_group.sg.id,\n  ]\n\n  subnets = [\n    aws_subnet.default.id,\n    aws_subnet.subnet2.id,\n  ]\n}\n\nresource \"aws_internet_gateway\" \"aws_internet_gateway_12\" {\n  vpc_id = aws_vpc.default.id\n}\n\n",
        "sha256": "660e9ebd4139435182d60c6dc5ba4c03b185bb3c68483ad091e741bb88eabb18",
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
        "code": "terraform {\n  required_providers {\n    aws = {\n      version = \"= 5.52.0\"\n    }\n  }\n}\n\nprovider \"aws\" {\n  region = \"us-east-2\"\n}\n",
        "sha256": "bdc9400ce8e5ed6d2fdd0b086a4810346048dab71515e6f2af62d9df8984b72f",
        "includeInWorkspace": true
      },
      {
        "fileName": "terraform.tfvars",
        "code": "# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = \"b7c82e16-49c5-4ed8-bc5f-bd54a4ea8e27\"\n  env      = \"Production\"\n}\n",
        "sha256": "a8f243d464a32ff5410f3f42facf3c29173e16e246fbf0a379607bc56b3ebb30",
        "includeInWorkspace": false
      },
      {
        "fileName": "undefined.tf",
        "code": "",
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "includeInWorkspace": true
      },
      {
        "fileName": "variables.tf",
        "code": "variable \"subnet2_cidr\" {\n  type    = string\n  default = \"10.0.2.0/24\"\n}\n\nvariable \"subnet_cidr\" {\n  description = \"The default subnet CIDR.\"\n  type        = string\n  default     = \"10.0.1.0/24\"\n}\n\nvariable \"tags\" {\n  description = \"Default tags to apply to all resources.\"\n  type        = map(any)\n  default = {\n    archuuid = \"85dda071-ea16-4cbc-9d77-7cebe6ebaadd\"\n    env      = \"Dev\"\n  }\n}\n\nvariable \"vpc_cidr\" {\n  description = \"The default VPC CIDR block.\"\n  type        = string\n  default     = \"10.0.0.0/16\"\n}\n\n",
        "sha256": "1248d8f191281aa4ee03b512d9ee81d8eeb98f715040ad98d60d8cbbe5b316e0",
        "includeInWorkspace": true,
        "workspaceSeed": {
          "code": "variable \"subnet2_cidr\" {\n  type    = string\n  default = \"10.0.2.0/24\"\n}\n\nvariable \"subnet_cidr\" {\n  description = \"The default subnet CIDR.\"\n  type        = string\n  default     = \"10.0.1.0/24\"\n}\n\nvariable \"tags\" {\n  description = \"Default tags to apply to all resources.\"\n  type        = map(any)\n  default = {\n    env      = \"Dev\"\n  }\n}\n\nvariable \"vpc_cidr\" {\n  description = \"The default VPC CIDR block.\"\n  type        = string\n  default     = \"10.0.0.0/16\"\n}\n\n",
          "sha256": "2f4aa10577f9200d9dda4b9e7496052e2e917945b91a281507e830a6d68f34a7",
          "omissions": [
            {
              "reason": "brainboard-architecture-uuid",
              "sourceText": "    archuuid = \"85dda071-ea16-4cbc-9d77-7cebe6ebaadd\"\n",
              "occurrenceCount": 1
            }
          ]
        }
      }
    ],
    "resourceAddresses": [
      "aws_vpc.default",
      "aws_subnet.default",
      "aws_subnet.subnet2",
      "aws_security_group.sg",
      "aws_lb_listener.lb_listner",
      "aws_lb_target_group.aws_lb_target_group_8",
      "aws_instance.t3a_9",
      "aws_lb_target_group_attachment.aws_lb_target_group_attachment_10",
      "aws_lb.alb",
      "aws_internet_gateway.aws_internet_gateway_12"
    ]
  },
  "bindings": {
    "c52a1a71-178d-4ae7-90bf-28a69b7d20a9": {
      "kind": "presentation",
      "catalogId": "aws-region",
      "aliasOf": null,
      "style": null
    },
    "595f9ca1-9786-4270-a86e-f584fd0dd78b": {
      "kind": "resource",
      "address": "aws_vpc.default",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "c62807d5-e1bf-450d-a78e-bd44c7911496": {
      "kind": "resource",
      "address": "aws_security_group.sg",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "cb5d901c-6f13-45b6-8c28-708389c20c56": {
      "kind": "presentation",
      "catalogId": "aws-availability-zone",
      "aliasOf": null,
      "style": null
    },
    "d5d05b1a-2611-4237-b99e-7e67ad204bcb": {
      "kind": "presentation",
      "catalogId": "aws-availability-zone",
      "aliasOf": null,
      "style": null
    },
    "e275ea03-fd95-411d-bf68-9beda7afa0a5": {
      "kind": "resource",
      "address": "aws_subnet.default",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "71f7a4a8-0f10-4c27-ab01-6feb1e6279b4": {
      "kind": "resource",
      "address": "aws_subnet.subnet2",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "9976bc88-df75-470c-8d22-b9d110e98a1c": {
      "kind": "resource",
      "address": "aws_lb_listener.lb_listner",
      "fileName": "main.tf",
      "addressMapping": "single-residual"
    },
    "b06847a7-437a-4d11-b271-28a83e9ff1c0": {
      "kind": "resource",
      "address": "aws_lb_target_group.aws_lb_target_group_8",
      "fileName": "main.tf",
      "addressMapping": "single-residual"
    },
    "048a3f38-9205-4ca7-b6fa-5f37ce90c75f": {
      "kind": "resource",
      "address": "aws_instance.t3a_9",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "f18c57e0-c9a1-45c1-83f4-03b84924b7c8": {
      "kind": "resource",
      "address": "aws_lb_target_group_attachment.aws_lb_target_group_attachment_10",
      "fileName": "main.tf",
      "addressMapping": "single-residual"
    },
    "3548540e-5692-4cc2-914b-11b77e43085d": {
      "kind": "resource",
      "address": "aws_lb.alb",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "4882367c-117c-4af0-9957-4d6d466d7658": {
      "kind": "resource",
      "address": "aws_internet_gateway.aws_internet_gateway_12",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    }
  }
}
);
