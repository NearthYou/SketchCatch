import { defineCapturedBrainboardTemplate } from "./define-source.ts";

export const awsDashcamVideoProcessingSource = defineCapturedBrainboardTemplate({
  id: "brainboard-aws-dashcam-video-pipeline",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "4e26a41a-78e5-43df-8c32-e6f1e47e40cb",
    sourceUrl: "https://app.brainboard.co/templates/4e26a41a-78e5-43df-8c32-e6f1e47e40cb",
    cloneArchitectureId: "45fd2390-58ad-4c4b-b840-739294fc4339",
    downloads: 38,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS Dashcam Video Processing Pipeline",
  description: null,
  provider: "aws",
  viewport: {
    x: -1060.65,
    y: -654.94,
    width: 3325.6774193548385,
    height: 1819.88458781362
  },
  nodes: [
    {
      sourceNodeId: "bc43454e-5410-4f46-9610-6622c8820e40",
      domOrder: 0,
      label: "US West (Oregon)",
      position: {
        x: -95,
        y: -135
      },
      size: {
        width: 1205,
        height: 760
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(-95, -135), rotate(0 602.5 380)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "13f9d1bb-7e57-4f23-a141-d99ebc4d39e2",
      domOrder: 1,
      label: "영상 처리 ECS Cluster",
      position: {
        x: 275,
        y: 475
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "bc43454e-5410-4f46-9610-6622c8820e40",
      zIndex: 1,
      rawTransform: "translate(275, 475), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_ecs_cluster"
    },
    {
      sourceNodeId: "2076baeb-dbf8-463d-bb50-7ec9b5d259b9",
      domOrder: 2,
      label: "처리 결과 S3 Bucket",
      position: {
        x: 270,
        y: 315
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "bc43454e-5410-4f46-9610-6622c8820e40",
      zIndex: 2,
      rawTransform: "translate(270, 315), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket"
    },
    {
      sourceNodeId: "23f9af50-c989-4d73-ac79-fbae47e10c04",
      domOrder: 3,
      label: "결과 영상 CloudFront Distribution",
      position: {
        x: 50,
        y: 315
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "bc43454e-5410-4f46-9610-6622c8820e40",
      zIndex: 3,
      rawTransform: "translate(50, 315), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_cloudfront_distribution"
    },
    {
      sourceNodeId: "30b41b95-ecec-400f-95b4-d47d7debfcea",
      domOrder: 4,
      label: "영상 API /videos Resource",
      position: {
        x: 660,
        y: 225
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "bc43454e-5410-4f46-9610-6622c8820e40",
      zIndex: 4,
      rawTransform: "translate(660, 225), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_api_gateway_resource"
    },
    {
      sourceNodeId: "32b37e79-d0da-4ea7-88c6-2c8789b455ce",
      domOrder: 5,
      label: "원본 영상 S3 Bucket",
      position: {
        x: 65,
        y: 485
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "bc43454e-5410-4f46-9610-6622c8820e40",
      zIndex: 5,
      rawTransform: "translate(65, 485), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket"
    },
    {
      sourceNodeId: "3b240358-1a05-4628-a2e8-be852cdbf846",
      domOrder: 6,
      label: "Lambda 기본 실행 권한 연결",
      position: {
        x: 60,
        y: -60
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "bc43454e-5410-4f46-9610-6622c8820e40",
      zIndex: 6,
      rawTransform: "translate(60, -60), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_role_policy_attachment"
    },
    {
      sourceNodeId: "5069c2b1-c725-4588-8c24-bb96be01ffd9",
      domOrder: 7,
      label: "영상 처리 ECS Task Definition",
      position: {
        x: 600,
        y: 320
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "bc43454e-5410-4f46-9610-6622c8820e40",
      zIndex: 7,
      rawTransform: "translate(600, 320), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_ecs_task_definition"
    },
    {
      sourceNodeId: "50a96af0-1d2d-46fd-a526-01a847c44613",
      domOrder: 8,
      label: "영상 처리 ECS Service",
      position: {
        x: 600,
        y: 480
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "bc43454e-5410-4f46-9610-6622c8820e40",
      zIndex: 8,
      rawTransform: "translate(600, 480), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_ecs_service"
    },
    {
      sourceNodeId: "6c4d1286-6d25-4835-8637-4d392c54de45",
      domOrder: 9,
      label: "영상 API Lambda 통합",
      position: {
        x: 440,
        y: 120
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "bc43454e-5410-4f46-9610-6622c8820e40",
      zIndex: 9,
      rawTransform: "translate(440, 120), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_api_gateway_integration"
    },
    {
      sourceNodeId: "9ea9ad58-0146-4a72-b2bb-a08d51f00503",
      domOrder: 10,
      label: "영상 API POST Method",
      position: {
        x: 660,
        y: -30
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "bc43454e-5410-4f46-9610-6622c8820e40",
      zIndex: 10,
      rawTransform: "translate(660, -30), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_api_gateway_method"
    },
    {
      sourceNodeId: "be541b7f-676c-46ae-992e-e7f31d3baf48",
      domOrder: 11,
      label: "영상 처리 Lambda",
      position: {
        x: 280,
        y: 120
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "bc43454e-5410-4f46-9610-6622c8820e40",
      zIndex: 11,
      rawTransform: "translate(280, 120), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_lambda_function"
    },
    {
      sourceNodeId: "cc70890f-c0f2-4f54-bf31-4017ea652dc6",
      domOrder: 12,
      label: "영상 처리 REST API",
      position: {
        x: 1020,
        y: 120
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "bc43454e-5410-4f46-9610-6622c8820e40",
      zIndex: 12,
      rawTransform: "translate(1020, 120), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_api_gateway_rest_api"
    },
    {
      sourceNodeId: "ecf5cf0b-9489-429e-a6a3-3db886ef26cb",
      domOrder: 13,
      label: "영상 처리 SQS Queue",
      position: {
        x: 895,
        y: 320
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "bc43454e-5410-4f46-9610-6622c8820e40",
      zIndex: 13,
      rawTransform: "translate(895, 320), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_sqs_queue"
    },
    {
      sourceNodeId: "f7a66538-185b-4023-ad8a-0d84ad5d2842",
      domOrder: 14,
      label: "영상 처리 Lambda IAM Role",
      position: {
        x: 55,
        y: 120
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "bc43454e-5410-4f46-9610-6622c8820e40",
      zIndex: 14,
      rawTransform: "translate(55, 120), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_role"
    }
  ],
  edges: [
    {
      sourceEdgeId: "08c784ac-ee32-485e-bceb-c36a25adf926",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "30b41b95-ecec-400f-95b4-d47d7debfcea",
      targetNodeId: "cc70890f-c0f2-4f54-bf31-4017ea652dc6",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M720,255 L862,255 Q870,255 870,247 L870,158 Q870,150 878,150 L1020,150",
      sourcePoint: {
        x: 720,
        y: 255
      },
      targetPoint: {
        x: 1020,
        y: 150
      },
      waypoints: [
        {
          x: 720,
          y: 255
        },
        {
          x: 862,
          y: 255
        },
        {
          x: 870,
          y: 255
        },
        {
          x: 870,
          y: 247
        },
        {
          x: 870,
          y: 158
        },
        {
          x: 870,
          y: 150
        },
        {
          x: 878,
          y: 150
        },
        {
          x: 1020,
          y: 150
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            1015,145\n            1020,150\n            1015,155\n          ",
        transform: "rotate(0, 1020, 150)"
      }
    },
    {
      sourceEdgeId: "0f1ae55d-92c7-464d-9a7b-d3f0e2e94053",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "9ea9ad58-0146-4a72-b2bb-a08d51f00503",
      targetNodeId: "cc70890f-c0f2-4f54-bf31-4017ea652dc6",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M720,0 L862,0 Q870,0 870,8 L870,142 Q870,150 878,150 L1020,150",
      sourcePoint: {
        x: 720,
        y: 0
      },
      targetPoint: {
        x: 1020,
        y: 150
      },
      waypoints: [
        {
          x: 720,
          y: 0
        },
        {
          x: 862,
          y: 0
        },
        {
          x: 870,
          y: 0
        },
        {
          x: 870,
          y: 8
        },
        {
          x: 870,
          y: 142
        },
        {
          x: 870,
          y: 150
        },
        {
          x: 878,
          y: 150
        },
        {
          x: 1020,
          y: 150
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            1015,145\n            1020,150\n            1015,155\n          ",
        transform: "rotate(0, 1020, 150)"
      }
    },
    {
      sourceEdgeId: "1453cebd-f908-4b12-bbba-0ce4d521185d",
      domOrder: 2,
      zIndex: 2,
      sourceNodeId: "6c4d1286-6d25-4835-8637-4d392c54de45",
      targetNodeId: "9ea9ad58-0146-4a72-b2bb-a08d51f00503",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M500,150 L572,150 Q580,150 580,142 L580,8 Q580,0 588,0 L660,0",
      sourcePoint: {
        x: 500,
        y: 150
      },
      targetPoint: {
        x: 660,
        y: 0
      },
      waypoints: [
        {
          x: 500,
          y: 150
        },
        {
          x: 572,
          y: 150
        },
        {
          x: 580,
          y: 150
        },
        {
          x: 580,
          y: 142
        },
        {
          x: 580,
          y: 8
        },
        {
          x: 580,
          y: 0
        },
        {
          x: 588,
          y: 0
        },
        {
          x: 660,
          y: 0
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            655,-5\n            660,0\n            655,5\n          ",
        transform: "rotate(0, 660, 0)"
      }
    },
    {
      sourceEdgeId: "6bd126aa-2a4b-4600-86ac-2e837f4ae6eb",
      domOrder: 3,
      zIndex: 3,
      sourceNodeId: "5069c2b1-c725-4588-8c24-bb96be01ffd9",
      targetNodeId: "2076baeb-dbf8-463d-bb50-7ec9b5d259b9",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M600,350 L330,350",
      sourcePoint: {
        x: 600,
        y: 350
      },
      targetPoint: {
        x: 330,
        y: 350
      },
      waypoints: [
        {
          x: 600,
          y: 350
        },
        {
          x: 330,
          y: 350
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            325,345\n            330,350\n            325,355\n          ",
        transform: "rotate(180, 330, 350)"
      }
    },
    {
      sourceEdgeId: "6f3e8fe8-36a3-4530-a6bb-0fc650c04883",
      domOrder: 4,
      zIndex: 4,
      sourceNodeId: "6c4d1286-6d25-4835-8637-4d392c54de45",
      targetNodeId: "30b41b95-ecec-400f-95b4-d47d7debfcea",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M500,150 L572,150 Q580,150 580,158 L580,247 Q580,255 588,255 L660,255",
      sourcePoint: {
        x: 500,
        y: 150
      },
      targetPoint: {
        x: 660,
        y: 255
      },
      waypoints: [
        {
          x: 500,
          y: 150
        },
        {
          x: 572,
          y: 150
        },
        {
          x: 580,
          y: 150
        },
        {
          x: 580,
          y: 158
        },
        {
          x: 580,
          y: 247
        },
        {
          x: 580,
          y: 255
        },
        {
          x: 588,
          y: 255
        },
        {
          x: 660,
          y: 255
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            655,250\n            660,255\n            655,260\n          ",
        transform: "rotate(0, 660, 255)"
      }
    },
    {
      sourceEdgeId: "81511039-e5b1-4aa7-a223-a9e9bff38785",
      domOrder: 5,
      zIndex: 5,
      sourceNodeId: "be541b7f-676c-46ae-992e-e7f31d3baf48",
      targetNodeId: "f7a66538-185b-4023-ad8a-0d84ad5d2842",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M280,150 L115,150",
      sourcePoint: {
        x: 280,
        y: 150
      },
      targetPoint: {
        x: 115,
        y: 150
      },
      waypoints: [
        {
          x: 280,
          y: 150
        },
        {
          x: 115,
          y: 150
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            110,145\n            115,150\n            110,155\n          ",
        transform: "rotate(180, 115, 150)"
      }
    },
    {
      sourceEdgeId: "997c15d4-346f-4682-b41c-5532a58ce5b6",
      domOrder: 6,
      zIndex: 6,
      sourceNodeId: "50a96af0-1d2d-46fd-a526-01a847c44613",
      targetNodeId: "5069c2b1-c725-4588-8c24-bb96be01ffd9",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M630,480 L630,380",
      sourcePoint: {
        x: 630,
        y: 480
      },
      targetPoint: {
        x: 630,
        y: 380
      },
      waypoints: [
        {
          x: 630,
          y: 480
        },
        {
          x: 630,
          y: 380
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            625,375\n            630,380\n            625,385\n          ",
        transform: "rotate(-90, 630, 380)"
      }
    },
    {
      sourceEdgeId: "a9d2d8cc-1719-4252-8240-00cdb3159598",
      domOrder: 7,
      zIndex: 7,
      sourceNodeId: "23f9af50-c989-4d73-ac79-fbae47e10c04",
      targetNodeId: "2076baeb-dbf8-463d-bb50-7ec9b5d259b9",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M110,345 L270,345",
      sourcePoint: {
        x: 110,
        y: 345
      },
      targetPoint: {
        x: 270,
        y: 345
      },
      waypoints: [
        {
          x: 110,
          y: 345
        },
        {
          x: 270,
          y: 345
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            265,340\n            270,345\n            265,350\n          ",
        transform: "rotate(0, 270, 345)"
      }
    },
    {
      sourceEdgeId: "b6e909d9-8a0d-4c3d-bb5c-cce33915e924",
      domOrder: 8,
      zIndex: 8,
      sourceNodeId: "9ea9ad58-0146-4a72-b2bb-a08d51f00503",
      targetNodeId: "30b41b95-ecec-400f-95b4-d47d7debfcea",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M690,30 L690,225",
      sourcePoint: {
        x: 690,
        y: 30
      },
      targetPoint: {
        x: 690,
        y: 225
      },
      waypoints: [
        {
          x: 690,
          y: 30
        },
        {
          x: 690,
          y: 225
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            685,220\n            690,225\n            685,230\n          ",
        transform: "rotate(90, 690, 225)"
      }
    },
    {
      sourceEdgeId: "b949abbf-711d-4552-8c8c-c9517c88ba11",
      domOrder: 9,
      zIndex: 9,
      sourceNodeId: "6c4d1286-6d25-4835-8637-4d392c54de45",
      targetNodeId: "be541b7f-676c-46ae-992e-e7f31d3baf48",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M440,150 L340,150",
      sourcePoint: {
        x: 440,
        y: 150
      },
      targetPoint: {
        x: 340,
        y: 150
      },
      waypoints: [
        {
          x: 440,
          y: 150
        },
        {
          x: 340,
          y: 150
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            335,145\n            340,150\n            335,155\n          ",
        transform: "rotate(180, 340, 150)"
      }
    },
    {
      sourceEdgeId: "bf780150-0f33-4196-9600-dccb8fdb7f20",
      domOrder: 10,
      zIndex: 10,
      sourceNodeId: "3b240358-1a05-4628-a2e8-be852cdbf846",
      targetNodeId: "f7a66538-185b-4023-ad8a-0d84ad5d2842",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M90,0 L90,120",
      sourcePoint: {
        x: 90,
        y: 0
      },
      targetPoint: {
        x: 90,
        y: 120
      },
      waypoints: [
        {
          x: 90,
          y: 0
        },
        {
          x: 90,
          y: 120
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            85,115\n            90,120\n            85,125\n          ",
        transform: "rotate(90, 90, 120)"
      }
    },
    {
      sourceEdgeId: "c4da462e-5d05-40d0-bfb4-b5d20b709236",
      domOrder: 11,
      zIndex: 11,
      sourceNodeId: "6c4d1286-6d25-4835-8637-4d392c54de45",
      targetNodeId: "cc70890f-c0f2-4f54-bf31-4017ea652dc6",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M500,150 L1020,150",
      sourcePoint: {
        x: 500,
        y: 150
      },
      targetPoint: {
        x: 1020,
        y: 150
      },
      waypoints: [
        {
          x: 500,
          y: 150
        },
        {
          x: 1020,
          y: 150
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            1015,145\n            1020,150\n            1015,155\n          ",
        transform: "rotate(0, 1020, 150)"
      }
    },
    {
      sourceEdgeId: "e90fac74-8d0d-4092-8d47-7f7fa39e4791",
      domOrder: 12,
      zIndex: 12,
      sourceNodeId: "5069c2b1-c725-4588-8c24-bb96be01ffd9",
      targetNodeId: "ecf5cf0b-9489-429e-a6a3-3db886ef26cb",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M660,350 L895,350",
      sourcePoint: {
        x: 660,
        y: 350
      },
      targetPoint: {
        x: 895,
        y: 350
      },
      waypoints: [
        {
          x: 660,
          y: 350
        },
        {
          x: 895,
          y: 350
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            890,345\n            895,350\n            890,355\n          ",
        transform: "rotate(0, 895, 350)"
      }
    },
    {
      sourceEdgeId: "f632c0e8-37ac-4290-a2bb-7dc5421a4bb7",
      domOrder: 13,
      zIndex: 13,
      sourceNodeId: "50a96af0-1d2d-46fd-a526-01a847c44613",
      targetNodeId: "13f9d1bb-7e57-4f23-a141-d99ebc4d39e2",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M600,510 L335,510",
      sourcePoint: {
        x: 600,
        y: 510
      },
      targetPoint: {
        x: 335,
        y: 510
      },
      waypoints: [
        {
          x: 600,
          y: 510
        },
        {
          x: 335,
          y: 510
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            330,505\n            335,510\n            330,515\n          ",
        transform: "rotate(180, 335, 510)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_s3_bucket" "video_bucket" {\n  bucket = "dashcam-video-processing"\n}\n\nresource "aws_s3_bucket" "output_bucket" {\n  bucket = "dashcam-output"\n}\n\nresource "aws_sqs_queue" "video_queue" {\n  name = "video-processing-queue"\n}\n\nresource "aws_api_gateway_rest_api" "video_api" {\n  name        = "VideoProcessingAPI"\n  description = "API for processing dash cam videos"\n}\n\nresource "aws_api_gateway_resource" "video_resource" {\n  rest_api_id = aws_api_gateway_rest_api.video_api.id\n  path_part   = "videos"\n  parent_id   = aws_api_gateway_rest_api.video_api.root_resource_id\n}\n\nresource "aws_api_gateway_method" "video_method" {\n  rest_api_id   = aws_api_gateway_rest_api.video_api.id\n  resource_id   = aws_api_gateway_resource.video_resource.id\n  http_method   = "POST"\n  authorization = "NONE"\n}\n\nresource "aws_api_gateway_integration" "video_integration" {\n  uri                     = aws_lambda_function.video_processor.invoke_arn\n  type                    = "AWS_PROXY"\n  rest_api_id             = aws_api_gateway_rest_api.video_api.id\n  resource_id             = aws_api_gateway_resource.video_resource.id\n  integration_http_method = "POST"\n  http_method             = aws_api_gateway_method.video_method.http_method\n}\n\nresource "aws_lambda_function" "video_processor" {\n  source_code_hash = filebase64sha256("./video_processor.zip")\n  runtime          = "python3.8"\n  role             = aws_iam_role.lambda_exec.arn\n  handler          = "video_processor.handler"\n  function_name    = "video_processor"\n  filename         = "video_processor.zip"\n}\n\nresource "aws_iam_role" "lambda_exec" {\n  name = "lambda_exec_role"\n  assume_role_policy = jsonencode({\n    Version = "2012-10-17"\n    Statement = [\n      {\n        Action = "sts:AssumeRole"\n        Effect = "Allow"\n        Principal = {\n          Service = "lambda.amazonaws.com"\n        }\n      },\n    ]\n  })\n}\n\nresource "aws_iam_role_policy_attachment" "lambda_policy" {\n  role       = aws_iam_role.lambda_exec.name\n  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"\n}\n\nresource "aws_ecs_cluster" "video_processing_cluster" {\n  name = "video-processing-cluster"\n}\n\nresource "aws_ecs_task_definition" "video_task" {\n  network_mode = "awsvpc"\n  memory       = "2048"\n  family       = "video-processing-task"\n  cpu          = "1024"\n  container_definitions = jsonencode([\n    {\n      name      = "video-processor"\n      image     = "video-processor-image"\n      essential = true\n      environment = [\n        {\n          name  = "S3_BUCKET"\n          value = aws_s3_bucket.output_bucket.bucket\n        },\n        {\n          name  = "SQS_QUEUE"\n          value = aws_sqs_queue.video_queue.id\n        }\n      ]\n      logConfiguration = {\n        logDriver = "awslogs"\n        options = {\n          "awslogs-group"         = "/ecs/video-processor"\n          "awslogs-region"        = "us-west-2"\n          "awslogs-stream-prefix" = "ecs"\n        }\n      }\n    }\n  ])\n\n  requires_compatibilities = [\n    "FARGATE",\n  ]\n}\n\nresource "aws_ecs_service" "video_service" {\n  task_definition = aws_ecs_task_definition.video_task.arn\n  name            = "video-processing-service"\n  launch_type     = "FARGATE"\n  desired_count   = 1\n  cluster         = aws_ecs_cluster.video_processing_cluster.id\n\n  network_configuration {\n    security_groups = [\n      "sg-0123456789abcdef0",\n    ]\n\n    subnets = [\n      "subnet-0123456789abcdef0",\n    ]\n  }\n}\n\nresource "aws_cloudfront_distribution" "video_distribution" {\n  is_ipv6_enabled     = true\n  enabled             = true\n  default_root_object = "index.html"\n\n  default_cache_behavior {\n    viewer_protocol_policy = "redirect-to-https"\n    target_origin_id       = "S3-dashcam-output"\n\n    allowed_methods = [\n      "GET",\n      "HEAD",\n    ]\n\n    cached_methods = [\n      "GET",\n      "HEAD",\n    ]\n\n    forwarded_values {\n      query_string = false\n\n      cookies {\n        forward = "none"\n      }\n    }\n  }\n\n  origin {\n    origin_id   = "S3-dashcam-output"\n    domain_name = aws_s3_bucket.output_bucket.bucket_regional_domain_name\n  }\n\n  restrictions {\n    geo_restriction {\n      restriction_type = "none"\n    }\n  }\n\n  viewer_certificate {\n    cloudfront_default_certificate = true\n  }\n}\n\n',
        sha256: "6b869ad14b1b1817908e57d68a99a009323e33b1d3a5b948c8bef6c57568892f",
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
        code: 'provider "aws" {\n  region = "us-west-2"\n}\n',
        sha256: "4d82027b624b25a50791e913906d69e73995a268b56820e1b190a0e36a0bfc14",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "45fd2390-58ad-4c4b-b840-739294fc4339"\n  env      = "Production"\n}\n',
        sha256: "ffe8dec36992ddaa163e22402066f2708d7306fb119b2385f2ddbd1ce464f743",
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
        code: 'variable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n}\n\n',
        sha256: "7dfe251e48aaeafe7882cd342c56947c587c7b269c4a623aa76f8ba3fc82fa33",
        includeInWorkspace: true
      }
    ],
    resourceAddresses: [
      "aws_s3_bucket.video_bucket",
      "aws_s3_bucket.output_bucket",
      "aws_sqs_queue.video_queue",
      "aws_api_gateway_rest_api.video_api",
      "aws_api_gateway_resource.video_resource",
      "aws_api_gateway_method.video_method",
      "aws_api_gateway_integration.video_integration",
      "aws_lambda_function.video_processor",
      "aws_iam_role.lambda_exec",
      "aws_iam_role_policy_attachment.lambda_policy",
      "aws_ecs_cluster.video_processing_cluster",
      "aws_ecs_task_definition.video_task",
      "aws_ecs_service.video_service",
      "aws_cloudfront_distribution.video_distribution"
    ]
  },
  bindings: {
    "bc43454e-5410-4f46-9610-6622c8820e40": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "13f9d1bb-7e57-4f23-a141-d99ebc4d39e2": {
      kind: "resource",
      address: "aws_ecs_cluster.video_processing_cluster",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "2076baeb-dbf8-463d-bb50-7ec9b5d259b9": {
      kind: "resource",
      address: "aws_s3_bucket.output_bucket",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "23f9af50-c989-4d73-ac79-fbae47e10c04": {
      kind: "resource",
      address: "aws_cloudfront_distribution.video_distribution",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "30b41b95-ecec-400f-95b4-d47d7debfcea": {
      kind: "resource",
      address: "aws_api_gateway_resource.video_resource",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "32b37e79-d0da-4ea7-88c6-2c8789b455ce": {
      kind: "resource",
      address: "aws_s3_bucket.video_bucket",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "3b240358-1a05-4628-a2e8-be852cdbf846": {
      kind: "resource",
      address: "aws_iam_role_policy_attachment.lambda_policy",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "5069c2b1-c725-4588-8c24-bb96be01ffd9": {
      kind: "resource",
      address: "aws_ecs_task_definition.video_task",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "50a96af0-1d2d-46fd-a526-01a847c44613": {
      kind: "resource",
      address: "aws_ecs_service.video_service",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "6c4d1286-6d25-4835-8637-4d392c54de45": {
      kind: "resource",
      address: "aws_api_gateway_integration.video_integration",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "9ea9ad58-0146-4a72-b2bb-a08d51f00503": {
      kind: "resource",
      address: "aws_api_gateway_method.video_method",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "be541b7f-676c-46ae-992e-e7f31d3baf48": {
      kind: "resource",
      address: "aws_lambda_function.video_processor",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "cc70890f-c0f2-4f54-bf31-4017ea652dc6": {
      kind: "resource",
      address: "aws_api_gateway_rest_api.video_api",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "ecf5cf0b-9489-429e-a6a3-3db886ef26cb": {
      kind: "resource",
      address: "aws_sqs_queue.video_queue",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "f7a66538-185b-4023-ad8a-0d84ad5d2842": {
      kind: "resource",
      address: "aws_iam_role.lambda_exec",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    }
  }
});
