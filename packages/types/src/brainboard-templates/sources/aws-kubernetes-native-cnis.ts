import { defineCapturedBrainboardTemplate } from "./define-source.js";

export const awsKubernetesNativeCnisSource = defineCapturedBrainboardTemplate(
{
  "id": "brainboard-aws-kubernetes-native-cnis",
  "origin": {
    "platform": "brainboard",
    "author": "Chafik Belhaoues",
    "sourceTemplateId": "43b2ae45-cae5-4a06-83d3-2c5007e0c49b",
    "sourceUrl": "https://app.brainboard.co/templates/43b2ae45-cae5-4a06-83d3-2c5007e0c49b",
    "cloneArchitectureId": "b5a1c8c8-7a01-4084-a785-a686b783c184",
    "downloads": 1414,
    "capturedAt": "2026-07-14"
  },
  "captureStatus": "captured",
  "title": "AWS Kubernetes cluster with native CNIs",
  "description": null,
  "provider": "aws",
  "viewport": {
    "x": -1085.54,
    "y": -648.79,
    "width": 5377.290322580645,
    "height": 2942.572759856631
  },
  "nodes": [
    {
      "sourceNodeId": "839c066c-c756-4005-aeb5-67c1e8c34cf7",
      "domOrder": 0,
      "label": "US East (N. Virginia)",
      "position": {
        "x": 450,
        "y": 310
      },
      "size": {
        "width": 2000,
        "height": 1190
      },
      "parentSourceNodeId": null,
      "zIndex": 0,
      "rawTransform": "translate(450, 310), rotate(0 1000 595)",
      "rotation": 0,
      "rawResourceType": "region"
    },
    {
      "sourceNodeId": "37304ca4-7959-4553-802c-96b74972173a",
      "domOrder": 1,
      "label": "default",
      "position": {
        "x": 850,
        "y": 405
      },
      "size": {
        "width": 1245,
        "height": 1035
      },
      "parentSourceNodeId": "839c066c-c756-4005-aeb5-67c1e8c34cf7",
      "zIndex": 1,
      "rawTransform": "translate(850, 405), rotate(0 622.5 517.5)",
      "rotation": 0,
      "rawResourceType": "aws_vpc"
    },
    {
      "sourceNodeId": "5941a072-4406-4e02-ab93-560811155e88",
      "domOrder": 2,
      "label": "sg",
      "position": {
        "x": 885,
        "y": 730
      },
      "size": {
        "width": 1180,
        "height": 665
      },
      "parentSourceNodeId": "37304ca4-7959-4553-802c-96b74972173a",
      "zIndex": 2,
      "rawTransform": "translate(885, 730), rotate(0 590 332.5)",
      "rotation": 0,
      "rawResourceType": "aws_security_group"
    },
    {
      "sourceNodeId": "5adb3d4d-2c10-46fe-93f8-691ad10c863a",
      "domOrder": 3,
      "label": "us-east-1a",
      "position": {
        "x": 960,
        "y": 835
      },
      "size": {
        "width": 300,
        "height": 480
      },
      "parentSourceNodeId": "5941a072-4406-4e02-ab93-560811155e88",
      "zIndex": 3,
      "rawTransform": "translate(960, 835), rotate(0 150 240)",
      "rotation": 0,
      "rawResourceType": "availability_zone"
    },
    {
      "sourceNodeId": "e88227bb-9f4f-4710-87a7-ad9ae751e7c0",
      "domOrder": 4,
      "label": "us-east-1b",
      "position": {
        "x": 1700,
        "y": 835
      },
      "size": {
        "width": 300,
        "height": 480
      },
      "parentSourceNodeId": "5941a072-4406-4e02-ab93-560811155e88",
      "zIndex": 4,
      "rawTransform": "translate(1700, 835), rotate(0 150 240)",
      "rotation": 0,
      "rawResourceType": "availability_zone"
    },
    {
      "sourceNodeId": "5b25dc4d-2481-4368-89be-255a3f450843",
      "domOrder": 5,
      "label": "snet-1b",
      "position": {
        "x": 1720,
        "y": 960
      },
      "size": {
        "width": 255,
        "height": 260
      },
      "parentSourceNodeId": "e88227bb-9f4f-4710-87a7-ad9ae751e7c0",
      "zIndex": 5,
      "rawTransform": "translate(1720, 960), rotate(0 127.5 130)",
      "rotation": 0,
      "rawResourceType": "aws_subnet"
    },
    {
      "sourceNodeId": "c7985a34-a745-4fc3-8e0c-32ceec6626f8",
      "domOrder": 6,
      "label": "snet-1a",
      "position": {
        "x": 980,
        "y": 960
      },
      "size": {
        "width": 250,
        "height": 260
      },
      "parentSourceNodeId": "5adb3d4d-2c10-46fe-93f8-691ad10c863a",
      "zIndex": 6,
      "rawTransform": "translate(980, 960), rotate(0 125 130)",
      "rotation": 0,
      "rawResourceType": "aws_subnet"
    },
    {
      "sourceNodeId": "80d3a744-01c0-4e70-91e9-2186f7cdf201",
      "domOrder": 7,
      "label": " ",
      "position": {
        "x": 1445,
        "y": 125
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": null,
      "zIndex": 7,
      "rawTransform": "translate(1445, 125), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "brainboard_icon"
    },
    {
      "sourceNodeId": "25376bca-5df7-479f-a809-cf06e64b7ca7",
      "domOrder": 8,
      "label": "IAM role policy attachment WN",
      "position": {
        "x": 560,
        "y": 755
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "839c066c-c756-4005-aeb5-67c1e8c34cf7",
      "zIndex": 8,
      "rawTransform": "translate(560, 755), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_iam_role_policy_attachment"
    },
    {
      "sourceNodeId": "2d045230-f49c-49bc-87b8-88f700f6781a",
      "domOrder": 9,
      "label": "IAM role policy attachment RC",
      "position": {
        "x": 2300,
        "y": 405
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "839c066c-c756-4005-aeb5-67c1e8c34cf7",
      "zIndex": 9,
      "rawTransform": "translate(2300, 405), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_iam_role_policy_attachment"
    },
    {
      "sourceNodeId": "42135c8e-4923-4254-b4c1-b22be65e236b",
      "domOrder": 10,
      "label": "node_group",
      "position": {
        "x": 760,
        "y": 575
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "839c066c-c756-4005-aeb5-67c1e8c34cf7",
      "zIndex": 10,
      "rawTransform": "translate(760, 575), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_iam_role"
    },
    {
      "sourceNodeId": "6f7256c8-2659-4d8d-865d-796e54991c87",
      "domOrder": 11,
      "label": "IAM role policy attachment CNI policy",
      "position": {
        "x": 560,
        "y": 405
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "839c066c-c756-4005-aeb5-67c1e8c34cf7",
      "zIndex": 11,
      "rawTransform": "translate(560, 405), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_iam_role_policy_attachment"
    },
    {
      "sourceNodeId": "b99df77b-1e2f-4322-9e97-0b4d91671f96",
      "domOrder": 12,
      "label": "eks",
      "position": {
        "x": 2210,
        "y": 575
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "839c066c-c756-4005-aeb5-67c1e8c34cf7",
      "zIndex": 12,
      "rawTransform": "translate(2210, 575), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_iam_role"
    },
    {
      "sourceNodeId": "c5930055-9371-4053-8473-91274baf223e",
      "domOrder": 13,
      "label": "IAM role policy attachment Registry",
      "position": {
        "x": 560,
        "y": 575
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "839c066c-c756-4005-aeb5-67c1e8c34cf7",
      "zIndex": 13,
      "rawTransform": "translate(560, 575), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_iam_role_policy_attachment"
    },
    {
      "sourceNodeId": "cb3135b3-a5b2-4d99-a025-049c131c7ab1",
      "domOrder": 14,
      "label": "IAM role policy attachment CP",
      "position": {
        "x": 2300,
        "y": 735
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "839c066c-c756-4005-aeb5-67c1e8c34cf7",
      "zIndex": 14,
      "rawTransform": "translate(2300, 735), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_iam_role_policy_attachment"
    },
    {
      "sourceNodeId": "45cb2eaf-9c40-4235-aa0a-b588cd32fcb4",
      "domOrder": 15,
      "label": "Internet gateway",
      "position": {
        "x": 1445,
        "y": 375
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "37304ca4-7959-4553-802c-96b74972173a",
      "zIndex": 15,
      "rawTransform": "translate(1445, 375), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_internet_gateway"
    },
    {
      "sourceNodeId": "7928be85-4122-45f6-b424-fba82256c200",
      "domOrder": 16,
      "label": "Route table",
      "position": {
        "x": 1445,
        "y": 575
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "37304ca4-7959-4553-802c-96b74972173a",
      "zIndex": 16,
      "rawTransform": "translate(1445, 575), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_route_table"
    },
    {
      "sourceNodeId": "767c4506-e235-40be-b156-037382cf07a7",
      "domOrder": 17,
      "label": "EKS node group",
      "position": {
        "x": 1295,
        "y": 1160
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "37304ca4-7959-4553-802c-96b74972173a",
      "zIndex": 17,
      "rawTransform": "translate(1295, 1160), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_eks_node_group"
    },
    {
      "sourceNodeId": "c34dd495-8609-4ac1-9a14-ee10979fd664",
      "domOrder": 18,
      "label": "SG rule",
      "position": {
        "x": 1445,
        "y": 1300
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "37304ca4-7959-4553-802c-96b74972173a",
      "zIndex": 18,
      "rawTransform": "translate(1445, 1300), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_security_group_rule"
    },
    {
      "sourceNodeId": "fe650b89-3abf-433e-87d7-612606ec80df",
      "domOrder": 19,
      "label": "EKS cluster",
      "position": {
        "x": 1605,
        "y": 1160
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "37304ca4-7959-4553-802c-96b74972173a",
      "zIndex": 19,
      "rawTransform": "translate(1605, 1160), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_eks_cluster"
    },
    {
      "sourceNodeId": "228e33c2-8279-40e1-ad69-745eebcae150",
      "domOrder": 20,
      "label": "rt association",
      "position": {
        "x": 1080,
        "y": 1030
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "c7985a34-a745-4fc3-8e0c-32ceec6626f8",
      "zIndex": 20,
      "rawTransform": "translate(1080, 1030), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_route_table_association"
    },
    {
      "sourceNodeId": "fa115f68-d3a4-433f-9f23-acba35012866",
      "domOrder": 21,
      "label": "rt association",
      "position": {
        "x": 1820,
        "y": 1030
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "5b25dc4d-2481-4368-89be-255a3f450843",
      "zIndex": 21,
      "rawTransform": "translate(1820, 1030), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_route_table_association"
    }
  ],
  "edges": [
    {
      "sourceEdgeId": "02dae22a-dcca-4e5b-98d9-b44d8f1a9d2b",
      "domOrder": 0,
      "zIndex": 0,
      "sourceNodeId": "fa115f68-d3a4-433f-9f23-acba35012866",
      "targetNodeId": "7928be85-4122-45f6-b424-fba82256c200",
      "sourcePort": "top",
      "targetPort": "bottom",
      "svgPath": "M1850,1030 L1850,918.4073751865562 Q1850,910.4073751865562 1842,910.4073751865562 L1483,910.4073751865562 Q1475,910.4073751865562 1475,902.4073751865562 L1475,635",
      "sourcePoint": {
        "x": 1850,
        "y": 1030
      },
      "targetPoint": {
        "x": 1475,
        "y": 635
      },
      "waypoints": [
        {
          "x": 1850,
          "y": 1030
        },
        {
          "x": 1850,
          "y": 918.4073751865562
        },
        {
          "x": 1850,
          "y": 910.4073751865562
        },
        {
          "x": 1842,
          "y": 910.4073751865562
        },
        {
          "x": 1483,
          "y": 910.4073751865562
        },
        {
          "x": 1475,
          "y": 910.4073751865562
        },
        {
          "x": 1475,
          "y": 902.4073751865562
        },
        {
          "x": 1475,
          "y": 635
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": -90,
      "rawArrow": {
        "points": "\n            1470,630\n            1475,635\n            1470,640\n          ",
        "transform": "rotate(-90, 1475, 635)"
      }
    },
    {
      "sourceEdgeId": "18339d6f-afa3-4436-a94d-f51b8364308f",
      "domOrder": 1,
      "zIndex": 1,
      "sourceNodeId": "c5930055-9371-4053-8473-91274baf223e",
      "targetNodeId": "42135c8e-4923-4254-b4c1-b22be65e236b",
      "sourcePort": "right",
      "targetPort": "left",
      "svgPath": "M620,605 L760,605",
      "sourcePoint": {
        "x": 620,
        "y": 605
      },
      "targetPoint": {
        "x": 760,
        "y": 605
      },
      "waypoints": [
        {
          "x": 620,
          "y": 605
        },
        {
          "x": 760,
          "y": 605
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 0,
      "rawArrow": {
        "points": "\n            755,600\n            760,605\n            755,610\n          ",
        "transform": "rotate(0, 760, 605)"
      }
    },
    {
      "sourceEdgeId": "481665a5-1b9e-49ac-89d6-8b9f24be57ed",
      "domOrder": 2,
      "zIndex": 2,
      "sourceNodeId": "fe650b89-3abf-433e-87d7-612606ec80df",
      "targetNodeId": "b99df77b-1e2f-4322-9e97-0b4d91671f96",
      "sourcePort": "top",
      "targetPort": "left",
      "svgPath": "M1635,1160 L1635,613 Q1635,605 1643,605 L2210,605",
      "sourcePoint": {
        "x": 1635,
        "y": 1160
      },
      "targetPoint": {
        "x": 2210,
        "y": 605
      },
      "waypoints": [
        {
          "x": 1635,
          "y": 1160
        },
        {
          "x": 1635,
          "y": 613
        },
        {
          "x": 1635,
          "y": 605
        },
        {
          "x": 1643,
          "y": 605
        },
        {
          "x": 2210,
          "y": 605
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 0,
      "rawArrow": {
        "points": "\n            2205,600\n            2210,605\n            2205,610\n          ",
        "transform": "rotate(0, 2210, 605)"
      }
    },
    {
      "sourceEdgeId": "56b6057a-22dd-41df-bfac-3c7a94de461b",
      "domOrder": 3,
      "zIndex": 3,
      "sourceNodeId": "767c4506-e235-40be-b156-037382cf07a7",
      "targetNodeId": "fe650b89-3abf-433e-87d7-612606ec80df",
      "sourcePort": "right",
      "targetPort": "left",
      "svgPath": "M1355,1190 L1605,1190",
      "sourcePoint": {
        "x": 1355,
        "y": 1190
      },
      "targetPoint": {
        "x": 1605,
        "y": 1190
      },
      "waypoints": [
        {
          "x": 1355,
          "y": 1190
        },
        {
          "x": 1605,
          "y": 1190
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 0,
      "rawArrow": {
        "points": "\n            1600,1185\n            1605,1190\n            1600,1195\n          ",
        "transform": "rotate(0, 1605, 1190)"
      }
    },
    {
      "sourceEdgeId": "5b2e6aa8-798c-4b0d-bec9-ca553ecf61ac",
      "domOrder": 4,
      "zIndex": 4,
      "sourceNodeId": "25376bca-5df7-479f-a809-cf06e64b7ca7",
      "targetNodeId": "42135c8e-4923-4254-b4c1-b22be65e236b",
      "sourcePort": "right",
      "targetPort": "left",
      "svgPath": "M620,785 L682,785 Q690,785 690,777 L690,613 Q690,605 698,605 L760,605",
      "sourcePoint": {
        "x": 620,
        "y": 785
      },
      "targetPoint": {
        "x": 760,
        "y": 605
      },
      "waypoints": [
        {
          "x": 620,
          "y": 785
        },
        {
          "x": 682,
          "y": 785
        },
        {
          "x": 690,
          "y": 785
        },
        {
          "x": 690,
          "y": 777
        },
        {
          "x": 690,
          "y": 613
        },
        {
          "x": 690,
          "y": 605
        },
        {
          "x": 698,
          "y": 605
        },
        {
          "x": 760,
          "y": 605
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 0,
      "rawArrow": {
        "points": "\n            755,600\n            760,605\n            755,610\n          ",
        "transform": "rotate(0, 760, 605)"
      }
    },
    {
      "sourceEdgeId": "97c863e0-1a3d-47ec-b523-d79e74e24e5d",
      "domOrder": 5,
      "zIndex": 5,
      "sourceNodeId": "767c4506-e235-40be-b156-037382cf07a7",
      "targetNodeId": "42135c8e-4923-4254-b4c1-b22be65e236b",
      "sourcePort": "top",
      "targetPort": "right",
      "svgPath": "M1325,1160 L1325,613 Q1325,605 1317,605 L820,605",
      "sourcePoint": {
        "x": 1325,
        "y": 1160
      },
      "targetPoint": {
        "x": 820,
        "y": 605
      },
      "waypoints": [
        {
          "x": 1325,
          "y": 1160
        },
        {
          "x": 1325,
          "y": 613
        },
        {
          "x": 1325,
          "y": 605
        },
        {
          "x": 1317,
          "y": 605
        },
        {
          "x": 820,
          "y": 605
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 180,
      "rawArrow": {
        "points": "\n            815,600\n            820,605\n            815,610\n          ",
        "transform": "rotate(180, 820, 605)"
      }
    },
    {
      "sourceEdgeId": "989a2632-9649-4ebb-b8d2-b9766ffde5ef",
      "domOrder": 6,
      "zIndex": 6,
      "sourceNodeId": "cb3135b3-a5b2-4d99-a025-049c131c7ab1",
      "targetNodeId": "b99df77b-1e2f-4322-9e97-0b4d91671f96",
      "sourcePort": "top",
      "targetPort": "bottom",
      "svgPath": "M2330,735 L2330,693 Q2330,685 2322,685 L2248,685 Q2240,685 2240,677 L2240,635",
      "sourcePoint": {
        "x": 2330,
        "y": 735
      },
      "targetPoint": {
        "x": 2240,
        "y": 635
      },
      "waypoints": [
        {
          "x": 2330,
          "y": 735
        },
        {
          "x": 2330,
          "y": 693
        },
        {
          "x": 2330,
          "y": 685
        },
        {
          "x": 2322,
          "y": 685
        },
        {
          "x": 2248,
          "y": 685
        },
        {
          "x": 2240,
          "y": 685
        },
        {
          "x": 2240,
          "y": 677
        },
        {
          "x": 2240,
          "y": 635
        }
      ],
      "arrowDirection": "none",
      "arrowAngle": 0,
      "rawArrow": null
    },
    {
      "sourceEdgeId": "ae6ff39f-fa1d-40a6-af53-dfda4436fdc9",
      "domOrder": 7,
      "zIndex": 7,
      "sourceNodeId": "80d3a744-01c0-4e70-91e9-2186f7cdf201",
      "targetNodeId": "45cb2eaf-9c40-4235-aa0a-b588cd32fcb4",
      "sourcePort": "bottom",
      "targetPort": "top",
      "svgPath": "M1475,185 L1475,375",
      "sourcePoint": {
        "x": 1475,
        "y": 185
      },
      "targetPoint": {
        "x": 1475,
        "y": 375
      },
      "waypoints": [
        {
          "x": 1475,
          "y": 185
        },
        {
          "x": 1475,
          "y": 375
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 90,
      "rawArrow": {
        "points": "\n            1470,370\n            1475,375\n            1470,380\n          ",
        "transform": "rotate(90, 1475, 375)"
      }
    },
    {
      "sourceEdgeId": "baa462f7-b1a6-44b2-beb8-00ec92c0679c",
      "domOrder": 8,
      "zIndex": 8,
      "sourceNodeId": "2d045230-f49c-49bc-87b8-88f700f6781a",
      "targetNodeId": "b99df77b-1e2f-4322-9e97-0b4d91671f96",
      "sourcePort": "bottom",
      "targetPort": "top",
      "svgPath": "M2330,465 L2330,512 Q2330,520 2322,520 L2248,520 Q2240,520 2240,528 L2240,575",
      "sourcePoint": {
        "x": 2330,
        "y": 465
      },
      "targetPoint": {
        "x": 2240,
        "y": 575
      },
      "waypoints": [
        {
          "x": 2330,
          "y": 465
        },
        {
          "x": 2330,
          "y": 512
        },
        {
          "x": 2330,
          "y": 520
        },
        {
          "x": 2322,
          "y": 520
        },
        {
          "x": 2248,
          "y": 520
        },
        {
          "x": 2240,
          "y": 520
        },
        {
          "x": 2240,
          "y": 528
        },
        {
          "x": 2240,
          "y": 575
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 90,
      "rawArrow": {
        "points": "\n            2235,570\n            2240,575\n            2235,580\n          ",
        "transform": "rotate(90, 2240, 575)"
      }
    },
    {
      "sourceEdgeId": "c4e355e9-4273-41b9-9228-f5b511b22939",
      "domOrder": 9,
      "zIndex": 9,
      "sourceNodeId": "6f7256c8-2659-4d8d-865d-796e54991c87",
      "targetNodeId": "42135c8e-4923-4254-b4c1-b22be65e236b",
      "sourcePort": "right",
      "targetPort": "left",
      "svgPath": "M620,435 L682,435 Q690,435 690,443 L690,597 Q690,605 698,605 L760,605",
      "sourcePoint": {
        "x": 620,
        "y": 435
      },
      "targetPoint": {
        "x": 760,
        "y": 605
      },
      "waypoints": [
        {
          "x": 620,
          "y": 435
        },
        {
          "x": 682,
          "y": 435
        },
        {
          "x": 690,
          "y": 435
        },
        {
          "x": 690,
          "y": 443
        },
        {
          "x": 690,
          "y": 597
        },
        {
          "x": 690,
          "y": 605
        },
        {
          "x": 698,
          "y": 605
        },
        {
          "x": 760,
          "y": 605
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 0,
      "rawArrow": {
        "points": "\n            755,600\n            760,605\n            755,610\n          ",
        "transform": "rotate(0, 760, 605)"
      }
    },
    {
      "sourceEdgeId": "c70bef85-722e-415f-b4ef-48c6e8244b12",
      "domOrder": 10,
      "zIndex": 10,
      "sourceNodeId": "228e33c2-8279-40e1-ad69-745eebcae150",
      "targetNodeId": "7928be85-4122-45f6-b424-fba82256c200",
      "sourcePort": "top",
      "targetPort": "bottom",
      "svgPath": "M1110,1030 L1110,917.6042063701999 Q1110,909.6042063701999 1118,909.6042063701999 L1467,909.6042063701999 Q1475,909.6042063701999 1475,901.6042063701999 L1475,635",
      "sourcePoint": {
        "x": 1110,
        "y": 1030
      },
      "targetPoint": {
        "x": 1475,
        "y": 635
      },
      "waypoints": [
        {
          "x": 1110,
          "y": 1030
        },
        {
          "x": 1110,
          "y": 917.6042063701999
        },
        {
          "x": 1110,
          "y": 909.6042063701999
        },
        {
          "x": 1118,
          "y": 909.6042063701999
        },
        {
          "x": 1467,
          "y": 909.6042063701999
        },
        {
          "x": 1475,
          "y": 909.6042063701999
        },
        {
          "x": 1475,
          "y": 901.6042063701999
        },
        {
          "x": 1475,
          "y": 635
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": -90,
      "rawArrow": {
        "points": "\n            1470,630\n            1475,635\n            1470,640\n          ",
        "transform": "rotate(-90, 1475, 635)"
      }
    },
    {
      "sourceEdgeId": "ce8604f3-1532-4cfd-a5d9-6384e59f4c9e",
      "domOrder": 11,
      "zIndex": 11,
      "sourceNodeId": "7928be85-4122-45f6-b424-fba82256c200",
      "targetNodeId": "45cb2eaf-9c40-4235-aa0a-b588cd32fcb4",
      "sourcePort": "top",
      "targetPort": "bottom",
      "svgPath": "M1475,575 L1475,435",
      "sourcePoint": {
        "x": 1475,
        "y": 575
      },
      "targetPoint": {
        "x": 1475,
        "y": 435
      },
      "waypoints": [
        {
          "x": 1475,
          "y": 575
        },
        {
          "x": 1475,
          "y": 435
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": -90,
      "rawArrow": {
        "points": "\n            1470,430\n            1475,435\n            1470,440\n          ",
        "transform": "rotate(-90, 1475, 435)"
      }
    },
    {
      "sourceEdgeId": "ed4a16e6-5983-4a14-ba56-36b3f7ac0546",
      "domOrder": 12,
      "zIndex": 12,
      "sourceNodeId": "767c4506-e235-40be-b156-037382cf07a7",
      "targetNodeId": "5b25dc4d-2481-4368-89be-255a3f450843",
      "sourcePort": "top",
      "targetPort": "left",
      "svgPath": "M1325,1160 L1325,1098 Q1325,1090 1333,1090 L1720,1090",
      "sourcePoint": {
        "x": 1325,
        "y": 1160
      },
      "targetPoint": {
        "x": 1720,
        "y": 1090
      },
      "waypoints": [
        {
          "x": 1325,
          "y": 1160
        },
        {
          "x": 1325,
          "y": 1098
        },
        {
          "x": 1325,
          "y": 1090
        },
        {
          "x": 1333,
          "y": 1090
        },
        {
          "x": 1720,
          "y": 1090
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 0,
      "rawArrow": {
        "points": "\n            1715,1085\n            1720,1090\n            1715,1095\n          ",
        "transform": "rotate(0, 1720, 1090)"
      }
    },
    {
      "sourceEdgeId": "f5129b3b-91cc-4026-84d9-4f772f21740d",
      "domOrder": 13,
      "zIndex": 13,
      "sourceNodeId": "767c4506-e235-40be-b156-037382cf07a7",
      "targetNodeId": "c7985a34-a745-4fc3-8e0c-32ceec6626f8",
      "sourcePort": "top",
      "targetPort": "right",
      "svgPath": "M1325,1160 L1325,1098 Q1325,1090 1317,1090 L1230,1090",
      "sourcePoint": {
        "x": 1325,
        "y": 1160
      },
      "targetPoint": {
        "x": 1230,
        "y": 1090
      },
      "waypoints": [
        {
          "x": 1325,
          "y": 1160
        },
        {
          "x": 1325,
          "y": 1098
        },
        {
          "x": 1325,
          "y": 1090
        },
        {
          "x": 1317,
          "y": 1090
        },
        {
          "x": 1230,
          "y": 1090
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 180,
      "rawArrow": {
        "points": "\n            1225,1085\n            1230,1090\n            1225,1095\n          ",
        "transform": "rotate(180, 1230, 1090)"
      }
    }
  ],
  "terraform": {
    "files": [
      {
        "fileName": "main.tf",
        "code": "resource \"aws_route_table\" \"rt\" {\n  vpc_id = aws_vpc.default.id\n  tags   = merge(var.tags, {})\n\n  route {\n    gateway_id = aws_internet_gateway.internet_gw.id\n    cidr_block = \"0.0.0.0/0\"\n  }\n}\n\nresource \"aws_route_table_association\" \"rt_association\" {\n  subnet_id      = aws_subnet.snet-1b.id\n  route_table_id = aws_route_table.rt.id\n}\n\nresource \"aws_subnet\" \"snet-1a\" {\n  vpc_id                  = aws_vpc.default.id\n  tags                    = merge(var.tags, {})\n  map_public_ip_on_launch = true\n  cidr_block              = var.subnets[0]\n  availability_zone       = \"us-east-1a\"\n}\n\nresource \"aws_security_group_rule\" \"sg_rule\" {\n  type              = \"ingress\"\n  to_port           = 443\n  security_group_id = aws_security_group.sg.id\n  protocol          = \"tcp\"\n  from_port         = 443\n  description       = \"Allow workstation to communicate with the cluster API Server\"\n\n  cidr_blocks = [\n    var.workstation-external-cidr,\n  ]\n}\n\nresource \"aws_subnet\" \"snet-1b\" {\n  vpc_id                  = aws_vpc.default.id\n  tags                    = merge(var.tags, {})\n  map_public_ip_on_launch = true\n  cidr_block              = var.subnets[1]\n  availability_zone       = \"us-east-1b\"\n}\n\nresource \"aws_route_table_association\" \"rt_association2\" {\n  subnet_id      = aws_subnet.snet-1a.id\n  route_table_id = aws_route_table.rt.id\n}\n\nresource \"aws_internet_gateway\" \"internet_gw\" {\n  vpc_id = aws_vpc.default.id\n  tags   = merge(var.tags, {})\n}\n\nresource \"aws_security_group\" \"sg\" {\n  vpc_id      = aws_vpc.default.id\n  tags        = merge(var.tags, {})\n  name        = var.sg_name\n  description = \"Cluster communication with worker nodes\"\n\n  egress {\n    to_port   = 0\n    protocol  = \"-1\"\n    from_port = 0\n\n    cidr_blocks = [\n      \"0.0.0.0/0\",\n    ]\n  }\n}\n\nresource \"aws_vpc\" \"default\" {\n  tags                             = merge(var.tags, {})\n  enable_dns_support               = true\n  enable_dns_hostnames             = true\n  cidr_block                       = var.vpc_cidr\n  assign_generated_ipv6_cidr_block = true\n}\n\n",
        "sha256": "d69135f18152ad158a58518da1b28a99d14d70ff7077c821c303c271213477d1",
        "includeInWorkspace": true
      },
      {
        "fileName": "backend.tf",
        "code": "# This architecture uses Brainboard managed storage\n",
        "sha256": "9bd86a80fa787dddd0ec09ee56ad995ddc8e504826d124a2fa09717444751c31",
        "includeInWorkspace": false
      },
      {
        "fileName": "cluster.tf",
        "code": "resource \"aws_eks_node_group\" \"eks_node_group\" {\n  tags            = merge(var.tags, {})\n  node_role_arn   = aws_iam_role.node_group.arn\n  node_group_name = var.cluster-name\n  cluster_name    = aws_eks_cluster.main.name\n\n  depends_on = [\n    aws_iam_role_policy_attachment.iam_role_policy_attachment,\n    aws_iam_role_policy_attachment.iam_role_policy_attachment4,\n    aws_iam_role_policy_attachment.iam_role_policy_attachment2,\n  ]\n\n  scaling_config {\n    min_size     = var.scaling.min\n    max_size     = var.scaling.max\n    desired_size = var.scaling.desired\n  }\n\n  subnet_ids = [\n    aws_subnet.snet-1a.id,\n    aws_subnet.snet-1b.id,\n  ]\n}\n\nresource \"aws_eks_cluster\" \"main\" {\n  tags     = merge(var.tags, {})\n  role_arn = aws_iam_role.eks.arn\n  name     = var.cluster-name\n\n  depends_on = [\n    aws_iam_role_policy_attachment.iam_role_policy_attachment3,\n    aws_iam_role_policy_attachment.iam_role_policy_attachment5,\n  ]\n\n  vpc_config {\n    security_group_ids = [\n      aws_security_group.sg.id,\n    ]\n\n    subnet_ids = [\n      aws_subnet.snet-1a.id,\n      aws_subnet.snet-1b.id,\n    ]\n  }\n}\n\n",
        "sha256": "eeb0b680d4acf39976a47f663eb0d3be72b0ac54bf6dd9d66ddfe6e9f6bba9d5",
        "includeInWorkspace": true
      },
      {
        "fileName": "iam.tf",
        "code": "resource \"aws_iam_role_policy_attachment\" \"iam_role_policy_attachment\" {\n  role       = aws_iam_role.node_group.name\n  policy_arn = \"arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy\"\n}\n\nresource \"aws_iam_role_policy_attachment\" \"iam_role_policy_attachment2\" {\n  role       = aws_iam_role.node_group.name\n  policy_arn = \"arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly\"\n}\n\nresource \"aws_iam_role\" \"eks\" {\n  tags = merge(var.tags, {})\n  name = \"brainboard-k8s-cluster\"\n  assume_role_policy = jsonencode({\n    \"Version\" : \"2012-10-17\",\n    \"Statement\" : [\n      {\n        \"Effect\" : \"Allow\",\n        \"Principal\" : {\n          \"Service\" : \"eks.amazonaws.com\"\n        },\n        \"Action\" : \"sts:AssumeRole\"\n      }\n    ]\n  })\n}\n\nresource \"aws_iam_role_policy_attachment\" \"iam_role_policy_attachment3\" {\n  role       = aws_iam_role.eks.name\n  policy_arn = \"arn:aws:iam::aws:policy/AmazonEKSClusterPolicy\"\n}\n\nresource \"aws_iam_role_policy_attachment\" \"iam_role_policy_attachment4\" {\n  role       = aws_iam_role.node_group.name\n  policy_arn = \"arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy\"\n}\n\nresource \"aws_iam_role_policy_attachment\" \"iam_role_policy_attachment5\" {\n  role       = aws_iam_role.eks.name\n  policy_arn = \"arn:aws:iam::aws:policy/AmazonEKSVPCResourceController\"\n}\n\nresource \"aws_iam_role\" \"node_group\" {\n  tags = merge(var.tags, {})\n  assume_role_policy = jsonencode({\n    \"Version\" : \"2012-10-17\",\n    \"Statement\" : [\n      {\n        \"Effect\" : \"Allow\",\n        \"Principal\" : {\n          \"Service\" : \"ec2.amazonaws.com\"\n        },\n        \"Action\" : \"sts:AssumeRole\"\n      }\n    ]\n  })\n}\n\n",
        "sha256": "144fbc7fd3c120f84dafa71708f6917f5e67873b85b3270e5db4ea8de42124b8",
        "includeInWorkspace": true
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
        "code": "# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = \"b5a1c8c8-7a01-4084-a785-a686b783c184\"\n  env      = \"Production\"\n}\n",
        "sha256": "47d6f58c4f0dfa4eaba7c60da3448fc9a93cd327ee880ef01032e7e0c5cc1196",
        "includeInWorkspace": false
      },
      {
        "fileName": "variables.tf",
        "code": "variable \"cluster-name\" {\n  type    = string\n  default = \"brainboard-eks-demo\"\n}\n\nvariable \"scaling\" {\n  description = \"The scaling capacity of the cluster.\"\n  type        = map(any)\n  default = {\n    desired = 1\n    max     = 1\n    min     = 1\n  }\n}\n\nvariable \"sg_name\" {\n  description = \"Default security group for the cluster.\"\n  type        = string\n  default     = \"kube_sg\"\n}\n\nvariable \"subnets\" {\n  description = \"Subnets where cluster resources are deployed.\"\n  type        = list(string)\n  default     = [\"10.0.0.0/24\", \"10.0.1.0/24\"]\n}\n\nvariable \"tags\" {\n  description = \"Default tags to apply to all resources.\"\n  type        = map(any)\n  default     = {}\n}\n\nvariable \"vpc_cidr\" {\n  description = \"CIDR block used by the main VPC.\"\n  type        = string\n  default     = \"10.0.0.0/16\"\n}\n\nvariable \"workstation-external-cidr\" {\n  type    = string\n  default = \"0.0.0.0/0\"\n}\n\n",
        "sha256": "d697ee9796a23e01d9cc9a209852206f1061d1c4034e088273bbd2a0d1fd631e",
        "includeInWorkspace": true
      }
    ],
    "resourceAddresses": [
      "aws_route_table.rt",
      "aws_route_table_association.rt_association",
      "aws_subnet.snet-1a",
      "aws_security_group_rule.sg_rule",
      "aws_subnet.snet-1b",
      "aws_route_table_association.rt_association2",
      "aws_internet_gateway.internet_gw",
      "aws_security_group.sg",
      "aws_vpc.default",
      "aws_eks_node_group.eks_node_group",
      "aws_eks_cluster.main",
      "aws_iam_role_policy_attachment.iam_role_policy_attachment",
      "aws_iam_role_policy_attachment.iam_role_policy_attachment2",
      "aws_iam_role.eks",
      "aws_iam_role_policy_attachment.iam_role_policy_attachment3",
      "aws_iam_role_policy_attachment.iam_role_policy_attachment4",
      "aws_iam_role_policy_attachment.iam_role_policy_attachment5",
      "aws_iam_role.node_group"
    ]
  },
  "bindings": {
    "839c066c-c756-4005-aeb5-67c1e8c34cf7": {
      "kind": "presentation",
      "catalogId": "aws-region",
      "aliasOf": null,
      "style": null
    },
    "37304ca4-7959-4553-802c-96b74972173a": {
      "kind": "resource",
      "address": "aws_vpc.default",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "5941a072-4406-4e02-ab93-560811155e88": {
      "kind": "resource",
      "address": "aws_security_group.sg",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "5adb3d4d-2c10-46fe-93f8-691ad10c863a": {
      "kind": "presentation",
      "catalogId": "aws-availability-zone",
      "aliasOf": null,
      "style": null
    },
    "e88227bb-9f4f-4710-87a7-ad9ae751e7c0": {
      "kind": "presentation",
      "catalogId": "aws-availability-zone",
      "aliasOf": null,
      "style": null
    },
    "5b25dc4d-2481-4368-89be-255a3f450843": {
      "kind": "resource",
      "address": "aws_subnet.snet-1b",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "c7985a34-a745-4fc3-8e0c-32ceec6626f8": {
      "kind": "resource",
      "address": "aws_subnet.snet-1a",
      "fileName": "main.tf",
      "addressMapping": "exact-title"
    },
    "80d3a744-01c0-4e70-91e9-2186f7cdf201": {
      "kind": "presentation",
      "catalogId": null,
      "aliasOf": null,
      "style": null
    },
    "25376bca-5df7-479f-a809-cf06e64b7ca7": {
      "kind": "resource",
      "address": "aws_iam_role_policy_attachment.iam_role_policy_attachment",
      "fileName": "iam.tf",
      "addressMapping": "reviewed-override"
    },
    "2d045230-f49c-49bc-87b8-88f700f6781a": {
      "kind": "resource",
      "address": "aws_iam_role_policy_attachment.iam_role_policy_attachment3",
      "fileName": "iam.tf",
      "addressMapping": "reviewed-override"
    },
    "42135c8e-4923-4254-b4c1-b22be65e236b": {
      "kind": "resource",
      "address": "aws_iam_role.node_group",
      "fileName": "iam.tf",
      "addressMapping": "exact-title"
    },
    "6f7256c8-2659-4d8d-865d-796e54991c87": {
      "kind": "resource",
      "address": "aws_iam_role_policy_attachment.iam_role_policy_attachment4",
      "fileName": "iam.tf",
      "addressMapping": "reviewed-override"
    },
    "b99df77b-1e2f-4322-9e97-0b4d91671f96": {
      "kind": "resource",
      "address": "aws_iam_role.eks",
      "fileName": "iam.tf",
      "addressMapping": "exact-title"
    },
    "c5930055-9371-4053-8473-91274baf223e": {
      "kind": "resource",
      "address": "aws_iam_role_policy_attachment.iam_role_policy_attachment2",
      "fileName": "iam.tf",
      "addressMapping": "reviewed-override"
    },
    "cb3135b3-a5b2-4d99-a025-049c131c7ab1": {
      "kind": "resource",
      "address": "aws_iam_role_policy_attachment.iam_role_policy_attachment5",
      "fileName": "iam.tf",
      "addressMapping": "reviewed-override"
    },
    "45cb2eaf-9c40-4235-aa0a-b588cd32fcb4": {
      "kind": "resource",
      "address": "aws_internet_gateway.internet_gw",
      "fileName": "main.tf",
      "addressMapping": "single-residual"
    },
    "7928be85-4122-45f6-b424-fba82256c200": {
      "kind": "resource",
      "address": "aws_route_table.rt",
      "fileName": "main.tf",
      "addressMapping": "single-residual"
    },
    "767c4506-e235-40be-b156-037382cf07a7": {
      "kind": "resource",
      "address": "aws_eks_node_group.eks_node_group",
      "fileName": "cluster.tf",
      "addressMapping": "single-residual"
    },
    "c34dd495-8609-4ac1-9a14-ee10979fd664": {
      "kind": "resource",
      "address": "aws_security_group_rule.sg_rule",
      "fileName": "main.tf",
      "addressMapping": "single-residual"
    },
    "fe650b89-3abf-433e-87d7-612606ec80df": {
      "kind": "resource",
      "address": "aws_eks_cluster.main",
      "fileName": "cluster.tf",
      "addressMapping": "single-residual"
    },
    "228e33c2-8279-40e1-ad69-745eebcae150": {
      "kind": "resource",
      "address": "aws_route_table_association.rt_association2",
      "fileName": "main.tf",
      "addressMapping": "reviewed-override"
    },
    "fa115f68-d3a4-433f-9f23-acba35012866": {
      "kind": "resource",
      "address": "aws_route_table_association.rt_association",
      "fileName": "main.tf",
      "addressMapping": "reviewed-override"
    }
  }
}
);
