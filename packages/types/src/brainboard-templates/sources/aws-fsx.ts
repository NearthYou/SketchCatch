import { defineCapturedBrainboardTemplate } from "./define-source.js";

export const awsFsxSource = defineCapturedBrainboardTemplate({
  id: "brainboard-aws-fsx",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "a1a4b134-bc00-4f97-82b8-46346da8ecde",
    sourceUrl: "https://app.brainboard.co/templates/a1a4b134-bc00-4f97-82b8-46346da8ecde",
    cloneArchitectureId: "2f87c587-14c3-4791-a494-ae1b27595ed4",
    downloads: 68,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS FSX architecture",
  description: null,
  provider: "aws",
  viewport: {
    x: -2199.68,
    y: -568.23,
    width: 5274.736059479554,
    height: 2886.4527881040894
  },
  nodes: [
    {
      sourceNodeId: "e39ed138-6200-410e-9d54-f567019667b7",
      domOrder: 0,
      label: "US East (Ohio)",
      position: {
        x: -490,
        y: 90
      },
      size: {
        width: 1555,
        height: 1720
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(-490, 90), rotate(0 777.5 860)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "7e275d52-672d-4e38-b17a-aad1e06c04e8",
      domOrder: 1,
      label: "default",
      position: {
        x: -420,
        y: 170
      },
      size: {
        width: 1405,
        height: 1575
      },
      parentSourceNodeId: "e39ed138-6200-410e-9d54-f567019667b7",
      zIndex: 1,
      rawTransform: "translate(-420, 170), rotate(0 702.5 787.5)",
      rotation: 0,
      rawResourceType: "aws_vpc"
    },
    {
      sourceNodeId: "9cd19ce4-c2ad-4a31-9a8b-ded606955752",
      domOrder: 2,
      label: "us-east-2a",
      position: {
        x: -290,
        y: 305
      },
      size: {
        width: 525,
        height: 1020
      },
      parentSourceNodeId: "7e275d52-672d-4e38-b17a-aad1e06c04e8",
      zIndex: 2,
      rawTransform: "translate(-290, 305), rotate(0 262.5 510)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "555b4f12-4843-4c1a-aa99-8771f272d00c",
      domOrder: 3,
      label: "us-east-2b",
      position: {
        x: 360,
        y: 309
      },
      size: {
        width: 525,
        height: 1010
      },
      parentSourceNodeId: "7e275d52-672d-4e38-b17a-aad1e06c04e8",
      zIndex: 3,
      rawTransform: "translate(360, 309), rotate(0 262.5 505)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "265b7ddb-d288-41f7-8459-7d3ace1c30b9",
      domOrder: 4,
      label: "Public subnet",
      position: {
        x: -272.784155214228,
        y: 460
      },
      size: {
        width: 490,
        height: 250
      },
      parentSourceNodeId: "9cd19ce4-c2ad-4a31-9a8b-ded606955752",
      zIndex: 4,
      rawTransform: "translate(-272.784155214228, 460), rotate(0 245 125)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "2702e115-2e4a-4d50-9424-59b727352c73",
      domOrder: 5,
      label: "Public subnet",
      position: {
        x: 380,
        y: 458
      },
      size: {
        width: 490,
        height: 250
      },
      parentSourceNodeId: "555b4f12-4843-4c1a-aa99-8771f272d00c",
      zIndex: 5,
      rawTransform: "translate(380, 458), rotate(0 245 125)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "b0dc4cbd-651f-42f7-b725-d3e7220d5559",
      domOrder: 6,
      label: "Private subnet",
      position: {
        x: -271.54138702460847,
        y: 790
      },
      size: {
        width: 480,
        height: 505
      },
      parentSourceNodeId: "9cd19ce4-c2ad-4a31-9a8b-ded606955752",
      zIndex: 6,
      rawTransform: "translate(-271.54138702460847, 790), rotate(0 240 252.5)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "9530b9bb-8579-4ae9-ae26-fa12f94a4068",
      domOrder: 7,
      label: "Private subnet",
      position: {
        x: 390,
        y: 790
      },
      size: {
        width: 480,
        height: 505
      },
      parentSourceNodeId: "555b4f12-4843-4c1a-aa99-8771f272d00c",
      zIndex: 7,
      rawTransform: "translate(390, 790), rotate(0 240 252.5)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "48a880f1-2fcf-4c52-9018-1f5af605f205",
      domOrder: 8,
      label: "fsx",
      position: {
        x: -350,
        y: 850
      },
      size: {
        width: 1290,
        height: 350
      },
      parentSourceNodeId: "7e275d52-672d-4e38-b17a-aad1e06c04e8",
      zIndex: 8,
      rawTransform: "translate(-350, 850), rotate(0 645 175)",
      rotation: 0,
      rawResourceType: "aws_security_group"
    },
    {
      sourceNodeId: "6a076cc5-40f2-4be7-b5b1-989687a1b017",
      domOrder: 9,
      label: "",
      position: {
        x: 420,
        y: 1380
      },
      size: {
        width: 540,
        height: 345
      },
      parentSourceNodeId: "7e275d52-672d-4e38-b17a-aad1e06c04e8",
      zIndex: 9,
      rawTransform: "translate(420, 1380), rotate(0 270 172.5)",
      rotation: 0,
      rawResourceType: "text"
    },
    {
      sourceNodeId: "78a94b1f-80ba-46b1-8204-1072ca27b91d",
      domOrder: 10,
      label: "",
      position: {
        x: -400,
        y: 1380
      },
      size: {
        width: 540,
        height: 345
      },
      parentSourceNodeId: "7e275d52-672d-4e38-b17a-aad1e06c04e8",
      zIndex: 10,
      rawTransform: "translate(-400, 1380), rotate(0 270 172.5)",
      rotation: 0,
      rawResourceType: "text"
    },
    {
      sourceNodeId: "6b6b83ad-b493-4db8-ad88-17d2c5e75426",
      domOrder: 11,
      label: "IGW",
      position: {
        x: 270,
        y: 140
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "7e275d52-672d-4e38-b17a-aad1e06c04e8",
      zIndex: 11,
      rawTransform: "translate(270, 140), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_internet_gateway"
    },
    {
      sourceNodeId: "19e4afd8-69f2-4959-a167-b8534d802b99",
      domOrder: 12,
      label: "Net ACL",
      position: {
        x: 780,
        y: 615
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "2702e115-2e4a-4d50-9424-59b727352c73",
      zIndex: 12,
      rawTransform: "translate(780, 615), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_network_acl"
    },
    {
      sourceNodeId: "b8e1ad82-f128-4801-ab61-99638f01082e",
      domOrder: 13,
      label: "Net ACL",
      position: {
        x: 130,
        y: 615
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "265b7ddb-d288-41f7-8459-7d3ace1c30b9",
      zIndex: 13,
      rawTransform: "translate(130, 615), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_network_acl"
    },
    {
      sourceNodeId: "c7a6ebee-753c-4aab-9075-6ae092cfc4a0",
      domOrder: 14,
      label: "eip_a",
      position: {
        x: 125,
        y: 340
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "9cd19ce4-c2ad-4a31-9a8b-ded606955752",
      zIndex: 14,
      rawTransform: "translate(125, 340), rotate(-90 30 30)",
      rotation: -90,
      rawResourceType: "aws_eip"
    },
    {
      sourceNodeId: "d7459e44-ed51-418c-805d-3f65ae50de2e",
      domOrder: 15,
      label: "nat-gw-2a-public",
      position: {
        x: 125,
        y: 500
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "265b7ddb-d288-41f7-8459-7d3ace1c30b9",
      zIndex: 15,
      rawTransform: "translate(125, 500), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_nat_gateway"
    },
    {
      sourceNodeId: "0cbffe9f-5ede-4969-b752-e22cb6fadcc2",
      domOrder: 16,
      label: "nat-gw-2b-public",
      position: {
        x: 780,
        y: 500
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "2702e115-2e4a-4d50-9424-59b727352c73",
      zIndex: 16,
      rawTransform: "translate(780, 500), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_nat_gateway"
    },
    {
      sourceNodeId: "194c263d-746a-43f0-af23-18445c225246",
      domOrder: 17,
      label: "default",
      position: {
        x: 630,
        y: 1470
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "7e275d52-672d-4e38-b17a-aad1e06c04e8",
      zIndex: 17,
      rawTransform: "translate(630, 1470), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket"
    },
    {
      sourceNodeId: "cd6d6243-292a-4775-baf7-35bcff8f1b56",
      domOrder: 18,
      label: "vpc_logs",
      position: {
        x: -190,
        y: 1470
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "7e275d52-672d-4e38-b17a-aad1e06c04e8",
      zIndex: 18,
      rawTransform: "translate(-190, 1470), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket"
    },
    {
      sourceNodeId: "6273bc80-9064-4f64-802d-e03902cbc52d",
      domOrder: 19,
      label: "Restrict public access",
      position: {
        x: 820,
        y: 1470
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "7e275d52-672d-4e38-b17a-aad1e06c04e8",
      zIndex: 19,
      rawTransform: "translate(820, 1470), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_public_access_block"
    },
    {
      sourceNodeId: "c0943882-2bf4-415b-83ab-21c7bb692b08",
      domOrder: 20,
      label: "Restrict public access",
      position: {
        x: 0,
        y: 1470
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "7e275d52-672d-4e38-b17a-aad1e06c04e8",
      zIndex: 20,
      rawTransform: "translate(0, 1470), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_public_access_block"
    },
    {
      sourceNodeId: "74346525-1052-4a0b-9e90-0253d59203dd",
      domOrder: 21,
      label: "eip_b",
      position: {
        x: 780,
        y: 340
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "555b4f12-4843-4c1a-aa99-8771f272d00c",
      zIndex: 21,
      rawTransform: "translate(780, 340), rotate(-90 30 30)",
      rotation: -90,
      rawResourceType: "aws_eip"
    },
    {
      sourceNodeId: "064d4e6f-a4bb-4041-8104-da21f1dd5bfb",
      domOrder: 22,
      label: "Internet",
      position: {
        x: 270,
        y: -80
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: null,
      zIndex: 22,
      rawTransform: "translate(270, -80), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "brainboard_icon"
    },
    {
      sourceNodeId: "f6768a8b-80fa-4dda-a435-32f0c81c5e24",
      domOrder: 23,
      label: "flow log",
      position: {
        x: -395,
        y: 1470
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "7e275d52-672d-4e38-b17a-aad1e06c04e8",
      zIndex: 23,
      rawTransform: "translate(-395, 1470), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_flow_log"
    },
    {
      sourceNodeId: "c3ae8f08-53e4-4d58-a37c-11e1c914492a",
      domOrder: 24,
      label: "FSX lustre FS mono-subnet",
      position: {
        x: -60,
        y: 1010
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "b0dc4cbd-651f-42f7-b725-d3e7220d5559",
      zIndex: 24,
      rawTransform: "translate(-60, 1010), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_fsx_lustre_file_system"
    },
    {
      sourceNodeId: "d0683fa2-c9a4-4966-9b98-ffa6892efa08",
      domOrder: 25,
      label: "FSX lustre FS mono-subnet",
      position: {
        x: 600,
        y: 1010
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "9530b9bb-8579-4ae9-ae26-fa12f94a4068",
      zIndex: 25,
      rawTransform: "translate(600, 1010), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_fsx_lustre_file_system"
    },
    {
      sourceNodeId: "54dcd23d-fd8e-4f8f-bc56-a81fcde34c8e",
      domOrder: 26,
      label: "versioning",
      position: {
        x: 820,
        y: 1630
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "7e275d52-672d-4e38-b17a-aad1e06c04e8",
      zIndex: 26,
      rawTransform: "translate(820, 1630), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_versioning"
    },
    {
      sourceNodeId: "c256a91a-8093-495c-b853-e52691c9d8c4",
      domOrder: 27,
      label: "versioning",
      position: {
        x: 0,
        y: 1630
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "7e275d52-672d-4e38-b17a-aad1e06c04e8",
      zIndex: 27,
      rawTransform: "translate(0, 1630), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_versioning"
    },
    {
      sourceNodeId: "364622cd-cd1c-483a-98b0-60f51b5ecdc9",
      domOrder: 28,
      label: "server side encryption configuration",
      position: {
        x: 630,
        y: 1630
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "7e275d52-672d-4e38-b17a-aad1e06c04e8",
      zIndex: 28,
      rawTransform: "translate(630, 1630), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_server_side_encryption_configuration"
    },
    {
      sourceNodeId: "8142cb9b-82c4-4772-a377-7d0162045d7b",
      domOrder: 29,
      label: "server side encryption configuration",
      position: {
        x: -190,
        y: 1630
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "7e275d52-672d-4e38-b17a-aad1e06c04e8",
      zIndex: 29,
      rawTransform: "translate(-190, 1630), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_server_side_encryption_configuration"
    }
  ],
  edges: [
    {
      sourceEdgeId: "0e5bcc05-c908-4af3-a0cf-92e641088b1a",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "064d4e6f-a4bb-4041-8104-da21f1dd5bfb",
      targetNodeId: "6b6b83ad-b493-4db8-ad88-17d2c5e75426",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M300,-20 L300,140",
      sourcePoint: {
        x: 300,
        y: -20
      },
      targetPoint: {
        x: 300,
        y: 140
      },
      waypoints: [
        {
          x: 300,
          y: -20
        },
        {
          x: 300,
          y: 140
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            295,-25\n            300,-20\n            295,-15\n          ",
        transform: "rotate(-90, 300, -20)"
      }
    },
    {
      sourceEdgeId: "42168d06-e667-40e9-b4dc-330b651749f4",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "0cbffe9f-5ede-4969-b752-e22cb6fadcc2",
      targetNodeId: "74346525-1052-4a0b-9e90-0253d59203dd",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M810,500 L810,400",
      sourcePoint: {
        x: 810,
        y: 500
      },
      targetPoint: {
        x: 810,
        y: 400
      },
      waypoints: [
        {
          x: 810,
          y: 500
        },
        {
          x: 810,
          y: 400
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            805,395\n            810,400\n            805,405\n          ",
        transform: "rotate(-90, 810, 400)"
      }
    },
    {
      sourceEdgeId: "46dd3064-ed83-44cc-b5eb-9c5c24a8db1b",
      domOrder: 2,
      zIndex: 2,
      sourceNodeId: "6273bc80-9064-4f64-802d-e03902cbc52d",
      targetNodeId: "194c263d-746a-43f0-af23-18445c225246",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M820,1500 L690,1500",
      sourcePoint: {
        x: 820,
        y: 1500
      },
      targetPoint: {
        x: 690,
        y: 1500
      },
      waypoints: [
        {
          x: 820,
          y: 1500
        },
        {
          x: 690,
          y: 1500
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            685,1495\n            690,1500\n            685,1505\n          ",
        transform: "rotate(180, 690, 1500)"
      }
    },
    {
      sourceEdgeId: "74827bd4-36c7-4616-8078-33522cb94c68",
      domOrder: 3,
      zIndex: 3,
      sourceNodeId: "364622cd-cd1c-483a-98b0-60f51b5ecdc9",
      targetNodeId: "194c263d-746a-43f0-af23-18445c225246",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M660,1630 L660,1530",
      sourcePoint: {
        x: 660,
        y: 1630
      },
      targetPoint: {
        x: 660,
        y: 1530
      },
      waypoints: [
        {
          x: 660,
          y: 1630
        },
        {
          x: 660,
          y: 1530
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            655,1525\n            660,1530\n            655,1535\n          ",
        transform: "rotate(-90, 660, 1530)"
      }
    },
    {
      sourceEdgeId: "84928896-ba48-43f3-9a17-4bf1998f5c3d",
      domOrder: 4,
      zIndex: 4,
      sourceNodeId: "f6768a8b-80fa-4dda-a435-32f0c81c5e24",
      targetNodeId: "cd6d6243-292a-4775-baf7-35bcff8f1b56",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M-335,1500 L-190,1500",
      sourcePoint: {
        x: -335,
        y: 1500
      },
      targetPoint: {
        x: -190,
        y: 1500
      },
      waypoints: [
        {
          x: -335,
          y: 1500
        },
        {
          x: -190,
          y: 1500
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            -195,1495\n            -190,1500\n            -195,1505\n          ",
        transform: "rotate(0, -190, 1500)"
      }
    },
    {
      sourceEdgeId: "a3108e96-8737-432a-a0fb-5d1bc491563b",
      domOrder: 5,
      zIndex: 5,
      sourceNodeId: "54dcd23d-fd8e-4f8f-bc56-a81fcde34c8e",
      targetNodeId: "194c263d-746a-43f0-af23-18445c225246",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M820,1660 L763,1660 Q755,1660 755,1652 L755,1508 Q755,1500 747,1500 L690,1500",
      sourcePoint: {
        x: 820,
        y: 1660
      },
      targetPoint: {
        x: 690,
        y: 1500
      },
      waypoints: [
        {
          x: 820,
          y: 1660
        },
        {
          x: 763,
          y: 1660
        },
        {
          x: 755,
          y: 1660
        },
        {
          x: 755,
          y: 1652
        },
        {
          x: 755,
          y: 1508
        },
        {
          x: 755,
          y: 1500
        },
        {
          x: 747,
          y: 1500
        },
        {
          x: 690,
          y: 1500
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            685,1495\n            690,1500\n            685,1505\n          ",
        transform: "rotate(180, 690, 1500)"
      }
    },
    {
      sourceEdgeId: "b44fa412-7597-4f46-8b55-d225065c1fb4",
      domOrder: 6,
      zIndex: 6,
      sourceNodeId: "8142cb9b-82c4-4772-a377-7d0162045d7b",
      targetNodeId: "cd6d6243-292a-4775-baf7-35bcff8f1b56",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M-160,1630 L-160,1530",
      sourcePoint: {
        x: -160,
        y: 1630
      },
      targetPoint: {
        x: -160,
        y: 1530
      },
      waypoints: [
        {
          x: -160,
          y: 1630
        },
        {
          x: -160,
          y: 1530
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            -165,1525\n            -160,1530\n            -165,1535\n          ",
        transform: "rotate(-90, -160, 1530)"
      }
    },
    {
      sourceEdgeId: "b8f2bf45-570f-49d6-a6f9-cc365e229215",
      domOrder: 7,
      zIndex: 7,
      sourceNodeId: "74346525-1052-4a0b-9e90-0253d59203dd",
      targetNodeId: "6b6b83ad-b493-4db8-ad88-17d2c5e75426",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath:
        "M810,340 L810,276.7690214333407 Q810,268.7690214333407 802,268.7690214333407 L308,268.7690214333407 Q300,268.7690214333407 300,260.7690214333407 L300,200",
      sourcePoint: {
        x: 810,
        y: 340
      },
      targetPoint: {
        x: 300,
        y: 200
      },
      waypoints: [
        {
          x: 810,
          y: 340
        },
        {
          x: 810,
          y: 276.7690214333407
        },
        {
          x: 810,
          y: 268.7690214333407
        },
        {
          x: 802,
          y: 268.7690214333407
        },
        {
          x: 308,
          y: 268.7690214333407
        },
        {
          x: 300,
          y: 268.7690214333407
        },
        {
          x: 300,
          y: 260.7690214333407
        },
        {
          x: 300,
          y: 200
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            295,195\n            300,200\n            295,205\n          ",
        transform: "rotate(-90, 300, 200)"
      }
    },
    {
      sourceEdgeId: "d0c6ff1b-421a-43d1-ab81-1e50828612c9",
      domOrder: 8,
      zIndex: 8,
      sourceNodeId: "c256a91a-8093-495c-b853-e52691c9d8c4",
      targetNodeId: "cd6d6243-292a-4775-baf7-35bcff8f1b56",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M0,1660 L-57,1660 Q-65,1660 -65,1652 L-65,1508 Q-65,1500 -73,1500 L-130,1500",
      sourcePoint: {
        x: 0,
        y: 1660
      },
      targetPoint: {
        x: -130,
        y: 1500
      },
      waypoints: [
        {
          x: 0,
          y: 1660
        },
        {
          x: -57,
          y: 1660
        },
        {
          x: -65,
          y: 1660
        },
        {
          x: -65,
          y: 1652
        },
        {
          x: -65,
          y: 1508
        },
        {
          x: -65,
          y: 1500
        },
        {
          x: -73,
          y: 1500
        },
        {
          x: -130,
          y: 1500
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            -135,1495\n            -130,1500\n            -135,1505\n          ",
        transform: "rotate(180, -130, 1500)"
      }
    },
    {
      sourceEdgeId: "e117a4c4-47be-4a89-95e2-e76d41397ba5",
      domOrder: 9,
      zIndex: 9,
      sourceNodeId: "d7459e44-ed51-418c-805d-3f65ae50de2e",
      targetNodeId: "c7a6ebee-753c-4aab-9075-6ae092cfc4a0",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M155,500 L155,400",
      sourcePoint: {
        x: 155,
        y: 500
      },
      targetPoint: {
        x: 155,
        y: 400
      },
      waypoints: [
        {
          x: 155,
          y: 500
        },
        {
          x: 155,
          y: 400
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            150,395\n            155,400\n            150,405\n          ",
        transform: "rotate(-90, 155, 400)"
      }
    },
    {
      sourceEdgeId: "e664c384-f903-4696-9228-7a2d53850034",
      domOrder: 10,
      zIndex: 10,
      sourceNodeId: "c0943882-2bf4-415b-83ab-21c7bb692b08",
      targetNodeId: "cd6d6243-292a-4775-baf7-35bcff8f1b56",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M0,1500 L-130,1500",
      sourcePoint: {
        x: 0,
        y: 1500
      },
      targetPoint: {
        x: -130,
        y: 1500
      },
      waypoints: [
        {
          x: 0,
          y: 1500
        },
        {
          x: -130,
          y: 1500
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            -135,1495\n            -130,1500\n            -135,1505\n          ",
        transform: "rotate(180, -130, 1500)"
      }
    },
    {
      sourceEdgeId: "ed437f7c-53ba-4cf2-b339-d24f5214af80",
      domOrder: 11,
      zIndex: 11,
      sourceNodeId: "c7a6ebee-753c-4aab-9075-6ae092cfc4a0",
      targetNodeId: "6b6b83ad-b493-4db8-ad88-17d2c5e75426",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M155,340 L155,278 Q155,270 163,270 L292,270 Q300,270 300,262 L300,200",
      sourcePoint: {
        x: 155,
        y: 340
      },
      targetPoint: {
        x: 300,
        y: 200
      },
      waypoints: [
        {
          x: 155,
          y: 340
        },
        {
          x: 155,
          y: 278
        },
        {
          x: 155,
          y: 270
        },
        {
          x: 163,
          y: 270
        },
        {
          x: 292,
          y: 270
        },
        {
          x: 300,
          y: 270
        },
        {
          x: 300,
          y: 262
        },
        {
          x: 300,
          y: 200
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            295,195\n            300,200\n            295,205\n          ",
        transform: "rotate(-90, 300, 200)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_network_acl" "public_a" {\n  vpc_id = aws_vpc.default.id\n  tags   = merge(var.tags, {})\n\n  subnet_ids = [\n    aws_subnet.public_a.id,\n  ]\n}\n\nresource "aws_network_acl" "public_b" {\n  vpc_id = aws_vpc.default.id\n  tags   = merge(var.tags, {})\n\n  subnet_ids = [\n    aws_subnet.public_b.id,\n  ]\n}\n\nresource "aws_fsx_lustre_file_system" "aws_fsx_lustre_file_system_12" {\n  tags             = merge(var.tags, {})\n  storage_capacity = 1200\n\n  security_group_ids = [\n    aws_security_group.fsx.id,\n  ]\n\n  subnet_ids = [\n    aws_subnet.private_a.id,\n  ]\n}\n\nresource "aws_security_group" "fsx" {\n  vpc_id      = aws_vpc.default.id\n  tags        = merge(var.tags, {})\n  name        = "fsx"\n  description = "FSX hardening"\n\n  ingress {\n    to_port     = 988\n    protocol    = "tcp"\n    from_port   = 988\n    description = "Allows Lustre traffic between FSx for Lustre file servers"\n\n    cidr_blocks = [\n      "0.0.0.0/0",\n    ]\n  }\n}\n\n',
        sha256: "864e0aa63bfba90ed8d2055ae1b39c5b58ce6ea61076a6dac3e8d5e660a65b4a",
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
        fileName: "private.tf",
        code: 'resource "aws_subnet" "private_a" {\n  vpc_id                  = aws_vpc.default.id\n  tags                    = merge(var.tags, {})\n  map_public_ip_on_launch = false\n  cidr_block              = var.private_subnets.a\n  availability_zone       = "us-east-2a"\n}\n\nresource "aws_subnet" "private_b" {\n  vpc_id                  = aws_vpc.default.id\n  tags                    = merge(var.tags, {})\n  map_public_ip_on_launch = false\n  cidr_block              = var.private_subnets.b\n  availability_zone       = "us-east-2b"\n}\n\n',
        sha256: "9c0af16ab04212fa0647ecdb84793de920da89c11e681192088df86a63241aec",
        includeInWorkspace: true
      },
      {
        fileName: "providers.tf",
        code: 'terraform {\n  required_providers {\n    aws = {\n      version = "= 5.52.0"\n    }\n  }\n}\n\nprovider "aws" {\n  region = "us-east-2"\n}\n',
        sha256: "bdc9400ce8e5ed6d2fdd0b086a4810346048dab71515e6f2af62d9df8984b72f",
        includeInWorkspace: true
      },
      {
        fileName: "public.tf",
        code: 'resource "aws_internet_gateway" "default" {\n  vpc_id = aws_vpc.default.id\n  tags   = merge(var.tags, {})\n}\n\nresource "aws_subnet" "public_a" {\n  vpc_id            = aws_vpc.default.id\n  tags              = merge(var.tags, {})\n  cidr_block        = var.public_subnets.a\n  availability_zone = "us-east-2a"\n}\n\nresource "aws_subnet" "public_b" {\n  vpc_id            = aws_vpc.default.id\n  tags              = merge(var.tags, {})\n  cidr_block        = var.public_subnets.b\n  availability_zone = "us-east-2b"\n}\n\nresource "aws_eip" "eip_a" {\n  tags = merge(var.tags, {})\n}\n\nresource "aws_eip" "eip_b" {\n  tags = merge(var.tags, {})\n}\n\nresource "aws_nat_gateway" "nat-gw-2a-public" {\n  tags          = merge(var.tags, {})\n  subnet_id     = aws_subnet.public_a.id\n  allocation_id = aws_eip.eip_a.allocation_id\n}\n\nresource "aws_nat_gateway" "nat-gw-2b-public" {\n  tags          = merge(var.tags, {})\n  subnet_id     = aws_subnet.public_b.id\n  allocation_id = aws_eip.eip_b.allocation_id\n}\n\n',
        sha256: "9f617109b4ae591e431b0badef1a4fa3ee953f89c92b35366b7f7d21f583f1f9",
        includeInWorkspace: true
      },
      {
        fileName: "storage.tf",
        code: 'resource "aws_s3_bucket" "default" {\n  tags   = merge(var.tags, {})\n  bucket = "vpc_logs"\n}\n\nresource "aws_s3_bucket_public_access_block" "default" {\n  restrict_public_buckets = true\n  ignore_public_acls      = true\n  bucket                  = aws_s3_bucket.default.id\n  block_public_policy     = true\n  block_public_acls       = true\n}\n\nresource "aws_s3_bucket_server_side_encryption_configuration" "default" {\n  bucket = aws_s3_bucket.default.arn\n\n  rule {\n    apply_server_side_encryption_by_default {\n      sse_algorithm     = "aws:kms"\n      kms_master_key_id = "arn"\n    }\n  }\n}\n\nresource "aws_s3_bucket_versioning" "default" {\n  bucket = aws_s3_bucket.default.arn\n\n  versioning_configuration {\n    status = "Enabled"\n  }\n}\n\n',
        sha256: "9e7450ac53dd66a7e5eadad575fcce64da33876bb7b3f17a164fcb29d65e8e11",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "2f87c587-14c3-4791-a494-ae1b27595ed4"\n  env      = "Production"\n}\n',
        sha256: "c6c167875da13cbccc7baf54d83a18483eb385f7c1d3a6f9c1cbb6e4fba2e9d4",
        includeInWorkspace: false
      },
      {
        fileName: "variables.tf",
        code: 'variable "private_subnets" {\n  type = map\n  default = {\n    a = "10.0.6.0/24"\n    b = "10.0.5.0/24"\n  }\n}\n\nvariable "public_subnets" {\n  description = "Default values for public subnets."\n  type        = map\n  default = {\n    a = "10.0.1.0/24"\n    b = "10.0.2.0/24"\n  }\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map\n  default = {\n    archuuid = "a1a4b134-bc00-4f97-82b8-46346da8ecde"\n    env      = "Dev - AWS"\n  }\n}\n\nvariable "vpc_cidr" {\n  description = "The network addressing for the default VPC."\n  type        = string\n  default     = "10.0.0.0/16"\n}\n\n',
        sha256: "079e75ff53b7a33f69ec390ac4b39eeaa455af1fa0f05f393f9cfaa466c7d4cc",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'variable "private_subnets" {\n  type = map\n  default = {\n    a = "10.0.6.0/24"\n    b = "10.0.5.0/24"\n  }\n}\n\nvariable "public_subnets" {\n  description = "Default values for public subnets."\n  type        = map\n  default = {\n    a = "10.0.1.0/24"\n    b = "10.0.2.0/24"\n  }\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map\n  default = {\n    env      = "Dev - AWS"\n  }\n}\n\nvariable "vpc_cidr" {\n  description = "The network addressing for the default VPC."\n  type        = string\n  default     = "10.0.0.0/16"\n}\n\n',
          sha256: "c658bf0376121331dfdb89a3eea85859a9727f4d24fe8c75a943230874ac785b",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archuuid = "a1a4b134-bc00-4f97-82b8-46346da8ecde"\n',
              occurrenceCount: 1
            }
          ]
        }
      },
      {
        fileName: "vpc.tf",
        code: 'resource "aws_vpc" "default" {\n  tags       = merge(var.tags, {})\n  cidr_block = var.vpc_cidr\n}\n\nresource "aws_flow_log" "default" {\n  vpc_id          = aws_vpc.default.id\n  tags            = merge(var.tags, {})\n  log_destination = aws_s3_bucket.vpc_logs.arn\n}\n\nresource "aws_s3_bucket" "vpc_logs" {\n  tags   = merge(var.tags, {})\n  bucket = "vpc_logs"\n}\n\nresource "aws_s3_bucket_public_access_block" "vpc_logs" {\n  restrict_public_buckets = true\n  ignore_public_acls      = true\n  bucket                  = aws_s3_bucket.vpc_logs.id\n  block_public_policy     = true\n  block_public_acls       = true\n}\n\nresource "aws_s3_bucket_server_side_encryption_configuration" "vpc_logs" {\n  bucket = aws_s3_bucket.vpc_logs.arn\n\n  rule {\n    apply_server_side_encryption_by_default {\n      sse_algorithm     = "aws:kms"\n      kms_master_key_id = "arn"\n    }\n  }\n}\n\nresource "aws_s3_bucket_versioning" "vpc_logs" {\n  bucket = aws_s3_bucket.vpc_logs.arn\n\n  versioning_configuration {\n    status = "Enabled"\n  }\n}\n\n',
        sha256: "35b236da3e5956184f9e8b4dd7f3be197c258358a3a2c8db09a25cb4b70c4fe1",
        includeInWorkspace: true
      }
    ],
    resourceAddresses: [
      "aws_network_acl.public_a",
      "aws_network_acl.public_b",
      "aws_fsx_lustre_file_system.aws_fsx_lustre_file_system_12",
      "aws_security_group.fsx",
      "aws_subnet.private_a",
      "aws_subnet.private_b",
      "aws_internet_gateway.default",
      "aws_subnet.public_a",
      "aws_subnet.public_b",
      "aws_eip.eip_a",
      "aws_eip.eip_b",
      "aws_nat_gateway.nat-gw-2a-public",
      "aws_nat_gateway.nat-gw-2b-public",
      "aws_s3_bucket.default",
      "aws_s3_bucket_public_access_block.default",
      "aws_s3_bucket_server_side_encryption_configuration.default",
      "aws_s3_bucket_versioning.default",
      "aws_vpc.default",
      "aws_flow_log.default",
      "aws_s3_bucket.vpc_logs",
      "aws_s3_bucket_public_access_block.vpc_logs",
      "aws_s3_bucket_server_side_encryption_configuration.vpc_logs",
      "aws_s3_bucket_versioning.vpc_logs"
    ]
  },
  bindings: {
    "e39ed138-6200-410e-9d54-f567019667b7": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "7e275d52-672d-4e38-b17a-aad1e06c04e8": {
      kind: "resource",
      address: "aws_vpc.default",
      fileName: "vpc.tf",
      addressMapping: "exact-title"
    },
    "9cd19ce4-c2ad-4a31-9a8b-ded606955752": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "555b4f12-4843-4c1a-aa99-8771f272d00c": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "265b7ddb-d288-41f7-8459-7d3ace1c30b9": {
      kind: "resource",
      address: "aws_subnet.public_a",
      fileName: "public.tf",
      addressMapping: "reviewed-override"
    },
    "2702e115-2e4a-4d50-9424-59b727352c73": {
      kind: "resource",
      address: "aws_subnet.public_b",
      fileName: "public.tf",
      addressMapping: "reviewed-override"
    },
    "b0dc4cbd-651f-42f7-b725-d3e7220d5559": {
      kind: "resource",
      address: "aws_subnet.private_a",
      fileName: "private.tf",
      addressMapping: "reviewed-override"
    },
    "9530b9bb-8579-4ae9-ae26-fa12f94a4068": {
      kind: "resource",
      address: "aws_subnet.private_b",
      fileName: "private.tf",
      addressMapping: "reviewed-override"
    },
    "48a880f1-2fcf-4c52-9018-1f5af605f205": {
      kind: "resource",
      address: "aws_security_group.fsx",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "6a076cc5-40f2-4be7-b5b1-989687a1b017": {
      kind: "presentation",
      catalogId: null,
      aliasOf: null,
      style: null
    },
    "78a94b1f-80ba-46b1-8204-1072ca27b91d": {
      kind: "presentation",
      catalogId: null,
      aliasOf: null,
      style: null
    },
    "6b6b83ad-b493-4db8-ad88-17d2c5e75426": {
      kind: "resource",
      address: "aws_internet_gateway.default",
      fileName: "public.tf",
      addressMapping: "single-residual"
    },
    "19e4afd8-69f2-4959-a167-b8534d802b99": {
      kind: "resource",
      address: "aws_network_acl.public_b",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "b8e1ad82-f128-4801-ab61-99638f01082e": {
      kind: "resource",
      address: "aws_network_acl.public_a",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "c7a6ebee-753c-4aab-9075-6ae092cfc4a0": {
      kind: "resource",
      address: "aws_eip.eip_a",
      fileName: "public.tf",
      addressMapping: "exact-title"
    },
    "d7459e44-ed51-418c-805d-3f65ae50de2e": {
      kind: "resource",
      address: "aws_nat_gateway.nat-gw-2a-public",
      fileName: "public.tf",
      addressMapping: "exact-title"
    },
    "0cbffe9f-5ede-4969-b752-e22cb6fadcc2": {
      kind: "resource",
      address: "aws_nat_gateway.nat-gw-2b-public",
      fileName: "public.tf",
      addressMapping: "exact-title"
    },
    "194c263d-746a-43f0-af23-18445c225246": {
      kind: "resource",
      address: "aws_s3_bucket.default",
      fileName: "storage.tf",
      addressMapping: "exact-title"
    },
    "cd6d6243-292a-4775-baf7-35bcff8f1b56": {
      kind: "resource",
      address: "aws_s3_bucket.vpc_logs",
      fileName: "vpc.tf",
      addressMapping: "exact-title"
    },
    "6273bc80-9064-4f64-802d-e03902cbc52d": {
      kind: "resource",
      address: "aws_s3_bucket_public_access_block.default",
      fileName: "storage.tf",
      addressMapping: "reviewed-override"
    },
    "c0943882-2bf4-415b-83ab-21c7bb692b08": {
      kind: "resource",
      address: "aws_s3_bucket_public_access_block.vpc_logs",
      fileName: "vpc.tf",
      addressMapping: "reviewed-override"
    },
    "74346525-1052-4a0b-9e90-0253d59203dd": {
      kind: "resource",
      address: "aws_eip.eip_b",
      fileName: "public.tf",
      addressMapping: "exact-title"
    },
    "064d4e6f-a4bb-4041-8104-da21f1dd5bfb": {
      kind: "presentation",
      catalogId: "design-internet",
      aliasOf: null,
      style: null
    },
    "f6768a8b-80fa-4dda-a435-32f0c81c5e24": {
      kind: "resource",
      address: "aws_flow_log.default",
      fileName: "vpc.tf",
      addressMapping: "single-residual"
    },
    "c3ae8f08-53e4-4d58-a37c-11e1c914492a": {
      kind: "resource",
      address: "aws_fsx_lustre_file_system.aws_fsx_lustre_file_system_12",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "d0683fa2-c9a4-4966-9b98-ffa6892efa08": {
      kind: "presentation",
      catalogId: "aws-fsx-lustre-file-system",
      aliasOf: "aws_fsx_lustre_file_system.aws_fsx_lustre_file_system_12",
      style: null
    },
    "54dcd23d-fd8e-4f8f-bc56-a81fcde34c8e": {
      kind: "resource",
      address: "aws_s3_bucket_versioning.default",
      fileName: "storage.tf",
      addressMapping: "reviewed-override"
    },
    "c256a91a-8093-495c-b853-e52691c9d8c4": {
      kind: "resource",
      address: "aws_s3_bucket_versioning.vpc_logs",
      fileName: "vpc.tf",
      addressMapping: "reviewed-override"
    },
    "364622cd-cd1c-483a-98b0-60f51b5ecdc9": {
      kind: "resource",
      address: "aws_s3_bucket_server_side_encryption_configuration.default",
      fileName: "storage.tf",
      addressMapping: "reviewed-override"
    },
    "8142cb9b-82c4-4772-a377-7d0162045d7b": {
      kind: "resource",
      address: "aws_s3_bucket_server_side_encryption_configuration.vpc_logs",
      fileName: "vpc.tf",
      addressMapping: "reviewed-override"
    }
  }
});
