import { defineCapturedBrainboardTemplate } from "./define-source.ts";

export const trainingAwsOnboardingSource = defineCapturedBrainboardTemplate({
  id: "brainboard-training-aws-onboarding",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "d71155af-5339-44f1-ae11-2bcd29411c2d",
    sourceUrl: "https://app.brainboard.co/templates/d71155af-5339-44f1-ae11-2bcd29411c2d",
    cloneArchitectureId: "b6c225e0-102b-4b88-b046-fb7d88c56f2f",
    downloads: 19855,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS onboarding",
  description: null,
  provider: "aws",
  viewport: {
    x: -1313.64,
    y: -798.37,
    width: 5622.451612903225,
    height: 3076.730465949821
  },
  nodes: [
    {
      sourceNodeId: "c7cf2dc9-4cc9-481f-b53f-9904151e2630",
      domOrder: 0,
      label: "EKS Cluster SG",
      position: {
        x: 795,
        y: 605
      },
      size: {
        width: 1180,
        height: 700
      },
      parentSourceNodeId: "3a7c40fe-8ca2-429b-a762-605aed1a0a33",
      zIndex: 0,
      rawTransform: "translate(795, 605), rotate(0 590 350)",
      rotation: 0,
      rawResourceType: "aws_security_group"
    },
    {
      sourceNodeId: "a9e7e1c4-6179-45d2-b7bc-885e61755ac2",
      domOrder: 1,
      label: "US East (N. Virginia)",
      position: {
        x: 290,
        y: 220
      },
      size: {
        width: 2095,
        height: 1210
      },
      parentSourceNodeId: null,
      zIndex: 1,
      rawTransform: "translate(290, 220), rotate(0 1047.5 605)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "3a7c40fe-8ca2-429b-a762-605aed1a0a33",
      domOrder: 2,
      label: "EKS VPC",
      position: {
        x: 760,
        y: 315
      },
      size: {
        width: 1245,
        height: 1035
      },
      parentSourceNodeId: "a9e7e1c4-6179-45d2-b7bc-885e61755ac2",
      zIndex: 2,
      rawTransform: "translate(760, 315), rotate(0 622.5 517.5)",
      rotation: 0,
      rawResourceType: "aws_vpc"
    },
    {
      sourceNodeId: "2c258322-661f-471b-b0e6-85d49fd8e46b",
      domOrder: 3,
      label: "AZ us-east-1b",
      position: {
        x: 1610,
        y: 745
      },
      size: {
        width: 300,
        height: 480
      },
      parentSourceNodeId: "c7cf2dc9-4cc9-481f-b53f-9904151e2630",
      zIndex: 3,
      rawTransform: "translate(1610, 745), rotate(0 150 240)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "dc0a5b25-308f-4bc2-871b-d5083cf2d0e2",
      domOrder: 4,
      label: "AZ us-east-1a",
      position: {
        x: 870,
        y: 745
      },
      size: {
        width: 300,
        height: 480
      },
      parentSourceNodeId: "c7cf2dc9-4cc9-481f-b53f-9904151e2630",
      zIndex: 4,
      rawTransform: "translate(870, 745), rotate(0 150 240)",
      rotation: 0,
      rawResourceType: "availability_zone"
    },
    {
      sourceNodeId: "7fc5471e-298b-4fe8-b8dd-61c9e12374a6",
      domOrder: 5,
      label: "Public Subnet A",
      position: {
        x: 890,
        y: 870
      },
      size: {
        width: 250,
        height: 260
      },
      parentSourceNodeId: "dc0a5b25-308f-4bc2-871b-d5083cf2d0e2",
      zIndex: 5,
      rawTransform: "translate(890, 870), rotate(0 125 130)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "9647ef8e-ba33-4608-be6b-79271f103fe3",
      domOrder: 6,
      label: "Public Subnet B",
      position: {
        x: 1630,
        y: 870
      },
      size: {
        width: 255,
        height: 260
      },
      parentSourceNodeId: "2c258322-661f-471b-b0e6-85d49fd8e46b",
      zIndex: 6,
      rawTransform: "translate(1630, 870), rotate(0 127.5 130)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "1deba4c9-a88f-4b0e-995a-2e5dc304d167",
      domOrder: 7,
      label: "ECR 읽기 권한 연결",
      position: {
        x: 470,
        y: 485
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a9e7e1c4-6179-45d2-b7bc-885e61755ac2",
      zIndex: 7,
      rawTransform: "translate(470, 485), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_role_policy_attachment"
    },
    {
      sourceNodeId: "548abc5b-922e-4cf6-95ea-4c34c2fe5459",
      domOrder: 8,
      label: "EKS Cluster IAM Role",
      position: {
        x: 2120,
        y: 485
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a9e7e1c4-6179-45d2-b7bc-885e61755ac2",
      zIndex: 8,
      rawTransform: "translate(2120, 485), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_role"
    },
    {
      sourceNodeId: "57b6aa35-9b3d-46bd-967d-07493b8aaa5e",
      domOrder: 9,
      label: "CNI 권한 연결",
      position: {
        x: 470,
        y: 315
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a9e7e1c4-6179-45d2-b7bc-885e61755ac2",
      zIndex: 9,
      rawTransform: "translate(470, 315), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_role_policy_attachment"
    },
    {
      sourceNodeId: "85d344cc-b877-4e92-a4fc-6ac1a7224135",
      domOrder: 10,
      label: "Worker Node IAM Role",
      position: {
        x: 670,
        y: 485
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a9e7e1c4-6179-45d2-b7bc-885e61755ac2",
      zIndex: 10,
      rawTransform: "translate(670, 485), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_role"
    },
    {
      sourceNodeId: "8a4bb82f-8ca2-4314-aa88-a7895bbe985d",
      domOrder: 11,
      label: "Worker Node 권한 연결",
      position: {
        x: 470,
        y: 665
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a9e7e1c4-6179-45d2-b7bc-885e61755ac2",
      zIndex: 11,
      rawTransform: "translate(470, 665), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_role_policy_attachment"
    },
    {
      sourceNodeId: "b1dff648-3242-4a8f-bde8-5a30459b5d09",
      domOrder: 12,
      label: "VPC Controller 권한 연결",
      position: {
        x: 2210,
        y: 315
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a9e7e1c4-6179-45d2-b7bc-885e61755ac2",
      zIndex: 12,
      rawTransform: "translate(2210, 315), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_role_policy_attachment"
    },
    {
      sourceNodeId: "bb5eb85d-fe0a-4239-affd-f34192d53c79",
      domOrder: 13,
      label: "EKS Cluster 권한 연결",
      position: {
        x: 2210,
        y: 645
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "a9e7e1c4-6179-45d2-b7bc-885e61755ac2",
      zIndex: 13,
      rawTransform: "translate(2210, 645), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_role_policy_attachment"
    },
    {
      sourceNodeId: "6c68b992-6afd-4fc8-b37c-45da1f674b4c",
      domOrder: 14,
      label: "Internet Gateway",
      position: {
        x: 1380,
        y: 285
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "3a7c40fe-8ca2-429b-a762-605aed1a0a33",
      zIndex: 14,
      rawTransform: "translate(1380, 285), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_internet_gateway"
    },
    {
      sourceNodeId: "f76286ac-796e-463a-b5a7-1fd6bfdc6a7a",
      domOrder: 15,
      label: "Public Route Table",
      position: {
        x: 1380,
        y: 485
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "3a7c40fe-8ca2-429b-a762-605aed1a0a33",
      zIndex: 15,
      rawTransform: "translate(1380, 485), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table"
    },
    {
      sourceNodeId: "0c5bbe79-b35c-46f0-8281-f9e02e95225a",
      domOrder: 16,
      label: "EKS Cluster",
      position: {
        x: 1475,
        y: 875
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "3a7c40fe-8ca2-429b-a762-605aed1a0a33",
      zIndex: 16,
      rawTransform: "translate(1475, 875), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_eks_cluster"
    },
    {
      sourceNodeId: "22a6d153-9c4c-49d4-a5b8-3c2fbb29162b",
      domOrder: 17,
      label: "EKS Node Group",
      position: {
        x: 1235,
        y: 875
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "3a7c40fe-8ca2-429b-a762-605aed1a0a33",
      zIndex: 17,
      rawTransform: "translate(1235, 875), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_eks_node_group"
    },
    {
      sourceNodeId: "78653b46-a7fb-490f-a677-70663c22cc5c",
      domOrder: 18,
      label: "Cluster API HTTPS 허용",
      position: {
        x: 1370,
        y: 1210
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "3a7c40fe-8ca2-429b-a762-605aed1a0a33",
      zIndex: 18,
      rawTransform: "translate(1370, 1210), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_security_group_rule"
    },
    {
      sourceNodeId: "ea26b075-2ec2-4686-9450-92cebdeeee7b",
      domOrder: 19,
      label: "Public Route 연결 A",
      position: {
        x: 980,
        y: 945
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "7fc5471e-298b-4fe8-b8dd-61c9e12374a6",
      zIndex: 19,
      rawTransform: "translate(980, 945), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table_association"
    },
    {
      sourceNodeId: "ee8367ce-4b1b-4b45-9fca-eeec80c852dd",
      domOrder: 20,
      label: "Public Route 연결 B",
      position: {
        x: 1730,
        y: 940
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "9647ef8e-ba33-4608-be6b-79271f103fe3",
      zIndex: 20,
      rawTransform: "translate(1730, 940), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_route_table_association"
    },
    {
      sourceNodeId: "e663734e-34c4-4211-825d-f7844e11c3e6",
      domOrder: 21,
      label: "Internet",
      position: {
        x: 1380,
        y: 30
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: null,
      zIndex: 21,
      rawTransform: "translate(1380, 30), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "brainboard_icon"
    }
  ],
  edges: [
    {
      sourceEdgeId: "053bafd1-9b59-4329-adb9-6943b1cb2af1",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "b1dff648-3242-4a8f-bde8-5a30459b5d09",
      targetNodeId: "548abc5b-922e-4cf6-95ea-4c34c2fe5459",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M2240,375 L2240,422 Q2240,430 2232,430 L2158,430 Q2150,430 2150,438 L2150,485",
      sourcePoint: {
        x: 2240,
        y: 375
      },
      targetPoint: {
        x: 2150,
        y: 485
      },
      waypoints: [
        {
          x: 2240,
          y: 375
        },
        {
          x: 2240,
          y: 422
        },
        {
          x: 2240,
          y: 430
        },
        {
          x: 2232,
          y: 430
        },
        {
          x: 2158,
          y: 430
        },
        {
          x: 2150,
          y: 430
        },
        {
          x: 2150,
          y: 438
        },
        {
          x: 2150,
          y: 485
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            2145,480\n            2150,485\n            2145,490\n          ",
        transform: "rotate(90, 2150, 485)"
      }
    },
    {
      sourceEdgeId: "07f76fd2-c669-48a0-a1f2-cf18a16d08e2",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "8a4bb82f-8ca2-4314-aa88-a7895bbe985d",
      targetNodeId: "85d344cc-b877-4e92-a4fc-6ac1a7224135",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M530,695 L592,695 Q600,695 600,687 L600,523 Q600,515 608,515 L670,515",
      sourcePoint: {
        x: 530,
        y: 695
      },
      targetPoint: {
        x: 670,
        y: 515
      },
      waypoints: [
        {
          x: 530,
          y: 695
        },
        {
          x: 592,
          y: 695
        },
        {
          x: 600,
          y: 695
        },
        {
          x: 600,
          y: 687
        },
        {
          x: 600,
          y: 523
        },
        {
          x: 600,
          y: 515
        },
        {
          x: 608,
          y: 515
        },
        {
          x: 670,
          y: 515
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            665,510\n            670,515\n            665,520\n          ",
        transform: "rotate(0, 670, 515)"
      }
    },
    {
      sourceEdgeId: "2359b3b0-ea92-40cf-b1e2-9f0625a65c01",
      domOrder: 2,
      zIndex: 2,
      sourceNodeId: "22a6d153-9c4c-49d4-a5b8-3c2fbb29162b",
      targetNodeId: "0c5bbe79-b35c-46f0-8281-f9e02e95225a",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M1295,905 L1475,905",
      sourcePoint: {
        x: 1295,
        y: 905
      },
      targetPoint: {
        x: 1475,
        y: 905
      },
      waypoints: [
        {
          x: 1295,
          y: 905
        },
        {
          x: 1475,
          y: 905
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            1470,900\n            1475,905\n            1470,910\n          ",
        transform: "rotate(0, 1475, 905)"
      }
    },
    {
      sourceEdgeId: "366eae70-2f83-4424-abe8-3edf632ab5e1",
      domOrder: 3,
      zIndex: 3,
      sourceNodeId: "0c5bbe79-b35c-46f0-8281-f9e02e95225a",
      targetNodeId: "548abc5b-922e-4cf6-95ea-4c34c2fe5459",
      sourcePort: "top",
      targetPort: "left",
      svgPath: "M1505,875 L1505,523 Q1505,515 1513,515 L2120,515",
      sourcePoint: {
        x: 1505,
        y: 875
      },
      targetPoint: {
        x: 2120,
        y: 515
      },
      waypoints: [
        {
          x: 1505,
          y: 875
        },
        {
          x: 1505,
          y: 523
        },
        {
          x: 1505,
          y: 515
        },
        {
          x: 1513,
          y: 515
        },
        {
          x: 2120,
          y: 515
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            2115,510\n            2120,515\n            2115,520\n          ",
        transform: "rotate(0, 2120, 515)"
      }
    },
    {
      sourceEdgeId: "3d8d3fac-1a75-4de9-8755-2739a6b1a669",
      domOrder: 4,
      zIndex: 4,
      sourceNodeId: "bb5eb85d-fe0a-4239-affd-f34192d53c79",
      targetNodeId: "548abc5b-922e-4cf6-95ea-4c34c2fe5459",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M2240,645 L2240,603 Q2240,595 2232,595 L2158,595 Q2150,595 2150,587 L2150,545",
      sourcePoint: {
        x: 2240,
        y: 645
      },
      targetPoint: {
        x: 2150,
        y: 545
      },
      waypoints: [
        {
          x: 2240,
          y: 645
        },
        {
          x: 2240,
          y: 603
        },
        {
          x: 2240,
          y: 595
        },
        {
          x: 2232,
          y: 595
        },
        {
          x: 2158,
          y: 595
        },
        {
          x: 2150,
          y: 595
        },
        {
          x: 2150,
          y: 587
        },
        {
          x: 2150,
          y: 545
        }
      ],
      arrowDirection: "none",
      arrowAngle: 0,
      rawArrow: null
    },
    {
      sourceEdgeId: "3e8f2d11-90ff-46ed-948a-0c3b6342f24a",
      domOrder: 5,
      zIndex: 5,
      sourceNodeId: "ee8367ce-4b1b-4b45-9fca-eeec80c852dd",
      targetNodeId: "f76286ac-796e-463a-b5a7-1fd6bfdc6a7a",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath:
        "M1760,940 L1760,671.501301035246 Q1760,663.501301035246 1752,663.501301035246 L1418,663.501301035246 Q1410,663.501301035246 1410,655.501301035246 L1410,545",
      sourcePoint: {
        x: 1760,
        y: 940
      },
      targetPoint: {
        x: 1410,
        y: 545
      },
      waypoints: [
        {
          x: 1760,
          y: 940
        },
        {
          x: 1760,
          y: 671.501301035246
        },
        {
          x: 1760,
          y: 663.501301035246
        },
        {
          x: 1752,
          y: 663.501301035246
        },
        {
          x: 1418,
          y: 663.501301035246
        },
        {
          x: 1410,
          y: 663.501301035246
        },
        {
          x: 1410,
          y: 655.501301035246
        },
        {
          x: 1410,
          y: 545
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            1405,540\n            1410,545\n            1405,550\n          ",
        transform: "rotate(-90, 1410, 545)"
      }
    },
    {
      sourceEdgeId: "423e0456-611e-430f-b92d-740a0668e776",
      domOrder: 6,
      zIndex: 6,
      sourceNodeId: "22a6d153-9c4c-49d4-a5b8-3c2fbb29162b",
      targetNodeId: "85d344cc-b877-4e92-a4fc-6ac1a7224135",
      sourcePort: "top",
      targetPort: "right",
      svgPath: "M1265,875 L1265,523 Q1265,515 1257,515 L730,515",
      sourcePoint: {
        x: 1265,
        y: 875
      },
      targetPoint: {
        x: 730,
        y: 515
      },
      waypoints: [
        {
          x: 1265,
          y: 875
        },
        {
          x: 1265,
          y: 523
        },
        {
          x: 1265,
          y: 515
        },
        {
          x: 1257,
          y: 515
        },
        {
          x: 730,
          y: 515
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            725,510\n            730,515\n            725,520\n          ",
        transform: "rotate(180, 730, 515)"
      }
    },
    {
      sourceEdgeId: "4872d155-ca08-4c0f-aabd-c1c7cf992543",
      domOrder: 7,
      zIndex: 7,
      sourceNodeId: "22a6d153-9c4c-49d4-a5b8-3c2fbb29162b",
      targetNodeId: "7fc5471e-298b-4fe8-b8dd-61c9e12374a6",
      sourcePort: "bottom",
      targetPort: "right",
      svgPath: "M1265,935 L1265,992 Q1265,1000 1257,1000 L1140,1000",
      sourcePoint: {
        x: 1265,
        y: 935
      },
      targetPoint: {
        x: 1140,
        y: 1000
      },
      waypoints: [
        {
          x: 1265,
          y: 935
        },
        {
          x: 1265,
          y: 992
        },
        {
          x: 1265,
          y: 1000
        },
        {
          x: 1257,
          y: 1000
        },
        {
          x: 1140,
          y: 1000
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            1135,995\n            1140,1000\n            1135,1005\n          ",
        transform: "rotate(180, 1140, 1000)"
      }
    },
    {
      sourceEdgeId: "4f5bb7e8-8336-4701-81ef-197171a464d1",
      domOrder: 8,
      zIndex: 8,
      sourceNodeId: "0c5bbe79-b35c-46f0-8281-f9e02e95225a",
      targetNodeId: "9647ef8e-ba33-4608-be6b-79271f103fe3",
      sourcePort: "bottom",
      targetPort: "left",
      svgPath: "M1505,935 L1505,992 Q1505,1000 1513,1000 L1630,1000",
      sourcePoint: {
        x: 1505,
        y: 935
      },
      targetPoint: {
        x: 1630,
        y: 1000
      },
      waypoints: [
        {
          x: 1505,
          y: 935
        },
        {
          x: 1505,
          y: 992
        },
        {
          x: 1505,
          y: 1000
        },
        {
          x: 1513,
          y: 1000
        },
        {
          x: 1630,
          y: 1000
        }
      ],
      arrowDirection: "none",
      arrowAngle: 0,
      rawArrow: null
    },
    {
      sourceEdgeId: "4fa5775f-4e74-4e20-be4c-75825e161125",
      domOrder: 9,
      zIndex: 9,
      sourceNodeId: "1deba4c9-a88f-4b0e-995a-2e5dc304d167",
      targetNodeId: "85d344cc-b877-4e92-a4fc-6ac1a7224135",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M530,515 L670,515",
      sourcePoint: {
        x: 530,
        y: 515
      },
      targetPoint: {
        x: 670,
        y: 515
      },
      waypoints: [
        {
          x: 530,
          y: 515
        },
        {
          x: 670,
          y: 515
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            665,510\n            670,515\n            665,520\n          ",
        transform: "rotate(0, 670, 515)"
      }
    },
    {
      sourceEdgeId: "73b04e33-2ceb-4b96-a2cf-21f1b6645506",
      domOrder: 10,
      zIndex: 10,
      sourceNodeId: "ea26b075-2ec2-4686-9450-92cebdeeee7b",
      targetNodeId: "f76286ac-796e-463a-b5a7-1fd6bfdc6a7a",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath:
        "M1010,945 L1010,672.5243386243386 Q1010,664.5243386243386 1018,664.5243386243386 L1402,664.5243386243386 Q1410,664.5243386243386 1410,656.5243386243386 L1410,545",
      sourcePoint: {
        x: 1010,
        y: 945
      },
      targetPoint: {
        x: 1410,
        y: 545
      },
      waypoints: [
        {
          x: 1010,
          y: 945
        },
        {
          x: 1010,
          y: 672.5243386243386
        },
        {
          x: 1010,
          y: 664.5243386243386
        },
        {
          x: 1018,
          y: 664.5243386243386
        },
        {
          x: 1402,
          y: 664.5243386243386
        },
        {
          x: 1410,
          y: 664.5243386243386
        },
        {
          x: 1410,
          y: 656.5243386243386
        },
        {
          x: 1410,
          y: 545
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            1405,540\n            1410,545\n            1405,550\n          ",
        transform: "rotate(-90, 1410, 545)"
      }
    },
    {
      sourceEdgeId: "8df9f4d0-cc37-4301-85e1-4e56dc69ffc1",
      domOrder: 11,
      zIndex: 11,
      sourceNodeId: "f76286ac-796e-463a-b5a7-1fd6bfdc6a7a",
      targetNodeId: "6c68b992-6afd-4fc8-b37c-45da1f674b4c",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M1410,485 L1410,345",
      sourcePoint: {
        x: 1410,
        y: 485
      },
      targetPoint: {
        x: 1410,
        y: 345
      },
      waypoints: [
        {
          x: 1410,
          y: 485
        },
        {
          x: 1410,
          y: 345
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            1405,340\n            1410,345\n            1405,350\n          ",
        transform: "rotate(-90, 1410, 345)"
      }
    },
    {
      sourceEdgeId: "91cc4f47-f71c-44cc-b7f0-9c350631ce23",
      domOrder: 12,
      zIndex: 12,
      sourceNodeId: "0c5bbe79-b35c-46f0-8281-f9e02e95225a",
      targetNodeId: "7fc5471e-298b-4fe8-b8dd-61c9e12374a6",
      sourcePort: "left",
      targetPort: "right",
      svgPath:
        "M1475,905 L1315.5,905 Q1307.5,905 1307.5,913 L1307.5,992 Q1307.5,1000 1299.5,1000 L1140,1000",
      sourcePoint: {
        x: 1475,
        y: 905
      },
      targetPoint: {
        x: 1140,
        y: 1000
      },
      waypoints: [
        {
          x: 1475,
          y: 905
        },
        {
          x: 1315.5,
          y: 905
        },
        {
          x: 1307.5,
          y: 905
        },
        {
          x: 1307.5,
          y: 913
        },
        {
          x: 1307.5,
          y: 992
        },
        {
          x: 1307.5,
          y: 1000
        },
        {
          x: 1299.5,
          y: 1000
        },
        {
          x: 1140,
          y: 1000
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            1135,995\n            1140,1000\n            1135,1005\n          ",
        transform: "rotate(180, 1140, 1000)"
      }
    },
    {
      sourceEdgeId: "a966941f-459d-46ed-a12f-058d98207486",
      domOrder: 13,
      zIndex: 13,
      sourceNodeId: "22a6d153-9c4c-49d4-a5b8-3c2fbb29162b",
      targetNodeId: "9647ef8e-ba33-4608-be6b-79271f103fe3",
      sourcePort: "bottom",
      targetPort: "left",
      svgPath: "M1265,935 L1265,992 Q1265,1000 1273,1000 L1630,1000",
      sourcePoint: {
        x: 1265,
        y: 935
      },
      targetPoint: {
        x: 1630,
        y: 1000
      },
      waypoints: [
        {
          x: 1265,
          y: 935
        },
        {
          x: 1265,
          y: 992
        },
        {
          x: 1265,
          y: 1000
        },
        {
          x: 1273,
          y: 1000
        },
        {
          x: 1630,
          y: 1000
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            1625,995\n            1630,1000\n            1625,1005\n          ",
        transform: "rotate(0, 1630, 1000)"
      }
    },
    {
      sourceEdgeId: "fc69d821-929a-4a03-95f9-6f456d914568",
      domOrder: 14,
      zIndex: 14,
      sourceNodeId: "57b6aa35-9b3d-46bd-967d-07493b8aaa5e",
      targetNodeId: "85d344cc-b877-4e92-a4fc-6ac1a7224135",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M530,345 L592,345 Q600,345 600,353 L600,507 Q600,515 608,515 L670,515",
      sourcePoint: {
        x: 530,
        y: 345
      },
      targetPoint: {
        x: 670,
        y: 515
      },
      waypoints: [
        {
          x: 530,
          y: 345
        },
        {
          x: 592,
          y: 345
        },
        {
          x: 600,
          y: 345
        },
        {
          x: 600,
          y: 353
        },
        {
          x: 600,
          y: 507
        },
        {
          x: 600,
          y: 515
        },
        {
          x: 608,
          y: 515
        },
        {
          x: 670,
          y: 515
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            665,510\n            670,515\n            665,520\n          ",
        transform: "rotate(0, 670, 515)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_vpc" "default" {\n  tags       = merge(var.tags, {})\n  cidr_block = var.vpc_cidr\n}\n\nresource "aws_subnet" "snet1" {\n  vpc_id                  = aws_vpc.default.id\n  tags                    = merge(var.tags, {})\n  map_public_ip_on_launch = true\n  cidr_block              = var.subnets[0]\n  availability_zone       = "us-east-1a"\n}\n\nresource "aws_subnet" "snet2" {\n  vpc_id                  = aws_vpc.default.id\n  tags                    = merge(var.tags, {})\n  map_public_ip_on_launch = true\n  cidr_block              = var.subnets[1]\n  availability_zone       = "us-east-1b"\n}\n\nresource "aws_internet_gateway" "gtw" {\n  vpc_id = aws_vpc.default.id\n\n  tags = {\n    Name = "Brainboard k8s"\n    Env  = "Development"\n  }\n}\n\nresource "aws_route_table" "default" {\n  vpc_id = aws_vpc.default.id\n  tags   = merge(var.tags, {})\n\n  route {\n    gateway_id = aws_internet_gateway.gtw.id\n    cidr_block = "0.0.0.0/0"\n  }\n}\n\nresource "aws_route_table_association" "route-association-2" {\n  subnet_id      = aws_subnet.snet2.id\n  route_table_id = aws_route_table.default.id\n}\n\nresource "aws_iam_role" "default-iam" {\n  tags               = merge(var.tags, {})\n  assume_role_policy = jsonencode({ "Statement" : [{ "Action" : "sts:AssumeRole", "Effect" : "Allow", "Principal" : { "Service" : "ec2.amazonaws.com" } }], "Version" : "2012-10-17" })\n}\n\nresource "aws_iam_role_policy_attachment" "node-AmazonEC2ContainerRegistryReadOnly" {\n  role       = aws_iam_role.default-iam.name\n  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"\n}\n\nresource "aws_iam_role_policy_attachment" "node-AmazonEKSWorkerNodePolicy" {\n  role       = aws_iam_role.default-iam.name\n  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"\n}\n\nresource "aws_iam_role_policy_attachment" "node-AmazonEKS_CNI_Policy" {\n  role       = aws_iam_role.default-iam.name\n  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"\n}\n\nresource "aws_eks_node_group" "default" {\n  tags            = merge(var.tags, {})\n  node_role_arn   = aws_iam_role.default-iam.arn\n  node_group_name = "brainboard_k8s"\n  cluster_name    = aws_eks_cluster.default.name\n\n  depends_on = [\n    aws_iam_role_policy_attachment.node-AmazonEKSWorkerNodePolicy,\n    aws_iam_role_policy_attachment.node-AmazonEKS_CNI_Policy,\n    aws_iam_role_policy_attachment.node-AmazonEC2ContainerRegistryReadOnly,\n  ]\n\n  scaling_config {\n    min_size     = var.scaling.min\n    max_size     = var.scaling.max\n    desired_size = var.scaling.desired\n  }\n\n  subnet_ids = [\n    aws_subnet.snet1.id,\n    aws_subnet.snet2.id,\n  ]\n}\n\nresource "aws_iam_role" "iam-cluster" {\n  tags               = merge(var.tags, {})\n  name               = "brainboard-k8s-cluster"\n  assume_role_policy = jsonencode({ "Statement" : [{ "Action" : "sts:AssumeRole", "Effect" : "Allow", "Principal" : { "Service" : "eks.amazonaws.com" } }], "Version" : "2012-10-17" })\n}\n\nresource "aws_iam_role_policy_attachment" "cluster-AmazonEKSClusterPolicy" {\n  role       = aws_iam_role.iam-cluster.name\n  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"\n}\n\nresource "aws_iam_role_policy_attachment" "cluster-AmazonEKSVPCResourceController" {\n  role       = aws_iam_role.iam-cluster.name\n  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"\n}\n\nresource "aws_security_group" "cluster-sg" {\n  vpc_id      = aws_vpc.default.id\n  tags        = merge(var.tags, {})\n  name        = var.sg_name\n  description = "Cluster communication with worker nodes"\n\n  egress {\n    to_port   = 0\n    protocol  = "-1"\n    from_port = 0\n\n    cidr_blocks = [\n      "0.0.0.0/0",\n    ]\n  }\n}\n\nresource "aws_security_group_rule" "cluster-ingress-workstation-https" {\n  type              = "ingress"\n  to_port           = 443\n  security_group_id = aws_security_group.cluster-sg.id\n  protocol          = "tcp"\n  from_port         = 443\n  description       = "Allow workstation to communicate with the cluster API Server"\n\n  cidr_blocks = [\n    var.workstation-external-cidr,\n  ]\n}\n\nresource "aws_eks_cluster" "default" {\n  role_arn = aws_iam_role.iam-cluster.arn\n  name     = var.cluster-name\n\n  depends_on = [\n    aws_iam_role_policy_attachment.cluster-AmazonEKSClusterPolicy,\n    aws_iam_role_policy_attachment.cluster-AmazonEKSVPCResourceController,\n  ]\n\n  tags = {\n    env      = "Staging"\n    archUUID = "db83bcc0-696a-4f64-a6d5-fcc143caf3e2"\n  }\n\n  vpc_config {\n    security_group_ids = [\n      aws_security_group.cluster-sg.id,\n    ]\n\n    subnet_ids = [\n      aws_subnet.snet1.id,\n      aws_subnet.snet2.id,\n    ]\n  }\n}\n\nresource "aws_route_table_association" "route-association-3" {\n  subnet_id      = aws_subnet.snet1.id\n  route_table_id = aws_route_table.default.id\n}\n\n',
        sha256: "ec488152058a76ece64b7d435531e22e2044af181310b82f1894f8ea977ccbe0",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'resource "aws_vpc" "default" {\n  tags       = merge(var.tags, {})\n  cidr_block = var.vpc_cidr\n}\n\nresource "aws_subnet" "snet1" {\n  vpc_id                  = aws_vpc.default.id\n  tags                    = merge(var.tags, {})\n  map_public_ip_on_launch = true\n  cidr_block              = var.subnets[0]\n  availability_zone       = "us-east-1a"\n}\n\nresource "aws_subnet" "snet2" {\n  vpc_id                  = aws_vpc.default.id\n  tags                    = merge(var.tags, {})\n  map_public_ip_on_launch = true\n  cidr_block              = var.subnets[1]\n  availability_zone       = "us-east-1b"\n}\n\nresource "aws_internet_gateway" "gtw" {\n  vpc_id = aws_vpc.default.id\n\n  tags = {\n    Name = "Brainboard k8s"\n    Env  = "Development"\n  }\n}\n\nresource "aws_route_table" "default" {\n  vpc_id = aws_vpc.default.id\n  tags   = merge(var.tags, {})\n\n  route {\n    gateway_id = aws_internet_gateway.gtw.id\n    cidr_block = "0.0.0.0/0"\n  }\n}\n\nresource "aws_route_table_association" "route-association-2" {\n  subnet_id      = aws_subnet.snet2.id\n  route_table_id = aws_route_table.default.id\n}\n\nresource "aws_iam_role" "default-iam" {\n  tags               = merge(var.tags, {})\n  assume_role_policy = jsonencode({ "Statement" : [{ "Action" : "sts:AssumeRole", "Effect" : "Allow", "Principal" : { "Service" : "ec2.amazonaws.com" } }], "Version" : "2012-10-17" })\n}\n\nresource "aws_iam_role_policy_attachment" "node-AmazonEC2ContainerRegistryReadOnly" {\n  role       = aws_iam_role.default-iam.name\n  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"\n}\n\nresource "aws_iam_role_policy_attachment" "node-AmazonEKSWorkerNodePolicy" {\n  role       = aws_iam_role.default-iam.name\n  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"\n}\n\nresource "aws_iam_role_policy_attachment" "node-AmazonEKS_CNI_Policy" {\n  role       = aws_iam_role.default-iam.name\n  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"\n}\n\nresource "aws_eks_node_group" "default" {\n  tags            = merge(var.tags, {})\n  node_role_arn   = aws_iam_role.default-iam.arn\n  node_group_name = "brainboard_k8s"\n  cluster_name    = aws_eks_cluster.default.name\n\n  depends_on = [\n    aws_iam_role_policy_attachment.node-AmazonEKSWorkerNodePolicy,\n    aws_iam_role_policy_attachment.node-AmazonEKS_CNI_Policy,\n    aws_iam_role_policy_attachment.node-AmazonEC2ContainerRegistryReadOnly,\n  ]\n\n  scaling_config {\n    min_size     = var.scaling.min\n    max_size     = var.scaling.max\n    desired_size = var.scaling.desired\n  }\n\n  subnet_ids = [\n    aws_subnet.snet1.id,\n    aws_subnet.snet2.id,\n  ]\n}\n\nresource "aws_iam_role" "iam-cluster" {\n  tags               = merge(var.tags, {})\n  name               = "brainboard-k8s-cluster"\n  assume_role_policy = jsonencode({ "Statement" : [{ "Action" : "sts:AssumeRole", "Effect" : "Allow", "Principal" : { "Service" : "eks.amazonaws.com" } }], "Version" : "2012-10-17" })\n}\n\nresource "aws_iam_role_policy_attachment" "cluster-AmazonEKSClusterPolicy" {\n  role       = aws_iam_role.iam-cluster.name\n  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"\n}\n\nresource "aws_iam_role_policy_attachment" "cluster-AmazonEKSVPCResourceController" {\n  role       = aws_iam_role.iam-cluster.name\n  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"\n}\n\nresource "aws_security_group" "cluster-sg" {\n  vpc_id      = aws_vpc.default.id\n  tags        = merge(var.tags, {})\n  name        = var.sg_name\n  description = "Cluster communication with worker nodes"\n\n  egress {\n    to_port   = 0\n    protocol  = "-1"\n    from_port = 0\n\n    cidr_blocks = [\n      "0.0.0.0/0",\n    ]\n  }\n}\n\nresource "aws_security_group_rule" "cluster-ingress-workstation-https" {\n  type              = "ingress"\n  to_port           = 443\n  security_group_id = aws_security_group.cluster-sg.id\n  protocol          = "tcp"\n  from_port         = 443\n  description       = "Allow workstation to communicate with the cluster API Server"\n\n  cidr_blocks = [\n    var.workstation-external-cidr,\n  ]\n}\n\nresource "aws_eks_cluster" "default" {\n  role_arn = aws_iam_role.iam-cluster.arn\n  name     = var.cluster-name\n\n  depends_on = [\n    aws_iam_role_policy_attachment.cluster-AmazonEKSClusterPolicy,\n    aws_iam_role_policy_attachment.cluster-AmazonEKSVPCResourceController,\n  ]\n\n  tags = {\n    env      = "Staging"\n  }\n\n  vpc_config {\n    security_group_ids = [\n      aws_security_group.cluster-sg.id,\n    ]\n\n    subnet_ids = [\n      aws_subnet.snet1.id,\n      aws_subnet.snet2.id,\n    ]\n  }\n}\n\nresource "aws_route_table_association" "route-association-3" {\n  subnet_id      = aws_subnet.snet1.id\n  route_table_id = aws_route_table.default.id\n}\n\n',
          sha256: "c09f9603870b15fe6d3878137f0d86661a9870c0a1fdf0c0fc38718c4b34e6d5",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archUUID = "db83bcc0-696a-4f64-a6d5-fcc143caf3e2"\n',
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
        code: 'terraform {\n  required_providers {\n    aws = {\n      version = "= 5.52.0"\n    }\n  }\n}\n\nprovider "aws" {\n  region = "us-east-1"\n}\n',
        sha256: "48a1ad8474f71e7904ac0639c3460b7a75ce71df8f5720658e9f012904229dfd",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "b6c225e0-102b-4b88-b046-fb7d88c56f2f"\n  env      = "Production"\n}\n',
        sha256: "399196eb1b7d0ba4474d68009f46082e4abbf2ca4d836db496c36612c06653a2",
        includeInWorkspace: false
      },
      {
        fileName: "variables.tf",
        code: 'variable "cluster-name" {\n  type    = string\n  default = "brainboard-eks-demo"\n}\n\nvariable "scaling" {\n  description = "The scaling capacity of the cluster."\n  type        = map(any)\n  default = {\n    desired = 1\n    max     = 1\n    min     = 1\n  }\n}\n\nvariable "sg_name" {\n  description = "Default security group for the cluster."\n  type        = string\n  default     = "kube_sg"\n}\n\nvariable "subnets" {\n  description = "Subnets where cluster resources are deployed."\n  type        = list(string)\n  default     = ["10.0.0.0/24", "10.0.1.0/24"]\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    archuuid = "d71155af-5339-44f1-ae11-2bcd29411c2d"\n    env      = "Training templates"\n  }\n}\n\nvariable "vpc_cidr" {\n  description = "CIDR block used by the main VPC."\n  type        = string\n  default     = "10.0.0.0/16"\n}\n\nvariable "workstation-external-cidr" {\n  type    = string\n  default = "0.0.0.0/0"\n}\n\n',
        sha256: "b523a2ba4ae3cbf5e02cf82f42d9035c99ec5617a4e016c3b316e4ab9d4532a3",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'variable "cluster-name" {\n  type    = string\n  default = "brainboard-eks-demo"\n}\n\nvariable "scaling" {\n  description = "The scaling capacity of the cluster."\n  type        = map(any)\n  default = {\n    desired = 1\n    max     = 1\n    min     = 1\n  }\n}\n\nvariable "sg_name" {\n  description = "Default security group for the cluster."\n  type        = string\n  default     = "kube_sg"\n}\n\nvariable "subnets" {\n  description = "Subnets where cluster resources are deployed."\n  type        = list(string)\n  default     = ["10.0.0.0/24", "10.0.1.0/24"]\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    env      = "Training templates"\n  }\n}\n\nvariable "vpc_cidr" {\n  description = "CIDR block used by the main VPC."\n  type        = string\n  default     = "10.0.0.0/16"\n}\n\nvariable "workstation-external-cidr" {\n  type    = string\n  default = "0.0.0.0/0"\n}\n\n',
          sha256: "a0d41e343cf97f49aa015272c35ce73abcd2770a6efa6120d124bd231cce927f",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archuuid = "d71155af-5339-44f1-ae11-2bcd29411c2d"\n',
              occurrenceCount: 1
            }
          ]
        }
      }
    ],
    resourceAddresses: [
      "aws_vpc.default",
      "aws_subnet.snet1",
      "aws_subnet.snet2",
      "aws_internet_gateway.gtw",
      "aws_route_table.default",
      "aws_route_table_association.route-association-2",
      "aws_iam_role.default-iam",
      "aws_iam_role_policy_attachment.node-AmazonEC2ContainerRegistryReadOnly",
      "aws_iam_role_policy_attachment.node-AmazonEKSWorkerNodePolicy",
      "aws_iam_role_policy_attachment.node-AmazonEKS_CNI_Policy",
      "aws_eks_node_group.default",
      "aws_iam_role.iam-cluster",
      "aws_iam_role_policy_attachment.cluster-AmazonEKSClusterPolicy",
      "aws_iam_role_policy_attachment.cluster-AmazonEKSVPCResourceController",
      "aws_security_group.cluster-sg",
      "aws_security_group_rule.cluster-ingress-workstation-https",
      "aws_eks_cluster.default",
      "aws_route_table_association.route-association-3"
    ]
  },
  bindings: {
    "c7cf2dc9-4cc9-481f-b53f-9904151e2630": {
      kind: "resource",
      address: "aws_security_group.cluster-sg",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "a9e7e1c4-6179-45d2-b7bc-885e61755ac2": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "3a7c40fe-8ca2-429b-a762-605aed1a0a33": {
      kind: "resource",
      address: "aws_vpc.default",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "2c258322-661f-471b-b0e6-85d49fd8e46b": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "dc0a5b25-308f-4bc2-871b-d5083cf2d0e2": {
      kind: "presentation",
      catalogId: "aws-availability-zone",
      aliasOf: null,
      style: null
    },
    "7fc5471e-298b-4fe8-b8dd-61c9e12374a6": {
      kind: "resource",
      address: "aws_subnet.snet1",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "9647ef8e-ba33-4608-be6b-79271f103fe3": {
      kind: "resource",
      address: "aws_subnet.snet2",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "1deba4c9-a88f-4b0e-995a-2e5dc304d167": {
      kind: "resource",
      address: "aws_iam_role_policy_attachment.node-AmazonEC2ContainerRegistryReadOnly",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "548abc5b-922e-4cf6-95ea-4c34c2fe5459": {
      kind: "resource",
      address: "aws_iam_role.iam-cluster",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "57b6aa35-9b3d-46bd-967d-07493b8aaa5e": {
      kind: "resource",
      address: "aws_iam_role_policy_attachment.node-AmazonEKS_CNI_Policy",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "85d344cc-b877-4e92-a4fc-6ac1a7224135": {
      kind: "resource",
      address: "aws_iam_role.default-iam",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "8a4bb82f-8ca2-4314-aa88-a7895bbe985d": {
      kind: "resource",
      address: "aws_iam_role_policy_attachment.node-AmazonEKSWorkerNodePolicy",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "b1dff648-3242-4a8f-bde8-5a30459b5d09": {
      kind: "resource",
      address: "aws_iam_role_policy_attachment.cluster-AmazonEKSVPCResourceController",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "bb5eb85d-fe0a-4239-affd-f34192d53c79": {
      kind: "resource",
      address: "aws_iam_role_policy_attachment.cluster-AmazonEKSClusterPolicy",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "6c68b992-6afd-4fc8-b37c-45da1f674b4c": {
      kind: "resource",
      address: "aws_internet_gateway.gtw",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "f76286ac-796e-463a-b5a7-1fd6bfdc6a7a": {
      kind: "resource",
      address: "aws_route_table.default",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "0c5bbe79-b35c-46f0-8281-f9e02e95225a": {
      kind: "resource",
      address: "aws_eks_cluster.default",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "22a6d153-9c4c-49d4-a5b8-3c2fbb29162b": {
      kind: "resource",
      address: "aws_eks_node_group.default",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "78653b46-a7fb-490f-a677-70663c22cc5c": {
      kind: "resource",
      address: "aws_security_group_rule.cluster-ingress-workstation-https",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "ea26b075-2ec2-4686-9450-92cebdeeee7b": {
      kind: "resource",
      address: "aws_route_table_association.route-association-3",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "ee8367ce-4b1b-4b45-9fca-eeec80c852dd": {
      kind: "resource",
      address: "aws_route_table_association.route-association-2",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "e663734e-34c4-4211-825d-f7844e11c3e6": {
      kind: "presentation",
      catalogId: "design-internet",
      aliasOf: null,
      style: null
    }
  }
});
