import { defineCapturedBrainboardTemplate } from "./define-source.js";

export const awsServerlessCdnSource = defineCapturedBrainboardTemplate({
  id: "brainboard-aws-serverless-cdn",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "45191152-00cd-443d-a7f5-9a7295120e48",
    sourceUrl: "https://app.brainboard.co/templates/45191152-00cd-443d-a7f5-9a7295120e48",
    cloneArchitectureId: "3a8408e9-b054-48d6-8a5e-b11c7b85dead",
    downloads: 812,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS serverless architecture with CDN",
  description: null,
  provider: "aws",
  viewport: {
    x: -758.67,
    y: 415.23,
    width: 3868.3569738977994,
    height: 2116.8508996051846
  },
  nodes: [
    {
      sourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      domOrder: 0,
      label: "US East (N. Virginia)",
      position: {
        x: 498.0087158203123,
        y: 841.1599700927736
      },
      size: {
        width: 1275,
        height: 1245
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(498.0087158203123, 841.1599700927736), rotate(0 637.5 622.5)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "04926feb-4622-439a-b228-cfc9e415e98e",
      domOrder: 1,
      label: "apigwv2_api",
      position: {
        x: 765,
        y: 1712.8609821992764
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 1,
      rawTransform: "translate(765, 1712.8609821992764), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_apigatewayv2_api"
    },
    {
      sourceNodeId: "0c2d3032-4148-4e80-bae8-9cfb63f6ec6e",
      domOrder: 2,
      label: "www",
      position: {
        x: 990,
        y: 1018.060958164477
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 2,
      rawTransform: "translate(990, 1018.060958164477), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route53_record"
    },
    {
      sourceNodeId: "372d8cce-6e53-4d81-a7d5-5337d826b75b",
      domOrder: 3,
      label: "website_bucket",
      position: {
        x: 1285.383966064453,
        y: 1218.296043395996
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 3,
      rawTransform: "translate(1285.383966064453, 1218.296043395996), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket"
    },
    {
      sourceNodeId: "3afa58d4-2389-47e3-af6d-197aa176ca4a",
      domOrder: 4,
      label: "s3_bucket_versioning",
      position: {
        x: 1550.5156738281253,
        y: 1369.0558364868166
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 4,
      rawTransform: "translate(1550.5156738281253, 1369.0558364868166), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_versioning"
    },
    {
      sourceNodeId: "3e80ddec-93fc-4732-8e32-ec2d48a5956f",
      domOrder: 5,
      label: "cognito_user_pool",
      position: {
        x: 765,
        y: 1509.0890020931467
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 5,
      rawTransform: "translate(765, 1509.0890020931467), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_cognito_user_pool"
    },
    {
      sourceNodeId: "46b1dd16-edd2-49f2-b3b6-b228d6838314",
      domOrder: 6,
      label: "iam_role",
      position: {
        x: 1158.5118881955068,
        y: 1715.4115959026792
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 6,
      rawTransform: "translate(1158.5118881955068, 1715.4115959026792), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_role"
    },
    {
      sourceNodeId: "48e4d8e3-8e35-4e2b-9d9a-3bd6309ce560",
      domOrder: 7,
      label: "lambda_function",
      position: {
        x: 990,
        y: 1509.0890020931467
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 7,
      rawTransform: "translate(990, 1509.0890020931467), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_lambda_function"
    },
    {
      sourceNodeId: "58851a9c-d1ed-4576-8636-e8c2de255585",
      domOrder: 8,
      label: "public_content",
      position: {
        x: 765,
        y: 1917.4084740890592
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 8,
      rawTransform: "translate(765, 1917.4084740890592), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket"
    },
    {
      sourceNodeId: "913fcb3c-08dd-487b-9f34-7a0e3aded6b6",
      domOrder: 9,
      label: "dynamodb_global_table",
      position: {
        x: 1390,
        y: 1712.8609821992764
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 9,
      rawTransform: "translate(1390, 1712.8609821992764), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_dynamodb_global_table"
    },
    {
      sourceNodeId: "96f0a15e-0305-405a-b9e9-eee46aed63e0",
      domOrder: 10,
      label: "error",
      position: {
        x: 1284.836767578125,
        y: 1372.1038528442382
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 10,
      rawTransform: "translate(1284.836767578125, 1372.1038528442382), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_object"
    },
    {
      sourceNodeId: "97ab46f5-02c0-4d3e-8d23-73e7cf4d9936",
      domOrder: 11,
      label: "route53_zone",
      position: {
        x: 765,
        y: 1015
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 11,
      rawTransform: "translate(765, 1015), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route53_zone"
    },
    {
      sourceNodeId: "9c5f4598-f184-4890-bdd0-1899be4e8cf7",
      domOrder: 12,
      label: "index",
      position: {
        x: 1552.8494110107422,
        y: 1219.7053787231446
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 12,
      rawTransform: "translate(1552.8494110107422, 1219.7053787231446), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_object"
    },
    {
      sourceNodeId: "a9812863-e435-4e22-8ead-21024b258441",
      domOrder: 13,
      label: "website_distribution",
      position: {
        x: 1285.383966064453,
        y: 1018.060958164477
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 13,
      rawTransform: "translate(1285.383966064453, 1018.060958164477), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_cloudfront_distribution"
    },
    {
      sourceNodeId: "b90b246d-aeeb-4e30-aa60-7929ecace81d",
      domOrder: 14,
      label: "ses_email_identity",
      position: {
        x: 1390,
        y: 1509.0890020931467
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 14,
      rawTransform: "translate(1390, 1509.0890020931467), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_ses_email_identity"
    },
    {
      sourceNodeId: "ceb49680-3cb4-41d8-9e9d-34f674391bb4",
      domOrder: 15,
      label: "lambda_function3",
      position: {
        x: 990,
        y: 1917.4084740890592
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 15,
      rawTransform: "translate(990, 1917.4084740890592), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_lambda_function"
    },
    {
      sourceNodeId: "d0fc5fc8-4e65-463c-96a9-abb6c4abd050",
      domOrder: 16,
      label: "origin_access_identity",
      position: {
        x: 1546.491870117187,
        y: 1018.060958164477
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 16,
      rawTransform: "translate(1546.4918701171873, 1018.060958164477), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_cloudfront_origin_access_identity"
    },
    {
      sourceNodeId: "ddbce9f8-63fd-43a9-a133-86dda6fed0e9",
      domOrder: 17,
      label: "s3_bucket_website_configuration",
      position: {
        x: 990.4061098255536,
        y: 1219.127717584708
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 17,
      rawTransform: "translate(990.4061098255537, 1219.127717584708), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_website_configuration"
    },
    {
      sourceNodeId: "e608c4e1-a9bf-4675-be19-e67f7bde4f98",
      domOrder: 18,
      label: "s3_bucket_acl",
      position: {
        x: 1071.368246459961,
        y: 1372.2546951293946
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 18,
      rawTransform: "translate(1071.368246459961, 1372.2546951293946), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_acl"
    },
    {
      sourceNodeId: "ed57ef8a-ac66-4a30-a586-09a0f3c4406a",
      domOrder: 19,
      label: "lambda_function2",
      position: {
        x: 990,
        y: 1712.8609821992764
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a7275a97-1cba-448c-b797-76cf925ac3d5",
      zIndex: 19,
      rawTransform: "translate(990, 1712.8609821992764), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_lambda_function"
    },
    {
      sourceNodeId: "675bd894-0771-422e-947d-b7c25fad993f",
      domOrder: 20,
      label: "users",
      position: {
        x: 357.720388434915,
        y: 1509.0890020931467
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: null,
      zIndex: 20,
      rawTransform: "translate(357.720388434915, 1509.0890020931467), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "brainboard_icon"
    }
  ],
  edges: [
    {
      sourceEdgeId: "0a2c5c55-317d-4994-bc80-a8ec68585022",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "58851a9c-d1ed-4576-8636-e8c2de255585",
      targetNodeId: "ceb49680-3cb4-41d8-9e9d-34f674391bb4",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M825,1947.4084740890592 L990,1947.4084740890592",
      sourcePoint: {
        x: 825,
        y: 1947.4084740890592
      },
      targetPoint: {
        x: 990,
        y: 1947.4084740890592
      },
      waypoints: [
        {
          x: 825,
          y: 1947.4084740890592
        },
        {
          x: 990,
          y: 1947.4084740890592
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            985,1942.4084740890592\n            990,1947.4084740890592\n            985,1952.4084740890592\n          ",
        transform: "rotate(0, 990, 1947.4084740890592)"
      }
    },
    {
      sourceEdgeId: "163c349e-1b2a-4b7b-b6f4-98531c5d84eb",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "675bd894-0771-422e-947d-b7c25fad993f",
      targetNodeId: "3e80ddec-93fc-4732-8e32-ec2d48a5956f",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M417.720388434915,1539.0890020931467 L765,1539.0890020931467",
      sourcePoint: {
        x: 417.720388434915,
        y: 1539.0890020931467
      },
      targetPoint: {
        x: 765,
        y: 1539.0890020931467
      },
      waypoints: [
        {
          x: 417.720388434915,
          y: 1539.0890020931467
        },
        {
          x: 765,
          y: 1539.0890020931467
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            760,1534.0890020931467\n            765,1539.0890020931467\n            760,1544.0890020931467\n          ",
        transform: "rotate(0, 765, 1539.0890020931467)"
      }
    },
    {
      sourceEdgeId: "1fd43ea4-b011-469e-9373-3ce64d78cb5c",
      domOrder: 2,
      zIndex: 2,
      sourceNodeId: "ed57ef8a-ac66-4a30-a586-09a0f3c4406a",
      targetNodeId: "46b1dd16-edd2-49f2-b3b6-b228d6838314",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M1050,1742.8609821992764 L1158.5118881955068,1745.4115959026792",
      sourcePoint: {
        x: 1050,
        y: 1742.8609821992764
      },
      targetPoint: {
        x: 1158.5118881955068,
        y: 1745.4115959026792
      },
      waypoints: [
        {
          x: 1050,
          y: 1742.8609821992764
        },
        {
          x: 1158.5118881955068,
          y: 1745.4115959026792
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 1.3465114059230463,
      rawArrow: {
        points:
          "\n            1153.5118881955068,1740.4115959026792\n            1158.5118881955068,1745.4115959026792\n            1153.5118881955068,1750.4115959026792\n          ",
        transform: "rotate(1.3465114059230463, 1158.5118881955068, 1745.4115959026792)"
      }
    },
    {
      sourceEdgeId: "294c11d1-c06a-41cc-ac93-eb12535a6178",
      domOrder: 3,
      zIndex: 3,
      sourceNodeId: "675bd894-0771-422e-947d-b7c25fad993f",
      targetNodeId: "58851a9c-d1ed-4576-8636-e8c2de255585",
      sourcePort: "right",
      targetPort: "left",
      svgPath:
        "M417.720388434915,1539.0890020931467 L595.2430038427799,1539.0890020931467 Q603.2430038427799,1539.0890020931467 603.2430038427799,1547.0890020931467 L603.2430038427799,1939.4084740890592 Q603.2430038427799,1947.4084740890592 611.2430038427799,1947.4084740890592 L765,1947.4084740890592",
      sourcePoint: {
        x: 417.720388434915,
        y: 1539.0890020931467
      },
      targetPoint: {
        x: 765,
        y: 1947.4084740890592
      },
      waypoints: [
        {
          x: 417.720388434915,
          y: 1539.0890020931467
        },
        {
          x: 595.2430038427799,
          y: 1539.0890020931467
        },
        {
          x: 603.2430038427799,
          y: 1539.0890020931467
        },
        {
          x: 603.2430038427799,
          y: 1547.0890020931467
        },
        {
          x: 603.2430038427799,
          y: 1939.4084740890592
        },
        {
          x: 603.2430038427799,
          y: 1947.4084740890592
        },
        {
          x: 611.2430038427799,
          y: 1947.4084740890592
        },
        {
          x: 765,
          y: 1947.4084740890592
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            760,1942.4084740890592\n            765,1947.4084740890592\n            760,1952.4084740890592\n          ",
        transform: "rotate(0, 765, 1947.4084740890592)"
      }
    },
    {
      sourceEdgeId: "4edf2cf3-216b-414d-aa51-dd6bcf3410cf",
      domOrder: 4,
      zIndex: 4,
      sourceNodeId: "96f0a15e-0305-405a-b9e9-eee46aed63e0",
      targetNodeId: "372d8cce-6e53-4d81-a7d5-5337d826b75b",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M1314.836767578125,1372.1038528442382 L1315.383966064453,1278.296043395996",
      sourcePoint: {
        x: 1314.836767578125,
        y: 1372.1038528442382
      },
      targetPoint: {
        x: 1315.383966064453,
        y: 1278.296043395996
      },
      waypoints: [
        {
          x: 1314.836767578125,
          y: 1372.1038528442382
        },
        {
          x: 1315.383966064453,
          y: 1278.296043395996
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -89.66578679944418,
      rawArrow: {
        points:
          "\n            1310.383966064453,1273.296043395996\n            1315.383966064453,1278.296043395996\n            1310.383966064453,1283.296043395996\n          ",
        transform: "rotate(-89.66578679944418, 1315.383966064453, 1278.296043395996)"
      }
    },
    {
      sourceEdgeId: "5b42b5e2-88e9-4f93-a810-b2ed594c97c1",
      domOrder: 5,
      zIndex: 5,
      sourceNodeId: "ceb49680-3cb4-41d8-9e9d-34f674391bb4",
      targetNodeId: "46b1dd16-edd2-49f2-b3b6-b228d6838314",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath:
        "M1020,1917.4084740890592 L1020,1854.4100349958692 Q1020,1846.4100349958692 1028,1846.4100349958692 L1180.5118881955068,1846.4100349958692 Q1188.5118881955068,1846.4100349958692 1188.5118881955068,1838.4100349958692 L1188.5118881955068,1775.4115959026792",
      sourcePoint: {
        x: 1020,
        y: 1917.4084740890592
      },
      targetPoint: {
        x: 1188.5118881955068,
        y: 1775.4115959026792
      },
      waypoints: [
        {
          x: 1020,
          y: 1917.4084740890592
        },
        {
          x: 1020,
          y: 1854.4100349958692
        },
        {
          x: 1020,
          y: 1846.4100349958692
        },
        {
          x: 1028,
          y: 1846.4100349958692
        },
        {
          x: 1180.5118881955068,
          y: 1846.4100349958692
        },
        {
          x: 1188.5118881955068,
          y: 1846.4100349958692
        },
        {
          x: 1188.5118881955068,
          y: 1838.4100349958692
        },
        {
          x: 1188.5118881955068,
          y: 1775.4115959026792
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points:
          "\n            1183.5118881955068,1770.4115959026792\n            1188.5118881955068,1775.4115959026792\n            1183.5118881955068,1780.4115959026792\n          ",
        transform: "rotate(-90, 1188.5118881955068, 1775.4115959026792)"
      }
    },
    {
      sourceEdgeId: "5de09fd2-a620-49a3-aa3b-d817f25bebd5",
      domOrder: 6,
      zIndex: 6,
      sourceNodeId: "97ab46f5-02c0-4d3e-8d23-73e7cf4d9936",
      targetNodeId: "0c2d3032-4148-4e80-bae8-9cfb63f6ec6e",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M825,1045 L990,1048.0609581644771",
      sourcePoint: {
        x: 825,
        y: 1045
      },
      targetPoint: {
        x: 990,
        y: 1048.0609581644771
      },
      waypoints: [
        {
          x: 825,
          y: 1045
        },
        {
          x: 990,
          y: 1048.0609581644771
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 1.0627870865292244,
      rawArrow: {
        points:
          "\n            985,1043.0609581644771\n            990,1048.0609581644771\n            985,1053.0609581644771\n          ",
        transform: "rotate(1.0627870865292244, 990, 1048.0609581644771)"
      }
    },
    {
      sourceEdgeId: "60b9dc33-5565-48ff-8585-e3dc11c1a1cb",
      domOrder: 7,
      zIndex: 7,
      sourceNodeId: "a9812863-e435-4e22-8ead-21024b258441",
      targetNodeId: "372d8cce-6e53-4d81-a7d5-5337d826b75b",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M1315.383966064453,1078.0609581644771 L1315.383966064453,1218.296043395996",
      sourcePoint: {
        x: 1315.383966064453,
        y: 1078.0609581644771
      },
      targetPoint: {
        x: 1315.383966064453,
        y: 1218.296043395996
      },
      waypoints: [
        {
          x: 1315.383966064453,
          y: 1078.0609581644771
        },
        {
          x: 1315.383966064453,
          y: 1218.296043395996
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 90,
      rawArrow: {
        points:
          "\n            1310.383966064453,1213.296043395996\n            1315.383966064453,1218.296043395996\n            1310.383966064453,1223.296043395996\n          ",
        transform: "rotate(90, 1315.383966064453, 1218.296043395996)"
      }
    },
    {
      sourceEdgeId: "7203dd28-f20e-4126-a829-5e077e612424",
      domOrder: 8,
      zIndex: 8,
      sourceNodeId: "675bd894-0771-422e-947d-b7c25fad993f",
      targetNodeId: "97ab46f5-02c0-4d3e-8d23-73e7cf4d9936",
      sourcePort: "right",
      targetPort: "left",
      svgPath:
        "M417.720388434915,1539.0890020931467 L595.8601942174575,1539.0890020931467 Q603.8601942174575,1539.0890020931467 603.8601942174575,1531.0890020931467 L603.8601942174575,1053 Q603.8601942174575,1045 611.8601942174575,1045 L765,1045",
      sourcePoint: {
        x: 417.720388434915,
        y: 1539.0890020931467
      },
      targetPoint: {
        x: 765,
        y: 1045
      },
      waypoints: [
        {
          x: 417.720388434915,
          y: 1539.0890020931467
        },
        {
          x: 595.8601942174575,
          y: 1539.0890020931467
        },
        {
          x: 603.8601942174575,
          y: 1539.0890020931467
        },
        {
          x: 603.8601942174575,
          y: 1531.0890020931467
        },
        {
          x: 603.8601942174575,
          y: 1053
        },
        {
          x: 603.8601942174575,
          y: 1045
        },
        {
          x: 611.8601942174575,
          y: 1045
        },
        {
          x: 765,
          y: 1045
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            760,1040\n            765,1045\n            760,1050\n          ",
        transform: "rotate(0, 765, 1045)"
      }
    },
    {
      sourceEdgeId: "9f24801e-bf6b-483d-b2e2-e4b44857c700",
      domOrder: 9,
      zIndex: 9,
      sourceNodeId: "a9812863-e435-4e22-8ead-21024b258441",
      targetNodeId: "d0fc5fc8-4e65-463c-96a9-abb6c4abd050",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M1345.383966064453,1048.0609581644771 L1546.4918701171873,1048.0609581644771",
      sourcePoint: {
        x: 1345.383966064453,
        y: 1048.0609581644771
      },
      targetPoint: {
        x: 1546.4918701171873,
        y: 1048.0609581644771
      },
      waypoints: [
        {
          x: 1345.383966064453,
          y: 1048.0609581644771
        },
        {
          x: 1546.4918701171873,
          y: 1048.0609581644771
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            1541.4918701171873,1043.0609581644771\n            1546.4918701171873,1048.0609581644771\n            1541.4918701171873,1053.0609581644771\n          ",
        transform: "rotate(0, 1546.4918701171873, 1048.0609581644771)"
      }
    },
    {
      sourceEdgeId: "9f694684-f25f-4db4-8170-9d17a37cfbaf",
      domOrder: 10,
      zIndex: 10,
      sourceNodeId: "48e4d8e3-8e35-4e2b-9d9a-3bd6309ce560",
      targetNodeId: "46b1dd16-edd2-49f2-b3b6-b228d6838314",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath:
        "M1020,1569.0890020931467 L1020,1634.250298997913 Q1020,1642.250298997913 1028,1642.250298997913 L1180.5118881955068,1642.250298997913 Q1188.5118881955068,1642.250298997913 1188.5118881955068,1650.250298997913 L1188.5118881955068,1715.4115959026792",
      sourcePoint: {
        x: 1020,
        y: 1569.0890020931467
      },
      targetPoint: {
        x: 1188.5118881955068,
        y: 1715.4115959026792
      },
      waypoints: [
        {
          x: 1020,
          y: 1569.0890020931467
        },
        {
          x: 1020,
          y: 1634.250298997913
        },
        {
          x: 1020,
          y: 1642.250298997913
        },
        {
          x: 1028,
          y: 1642.250298997913
        },
        {
          x: 1180.5118881955068,
          y: 1642.250298997913
        },
        {
          x: 1188.5118881955068,
          y: 1642.250298997913
        },
        {
          x: 1188.5118881955068,
          y: 1650.250298997913
        },
        {
          x: 1188.5118881955068,
          y: 1715.4115959026792
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 90,
      rawArrow: {
        points:
          "\n            1183.5118881955068,1710.4115959026792\n            1188.5118881955068,1715.4115959026792\n            1183.5118881955068,1720.4115959026792\n          ",
        transform: "rotate(90, 1188.5118881955068, 1715.4115959026792)"
      }
    },
    {
      sourceEdgeId: "a140269b-c558-4bf7-8e01-9015ee5c48ea",
      domOrder: 11,
      zIndex: 11,
      sourceNodeId: "ceb49680-3cb4-41d8-9e9d-34f674391bb4",
      targetNodeId: "913fcb3c-08dd-487b-9f34-7a0e3aded6b6",
      sourcePort: "right",
      targetPort: "bottom",
      svgPath:
        "M1050,1947.4084740890592 L1412,1947.4084740890592 Q1420,1947.4084740890592 1420,1939.4084740890592 L1420,1772.8609821992764",
      sourcePoint: {
        x: 1050,
        y: 1947.4084740890592
      },
      targetPoint: {
        x: 1420,
        y: 1772.8609821992764
      },
      waypoints: [
        {
          x: 1050,
          y: 1947.4084740890592
        },
        {
          x: 1412,
          y: 1947.4084740890592
        },
        {
          x: 1420,
          y: 1947.4084740890592
        },
        {
          x: 1420,
          y: 1939.4084740890592
        },
        {
          x: 1420,
          y: 1772.8609821992764
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points:
          "\n            1415,1767.8609821992764\n            1420,1772.8609821992764\n            1415,1777.8609821992764\n          ",
        transform: "rotate(-90, 1420, 1772.8609821992764)"
      }
    },
    {
      sourceEdgeId: "a6302ecb-0dc4-49c7-8ea7-4635088feadc",
      domOrder: 12,
      zIndex: 12,
      sourceNodeId: "675bd894-0771-422e-947d-b7c25fad993f",
      targetNodeId: "04926feb-4622-439a-b228-cfc9e415e98e",
      sourcePort: "right",
      targetPort: "left",
      svgPath:
        "M417.720388434915,1539.0890020931467 L595.0356868328668,1539.0890020931467 Q603.0356868328668,1539.0890020931467 603.0356868328668,1547.0890020931467 L603.0356868328668,1734.8609821992764 Q603.0356868328668,1742.8609821992764 611.0356868328668,1742.8609821992764 L765,1742.8609821992764",
      sourcePoint: {
        x: 417.720388434915,
        y: 1539.0890020931467
      },
      targetPoint: {
        x: 765,
        y: 1742.8609821992764
      },
      waypoints: [
        {
          x: 417.720388434915,
          y: 1539.0890020931467
        },
        {
          x: 595.0356868328668,
          y: 1539.0890020931467
        },
        {
          x: 603.0356868328668,
          y: 1539.0890020931467
        },
        {
          x: 603.0356868328668,
          y: 1547.0890020931467
        },
        {
          x: 603.0356868328668,
          y: 1734.8609821992764
        },
        {
          x: 603.0356868328668,
          y: 1742.8609821992764
        },
        {
          x: 611.0356868328668,
          y: 1742.8609821992764
        },
        {
          x: 765,
          y: 1742.8609821992764
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            760,1737.8609821992764\n            765,1742.8609821992764\n            760,1747.8609821992764\n          ",
        transform: "rotate(0, 765, 1742.8609821992764)"
      }
    },
    {
      sourceEdgeId: "a9a8c600-b43e-4f7c-ab1c-7e8b7f3896bd",
      domOrder: 13,
      zIndex: 13,
      sourceNodeId: "48e4d8e3-8e35-4e2b-9d9a-3bd6309ce560",
      targetNodeId: "913fcb3c-08dd-487b-9f34-7a0e3aded6b6",
      sourcePort: "right",
      targetPort: "left",
      svgPath:
        "M1050,1539.0890020931467 L1323.5658183250216,1539.0890020931467 Q1331.5658183250216,1539.0890020931467 1331.5658183250216,1547.0890020931467 L1331.5658183250216,1734.8609821992764 Q1331.5658183250216,1742.8609821992764 1339.5658183250216,1742.8609821992764 L1390,1742.8609821992764",
      sourcePoint: {
        x: 1050,
        y: 1539.0890020931467
      },
      targetPoint: {
        x: 1390,
        y: 1742.8609821992764
      },
      waypoints: [
        {
          x: 1050,
          y: 1539.0890020931467
        },
        {
          x: 1323.5658183250216,
          y: 1539.0890020931467
        },
        {
          x: 1331.5658183250216,
          y: 1539.0890020931467
        },
        {
          x: 1331.5658183250216,
          y: 1547.0890020931467
        },
        {
          x: 1331.5658183250216,
          y: 1734.8609821992764
        },
        {
          x: 1331.5658183250216,
          y: 1742.8609821992764
        },
        {
          x: 1339.5658183250216,
          y: 1742.8609821992764
        },
        {
          x: 1390,
          y: 1742.8609821992764
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            1385,1737.8609821992764\n            1390,1742.8609821992764\n            1385,1747.8609821992764\n          ",
        transform: "rotate(0, 1390, 1742.8609821992764)"
      }
    },
    {
      sourceEdgeId: "b1b21dec-1a7f-453b-aecc-16baab7a100c",
      domOrder: 14,
      zIndex: 14,
      sourceNodeId: "9c5f4598-f184-4890-bdd0-1899be4e8cf7",
      targetNodeId: "372d8cce-6e53-4d81-a7d5-5337d826b75b",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M1552.8494110107422,1249.7053787231446 L1345.383966064453,1248.296043395996",
      sourcePoint: {
        x: 1552.8494110107422,
        y: 1249.7053787231446
      },
      targetPoint: {
        x: 1345.383966064453,
        y: 1248.296043395996
      },
      waypoints: [
        {
          x: 1552.8494110107422,
          y: 1249.7053787231446
        },
        {
          x: 1345.383966064453,
          y: 1248.296043395996
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -179.6107895262741,
      rawArrow: {
        points:
          "\n            1340.383966064453,1243.296043395996\n            1345.383966064453,1248.296043395996\n            1340.383966064453,1253.296043395996\n          ",
        transform: "rotate(-179.6107895262741, 1345.383966064453, 1248.296043395996)"
      }
    },
    {
      sourceEdgeId: "c151da48-a38b-4b7c-a381-2b13d06bac46",
      domOrder: 15,
      zIndex: 15,
      sourceNodeId: "3e80ddec-93fc-4732-8e32-ec2d48a5956f",
      targetNodeId: "48e4d8e3-8e35-4e2b-9d9a-3bd6309ce560",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M825,1539.0890020931467 L990,1539.0890020931467",
      sourcePoint: {
        x: 825,
        y: 1539.0890020931467
      },
      targetPoint: {
        x: 990,
        y: 1539.0890020931467
      },
      waypoints: [
        {
          x: 825,
          y: 1539.0890020931467
        },
        {
          x: 990,
          y: 1539.0890020931467
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            985,1534.0890020931467\n            990,1539.0890020931467\n            985,1544.0890020931467\n          ",
        transform: "rotate(0, 990, 1539.0890020931467)"
      }
    },
    {
      sourceEdgeId: "c6681b91-c6a2-4c8c-88c6-b165f5c1de36",
      domOrder: 16,
      zIndex: 16,
      sourceNodeId: "e608c4e1-a9bf-4675-be19-e67f7bde4f98",
      targetNodeId: "372d8cce-6e53-4d81-a7d5-5337d826b75b",
      sourcePort: "right",
      targetPort: "left",
      svgPath:
        "M1131.368246459961,1402.2546951293946 L1200.376106262207,1402.2546951293946 Q1208.376106262207,1402.2546951293946 1208.376106262207,1394.2546951293946 L1208.376106262207,1256.296043395996 Q1208.376106262207,1248.296043395996 1216.376106262207,1248.296043395996 L1285.383966064453,1248.296043395996",
      sourcePoint: {
        x: 1131.368246459961,
        y: 1402.2546951293946
      },
      targetPoint: {
        x: 1285.383966064453,
        y: 1248.296043395996
      },
      waypoints: [
        {
          x: 1131.368246459961,
          y: 1402.2546951293946
        },
        {
          x: 1200.376106262207,
          y: 1402.2546951293946
        },
        {
          x: 1208.376106262207,
          y: 1402.2546951293946
        },
        {
          x: 1208.376106262207,
          y: 1394.2546951293946
        },
        {
          x: 1208.376106262207,
          y: 1256.296043395996
        },
        {
          x: 1208.376106262207,
          y: 1248.296043395996
        },
        {
          x: 1216.376106262207,
          y: 1248.296043395996
        },
        {
          x: 1285.383966064453,
          y: 1248.296043395996
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            1280.383966064453,1243.296043395996\n            1285.383966064453,1248.296043395996\n            1280.383966064453,1253.296043395996\n          ",
        transform: "rotate(0, 1285.383966064453, 1248.296043395996)"
      }
    },
    {
      sourceEdgeId: "dfdcf824-5fd1-487f-82d1-15d995c196c3",
      domOrder: 17,
      zIndex: 17,
      sourceNodeId: "48e4d8e3-8e35-4e2b-9d9a-3bd6309ce560",
      targetNodeId: "b90b246d-aeeb-4e30-aa60-7929ecace81d",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M1050,1539.0890020931467 L1390,1539.0890020931467",
      sourcePoint: {
        x: 1050,
        y: 1539.0890020931467
      },
      targetPoint: {
        x: 1390,
        y: 1539.0890020931467
      },
      waypoints: [
        {
          x: 1050,
          y: 1539.0890020931467
        },
        {
          x: 1390,
          y: 1539.0890020931467
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            1385,1534.0890020931467\n            1390,1539.0890020931467\n            1385,1544.0890020931467\n          ",
        transform: "rotate(0, 1390, 1539.0890020931467)"
      }
    },
    {
      sourceEdgeId: "e6c4c782-bffb-4109-b42d-494735c77a9d",
      domOrder: 18,
      zIndex: 18,
      sourceNodeId: "3afa58d4-2389-47e3-af6d-197aa176ca4a",
      targetNodeId: "372d8cce-6e53-4d81-a7d5-5337d826b75b",
      sourcePort: "left",
      targetPort: "right",
      svgPath:
        "M1550.5156738281253,1399.0558364868166 L1455.9498199462892,1399.0558364868166 Q1447.9498199462892,1399.0558364868166 1447.9498199462892,1391.0558364868166 L1447.9498199462892,1256.296043395996 Q1447.9498199462892,1248.296043395996 1439.9498199462892,1248.296043395996 L1345.383966064453,1248.296043395996",
      sourcePoint: {
        x: 1550.5156738281253,
        y: 1399.0558364868166
      },
      targetPoint: {
        x: 1345.383966064453,
        y: 1248.296043395996
      },
      waypoints: [
        {
          x: 1550.5156738281253,
          y: 1399.0558364868166
        },
        {
          x: 1455.9498199462892,
          y: 1399.0558364868166
        },
        {
          x: 1447.9498199462892,
          y: 1399.0558364868166
        },
        {
          x: 1447.9498199462892,
          y: 1391.0558364868166
        },
        {
          x: 1447.9498199462892,
          y: 1256.296043395996
        },
        {
          x: 1447.9498199462892,
          y: 1248.296043395996
        },
        {
          x: 1439.9498199462892,
          y: 1248.296043395996
        },
        {
          x: 1345.383966064453,
          y: 1248.296043395996
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points:
          "\n            1340.383966064453,1243.296043395996\n            1345.383966064453,1248.296043395996\n            1340.383966064453,1253.296043395996\n          ",
        transform: "rotate(180, 1345.383966064453, 1248.296043395996)"
      }
    },
    {
      sourceEdgeId: "f0dda15b-5787-4dc7-a48f-67e600c73fcd",
      domOrder: 19,
      zIndex: 19,
      sourceNodeId: "04926feb-4622-439a-b228-cfc9e415e98e",
      targetNodeId: "ed57ef8a-ac66-4a30-a586-09a0f3c4406a",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M825,1742.8609821992764 L990,1742.8609821992764",
      sourcePoint: {
        x: 825,
        y: 1742.8609821992764
      },
      targetPoint: {
        x: 990,
        y: 1742.8609821992764
      },
      waypoints: [
        {
          x: 825,
          y: 1742.8609821992764
        },
        {
          x: 990,
          y: 1742.8609821992764
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            985,1737.8609821992764\n            990,1742.8609821992764\n            985,1747.8609821992764\n          ",
        transform: "rotate(0, 990, 1742.8609821992764)"
      }
    },
    {
      sourceEdgeId: "f3886e54-ea74-4f39-ab63-f1f8c5b622a0",
      domOrder: 20,
      zIndex: 20,
      sourceNodeId: "ddbce9f8-63fd-43a9-a133-86dda6fed0e9",
      targetNodeId: "372d8cce-6e53-4d81-a7d5-5337d826b75b",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M1050.4061098255538,1249.127717584708 L1285.383966064453,1248.296043395996",
      sourcePoint: {
        x: 1050.4061098255538,
        y: 1249.127717584708
      },
      targetPoint: {
        x: 1285.383966064453,
        y: 1248.296043395996
      },
      waypoints: [
        {
          x: 1050.4061098255538,
          y: 1249.127717584708
        },
        {
          x: 1285.383966064453,
          y: 1248.296043395996
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -0.20279026597827726,
      rawArrow: {
        points:
          "\n            1280.383966064453,1243.296043395996\n            1285.383966064453,1248.296043395996\n            1280.383966064453,1253.296043395996\n          ",
        transform: "rotate(-0.20279026597827726, 1285.383966064453, 1248.296043395996)"
      }
    },
    {
      sourceEdgeId: "f3d48e53-a3c0-4969-a934-4c9a85641425",
      domOrder: 21,
      zIndex: 21,
      sourceNodeId: "0c2d3032-4148-4e80-bae8-9cfb63f6ec6e",
      targetNodeId: "a9812863-e435-4e22-8ead-21024b258441",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M1050,1048.0609581644771 L1285.383966064453,1048.0609581644771",
      sourcePoint: {
        x: 1050,
        y: 1048.0609581644771
      },
      targetPoint: {
        x: 1285.383966064453,
        y: 1048.0609581644771
      },
      waypoints: [
        {
          x: 1050,
          y: 1048.0609581644771
        },
        {
          x: 1285.383966064453,
          y: 1048.0609581644771
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            1280.383966064453,1043.0609581644771\n            1285.383966064453,1048.0609581644771\n            1280.383966064453,1053.0609581644771\n          ",
        transform: "rotate(0, 1285.383966064453, 1048.0609581644771)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_cognito_user_pool" "cognito_user_pool" {\n  tags = merge(var.tags, {})\n  name = "serverless_pool"\n}\n\nresource "aws_route53_zone" "route53_zone" {\n  tags = merge(var.tags, {})\n  name = "subdomain.domain.com"\n}\n\nresource "aws_cloudfront_origin_access_identity" "origin_access_identity" {\n  comment = "Example OAI for S3 website"\n}\n\nresource "aws_s3_bucket" "website_bucket" {\n  bucket = "example-website-bucket"\n\n  tags = {\n    Name = "example-website-bucket"\n  }\n}\n\nresource "aws_ses_email_identity" "ses_email_identity" {\n  email = "noreply@domain.com"\n}\n\nresource "aws_s3_object" "index" {\n  tags         = merge(var.tags, {})\n  source       = "path/to/index.html"\n  key          = "index.html"\n  content_type = "text/html"\n  bucket       = aws_s3_bucket.website_bucket.id\n  acl          = "public-read"\n}\n\nresource "aws_dynamodb_global_table" "dynamodb_global_table" {\n  name = "serverless"\n\n  replica {\n    region_name = "region.region.name"\n  }\n\n  replica {\n    region_name = "region.region.name"\n  }\n}\n\nresource "aws_s3_bucket" "public_content" {\n  tags   = merge(var.tags, {})\n  bucket = "public_content"\n}\n\nresource "aws_cloudfront_distribution" "website_distribution" {\n  is_ipv6_enabled     = true\n  enabled             = true\n  default_root_object = "index.html"\n  comment             = "Example website distribution"\n\n  aliases = [\n    "www.example.com",\n  ]\n\n  default_cache_behavior {\n    viewer_protocol_policy = "redirect-to-https"\n    target_origin_id       = "S3-example-website"\n    min_ttl                = 0\n    max_ttl                = 86400\n    default_ttl            = 3600\n\n    allowed_methods = [\n      "GET",\n      "HEAD",\n    ]\n\n    cached_methods = [\n      "GET",\n      "HEAD",\n    ]\n\n    forwarded_values {\n      query_string = false\n\n      cookies {\n        forward = "none"\n      }\n    }\n  }\n\n  origin {\n    origin_id   = "S3-example-website"\n    domain_name = aws_s3_bucket.website_bucket.bucket_regional_domain_name\n\n    s3_origin_config {\n      origin_access_identity = aws_cloudfront_origin_access_identity.origin_access_identity.cloudfront_access_identity_path\n    }\n  }\n\n  restrictions {\n    geo_restriction {\n      restriction_type = "none"\n    }\n  }\n\n  tags = {\n    Name = "example-website-distribution"\n  }\n\n  viewer_certificate {\n    ssl_support_method       = "sni-only"\n    minimum_protocol_version = "TLSv1.2_2021"\n    acm_certificate_arn      = "arn:aws:acm:us-east-1:123456789012:certificate/your-acm-certificate-id"\n  }\n}\n\nresource "aws_s3_bucket_acl" "s3_bucket_acl" {\n  bucket = aws_s3_bucket.website_bucket.id\n  acl    = "public-read"\n}\n\nresource "aws_s3_bucket_versioning" "s3_bucket_versioning" {\n  bucket = aws_s3_bucket.website_bucket.id\n\n  versioning_configuration {\n    status = "Enabled"\n  }\n}\n\nresource "aws_lambda_function" "lambda_function3" {\n  tags          = merge(var.tags, {})\n  runtime       = "nodejs18.x"\n  role          = aws_iam_role.iam_role.arn\n  handler       = "filename.js"\n  function_name = "job3"\n  filename      = "payload.zip"\n}\n\nresource "aws_s3_object" "error" {\n  tags         = merge(var.tags, {})\n  source       = "path/to/error.html"\n  key          = "error.html"\n  content_type = "text/html"\n  bucket       = aws_s3_bucket.website_bucket.id\n  acl          = "public-read"\n}\n\nresource "aws_s3_bucket_website_configuration" "s3_bucket_website_configuration" {\n  bucket = aws_s3_bucket.website_bucket.id\n\n  error_document {\n    key = "error.html"\n  }\n\n  index_document {\n    suffix = "index.html"\n  }\n}\n\nresource "aws_route53_record" "www" {\n  zone_id = "Z1234567890"\n  type    = "A"\n  name    = "www.example.com"\n\n  alias {\n    zone_id                = aws_cloudfront_distribution.website_distribution.hosted_zone_id\n    name                   = aws_cloudfront_distribution.website_distribution.domain_name\n    evaluate_target_health = false\n  }\n}\n\nresource "aws_apigatewayv2_api" "apigwv2_api" {\n  tags          = merge(var.tags, {})\n  protocol_type = "HTTP"\n  name          = "serverless_gw"\n}\n\nresource "aws_lambda_function" "lambda_function2" {\n  tags          = merge(var.tags, {})\n  runtime       = "nodejs18.x"\n  role          = aws_iam_role.iam_role.arn\n  handler       = "filename.js"\n  function_name = "job2"\n  filename      = "payload.zip"\n}\n\nresource "aws_iam_role" "iam_role" {\n  tags = merge(var.tags, {})\n  assume_role_policy = jsonencode({\n    "Version" : "2012-10-17",\n    "Statement" : [\n      {\n        "Effect" : "Allow",\n        "Principal" : {\n          "Service" : "lambda.amazonaws.com"\n        },\n        "Action" : "sts:AssumeRole"\n      }\n    ]\n  })\n}\n\nresource "aws_lambda_function" "lambda_function" {\n  tags          = merge(var.tags, {})\n  runtime       = "nodejs18.x"\n  role          = aws_iam_role.iam_role.arn\n  handler       = "handler.js"\n  function_name = "job1"\n  filename      = "payload.zip"\n}\n\n',
        sha256: "a5550df84172b1c3835afb9d3b53f5e13d176b80ff2c12abfd9077ee69d022f2",
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
        code: 'terraform {\n  required_providers {\n    aws = {\n      version = "= 5.85.0"\n    }\n  }\n}\n\nprovider "aws" {\n  region = "us-east-1"\n}\n',
        sha256: "9cccfd1a30be2a078ff3693fb071df91c06b21de0b4dccebb2d9168d8ee92039",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "3a8408e9-b054-48d6-8a5e-b11c7b85dead"\n  env      = "Production"\n}\n',
        sha256: "9fb7e8aeb92f5328a451a50c46722f0097c54497814d7c72025aeec4b8fb6dc9",
        includeInWorkspace: false
      },
      {
        fileName: "variables.tf",
        code: 'variable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    archuuid = "45191152-00cd-443d-a7f5-9a7295120e48"\n    env      = "Development"\n  }\n}\n\n',
        sha256: "b67164427570bc075abc4b06dc1d74d00f50cb6bd7c3c30f7ce87056697f7939",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'variable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    env      = "Development"\n  }\n}\n\n',
          sha256: "7d59ebde1465c3fa99ec58fd23368b51196bf9a91e4c06942f5cef931fa20e9e",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archuuid = "45191152-00cd-443d-a7f5-9a7295120e48"\n',
              occurrenceCount: 1
            }
          ]
        }
      }
    ],
    resourceAddresses: [
      "aws_cognito_user_pool.cognito_user_pool",
      "aws_route53_zone.route53_zone",
      "aws_cloudfront_origin_access_identity.origin_access_identity",
      "aws_s3_bucket.website_bucket",
      "aws_ses_email_identity.ses_email_identity",
      "aws_s3_object.index",
      "aws_dynamodb_global_table.dynamodb_global_table",
      "aws_s3_bucket.public_content",
      "aws_cloudfront_distribution.website_distribution",
      "aws_s3_bucket_acl.s3_bucket_acl",
      "aws_s3_bucket_versioning.s3_bucket_versioning",
      "aws_lambda_function.lambda_function3",
      "aws_s3_object.error",
      "aws_s3_bucket_website_configuration.s3_bucket_website_configuration",
      "aws_route53_record.www",
      "aws_apigatewayv2_api.apigwv2_api",
      "aws_lambda_function.lambda_function2",
      "aws_iam_role.iam_role",
      "aws_lambda_function.lambda_function"
    ]
  },
  bindings: {
    "a7275a97-1cba-448c-b797-76cf925ac3d5": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "04926feb-4622-439a-b228-cfc9e415e98e": {
      kind: "resource",
      address: "aws_apigatewayv2_api.apigwv2_api",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "0c2d3032-4148-4e80-bae8-9cfb63f6ec6e": {
      kind: "resource",
      address: "aws_route53_record.www",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "372d8cce-6e53-4d81-a7d5-5337d826b75b": {
      kind: "resource",
      address: "aws_s3_bucket.website_bucket",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "3afa58d4-2389-47e3-af6d-197aa176ca4a": {
      kind: "resource",
      address: "aws_s3_bucket_versioning.s3_bucket_versioning",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "3e80ddec-93fc-4732-8e32-ec2d48a5956f": {
      kind: "resource",
      address: "aws_cognito_user_pool.cognito_user_pool",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "46b1dd16-edd2-49f2-b3b6-b228d6838314": {
      kind: "resource",
      address: "aws_iam_role.iam_role",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "48e4d8e3-8e35-4e2b-9d9a-3bd6309ce560": {
      kind: "resource",
      address: "aws_lambda_function.lambda_function",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "58851a9c-d1ed-4576-8636-e8c2de255585": {
      kind: "resource",
      address: "aws_s3_bucket.public_content",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "913fcb3c-08dd-487b-9f34-7a0e3aded6b6": {
      kind: "resource",
      address: "aws_dynamodb_global_table.dynamodb_global_table",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "96f0a15e-0305-405a-b9e9-eee46aed63e0": {
      kind: "resource",
      address: "aws_s3_object.error",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "97ab46f5-02c0-4d3e-8d23-73e7cf4d9936": {
      kind: "resource",
      address: "aws_route53_zone.route53_zone",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "9c5f4598-f184-4890-bdd0-1899be4e8cf7": {
      kind: "resource",
      address: "aws_s3_object.index",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "a9812863-e435-4e22-8ead-21024b258441": {
      kind: "resource",
      address: "aws_cloudfront_distribution.website_distribution",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "b90b246d-aeeb-4e30-aa60-7929ecace81d": {
      kind: "resource",
      address: "aws_ses_email_identity.ses_email_identity",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "ceb49680-3cb4-41d8-9e9d-34f674391bb4": {
      kind: "resource",
      address: "aws_lambda_function.lambda_function3",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "d0fc5fc8-4e65-463c-96a9-abb6c4abd050": {
      kind: "resource",
      address: "aws_cloudfront_origin_access_identity.origin_access_identity",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "ddbce9f8-63fd-43a9-a133-86dda6fed0e9": {
      kind: "resource",
      address: "aws_s3_bucket_website_configuration.s3_bucket_website_configuration",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "e608c4e1-a9bf-4675-be19-e67f7bde4f98": {
      kind: "resource",
      address: "aws_s3_bucket_acl.s3_bucket_acl",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "ed57ef8a-ac66-4a30-a586-09a0f3c4406a": {
      kind: "resource",
      address: "aws_lambda_function.lambda_function2",
      fileName: "main.tf",
      addressMapping: "exact-title"
    },
    "675bd894-0771-422e-947d-b7c25fad993f": {
      kind: "presentation",
      catalogId: "design-user-client",
      aliasOf: null,
      style: null
    }
  }
});
