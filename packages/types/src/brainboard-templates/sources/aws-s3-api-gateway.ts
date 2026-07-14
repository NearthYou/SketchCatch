import { defineCapturedBrainboardTemplate } from "./define-source.ts";

export const awsS3ApiGatewaySource = defineCapturedBrainboardTemplate({
  id: "brainboard-aws-s3-api-gateway",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "73327761-bb6a-4516-92e5-f06007e372ec",
    sourceUrl: "https://app.brainboard.co/templates/73327761-bb6a-4516-92e5-f06007e372ec",
    cloneArchitectureId: "0665ac2e-daae-43d0-8de3-ee7c700e5cc0",
    downloads: 299,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS S3 API Gateway integration",
  description: null,
  provider: "aws",
  viewport: {
    x: -1202.92,
    y: -1128.11,
    width: 3775.8513011152413,
    height: 2066.2297397769516
  },
  nodes: [
    {
      sourceNodeId: "a2125cbe-8cfa-4842-a527-7f042330455b",
      domOrder: 0,
      label: "US East (Ohio)",
      position: {
        x: -100,
        y: -770
      },
      size: {
        width: 1355,
        height: 1330
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(-100, -770), rotate(0 677.5 665)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "f51e7972-ab44-48f6-a7e3-9cb720aa0c51",
      domOrder: 1,
      label: "IAM policy",
      position: {
        x: 260,
        y: -700
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a2125cbe-8cfa-4842-a527-7f042330455b",
      zIndex: 1,
      rawTransform: "translate(260, -700), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_policy"
    },
    {
      sourceNodeId: "8cfad4ae-9882-4ba7-a0d7-1dbe9defb4f7",
      domOrder: 2,
      label: "IAM role",
      position: {
        x: -10,
        y: -510
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a2125cbe-8cfa-4842-a527-7f042330455b",
      zIndex: 2,
      rawTransform: "translate(-10, -510), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_role"
    },
    {
      sourceNodeId: "4dfe1d77-191d-4f82-94f4-153e22afac77",
      domOrder: 3,
      label: "IAM role policy attachment",
      position: {
        x: -10,
        y: -700
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a2125cbe-8cfa-4842-a527-7f042330455b",
      zIndex: 3,
      rawTransform: "translate(-10, -700), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_role_policy_attachment"
    },
    {
      sourceNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      domOrder: 4,
      label: "API gateway rest API",
      position: {
        x: 770,
        y: -280
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a2125cbe-8cfa-4842-a527-7f042330455b",
      zIndex: 4,
      rawTransform: "translate(770, -280), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_api_gateway_rest_api"
    },
    {
      sourceNodeId: "d7f660ea-c9a7-4269-9a78-047de51122c5",
      domOrder: 5,
      label: "API gateway resource",
      position: {
        x: 770,
        y: -640
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a2125cbe-8cfa-4842-a527-7f042330455b",
      zIndex: 5,
      rawTransform: "translate(770, -640), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_api_gateway_resource"
    },
    {
      sourceNodeId: "5d9d4b38-323c-4029-b582-1ab3e2875f5e",
      domOrder: 6,
      label: "API gateway resource",
      position: {
        x: 1110,
        y: -640
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a2125cbe-8cfa-4842-a527-7f042330455b",
      zIndex: 6,
      rawTransform: "translate(1110, -640), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_api_gateway_resource"
    },
    {
      sourceNodeId: "75347de7-6fdd-43eb-affc-adda7651310c",
      domOrder: 7,
      label: "API gateway method",
      position: {
        x: 770,
        y: -20
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a2125cbe-8cfa-4842-a527-7f042330455b",
      zIndex: 7,
      rawTransform: "translate(770, -20), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_api_gateway_method"
    },
    {
      sourceNodeId: "5e8966bc-bff7-49f0-889c-7570aa6ff7ec",
      domOrder: 8,
      label: "Status 200",
      position: {
        x: 1110,
        y: 0
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a2125cbe-8cfa-4842-a527-7f042330455b",
      zIndex: 8,
      rawTransform: "translate(1110, 0), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_api_gateway_method_response"
    },
    {
      sourceNodeId: "18c510a5-9ff3-4248-a32d-7172fdb43a77",
      domOrder: 9,
      label: "Status 400",
      position: {
        x: 860,
        y: 360
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a2125cbe-8cfa-4842-a527-7f042330455b",
      zIndex: 9,
      rawTransform: "translate(860, 360), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_api_gateway_method_response"
    },
    {
      sourceNodeId: "ef9e666e-bd66-40f8-b84a-0fd40902e25c",
      domOrder: 10,
      label: "Integration Response 400",
      position: {
        x: 540,
        y: 360
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a2125cbe-8cfa-4842-a527-7f042330455b",
      zIndex: 10,
      rawTransform: "translate(540, 360), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_api_gateway_integration_response"
    },
    {
      sourceNodeId: "fb45b084-8383-4a40-bddb-78957f701b33",
      domOrder: 11,
      label: "Integration Response 400",
      position: {
        x: 260,
        y: 230
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a2125cbe-8cfa-4842-a527-7f042330455b",
      zIndex: 11,
      rawTransform: "translate(260, 230), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_api_gateway_integration_response"
    },
    {
      sourceNodeId: "b7ca82da-ac8a-45c3-b72b-f47f1eb5b83e",
      domOrder: 12,
      label: "API gateway deployment",
      position: {
        x: 260,
        y: -500
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a2125cbe-8cfa-4842-a527-7f042330455b",
      zIndex: 12,
      rawTransform: "translate(260, -500), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_api_gateway_deployment"
    },
    {
      sourceNodeId: "91ca7d35-8b99-47be-83c9-952aa6c46c46",
      domOrder: 13,
      label: "API gateway integration",
      position: {
        x: 260,
        y: -280
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a2125cbe-8cfa-4842-a527-7f042330455b",
      zIndex: 13,
      rawTransform: "translate(260, -280), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_api_gateway_integration"
    },
    {
      sourceNodeId: "aa4a3412-93c5-49e6-891b-37102ca3f8b2",
      domOrder: 14,
      label: "Status 500",
      position: {
        x: 260,
        y: -20
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a2125cbe-8cfa-4842-a527-7f042330455b",
      zIndex: 14,
      rawTransform: "translate(260, -20), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_api_gateway_method_response"
    },
    {
      sourceNodeId: "b93e0c77-0069-4893-a2ce-c5635c99d530",
      domOrder: 15,
      label: "Integration Response 200",
      position: {
        x: 1110,
        y: 440
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a2125cbe-8cfa-4842-a527-7f042330455b",
      zIndex: 15,
      rawTransform: "translate(1110, 440), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_api_gateway_integration_response"
    }
  ],
  edges: [
    {
      sourceEdgeId: "0c50654d-fe3e-4abd-915e-1e609b02ea59",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "ef9e666e-bd66-40f8-b84a-0fd40902e25c",
      targetNodeId: "18c510a5-9ff3-4248-a32d-7172fdb43a77",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M600,390 L860,390",
      sourcePoint: {
        x: 600,
        y: 390
      },
      targetPoint: {
        x: 860,
        y: 390
      },
      waypoints: [
        {
          x: 600,
          y: 390
        },
        {
          x: 860,
          y: 390
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            595,385\n            600,390\n            595,395\n          ",
        transform: "rotate(180, 600, 390)"
      }
    },
    {
      sourceEdgeId: "11b57a55-d976-48a4-b30a-504c08c69bb2",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "fb45b084-8383-4a40-bddb-78957f701b33",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M290,230 L290,13 Q290,5 298,5 L792,5 Q800,5 800,-3 L800,-220",
      sourcePoint: {
        x: 290,
        y: 230
      },
      targetPoint: {
        x: 800,
        y: -220
      },
      waypoints: [
        {
          x: 290,
          y: 230
        },
        {
          x: 290,
          y: 13
        },
        {
          x: 290,
          y: 5
        },
        {
          x: 298,
          y: 5
        },
        {
          x: 792,
          y: 5
        },
        {
          x: 800,
          y: 5
        },
        {
          x: 800,
          y: -3
        },
        {
          x: 800,
          y: -220
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            285,225\n            290,230\n            285,235\n          ",
        transform: "rotate(90, 290, 230)"
      }
    },
    {
      sourceEdgeId: "2173fa8d-b94f-4cbe-ae5d-9baed2faa0cd",
      domOrder: 2,
      zIndex: 2,
      sourceNodeId: "b7ca82da-ac8a-45c3-b72b-f47f1eb5b83e",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M320,-470 L770,-250",
      sourcePoint: {
        x: 320,
        y: -470
      },
      targetPoint: {
        x: 770,
        y: -250
      },
      waypoints: [
        {
          x: 320,
          y: -470
        },
        {
          x: 770,
          y: -250
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: -153.94650468950906,
      rawArrow: {
        points: "\n            315,-475\n            320,-470\n            315,-465\n          ",
        transform: "rotate(-153.94650468950906, 320, -470)"
      }
    },
    {
      sourceEdgeId: "30136167-9637-4ff0-a0c2-ab8cc181e970",
      domOrder: 3,
      zIndex: 3,
      sourceNodeId: "91ca7d35-8b99-47be-83c9-952aa6c46c46",
      targetNodeId: "8cfad4ae-9882-4ba7-a0d7-1dbe9defb4f7",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M260,-250 L50,-480",
      sourcePoint: {
        x: 260,
        y: -250
      },
      targetPoint: {
        x: 50,
        y: -480
      },
      waypoints: [
        {
          x: 260,
          y: -250
        },
        {
          x: 50,
          y: -480
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 47.60256220249981,
      rawArrow: {
        points: "\n            255,-255\n            260,-250\n            255,-245\n          ",
        transform: "rotate(47.60256220249981, 260, -250)"
      }
    },
    {
      sourceEdgeId: "30ca0b4b-b474-4031-8f46-7a9f453fd562",
      domOrder: 4,
      zIndex: 4,
      sourceNodeId: "4dfe1d77-191d-4f82-94f4-153e22afac77",
      targetNodeId: "f51e7972-ab44-48f6-a7e3-9cb720aa0c51",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M50,-670 L260,-670",
      sourcePoint: {
        x: 50,
        y: -670
      },
      targetPoint: {
        x: 260,
        y: -670
      },
      waypoints: [
        {
          x: 50,
          y: -670
        },
        {
          x: 260,
          y: -670
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            45,-675\n            50,-670\n            45,-665\n          ",
        transform: "rotate(180, 50, -670)"
      }
    },
    {
      sourceEdgeId: "3697f8f4-4639-4ee1-929c-a50db2063ba2",
      domOrder: 5,
      zIndex: 5,
      sourceNodeId: "18c510a5-9ff3-4248-a32d-7172fdb43a77",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M890,360 L890,78 Q890,70 882,70 L808,70 Q800,70 800,62 L800,-220",
      sourcePoint: {
        x: 890,
        y: 360
      },
      targetPoint: {
        x: 800,
        y: -220
      },
      waypoints: [
        {
          x: 890,
          y: 360
        },
        {
          x: 890,
          y: 78
        },
        {
          x: 890,
          y: 70
        },
        {
          x: 882,
          y: 70
        },
        {
          x: 808,
          y: 70
        },
        {
          x: 800,
          y: 70
        },
        {
          x: 800,
          y: 62
        },
        {
          x: 800,
          y: -220
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            885,355\n            890,360\n            885,365\n          ",
        transform: "rotate(90, 890, 360)"
      }
    },
    {
      sourceEdgeId: "41fc3545-da9c-44d2-9a9a-c732098620c9",
      domOrder: 6,
      zIndex: 6,
      sourceNodeId: "75347de7-6fdd-43eb-affc-adda7651310c",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M800,-20 L800,-220",
      sourcePoint: {
        x: 800,
        y: -20
      },
      targetPoint: {
        x: 800,
        y: -220
      },
      waypoints: [
        {
          x: 800,
          y: -20
        },
        {
          x: 800,
          y: -220
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            795,-25\n            800,-20\n            795,-15\n          ",
        transform: "rotate(90, 800, -20)"
      }
    },
    {
      sourceEdgeId: "49a47baa-9405-40cb-9a1d-8233cb1807f8",
      domOrder: 7,
      zIndex: 7,
      sourceNodeId: "b93e0c77-0069-4893-a2ce-c5635c99d530",
      targetNodeId: "75347de7-6fdd-43eb-affc-adda7651310c",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M1140,440 L1140,248 Q1140,240 1132,240 L808,240 Q800,240 800,232 L800,40",
      sourcePoint: {
        x: 1140,
        y: 440
      },
      targetPoint: {
        x: 800,
        y: 40
      },
      waypoints: [
        {
          x: 1140,
          y: 440
        },
        {
          x: 1140,
          y: 248
        },
        {
          x: 1140,
          y: 240
        },
        {
          x: 1132,
          y: 240
        },
        {
          x: 808,
          y: 240
        },
        {
          x: 800,
          y: 240
        },
        {
          x: 800,
          y: 232
        },
        {
          x: 800,
          y: 40
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            795,35\n            800,40\n            795,45\n          ",
        transform: "rotate(-90, 800, 40)"
      }
    },
    {
      sourceEdgeId: "50a835a8-26cb-46a5-aa69-f5ea6326e859",
      domOrder: 8,
      zIndex: 8,
      sourceNodeId: "fb45b084-8383-4a40-bddb-78957f701b33",
      targetNodeId: "75347de7-6fdd-43eb-affc-adda7651310c",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M320,260 L537,260 Q545,260 545,252 L545,18 Q545,10 553,10 L770,10",
      sourcePoint: {
        x: 320,
        y: 260
      },
      targetPoint: {
        x: 770,
        y: 10
      },
      waypoints: [
        {
          x: 320,
          y: 260
        },
        {
          x: 537,
          y: 260
        },
        {
          x: 545,
          y: 260
        },
        {
          x: 545,
          y: 252
        },
        {
          x: 545,
          y: 18
        },
        {
          x: 545,
          y: 10
        },
        {
          x: 553,
          y: 10
        },
        {
          x: 770,
          y: 10
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            765,5\n            770,10\n            765,15\n          ",
        transform: "rotate(0, 770, 10)"
      }
    },
    {
      sourceEdgeId: "5623cf7f-3e3c-4a1e-9ce2-c01800bddb6e",
      domOrder: 9,
      zIndex: 9,
      sourceNodeId: "b93e0c77-0069-4893-a2ce-c5635c99d530",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M1140,440 L1140,118 Q1140,110 1132,110 L808,110 Q800,110 800,102 L800,-220",
      sourcePoint: {
        x: 1140,
        y: 440
      },
      targetPoint: {
        x: 800,
        y: -220
      },
      waypoints: [
        {
          x: 1140,
          y: 440
        },
        {
          x: 1140,
          y: 118
        },
        {
          x: 1140,
          y: 110
        },
        {
          x: 1132,
          y: 110
        },
        {
          x: 808,
          y: 110
        },
        {
          x: 800,
          y: 110
        },
        {
          x: 800,
          y: 102
        },
        {
          x: 800,
          y: -220
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            1135,435\n            1140,440\n            1135,445\n          ",
        transform: "rotate(90, 1140, 440)"
      }
    },
    {
      sourceEdgeId: "6638471d-f85b-4b15-bfcd-8944af25155d",
      domOrder: 10,
      zIndex: 10,
      sourceNodeId: "5d9d4b38-323c-4029-b582-1ab3e2875f5e",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M1140,-580 L1140,-438 Q1140,-430 1132,-430 L808,-430 Q800,-430 800,-422 L800,-280",
      sourcePoint: {
        x: 1140,
        y: -580
      },
      targetPoint: {
        x: 800,
        y: -280
      },
      waypoints: [
        {
          x: 1140,
          y: -580
        },
        {
          x: 1140,
          y: -438
        },
        {
          x: 1140,
          y: -430
        },
        {
          x: 1132,
          y: -430
        },
        {
          x: 808,
          y: -430
        },
        {
          x: 800,
          y: -430
        },
        {
          x: 800,
          y: -422
        },
        {
          x: 800,
          y: -280
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            1135,-585\n            1140,-580\n            1135,-575\n          ",
        transform: "rotate(-90, 1140, -580)"
      }
    },
    {
      sourceEdgeId: "797f8d2c-503d-4da9-9b5e-4842dacde168",
      domOrder: 11,
      zIndex: 11,
      sourceNodeId: "fb45b084-8383-4a40-bddb-78957f701b33",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M290,230 L290,13 Q290,5 298,5 L792,5 Q800,5 800,-3 L800,-220",
      sourcePoint: {
        x: 290,
        y: 230
      },
      targetPoint: {
        x: 800,
        y: -220
      },
      waypoints: [
        {
          x: 290,
          y: 230
        },
        {
          x: 290,
          y: 13
        },
        {
          x: 290,
          y: 5
        },
        {
          x: 298,
          y: 5
        },
        {
          x: 792,
          y: 5
        },
        {
          x: 800,
          y: 5
        },
        {
          x: 800,
          y: -3
        },
        {
          x: 800,
          y: -220
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            285,225\n            290,230\n            285,235\n          ",
        transform: "rotate(90, 290, 230)"
      }
    },
    {
      sourceEdgeId: "813a8915-4354-4670-a7ba-5ddc2c26ccae",
      domOrder: 12,
      zIndex: 12,
      sourceNodeId: "5d9d4b38-323c-4029-b582-1ab3e2875f5e",
      targetNodeId: "d7f660ea-c9a7-4269-9a78-047de51122c5",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M1110,-610 L830,-610",
      sourcePoint: {
        x: 1110,
        y: -610
      },
      targetPoint: {
        x: 830,
        y: -610
      },
      waypoints: [
        {
          x: 1110,
          y: -610
        },
        {
          x: 830,
          y: -610
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            1105,-615\n            1110,-610\n            1105,-605\n          ",
        transform: "rotate(0, 1110, -610)"
      }
    },
    {
      sourceEdgeId: "862511ad-d333-4521-a393-ab60ee786ea5",
      domOrder: 13,
      zIndex: 13,
      sourceNodeId: "4dfe1d77-191d-4f82-94f4-153e22afac77",
      targetNodeId: "8cfad4ae-9882-4ba7-a0d7-1dbe9defb4f7",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M20,-640 L20,-510",
      sourcePoint: {
        x: 20,
        y: -640
      },
      targetPoint: {
        x: 20,
        y: -510
      },
      waypoints: [
        {
          x: 20,
          y: -640
        },
        {
          x: 20,
          y: -510
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            15,-645\n            20,-640\n            15,-635\n          ",
        transform: "rotate(-90, 20, -640)"
      }
    },
    {
      sourceEdgeId: "86b0c22f-2f4f-44ad-9672-368bbae5b7ef",
      domOrder: 14,
      zIndex: 14,
      sourceNodeId: "ef9e666e-bd66-40f8-b84a-0fd40902e25c",
      targetNodeId: "75347de7-6fdd-43eb-affc-adda7651310c",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M570,360 L570,208 Q570,200 578,200 L792,200 Q800,200 800,192 L800,40",
      sourcePoint: {
        x: 570,
        y: 360
      },
      targetPoint: {
        x: 800,
        y: 40
      },
      waypoints: [
        {
          x: 570,
          y: 360
        },
        {
          x: 570,
          y: 208
        },
        {
          x: 570,
          y: 200
        },
        {
          x: 578,
          y: 200
        },
        {
          x: 792,
          y: 200
        },
        {
          x: 800,
          y: 200
        },
        {
          x: 800,
          y: 192
        },
        {
          x: 800,
          y: 40
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            795,35\n            800,40\n            795,45\n          ",
        transform: "rotate(-90, 800, 40)"
      }
    },
    {
      sourceEdgeId: "877ffb6d-c25b-4ac7-9081-3d342d15dd3d",
      domOrder: 15,
      zIndex: 15,
      sourceNodeId: "fb45b084-8383-4a40-bddb-78957f701b33",
      targetNodeId: "aa4a3412-93c5-49e6-891b-37102ca3f8b2",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M290,230 L290,40",
      sourcePoint: {
        x: 290,
        y: 230
      },
      targetPoint: {
        x: 290,
        y: 40
      },
      waypoints: [
        {
          x: 290,
          y: 230
        },
        {
          x: 290,
          y: 40
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            285,225\n            290,230\n            285,235\n          ",
        transform: "rotate(90, 290, 230)"
      }
    },
    {
      sourceEdgeId: "87d3670e-8fac-499d-a21b-dc93849979c7",
      domOrder: 16,
      zIndex: 16,
      sourceNodeId: "75347de7-6fdd-43eb-affc-adda7651310c",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M800,-20 L800,-220",
      sourcePoint: {
        x: 800,
        y: -20
      },
      targetPoint: {
        x: 800,
        y: -220
      },
      waypoints: [
        {
          x: 800,
          y: -20
        },
        {
          x: 800,
          y: -220
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            795,-25\n            800,-20\n            795,-15\n          ",
        transform: "rotate(90, 800, -20)"
      }
    },
    {
      sourceEdgeId: "8ff00ea6-7182-4460-ade0-333d5142597b",
      domOrder: 17,
      zIndex: 17,
      sourceNodeId: "d7f660ea-c9a7-4269-9a78-047de51122c5",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M800,-580 L800,-280",
      sourcePoint: {
        x: 800,
        y: -580
      },
      targetPoint: {
        x: 800,
        y: -280
      },
      waypoints: [
        {
          x: 800,
          y: -580
        },
        {
          x: 800,
          y: -280
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            795,-585\n            800,-580\n            795,-575\n          ",
        transform: "rotate(-90, 800, -580)"
      }
    },
    {
      sourceEdgeId: "a7f38f53-e4bf-4f25-a187-fa32ee56db26",
      domOrder: 18,
      zIndex: 18,
      sourceNodeId: "18c510a5-9ff3-4248-a32d-7172fdb43a77",
      targetNodeId: "75347de7-6fdd-43eb-affc-adda7651310c",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M890,360 L890,208 Q890,200 882,200 L808,200 Q800,200 800,192 L800,40",
      sourcePoint: {
        x: 890,
        y: 360
      },
      targetPoint: {
        x: 800,
        y: 40
      },
      waypoints: [
        {
          x: 890,
          y: 360
        },
        {
          x: 890,
          y: 208
        },
        {
          x: 890,
          y: 200
        },
        {
          x: 882,
          y: 200
        },
        {
          x: 808,
          y: 200
        },
        {
          x: 800,
          y: 200
        },
        {
          x: 800,
          y: 192
        },
        {
          x: 800,
          y: 40
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            795,35\n            800,40\n            795,45\n          ",
        transform: "rotate(-90, 800, 40)"
      }
    },
    {
      sourceEdgeId: "b143c653-8c2c-4498-9be3-3b28b7c50a67",
      domOrder: 19,
      zIndex: 19,
      sourceNodeId: "b93e0c77-0069-4893-a2ce-c5635c99d530",
      targetNodeId: "5e8966bc-bff7-49f0-889c-7570aa6ff7ec",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M1140,440 L1140,60",
      sourcePoint: {
        x: 1140,
        y: 440
      },
      targetPoint: {
        x: 1140,
        y: 60
      },
      waypoints: [
        {
          x: 1140,
          y: 440
        },
        {
          x: 1140,
          y: 60
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            1135,435\n            1140,440\n            1135,445\n          ",
        transform: "rotate(90, 1140, 440)"
      }
    },
    {
      sourceEdgeId: "b88b47d2-7d75-42a1-bae4-cc724cc08298",
      domOrder: 20,
      zIndex: 20,
      sourceNodeId: "aa4a3412-93c5-49e6-891b-37102ca3f8b2",
      targetNodeId: "75347de7-6fdd-43eb-affc-adda7651310c",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M320,10 L770,10",
      sourcePoint: {
        x: 320,
        y: 10
      },
      targetPoint: {
        x: 770,
        y: 10
      },
      waypoints: [
        {
          x: 320,
          y: 10
        },
        {
          x: 770,
          y: 10
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            315,5\n            320,10\n            315,15\n          ",
        transform: "rotate(180, 320, 10)"
      }
    },
    {
      sourceEdgeId: "c1c547ed-f6a0-4b37-a930-ee4fccfc191b",
      domOrder: 21,
      zIndex: 21,
      sourceNodeId: "5e8966bc-bff7-49f0-889c-7570aa6ff7ec",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M1110,30 L978,30 Q970,30 970,22 L970,-242 Q970,-250 962,-250 L830,-250",
      sourcePoint: {
        x: 1110,
        y: 30
      },
      targetPoint: {
        x: 830,
        y: -250
      },
      waypoints: [
        {
          x: 1110,
          y: 30
        },
        {
          x: 978,
          y: 30
        },
        {
          x: 970,
          y: 30
        },
        {
          x: 970,
          y: 22
        },
        {
          x: 970,
          y: -242
        },
        {
          x: 970,
          y: -250
        },
        {
          x: 962,
          y: -250
        },
        {
          x: 830,
          y: -250
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            1105,25\n            1110,30\n            1105,35\n          ",
        transform: "rotate(0, 1110, 30)"
      }
    },
    {
      sourceEdgeId: "c8dd08be-0994-44c8-b643-440e1e511ae5",
      domOrder: 22,
      zIndex: 22,
      sourceNodeId: "18c510a5-9ff3-4248-a32d-7172fdb43a77",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M890,360 L890,78 Q890,70 882,70 L808,70 Q800,70 800,62 L800,-220",
      sourcePoint: {
        x: 890,
        y: 360
      },
      targetPoint: {
        x: 800,
        y: -220
      },
      waypoints: [
        {
          x: 890,
          y: 360
        },
        {
          x: 890,
          y: 78
        },
        {
          x: 890,
          y: 70
        },
        {
          x: 882,
          y: 70
        },
        {
          x: 808,
          y: 70
        },
        {
          x: 800,
          y: 70
        },
        {
          x: 800,
          y: 62
        },
        {
          x: 800,
          y: -220
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            885,355\n            890,360\n            885,365\n          ",
        transform: "rotate(90, 890, 360)"
      }
    },
    {
      sourceEdgeId: "cdf77811-1d8b-42f7-a048-257937e1c89b",
      domOrder: 23,
      zIndex: 23,
      sourceNodeId: "ef9e666e-bd66-40f8-b84a-0fd40902e25c",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M570,360 L570,78 Q570,70 578,70 L792,70 Q800,70 800,62 L800,-220",
      sourcePoint: {
        x: 570,
        y: 360
      },
      targetPoint: {
        x: 800,
        y: -220
      },
      waypoints: [
        {
          x: 570,
          y: 360
        },
        {
          x: 570,
          y: 78
        },
        {
          x: 570,
          y: 70
        },
        {
          x: 578,
          y: 70
        },
        {
          x: 792,
          y: 70
        },
        {
          x: 800,
          y: 70
        },
        {
          x: 800,
          y: 62
        },
        {
          x: 800,
          y: -220
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            565,355\n            570,360\n            565,365\n          ",
        transform: "rotate(90, 570, 360)"
      }
    },
    {
      sourceEdgeId: "e65ccdc8-4ea1-42f9-95ee-9ff69bf23cda",
      domOrder: 24,
      zIndex: 24,
      sourceNodeId: "5e8966bc-bff7-49f0-889c-7570aa6ff7ec",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M1110,30 L978,30 Q970,30 970,22 L970,-242 Q970,-250 962,-250 L830,-250",
      sourcePoint: {
        x: 1110,
        y: 30
      },
      targetPoint: {
        x: 830,
        y: -250
      },
      waypoints: [
        {
          x: 1110,
          y: 30
        },
        {
          x: 978,
          y: 30
        },
        {
          x: 970,
          y: 30
        },
        {
          x: 970,
          y: 22
        },
        {
          x: 970,
          y: -242
        },
        {
          x: 970,
          y: -250
        },
        {
          x: 962,
          y: -250
        },
        {
          x: 830,
          y: -250
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            1105,25\n            1110,30\n            1105,35\n          ",
        transform: "rotate(0, 1110, 30)"
      }
    },
    {
      sourceEdgeId: "eab035ef-0329-4fbb-aa1d-daf77ee29a7e",
      domOrder: 25,
      zIndex: 25,
      sourceNodeId: "91ca7d35-8b99-47be-83c9-952aa6c46c46",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M320,-250 L770,-250",
      sourcePoint: {
        x: 320,
        y: -250
      },
      targetPoint: {
        x: 770,
        y: -250
      },
      waypoints: [
        {
          x: 320,
          y: -250
        },
        {
          x: 770,
          y: -250
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            315,-255\n            320,-250\n            315,-245\n          ",
        transform: "rotate(180, 320, -250)"
      }
    },
    {
      sourceEdgeId: "eed42699-0b0c-4014-9da4-34fbf1dae985",
      domOrder: 26,
      zIndex: 26,
      sourceNodeId: "91ca7d35-8b99-47be-83c9-952aa6c46c46",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M320,-250 L770,-250",
      sourcePoint: {
        x: 320,
        y: -250
      },
      targetPoint: {
        x: 770,
        y: -250
      },
      waypoints: [
        {
          x: 320,
          y: -250
        },
        {
          x: 770,
          y: -250
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            315,-255\n            320,-250\n            315,-245\n          ",
        transform: "rotate(180, 320, -250)"
      }
    },
    {
      sourceEdgeId: "f41e6388-ccc5-41e0-9466-c83d92998303",
      domOrder: 27,
      zIndex: 27,
      sourceNodeId: "d7f660ea-c9a7-4269-9a78-047de51122c5",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M800,-580 L800,-280",
      sourcePoint: {
        x: 800,
        y: -580
      },
      targetPoint: {
        x: 800,
        y: -280
      },
      waypoints: [
        {
          x: 800,
          y: -580
        },
        {
          x: 800,
          y: -280
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            795,-585\n            800,-580\n            795,-575\n          ",
        transform: "rotate(-90, 800, -580)"
      }
    },
    {
      sourceEdgeId: "feaa4867-a192-469e-8b1e-438911a86f34",
      domOrder: 28,
      zIndex: 28,
      sourceNodeId: "b93e0c77-0069-4893-a2ce-c5635c99d530",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M1140,440 L1140,118 Q1140,110 1132,110 L808,110 Q800,110 800,102 L800,-220",
      sourcePoint: {
        x: 1140,
        y: 440
      },
      targetPoint: {
        x: 800,
        y: -220
      },
      waypoints: [
        {
          x: 1140,
          y: 440
        },
        {
          x: 1140,
          y: 118
        },
        {
          x: 1140,
          y: 110
        },
        {
          x: 1132,
          y: 110
        },
        {
          x: 808,
          y: 110
        },
        {
          x: 800,
          y: 110
        },
        {
          x: 800,
          y: 102
        },
        {
          x: 800,
          y: -220
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            1135,435\n            1140,440\n            1135,445\n          ",
        transform: "rotate(90, 1140, 440)"
      }
    },
    {
      sourceEdgeId: "ff6a14d7-95f1-49f1-b802-ccce6c034c51",
      domOrder: 29,
      zIndex: 29,
      sourceNodeId: "aa4a3412-93c5-49e6-891b-37102ca3f8b2",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M320,10 L537,10 Q545,10 545,2 L545,-242 Q545,-250 553,-250 L770,-250",
      sourcePoint: {
        x: 320,
        y: 10
      },
      targetPoint: {
        x: 770,
        y: -250
      },
      waypoints: [
        {
          x: 320,
          y: 10
        },
        {
          x: 537,
          y: 10
        },
        {
          x: 545,
          y: 10
        },
        {
          x: 545,
          y: 2
        },
        {
          x: 545,
          y: -242
        },
        {
          x: 545,
          y: -250
        },
        {
          x: 553,
          y: -250
        },
        {
          x: 770,
          y: -250
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            315,5\n            320,10\n            315,15\n          ",
        transform: "rotate(180, 320, 10)"
      }
    },
    {
      sourceEdgeId: "ff9493b3-c93e-4c07-8013-3f41066fb24a",
      domOrder: 30,
      zIndex: 30,
      sourceNodeId: "ef9e666e-bd66-40f8-b84a-0fd40902e25c",
      targetNodeId: "208ba11f-9da2-4fbf-8748-3fdbaddee037",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M570,360 L570,78 Q570,70 578,70 L792,70 Q800,70 800,62 L800,-220",
      sourcePoint: {
        x: 570,
        y: 360
      },
      targetPoint: {
        x: 800,
        y: -220
      },
      waypoints: [
        {
          x: 570,
          y: 360
        },
        {
          x: 570,
          y: 78
        },
        {
          x: 570,
          y: 70
        },
        {
          x: 578,
          y: 70
        },
        {
          x: 792,
          y: 70
        },
        {
          x: 800,
          y: 70
        },
        {
          x: 800,
          y: 62
        },
        {
          x: 800,
          y: -220
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            565,355\n            570,360\n            565,365\n          ",
        transform: "rotate(90, 570, 360)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_iam_policy" "s3_policy" {\n  policy      = <<EOF\n{\n    "Version": "2012-10-17",\n    "Statement": [\n        {\n            "Effect": "Allow",\n            "Action": "s3:*",\n            "Resource": "*"\n        }\n    ]\n}\nEOF\n  description = "Policy for allowing all S3 Actions"\n}\n\nresource "aws_iam_role" "s3_api_gateyway_role" {\n  name               = "s3_api_gateyway_role"\n  assume_role_policy = <<EOF\n{\n  "Version": "2012-10-17",\n  "Statement": [\n    {\n      "Sid": "",\n      "Effect": "Allow",\n      "Principal": {\n        "Service": "apigateway.amazonaws.com"\n      },\n      "Action": "sts:AssumeRole"\n    }\n  ]\n}\nEOF\n\n  tags = {\n    env      = "Staging"\n    archUUID = "682c2db8-5d36-4383-b248-cb2142e2b6fb"\n  }\n}\n\nresource "aws_iam_role_policy_attachment" "s3_policy_attach" {\n  role       = aws_iam_role.s3_api_gateyway_role.name\n  policy_arn = aws_iam_policy.s3_policy.arn\n}\n\nresource "aws_api_gateway_rest_api" "s3_gtw" {\n  name        = "S3GTW"\n  description = "API for S3 Integration"\n}\n\nresource "aws_api_gateway_resource" "folder" {\n  rest_api_id = aws_api_gateway_rest_api.s3_gtw.id\n  path_part   = { folder }\n  parent_id   = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n}\n\nresource "aws_api_gateway_resource" "item" {\n  rest_api_id = aws_api_gateway_rest_api.s3_gtw.id\n  path_part   = { item }\n  parent_id   = aws_api_gateway_resource.folder.id\n}\n\nresource "aws_api_gateway_method" "GetBuckets" {\n  rest_api_id   = aws_api_gateway_rest_api.s3_gtw.id\n  resource_id   = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n  http_method   = "GET"\n  authorization = "AWS_IAM"\n}\n\nresource "aws_api_gateway_integration" "S3Integration" {\n  uri         = "arn:aws:apigateway:${var.region}:s3:path//"\n  type        = "AWS"\n  rest_api_id = aws_api_gateway_rest_api.s3_gtw.id\n  resource_id = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n  http_method = "GET"\n  credentials = aws_iam_role.s3_api_gateyway_role.arn\n}\n\nresource "aws_api_gateway_method_response" "Status200" {\n  status_code = "200"\n  rest_api_id = aws_api_gateway_rest_api.s3_gtw.id\n  resource_id = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n  http_method = aws_api_gateway_method.GetBuckets.http_method\n}\n\nresource "aws_api_gateway_method_response" "Status400" {\n  status_code = "400"\n  rest_api_id = aws_api_gateway_rest_api.s3_gtw.id\n  resource_id = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n  http_method = aws_api_gateway_method.GetBuckets.http_method\n\n  depends_on = [\n    aws_api_gateway_integration.S3Integration,\n  ]\n}\n\nresource "aws_api_gateway_method_response" "Status500" {\n  status_code = "500"\n  rest_api_id = aws_api_gateway_rest_api.s3_gtw.id\n  resource_id = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n  http_method = aws_api_gateway_method.GetBuckets.http_method\n\n  depends_on = [\n    aws_api_gateway_integration.S3Integration,\n  ]\n}\n\nresource "aws_api_gateway_integration_response" "IntegrationResponse200" {\n  status_code = aws_api_gateway_method_response.Status200.status_code\n  rest_api_id = aws_api_gateway_rest_api.s3_gtw.id\n  resource_id = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n  http_method = aws_api_gateway_method.GetBuckets.http_method\n\n  depends_on = [\n    aws_api_gateway_integration.S3Integration,\n  ]\n}\n\nresource "aws_api_gateway_integration_response" "IntegrationResponse400" {\n  status_code       = aws_api_gateway_method_response.Status400.status_code\n  selection_pattern = "4\\\\d{2}"\n  rest_api_id       = aws_api_gateway_rest_api.s3_gtw.id\n  resource_id       = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n  http_method       = aws_api_gateway_method.GetBuckets.http_method\n\n  depends_on = [\n    aws_api_gateway_integration.S3Integration,\n  ]\n}\n\nresource "aws_api_gateway_integration_response" "IntegrationResponse500" {\n  status_code       = aws_api_gateway_method_response.Status500.status_code\n  selection_pattern = "5\\\\d{2}"\n  rest_api_id       = aws_api_gateway_rest_api.s3_gtw.id\n  resource_id       = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n  http_method       = aws_api_gateway_method.GetBuckets.http_method\n\n  depends_on = [\n    aws_api_gateway_integration.S3Integration,\n  ]\n}\n\nresource "aws_api_gateway_deployment" "S3APIDeployment" {\n  stage_name  = "BrainboardS3"\n  rest_api_id = aws_api_gateway_rest_api.s3_gtw.id\n\n  depends_on = [\n    aws_api_gateway_integration.S3Integration,\n  ]\n}\n\n',
        sha256: "e6d646b067a0fa0bba633aad4fe2ca30b0eb63d3d2f520278d5e648ffd109f62",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'resource "aws_iam_policy" "s3_policy" {\n  policy      = <<EOF\n{\n    "Version": "2012-10-17",\n    "Statement": [\n        {\n            "Effect": "Allow",\n            "Action": "s3:*",\n            "Resource": "*"\n        }\n    ]\n}\nEOF\n  description = "Policy for allowing all S3 Actions"\n}\n\nresource "aws_iam_role" "s3_api_gateyway_role" {\n  name               = "s3_api_gateyway_role"\n  assume_role_policy = <<EOF\n{\n  "Version": "2012-10-17",\n  "Statement": [\n    {\n      "Sid": "",\n      "Effect": "Allow",\n      "Principal": {\n        "Service": "apigateway.amazonaws.com"\n      },\n      "Action": "sts:AssumeRole"\n    }\n  ]\n}\nEOF\n\n  tags = {\n    env      = "Staging"\n  }\n}\n\nresource "aws_iam_role_policy_attachment" "s3_policy_attach" {\n  role       = aws_iam_role.s3_api_gateyway_role.name\n  policy_arn = aws_iam_policy.s3_policy.arn\n}\n\nresource "aws_api_gateway_rest_api" "s3_gtw" {\n  name        = "S3GTW"\n  description = "API for S3 Integration"\n}\n\nresource "aws_api_gateway_resource" "folder" {\n  rest_api_id = aws_api_gateway_rest_api.s3_gtw.id\n  path_part   = { folder }\n  parent_id   = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n}\n\nresource "aws_api_gateway_resource" "item" {\n  rest_api_id = aws_api_gateway_rest_api.s3_gtw.id\n  path_part   = { item }\n  parent_id   = aws_api_gateway_resource.folder.id\n}\n\nresource "aws_api_gateway_method" "GetBuckets" {\n  rest_api_id   = aws_api_gateway_rest_api.s3_gtw.id\n  resource_id   = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n  http_method   = "GET"\n  authorization = "AWS_IAM"\n}\n\nresource "aws_api_gateway_integration" "S3Integration" {\n  uri         = "arn:aws:apigateway:${var.region}:s3:path//"\n  type        = "AWS"\n  rest_api_id = aws_api_gateway_rest_api.s3_gtw.id\n  resource_id = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n  http_method = "GET"\n  credentials = aws_iam_role.s3_api_gateyway_role.arn\n}\n\nresource "aws_api_gateway_method_response" "Status200" {\n  status_code = "200"\n  rest_api_id = aws_api_gateway_rest_api.s3_gtw.id\n  resource_id = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n  http_method = aws_api_gateway_method.GetBuckets.http_method\n}\n\nresource "aws_api_gateway_method_response" "Status400" {\n  status_code = "400"\n  rest_api_id = aws_api_gateway_rest_api.s3_gtw.id\n  resource_id = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n  http_method = aws_api_gateway_method.GetBuckets.http_method\n\n  depends_on = [\n    aws_api_gateway_integration.S3Integration,\n  ]\n}\n\nresource "aws_api_gateway_method_response" "Status500" {\n  status_code = "500"\n  rest_api_id = aws_api_gateway_rest_api.s3_gtw.id\n  resource_id = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n  http_method = aws_api_gateway_method.GetBuckets.http_method\n\n  depends_on = [\n    aws_api_gateway_integration.S3Integration,\n  ]\n}\n\nresource "aws_api_gateway_integration_response" "IntegrationResponse200" {\n  status_code = aws_api_gateway_method_response.Status200.status_code\n  rest_api_id = aws_api_gateway_rest_api.s3_gtw.id\n  resource_id = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n  http_method = aws_api_gateway_method.GetBuckets.http_method\n\n  depends_on = [\n    aws_api_gateway_integration.S3Integration,\n  ]\n}\n\nresource "aws_api_gateway_integration_response" "IntegrationResponse400" {\n  status_code       = aws_api_gateway_method_response.Status400.status_code\n  selection_pattern = "4\\\\d{2}"\n  rest_api_id       = aws_api_gateway_rest_api.s3_gtw.id\n  resource_id       = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n  http_method       = aws_api_gateway_method.GetBuckets.http_method\n\n  depends_on = [\n    aws_api_gateway_integration.S3Integration,\n  ]\n}\n\nresource "aws_api_gateway_integration_response" "IntegrationResponse500" {\n  status_code       = aws_api_gateway_method_response.Status500.status_code\n  selection_pattern = "5\\\\d{2}"\n  rest_api_id       = aws_api_gateway_rest_api.s3_gtw.id\n  resource_id       = aws_api_gateway_rest_api.s3_gtw.root_resource_id\n  http_method       = aws_api_gateway_method.GetBuckets.http_method\n\n  depends_on = [\n    aws_api_gateway_integration.S3Integration,\n  ]\n}\n\nresource "aws_api_gateway_deployment" "S3APIDeployment" {\n  stage_name  = "BrainboardS3"\n  rest_api_id = aws_api_gateway_rest_api.s3_gtw.id\n\n  depends_on = [\n    aws_api_gateway_integration.S3Integration,\n  ]\n}\n\n',
          sha256: "e22679edc9792ee9536a55fc84ab040b7a33202fffd1f0b3b98a15fe897afbfd",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archUUID = "682c2db8-5d36-4383-b248-cb2142e2b6fb"\n',
              occurrenceCount: 1
            }
          ]
        }
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
        code: 'terraform {\n  required_providers {\n    aws = {\n      version = "= 5.52.0"\n    }\n  }\n}\n\nprovider "aws" {\n  region = "us-east-2"\n}\n',
        sha256: "bdc9400ce8e5ed6d2fdd0b086a4810346048dab71515e6f2af62d9df8984b72f",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "0665ac2e-daae-43d0-8de3-ee7c700e5cc0"\n  env      = "Production"\n}\n',
        sha256: "97e10b5f3c56f9b066427cfedb6b83bbcd2cfa9737a4b750103b01be5a4ddfa1",
        includeInWorkspace: false
      },
      {
        fileName: "undefined.tf",
        code: "",
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        includeInWorkspace: true
      },
      {
        fileName: "variables.tf",
        code: 'variable "region" {\n  description = "The default region"\n  type        = string\n  default     = "eu-east-1"\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    archuuid = "73327761-bb6a-4516-92e5-f06007e372ec"\n    env      = "Staging"\n  }\n}\n\n',
        sha256: "eab95b312211e0edbc78585d7863bbed195406563acd910ff5ea5db036aca6f6",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'variable "region" {\n  description = "The default region"\n  type        = string\n  default     = "eu-east-1"\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    env      = "Staging"\n  }\n}\n\n',
          sha256: "fa47eadc70beaad38f84697be964301f0c502c85b9a2c82b275e787cf8ab0d09",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archuuid = "73327761-bb6a-4516-92e5-f06007e372ec"\n',
              occurrenceCount: 1
            }
          ]
        }
      }
    ],
    resourceAddresses: [
      "aws_iam_policy.s3_policy",
      "aws_iam_role.s3_api_gateyway_role",
      "aws_iam_role_policy_attachment.s3_policy_attach",
      "aws_api_gateway_rest_api.s3_gtw",
      "aws_api_gateway_resource.folder",
      "aws_api_gateway_resource.item",
      "aws_api_gateway_method.GetBuckets",
      "aws_api_gateway_integration.S3Integration",
      "aws_api_gateway_method_response.Status200",
      "aws_api_gateway_method_response.Status400",
      "aws_api_gateway_method_response.Status500",
      "aws_api_gateway_integration_response.IntegrationResponse200",
      "aws_api_gateway_integration_response.IntegrationResponse400",
      "aws_api_gateway_integration_response.IntegrationResponse500",
      "aws_api_gateway_deployment.S3APIDeployment"
    ]
  },
  bindings: {
    "a2125cbe-8cfa-4842-a527-7f042330455b": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "f51e7972-ab44-48f6-a7e3-9cb720aa0c51": {
      kind: "resource",
      address: "aws_iam_policy.s3_policy",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "8cfad4ae-9882-4ba7-a0d7-1dbe9defb4f7": {
      kind: "resource",
      address: "aws_iam_role.s3_api_gateyway_role",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "4dfe1d77-191d-4f82-94f4-153e22afac77": {
      kind: "resource",
      address: "aws_iam_role_policy_attachment.s3_policy_attach",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "208ba11f-9da2-4fbf-8748-3fdbaddee037": {
      kind: "resource",
      address: "aws_api_gateway_rest_api.s3_gtw",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "d7f660ea-c9a7-4269-9a78-047de51122c5": {
      kind: "resource",
      address: "aws_api_gateway_resource.folder",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "5d9d4b38-323c-4029-b582-1ab3e2875f5e": {
      kind: "resource",
      address: "aws_api_gateway_resource.item",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "75347de7-6fdd-43eb-affc-adda7651310c": {
      kind: "resource",
      address: "aws_api_gateway_method.GetBuckets",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "5e8966bc-bff7-49f0-889c-7570aa6ff7ec": {
      kind: "resource",
      address: "aws_api_gateway_method_response.Status200",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "18c510a5-9ff3-4248-a32d-7172fdb43a77": {
      kind: "resource",
      address: "aws_api_gateway_method_response.Status400",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "ef9e666e-bd66-40f8-b84a-0fd40902e25c": {
      kind: "resource",
      address: "aws_api_gateway_integration_response.IntegrationResponse400",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "fb45b084-8383-4a40-bddb-78957f701b33": {
      kind: "resource",
      address: "aws_api_gateway_integration_response.IntegrationResponse500",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "b7ca82da-ac8a-45c3-b72b-f47f1eb5b83e": {
      kind: "resource",
      address: "aws_api_gateway_deployment.S3APIDeployment",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "91ca7d35-8b99-47be-83c9-952aa6c46c46": {
      kind: "resource",
      address: "aws_api_gateway_integration.S3Integration",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "aa4a3412-93c5-49e6-891b-37102ca3f8b2": {
      kind: "resource",
      address: "aws_api_gateway_method_response.Status500",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "b93e0c77-0069-4893-a2ce-c5635c99d530": {
      kind: "resource",
      address: "aws_api_gateway_integration_response.IntegrationResponse200",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    }
  }
});
