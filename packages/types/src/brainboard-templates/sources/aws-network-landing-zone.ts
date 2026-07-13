import { defineCapturedBrainboardTemplate } from "./define-source.js";

export const awsNetworkLandingZoneSource = defineCapturedBrainboardTemplate({
  id: "brainboard-aws-network-landing-zone",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "32450f82-e196-4602-853c-c55c0cb9718e",
    sourceUrl: "https://app.brainboard.co/templates/32450f82-e196-4602-853c-c55c0cb9718e",
    cloneArchitectureId: "d1841afa-9c0f-40d3-a188-477020ee4f17",
    downloads: 537,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS network landing zone",
  description: null,
  provider: "aws",
  viewport: {
    x: -2177.5,
    y: -946.04,
    width: 5906.322580645161,
    height: 3232.0709677419354
  },
  nodes: [
    {
      sourceNodeId: "eaf4b1f2-372f-4eef-968c-5137fb0941ef",
      domOrder: 0,
      label: "US East (Ohio)",
      position: {
        x: -495,
        y: 90
      },
      size: {
        width: 2205,
        height: 1350
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(-495, 90), rotate(0 1102.5 675)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "2abe13e0-233f-4e11-9d24-05e9b3d61bdf",
      domOrder: 1,
      label: "default",
      position: {
        x: -430,
        y: 170
      },
      size: {
        width: 2070,
        height: 1230
      },
      parentSourceNodeId: "eaf4b1f2-372f-4eef-968c-5137fb0941ef",
      zIndex: 1,
      rawTransform: "translate(-430, 170), rotate(0 1035 615)",
      rotation: 0,
      rawResourceType: "aws_vpc"
    },
    {
      sourceNodeId: "8487e22b-1a81-4b45-87f4-3415848b288a",
      domOrder: 2,
      label: "us-east-2a",
      position: {
        x: -300,
        y: 305
      },
      size: {
        width: 525,
        height: 1020
      },
      parentSourceNodeId: "2abe13e0-233f-4e11-9d24-05e9b3d61bdf",
      zIndex: 2,
      rawTransform: "translate(-300, 305), rotate(0 262.5 510)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "a8cbdb9e-1255-44d1-9ccc-af111d08dc6d",
      domOrder: 3,
      label: "us-east-2b",
      position: {
        x: 350,
        y: 309
      },
      size: {
        width: 525,
        height: 1010
      },
      parentSourceNodeId: "2abe13e0-233f-4e11-9d24-05e9b3d61bdf",
      zIndex: 3,
      rawTransform: "translate(350, 309), rotate(0 262.5 505)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "efe4bfff-0849-45a3-81fd-d78dcec9062e",
      domOrder: 4,
      label: "us-east-2c",
      position: {
        x: 990,
        y: 310
      },
      size: {
        width: 525,
        height: 1010
      },
      parentSourceNodeId: "2abe13e0-233f-4e11-9d24-05e9b3d61bdf",
      zIndex: 4,
      rawTransform: "translate(990, 310), rotate(0 262.5 505)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "ceb5c182-f15b-4fed-8cd2-ae6f38ae57bb",
      domOrder: 5,
      label: "Public subnet",
      position: {
        x: -282.784155214228,
        y: 460
      },
      size: {
        width: 490,
        height: 250
      },
      parentSourceNodeId: "8487e22b-1a81-4b45-87f4-3415848b288a",
      zIndex: 5,
      rawTransform: "translate(-282.784155214228, 460), rotate(0 245 125)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "59330f93-ad09-4e27-8125-9ed70c14f18d",
      domOrder: 6,
      label: "Public subnet",
      position: {
        x: 370,
        y: 458
      },
      size: {
        width: 490,
        height: 250
      },
      parentSourceNodeId: "a8cbdb9e-1255-44d1-9ccc-af111d08dc6d",
      zIndex: 6,
      rawTransform: "translate(370, 458), rotate(0 245 125)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "d8602f90-fb4f-43f4-b4de-810d0117cc46",
      domOrder: 7,
      label: "Public subnet",
      position: {
        x: 1010,
        y: 460
      },
      size: {
        width: 490,
        height: 250
      },
      parentSourceNodeId: "efe4bfff-0849-45a3-81fd-d78dcec9062e",
      zIndex: 7,
      rawTransform: "translate(1010, 460), rotate(0 245 125)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "75bf4e98-45fc-47f3-91d3-3c96bcbbde9c",
      domOrder: 8,
      label: "Private subnet",
      position: {
        x: -281.54138702460847,
        y: 790
      },
      size: {
        width: 480,
        height: 505
      },
      parentSourceNodeId: "8487e22b-1a81-4b45-87f4-3415848b288a",
      zIndex: 8,
      rawTransform: "translate(-281.54138702460847, 790), rotate(0 240 252.5)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "c922d942-2e74-48fa-8ad7-588328b69fbd",
      domOrder: 9,
      label: "Private subnet",
      position: {
        x: 380,
        y: 790
      },
      size: {
        width: 480,
        height: 505
      },
      parentSourceNodeId: "a8cbdb9e-1255-44d1-9ccc-af111d08dc6d",
      zIndex: 9,
      rawTransform: "translate(380, 790), rotate(0 240 252.5)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "7706801a-075a-4573-ba3c-fa5fcdcb5e39",
      domOrder: 10,
      label: "Private subnet",
      position: {
        x: 1010,
        y: 790
      },
      size: {
        width: 480,
        height: 505
      },
      parentSourceNodeId: "efe4bfff-0849-45a3-81fd-d78dcec9062e",
      zIndex: 10,
      rawTransform: "translate(1010, 790), rotate(0 240 252.5)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "c5e2f82f-fa10-4734-ba7b-13c62eca245c",
      domOrder: 11,
      label: "eip_a",
      position: {
        x: 120,
        y: 500
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "ceb5c182-f15b-4fed-8cd2-ae6f38ae57bb",
      zIndex: 11,
      rawTransform: "translate(120, 500), rotate(-90 30 30)",
      rotation: -90,
      rawResourceType: "aws_eip"
    },
    {
      sourceNodeId: "930b2ef4-42c3-47c3-a5f2-8f1c8b66eeb2",
      domOrder: 12,
      label: "nat-gw-2a-public",
      position: {
        x: 120,
        y: 620
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "ceb5c182-f15b-4fed-8cd2-ae6f38ae57bb",
      zIndex: 12,
      rawTransform: "translate(120, 620), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_nat_gateway"
    },
    {
      sourceNodeId: "7e887897-a039-4423-90de-08855d52d313",
      domOrder: 13,
      label: "nat-gw-2b-public",
      position: {
        x: 770,
        y: 620
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "59330f93-ad09-4e27-8125-9ed70c14f18d",
      zIndex: 13,
      rawTransform: "translate(770, 620), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_nat_gateway"
    },
    {
      sourceNodeId: "63b13b84-61f9-4e19-bb60-a3d254b4ec5c",
      domOrder: 14,
      label: "nat-gw-2c-public",
      position: {
        x: 1411.5413870246084,
        y: 620
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d8602f90-fb4f-43f4-b4de-810d0117cc46",
      zIndex: 14,
      rawTransform: "translate(1411.5413870246084, 620), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_nat_gateway"
    },
    {
      sourceNodeId: "d1d206eb-491d-49e0-89f8-a079f364504b",
      domOrder: 15,
      label: "eip_b",
      position: {
        x: 770,
        y: 500
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "59330f93-ad09-4e27-8125-9ed70c14f18d",
      zIndex: 15,
      rawTransform: "translate(770, 500), rotate(-90 30 30)",
      rotation: -90,
      rawResourceType: "aws_eip"
    },
    {
      sourceNodeId: "19d29edd-f56f-4e0c-8783-f484e8ba099b",
      domOrder: 16,
      label: "rt_public_a",
      position: {
        x: -240,
        y: 560
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "ceb5c182-f15b-4fed-8cd2-ae6f38ae57bb",
      zIndex: 16,
      rawTransform: "translate(-240, 560), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table"
    },
    {
      sourceNodeId: "991494f9-ef01-48fc-a913-5fcf1ef4d36f",
      domOrder: 17,
      label: "rt_public_b",
      position: {
        x: 420,
        y: 560
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "59330f93-ad09-4e27-8125-9ed70c14f18d",
      zIndex: 17,
      rawTransform: "translate(420, 560), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table"
    },
    {
      sourceNodeId: "ee5363fd-574a-41db-8101-3f1b3f9a4a89",
      domOrder: 18,
      label: "eip_c",
      position: {
        x: 1410,
        y: 500
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d8602f90-fb4f-43f4-b4de-810d0117cc46",
      zIndex: 18,
      rawTransform: "translate(1410, 500), rotate(-90 30 30)",
      rotation: -90,
      rawResourceType: "aws_eip"
    },
    {
      sourceNodeId: "4bcc66c1-1ca5-4598-b191-43978626b5d4",
      domOrder: 19,
      label: "rt_private_a",
      position: {
        x: 120,
        y: 920
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "75bf4e98-45fc-47f3-91d3-3c96bcbbde9c",
      zIndex: 19,
      rawTransform: "translate(120, 920), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table"
    },
    {
      sourceNodeId: "3a83b88a-5972-4fa0-a93d-a5e9043dd346",
      domOrder: 20,
      label: "rt_public_c",
      position: {
        x: 1060,
        y: 560
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d8602f90-fb4f-43f4-b4de-810d0117cc46",
      zIndex: 20,
      rawTransform: "translate(1060, 560), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table"
    },
    {
      sourceNodeId: "e2b5b2fc-8c8c-4ba3-ac14-7ef1f114adae",
      domOrder: 21,
      label: "rt_private_b",
      position: {
        x: 770,
        y: 900
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "c922d942-2e74-48fa-8ad7-588328b69fbd",
      zIndex: 21,
      rawTransform: "translate(770, 900), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table"
    },
    {
      sourceNodeId: "ccbad7d3-fe39-4213-953c-0884b6e0aa64",
      domOrder: 22,
      label: "rt_private_c",
      position: {
        x: 1410,
        y: 920
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "7706801a-075a-4573-ba3c-fa5fcdcb5e39",
      zIndex: 22,
      rawTransform: "translate(1410, 920), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table"
    },
    {
      sourceNodeId: "33d669e3-4362-4e39-b077-46eaa146ea0b",
      domOrder: 23,
      label: "Internet",
      position: {
        x: 590,
        y: -120
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: null,
      zIndex: 23,
      rawTransform: "translate(590, -120), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "brainboard_icon"
    },
    {
      sourceNodeId: "eafb249d-07f3-431b-9f76-dbd55ad496fe",
      domOrder: 24,
      label: "default",
      position: {
        x: -400,
        y: 250
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "2abe13e0-233f-4e11-9d24-05e9b3d61bdf",
      zIndex: 24,
      rawTransform: "translate(-400, 250), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_flow_log"
    },
    {
      sourceNodeId: "b52fd88e-c798-4539-bc2c-c96d2ff2a59a",
      domOrder: 25,
      label: "default",
      position: {
        x: 590,
        y: 140
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "2abe13e0-233f-4e11-9d24-05e9b3d61bdf",
      zIndex: 25,
      rawTransform: "translate(590, 140), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_internet_gateway"
    }
  ],
  edges: [
    {
      sourceEdgeId: "0cda84bb-23ea-4983-9da9-f770844b3af2",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "7e887897-a039-4423-90de-08855d52d313",
      targetNodeId: "d1d206eb-491d-49e0-89f8-a079f364504b",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M800,620 L800,560",
      sourcePoint: {
        x: 800,
        y: 620
      },
      targetPoint: {
        x: 800,
        y: 560
      },
      waypoints: [
        {
          x: 800,
          y: 620
        },
        {
          x: 800,
          y: 560
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            795,555\n            800,560\n            795,565\n          ",
        transform: "rotate(-90, 800, 560)"
      }
    },
    {
      sourceEdgeId: "1e35b5f4-f205-4c21-ab80-54766f6583b5",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "ee5363fd-574a-41db-8101-3f1b3f9a4a89",
      targetNodeId: "b52fd88e-c798-4539-bc2c-c96d2ff2a59a",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath:
        "M1440,500 L1440,276.7051264994476 Q1440,268.7051264994476 1432,268.7051264994476 L628,268.7051264994476 Q620,268.7051264994476 620,260.7051264994476 L620,200",
      sourcePoint: {
        x: 1440,
        y: 500
      },
      targetPoint: {
        x: 620,
        y: 200
      },
      waypoints: [
        {
          x: 1440,
          y: 500
        },
        {
          x: 1440,
          y: 276.7051264994476
        },
        {
          x: 1440,
          y: 268.7051264994476
        },
        {
          x: 1432,
          y: 268.7051264994476
        },
        {
          x: 628,
          y: 268.7051264994476
        },
        {
          x: 620,
          y: 268.7051264994476
        },
        {
          x: 620,
          y: 260.7051264994476
        },
        {
          x: 620,
          y: 200
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            615,195\n            620,200\n            615,205\n          ",
        transform: "rotate(-90, 620, 200)"
      }
    },
    {
      sourceEdgeId: "25fd4a12-9294-4ce6-b84d-15f3ad9e6ed2",
      domOrder: 2,
      zIndex: 2,
      sourceNodeId: "4bcc66c1-1ca5-4598-b191-43978626b5d4",
      targetNodeId: "930b2ef4-42c3-47c3-a5f2-8f1c8b66eeb2",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M150,920 L150,680",
      sourcePoint: {
        x: 150,
        y: 920
      },
      targetPoint: {
        x: 150,
        y: 680
      },
      waypoints: [
        {
          x: 150,
          y: 920
        },
        {
          x: 150,
          y: 680
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            145,675\n            150,680\n            145,685\n          ",
        transform: "rotate(-90, 150, 680)"
      }
    },
    {
      sourceEdgeId: "3444931e-eae9-402f-9993-03b7417bd98b",
      domOrder: 3,
      zIndex: 3,
      sourceNodeId: "d1d206eb-491d-49e0-89f8-a079f364504b",
      targetNodeId: "b52fd88e-c798-4539-bc2c-c96d2ff2a59a",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath:
        "M800,500 L800,276.43906749934513 Q800,268.43906749934513 792,268.43906749934513 L628,268.43906749934513 Q620,268.43906749934513 620,260.43906749934513 L620,200",
      sourcePoint: {
        x: 800,
        y: 500
      },
      targetPoint: {
        x: 620,
        y: 200
      },
      waypoints: [
        {
          x: 800,
          y: 500
        },
        {
          x: 800,
          y: 276.43906749934513
        },
        {
          x: 800,
          y: 268.43906749934513
        },
        {
          x: 792,
          y: 268.43906749934513
        },
        {
          x: 628,
          y: 268.43906749934513
        },
        {
          x: 620,
          y: 268.43906749934513
        },
        {
          x: 620,
          y: 260.43906749934513
        },
        {
          x: 620,
          y: 200
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            615,195\n            620,200\n            615,205\n          ",
        transform: "rotate(-90, 620, 200)"
      }
    },
    {
      sourceEdgeId: "3a965630-5490-4fc9-99df-8dae358ab6ba",
      domOrder: 4,
      zIndex: 4,
      sourceNodeId: "33d669e3-4362-4e39-b077-46eaa146ea0b",
      targetNodeId: "b52fd88e-c798-4539-bc2c-c96d2ff2a59a",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M620,-60 L620,140",
      sourcePoint: {
        x: 620,
        y: -60
      },
      targetPoint: {
        x: 620,
        y: 140
      },
      waypoints: [
        {
          x: 620,
          y: -60
        },
        {
          x: 620,
          y: 140
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            615,-65\n            620,-60\n            615,-55\n          ",
        transform: "rotate(-90, 620, -60)"
      }
    },
    {
      sourceEdgeId: "57fd9a0d-2bba-47e1-b544-fb7c136fa06a",
      domOrder: 5,
      zIndex: 5,
      sourceNodeId: "63b13b84-61f9-4e19-bb60-a3d254b4ec5c",
      targetNodeId: "ee5363fd-574a-41db-8101-3f1b3f9a4a89",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M1441.5413870246084,620 L1440,560",
      sourcePoint: {
        x: 1441.5413870246084,
        y: 620
      },
      targetPoint: {
        x: 1440,
        y: 560
      },
      waypoints: [
        {
          x: 1441.5413870246084,
          y: 620
        },
        {
          x: 1440,
          y: 560
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -91.47159250888129,
      rawArrow: {
        points: "\n            1435,555\n            1440,560\n            1435,565\n          ",
        transform: "rotate(-91.47159250888129, 1440, 560)"
      }
    },
    {
      sourceEdgeId: "96c86eb8-eb82-466c-8442-458fb02357a6",
      domOrder: 6,
      zIndex: 6,
      sourceNodeId: "ccbad7d3-fe39-4213-953c-0884b6e0aa64",
      targetNodeId: "63b13b84-61f9-4e19-bb60-a3d254b4ec5c",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M1440,920 L1441.5413870246084,680",
      sourcePoint: {
        x: 1440,
        y: 920
      },
      targetPoint: {
        x: 1441.5413870246084,
        y: 680
      },
      waypoints: [
        {
          x: 1440,
          y: 920
        },
        {
          x: 1441.5413870246084,
          y: 680
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -89.63202601304208,
      rawArrow: {
        points:
          "\n            1436.5413870246084,675\n            1441.5413870246084,680\n            1436.5413870246084,685\n          ",
        transform: "rotate(-89.63202601304208, 1441.5413870246084, 680)"
      }
    },
    {
      sourceEdgeId: "ad47b601-c705-4b66-876f-e74ce3fc6739",
      domOrder: 7,
      zIndex: 7,
      sourceNodeId: "e2b5b2fc-8c8c-4ba3-ac14-7ef1f114adae",
      targetNodeId: "7e887897-a039-4423-90de-08855d52d313",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M800,900 L800,680",
      sourcePoint: {
        x: 800,
        y: 900
      },
      targetPoint: {
        x: 800,
        y: 680
      },
      waypoints: [
        {
          x: 800,
          y: 900
        },
        {
          x: 800,
          y: 680
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            795,675\n            800,680\n            795,685\n          ",
        transform: "rotate(-90, 800, 680)"
      }
    },
    {
      sourceEdgeId: "ae75d15f-6fbd-4fa8-b931-b0e96c3bc222",
      domOrder: 8,
      zIndex: 8,
      sourceNodeId: "c5e2f82f-fa10-4734-ba7b-13c62eca245c",
      targetNodeId: "b52fd88e-c798-4539-bc2c-c96d2ff2a59a",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath:
        "M150,500 L150,276.9554053869204 Q150,268.9554053869204 158,268.9554053869204 L612,268.9554053869204 Q620,268.9554053869204 620,260.9554053869204 L620,200",
      sourcePoint: {
        x: 150,
        y: 500
      },
      targetPoint: {
        x: 620,
        y: 200
      },
      waypoints: [
        {
          x: 150,
          y: 500
        },
        {
          x: 150,
          y: 276.9554053869204
        },
        {
          x: 150,
          y: 268.9554053869204
        },
        {
          x: 158,
          y: 268.9554053869204
        },
        {
          x: 612,
          y: 268.9554053869204
        },
        {
          x: 620,
          y: 268.9554053869204
        },
        {
          x: 620,
          y: 260.9554053869204
        },
        {
          x: 620,
          y: 200
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            615,195\n            620,200\n            615,205\n          ",
        transform: "rotate(-90, 620, 200)"
      }
    },
    {
      sourceEdgeId: "d4e1dd6f-e533-4900-b594-97eb49826b31",
      domOrder: 9,
      zIndex: 9,
      sourceNodeId: "930b2ef4-42c3-47c3-a5f2-8f1c8b66eeb2",
      targetNodeId: "c5e2f82f-fa10-4734-ba7b-13c62eca245c",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M150,620 L150,560",
      sourcePoint: {
        x: 150,
        y: 620
      },
      targetPoint: {
        x: 150,
        y: 560
      },
      waypoints: [
        {
          x: 150,
          y: 620
        },
        {
          x: 150,
          y: 560
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            145,555\n            150,560\n            145,565\n          ",
        transform: "rotate(-90, 150, 560)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_vpc" "default" {\n  tags       = merge(var.tags, {})\n  cidr_block = var.vpc_cidr\n}\n\nresource "aws_flow_log" "default" {\n  vpc_id = aws_vpc.default.id\n  tags   = merge(var.tags, {})\n}\n\n',
        sha256: "232004fdda2a236200153755258f942f20fc7566b3bc238160fd8a1d2b650672",
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
        code: 'resource "aws_route_table" "rt_private_a" {\n  vpc_id = aws_vpc.default.id\n  tags   = merge(var.tags, {})\n}\n\nresource "aws_route_table" "rt_private_b" {\n  vpc_id = aws_vpc.default.id\n  tags   = merge(var.tags, {})\n}\n\nresource "aws_route_table" "rt_private_c" {\n  vpc_id = aws_vpc.default.id\n  tags   = merge(var.tags, {})\n}\n\nresource "aws_subnet" "private_a" {\n  vpc_id                  = aws_vpc.default.id\n  tags                    = merge(var.tags, {})\n  map_public_ip_on_launch = false\n  cidr_block              = var.private_subnets.a\n  availability_zone       = "us-east-2a"\n}\n\nresource "aws_subnet" "private_b" {\n  vpc_id                  = aws_vpc.default.id\n  tags                    = merge(var.tags, {})\n  map_public_ip_on_launch = false\n  cidr_block              = var.private_subnets.b\n  availability_zone       = "us-east-2b"\n}\n\nresource "aws_subnet" "private_c" {\n  vpc_id                  = aws_vpc.default.id\n  tags                    = merge(var.tags, {})\n  map_public_ip_on_launch = false\n  cidr_block              = var.private_subnets.c\n  availability_zone       = "us-east-2c"\n}\n\n',
        sha256: "26365ee49fdcf75b7bac612ed6887d1e749f7f5010b79c57347e942b5925b82f",
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
        code: 'resource "aws_internet_gateway" "default" {\n  vpc_id = aws_vpc.default.id\n  tags   = merge(var.tags, {})\n}\n\nresource "aws_subnet" "public_a" {\n  vpc_id            = aws_vpc.default.id\n  tags              = merge(var.tags, {})\n  cidr_block        = var.subnets.a\n  availability_zone = "us-east-2a"\n}\n\nresource "aws_subnet" "public_b" {\n  vpc_id            = aws_vpc.default.id\n  tags              = merge(var.tags, {})\n  cidr_block        = var.subnets.b\n  availability_zone = "us-east-2b"\n}\n\nresource "aws_subnet" "public_c" {\n  vpc_id            = aws_vpc.default.id\n  tags              = merge(var.tags, {})\n  cidr_block        = var.subnets.c\n  availability_zone = "us-east-2c"\n}\n\nresource "aws_eip" "eip_a" {\n  tags = merge(var.tags, {})\n}\n\nresource "aws_eip" "eip_b" {\n  tags = merge(var.tags, {})\n}\n\nresource "aws_eip" "eip_c" {\n  tags = merge(var.tags, {})\n}\n\nresource "aws_nat_gateway" "nat-gw-2a-public" {\n  tags      = merge(var.tags, {})\n  subnet_id = aws_subnet.public_a.id\n}\n\nresource "aws_nat_gateway" "nat-gw-2b-public" {\n  tags      = merge(var.tags, {})\n  subnet_id = aws_subnet.public_b.id\n}\n\nresource "aws_nat_gateway" "nat-gw-2c-public" {\n  tags      = merge(var.tags, {})\n  subnet_id = aws_subnet.public_c.id\n}\n\nresource "aws_route_table" "rt_public_a" {\n  vpc_id = aws_vpc.default.id\n}\n\nresource "aws_route_table" "rt_public_b" {\n  vpc_id = aws_vpc.default.id\n  tags   = merge(var.tags, {})\n}\n\nresource "aws_route_table" "rt_public_c" {\n  vpc_id = aws_vpc.default.id\n  tags   = merge(var.tags, {})\n}\n\n',
        sha256: "29cf1ee635118b1cbce47e85deafa147707eb1f69d7d6726c67d0d11d4cc3ef4",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "d1841afa-9c0f-40d3-a188-477020ee4f17"\n  env      = "Production"\n}\n',
        sha256: "c7c1cea54c949c2e5e552f121e2911ae84393045f37190ea1b1c472e0dcb8686",
        includeInWorkspace: false
      },
      {
        fileName: "variables.tf",
        code: 'variable "private_subnets" {\n  type = map\n  default = {\n    a = "10.0.1.0/24"\n    b = "10.0.2.0/24"\n    c = "10.0.3.0/24"\n  }\n}\n\nvariable "subnets" {\n  description = "Default values for public subnets."\n  type        = map\n  default = {\n    a = "10.0.1.0/24"\n    b = "10.0.2.0/24"\n    c = "10.0.3.0/24"\n  }\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map\n  default     = {}\n}\n\nvariable "vpc_cidr" {\n  description = "The network addressing for the default VPC."\n  type        = string\n  default     = "10.0.0.0/16"\n}\n\n',
        sha256: "496e76e9df934b00c9cd49ec309102f9561752b6a44fd400fa8532255264a65b",
        includeInWorkspace: true
      }
    ],
    resourceAddresses: [
      "aws_vpc.default",
      "aws_flow_log.default",
      "aws_route_table.rt_private_a",
      "aws_route_table.rt_private_b",
      "aws_route_table.rt_private_c",
      "aws_subnet.private_a",
      "aws_subnet.private_b",
      "aws_subnet.private_c",
      "aws_internet_gateway.default",
      "aws_subnet.public_a",
      "aws_subnet.public_b",
      "aws_subnet.public_c",
      "aws_eip.eip_a",
      "aws_eip.eip_b",
      "aws_eip.eip_c",
      "aws_nat_gateway.nat-gw-2a-public",
      "aws_nat_gateway.nat-gw-2b-public",
      "aws_nat_gateway.nat-gw-2c-public",
      "aws_route_table.rt_public_a",
      "aws_route_table.rt_public_b",
      "aws_route_table.rt_public_c"
    ]
  },
  bindings: {
    "eaf4b1f2-372f-4eef-968c-5137fb0941ef": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "2abe13e0-233f-4e11-9d24-05e9b3d61bdf": {
      kind: "resource",
      address: "aws_vpc.default",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "8487e22b-1a81-4b45-87f4-3415848b288a": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "a8cbdb9e-1255-44d1-9ccc-af111d08dc6d": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "efe4bfff-0849-45a3-81fd-d78dcec9062e": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "ceb5c182-f15b-4fed-8cd2-ae6f38ae57bb": {
      kind: "resource",
      address: "aws_subnet.public_a",
      fileName: "public.tf",
      addressMapping: "reviewed-override"
    },
    "59330f93-ad09-4e27-8125-9ed70c14f18d": {
      kind: "resource",
      address: "aws_subnet.public_b",
      fileName: "public.tf",
      addressMapping: "reviewed-override"
    },
    "d8602f90-fb4f-43f4-b4de-810d0117cc46": {
      kind: "resource",
      address: "aws_subnet.public_c",
      fileName: "public.tf",
      addressMapping: "reviewed-override"
    },
    "75bf4e98-45fc-47f3-91d3-3c96bcbbde9c": {
      kind: "resource",
      address: "aws_subnet.private_a",
      fileName: "private.tf",
      addressMapping: "reviewed-override"
    },
    "c922d942-2e74-48fa-8ad7-588328b69fbd": {
      kind: "resource",
      address: "aws_subnet.private_b",
      fileName: "private.tf",
      addressMapping: "reviewed-override"
    },
    "7706801a-075a-4573-ba3c-fa5fcdcb5e39": {
      kind: "resource",
      address: "aws_subnet.private_c",
      fileName: "private.tf",
      addressMapping: "reviewed-override"
    },
    "c5e2f82f-fa10-4734-ba7b-13c62eca245c": {
      kind: "resource",
      address: "aws_eip.eip_a",
      fileName: "public.tf",
      addressMapping: "exact-title"
    },
    "930b2ef4-42c3-47c3-a5f2-8f1c8b66eeb2": {
      kind: "resource",
      address: "aws_nat_gateway.nat-gw-2a-public",
      fileName: "public.tf",
      addressMapping: "exact-title"
    },
    "7e887897-a039-4423-90de-08855d52d313": {
      kind: "resource",
      address: "aws_nat_gateway.nat-gw-2b-public",
      fileName: "public.tf",
      addressMapping: "exact-title"
    },
    "63b13b84-61f9-4e19-bb60-a3d254b4ec5c": {
      kind: "resource",
      address: "aws_nat_gateway.nat-gw-2c-public",
      fileName: "public.tf",
      addressMapping: "exact-title"
    },
    "d1d206eb-491d-49e0-89f8-a079f364504b": {
      kind: "resource",
      address: "aws_eip.eip_b",
      fileName: "public.tf",
      addressMapping: "exact-title"
    },
    "19d29edd-f56f-4e0c-8783-f484e8ba099b": {
      kind: "resource",
      address: "aws_route_table.rt_public_a",
      fileName: "public.tf",
      addressMapping: "exact-title"
    },
    "991494f9-ef01-48fc-a913-5fcf1ef4d36f": {
      kind: "resource",
      address: "aws_route_table.rt_public_b",
      fileName: "public.tf",
      addressMapping: "exact-title"
    },
    "ee5363fd-574a-41db-8101-3f1b3f9a4a89": {
      kind: "resource",
      address: "aws_eip.eip_c",
      fileName: "public.tf",
      addressMapping: "exact-title"
    },
    "4bcc66c1-1ca5-4598-b191-43978626b5d4": {
      kind: "resource",
      address: "aws_route_table.rt_private_a",
      fileName: "private.tf",
      addressMapping: "exact-title"
    },
    "3a83b88a-5972-4fa0-a93d-a5e9043dd346": {
      kind: "resource",
      address: "aws_route_table.rt_public_c",
      fileName: "public.tf",
      addressMapping: "exact-title"
    },
    "e2b5b2fc-8c8c-4ba3-ac14-7ef1f114adae": {
      kind: "resource",
      address: "aws_route_table.rt_private_b",
      fileName: "private.tf",
      addressMapping: "exact-title"
    },
    "ccbad7d3-fe39-4213-953c-0884b6e0aa64": {
      kind: "resource",
      address: "aws_route_table.rt_private_c",
      fileName: "private.tf",
      addressMapping: "exact-title"
    },
    "33d669e3-4362-4e39-b077-46eaa146ea0b": {
      kind: "presentation",
      catalogId: "design-internet",
      aliasOf: null,
      style: null
    },
    "eafb249d-07f3-431b-9f76-dbd55ad496fe": {
      kind: "resource",
      address: "aws_flow_log.default",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "b52fd88e-c798-4539-bc2c-c96d2ff2a59a": {
      kind: "resource",
      address: "aws_internet_gateway.default",
      fileName: "public.tf",
      addressMapping: "exact-title"
    }
  }
});
