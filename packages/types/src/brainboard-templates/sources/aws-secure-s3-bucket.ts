import { defineCapturedBrainboardTemplate } from "./define-source.ts";

export const awsSecureS3BucketSource = defineCapturedBrainboardTemplate({
  id: "brainboard-aws-secure-s3-bucket",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "83a63920-3c99-4e86-9f42-a46de416e124",
    sourceUrl: "https://app.brainboard.co/templates/83a63920-3c99-4e86-9f42-a46de416e124",
    cloneArchitectureId: "40361bdd-1e39-479c-869a-05763f43f8bb",
    downloads: 0,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS secure S3 bucket",
  description: null,
  provider: "aws",
  viewport: {
    x: -346.8,
    y: -2227.27,
    width: 3041.806451612903,
    height: 1664.5440860215053
  },
  nodes: [
    {
      sourceNodeId: "d688c36c-abf5-43d6-8c47-15e8b5911a50",
      domOrder: 0,
      label: "US East (N. Virginia)",
      position: {
        x: 540,
        y: -1825
      },
      size: {
        width: 1095,
        height: 840
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(540, -1825), rotate(0 547.5 420)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "06c1d1a2-a280-419f-95a3-7e3cda0c3330",
      domOrder: 1,
      label: "보안 S3 Bucket",
      position: {
        x: 1020,
        y: -1440
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d688c36c-abf5-43d6-8c47-15e8b5911a50",
      zIndex: 1,
      rawTransform: "translate(1020, -1440), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket"
    },
    {
      sourceNodeId: "262e64a9-86bc-4bc5-b7e1-82e26ddedb06",
      domOrder: 2,
      label: "로그 객체 생성 SNS 알림",
      position: {
        x: 1020,
        y: -1660
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d688c36c-abf5-43d6-8c47-15e8b5911a50",
      zIndex: 2,
      rawTransform: "translate(1020, -1660), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_notification"
    },
    {
      sourceNodeId: "2bad56b6-e6ee-4248-9659-56171ccca61c",
      domOrder: 3,
      label: "로그 보관 Lifecycle",
      position: {
        x: 695,
        y: -1620
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d688c36c-abf5-43d6-8c47-15e8b5911a50",
      zIndex: 3,
      rawTransform: "translate(695, -1620), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_lifecycle_configuration"
    },
    {
      sourceNodeId: "4940107a-b41a-4e29-b53b-5618978ed6c3",
      domOrder: 4,
      label: "S3 Versioning",
      position: {
        x: 1020,
        y: -1210
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d688c36c-abf5-43d6-8c47-15e8b5911a50",
      zIndex: 4,
      rawTransform: "translate(1020, -1210), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_versioning"
    },
    {
      sourceNodeId: "6d669ff4-d4d1-44a6-b483-d16ca60e815a",
      domOrder: 5,
      label: "S3 KMS 암호화",
      position: {
        x: 695,
        y: -1210
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d688c36c-abf5-43d6-8c47-15e8b5911a50",
      zIndex: 5,
      rawTransform: "translate(695, -1210), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_server_side_encryption_configuration"
    },
    {
      sourceNodeId: "c636c16f-3b4a-4e46-bff2-70462f108900",
      domOrder: 6,
      label: "S3 Public Access 차단",
      position: {
        x: 1335,
        y: -1440
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d688c36c-abf5-43d6-8c47-15e8b5911a50",
      zIndex: 6,
      rawTransform: "translate(1335, -1440), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_public_access_block"
    },
    {
      sourceNodeId: "e06758f9-5a60-4934-8ac3-af746693a4a9",
      domOrder: 7,
      label: "버킷 알림 SNS Topic",
      position: {
        x: 1345,
        y: -1660
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d688c36c-abf5-43d6-8c47-15e8b5911a50",
      zIndex: 7,
      rawTransform: "translate(1345, -1660), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_sns_topic"
    },
    {
      sourceNodeId: "e4f7100a-1573-46ab-96db-116709afa0e8",
      domOrder: 8,
      label: "S3 Private ACL",
      position: {
        x: 1280,
        y: -1560
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d688c36c-abf5-43d6-8c47-15e8b5911a50",
      zIndex: 8,
      rawTransform: "translate(1280, -1560), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_acl"
    },
    {
      sourceNodeId: "ef48c7ff-a34a-49fb-94fd-ea9c35cedc11",
      domOrder: 9,
      label: "S3 Replication 설정",
      position: {
        x: 1280,
        y: -1210
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d688c36c-abf5-43d6-8c47-15e8b5911a50",
      zIndex: 9,
      rawTransform: "translate(1280, -1210), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_replication_configuration"
    },
    {
      sourceNodeId: "f079d191-2684-4c89-8e19-370d63c1d764",
      domOrder: 10,
      label: "S3 Replication IAM Role",
      position: {
        x: 1460,
        y: -1210
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d688c36c-abf5-43d6-8c47-15e8b5911a50",
      zIndex: 10,
      rawTransform: "translate(1460, -1210), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_role"
    },
    {
      sourceNodeId: "fa1b482b-0830-4610-a6ac-086a532b1f3f",
      domOrder: 11,
      label: "S3 접근 로그 수집",
      position: {
        x: 695,
        y: -1440
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "d688c36c-abf5-43d6-8c47-15e8b5911a50",
      zIndex: 11,
      rawTransform: "translate(695, -1440), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_logging"
    }
  ],
  edges: [
    {
      sourceEdgeId: "0a16c584-6935-4dcd-a0e2-c4a9f27b2d3e",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "ef48c7ff-a34a-49fb-94fd-ea9c35cedc11",
      targetNodeId: "f079d191-2684-4c89-8e19-370d63c1d764",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M1340,-1180 L1460,-1180",
      sourcePoint: {
        x: 1340,
        y: -1180
      },
      targetPoint: {
        x: 1460,
        y: -1180
      },
      waypoints: [
        {
          x: 1340,
          y: -1180
        },
        {
          x: 1460,
          y: -1180
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            1455,-1185\n            1460,-1180\n            1455,-1175\n          ",
        transform: "rotate(0, 1460, -1180)"
      }
    },
    {
      sourceEdgeId: "0bb580ee-bad5-4952-8d17-75a6bb0911d2",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "6d669ff4-d4d1-44a6-b483-d16ca60e815a",
      targetNodeId: "06c1d1a2-a280-419f-95a3-7e3cda0c3330",
      sourcePort: "right",
      targetPort: "left",
      svgPath:
        "M755,-1180 L879.5,-1180 Q887.5,-1180 887.5,-1188 L887.5,-1402 Q887.5,-1410 895.5,-1410 L1020,-1410",
      sourcePoint: {
        x: 755,
        y: -1180
      },
      targetPoint: {
        x: 1020,
        y: -1410
      },
      waypoints: [
        {
          x: 755,
          y: -1180
        },
        {
          x: 879.5,
          y: -1180
        },
        {
          x: 887.5,
          y: -1180
        },
        {
          x: 887.5,
          y: -1188
        },
        {
          x: 887.5,
          y: -1402
        },
        {
          x: 887.5,
          y: -1410
        },
        {
          x: 895.5,
          y: -1410
        },
        {
          x: 1020,
          y: -1410
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            1015,-1415\n            1020,-1410\n            1015,-1405\n          ",
        transform: "rotate(0, 1020, -1410)"
      }
    },
    {
      sourceEdgeId: "19f0bd66-c86f-4e8f-b1b9-0935cab8f210",
      domOrder: 2,
      zIndex: 2,
      sourceNodeId: "262e64a9-86bc-4bc5-b7e1-82e26ddedb06",
      targetNodeId: "e06758f9-5a60-4934-8ac3-af746693a4a9",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M1080,-1630 L1345,-1630",
      sourcePoint: {
        x: 1080,
        y: -1630
      },
      targetPoint: {
        x: 1345,
        y: -1630
      },
      waypoints: [
        {
          x: 1080,
          y: -1630
        },
        {
          x: 1345,
          y: -1630
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            1340,-1635\n            1345,-1630\n            1340,-1625\n          ",
        transform: "rotate(0, 1345, -1630)"
      }
    },
    {
      sourceEdgeId: "3080c2bd-e369-42d3-bd39-23dd2a4b1b44",
      domOrder: 3,
      zIndex: 3,
      sourceNodeId: "e4f7100a-1573-46ab-96db-116709afa0e8",
      targetNodeId: "06c1d1a2-a280-419f-95a3-7e3cda0c3330",
      sourcePort: "left",
      targetPort: "right",
      svgPath:
        "M1280,-1530 L1188,-1530 Q1180,-1530 1180,-1522 L1180,-1418 Q1180,-1410 1172,-1410 L1080,-1410",
      sourcePoint: {
        x: 1280,
        y: -1530
      },
      targetPoint: {
        x: 1080,
        y: -1410
      },
      waypoints: [
        {
          x: 1280,
          y: -1530
        },
        {
          x: 1188,
          y: -1530
        },
        {
          x: 1180,
          y: -1530
        },
        {
          x: 1180,
          y: -1522
        },
        {
          x: 1180,
          y: -1418
        },
        {
          x: 1180,
          y: -1410
        },
        {
          x: 1172,
          y: -1410
        },
        {
          x: 1080,
          y: -1410
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points:
          "\n            1075,-1415\n            1080,-1410\n            1075,-1405\n          ",
        transform: "rotate(180, 1080, -1410)"
      }
    },
    {
      sourceEdgeId: "3ada6fe8-5fd5-46a1-bb12-699e268fb4a0",
      domOrder: 4,
      zIndex: 4,
      sourceNodeId: "2bad56b6-e6ee-4248-9659-56171ccca61c",
      targetNodeId: "06c1d1a2-a280-419f-95a3-7e3cda0c3330",
      sourcePort: "right",
      targetPort: "left",
      svgPath:
        "M755,-1590 L879.5,-1590 Q887.5,-1590 887.5,-1582 L887.5,-1418 Q887.5,-1410 895.5,-1410 L1020,-1410",
      sourcePoint: {
        x: 755,
        y: -1590
      },
      targetPoint: {
        x: 1020,
        y: -1410
      },
      waypoints: [
        {
          x: 755,
          y: -1590
        },
        {
          x: 879.5,
          y: -1590
        },
        {
          x: 887.5,
          y: -1590
        },
        {
          x: 887.5,
          y: -1582
        },
        {
          x: 887.5,
          y: -1418
        },
        {
          x: 887.5,
          y: -1410
        },
        {
          x: 895.5,
          y: -1410
        },
        {
          x: 1020,
          y: -1410
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            1015,-1415\n            1020,-1410\n            1015,-1405\n          ",
        transform: "rotate(0, 1020, -1410)"
      }
    },
    {
      sourceEdgeId: "8ac3de98-692d-4f41-b4ab-70a9b0cccec2",
      domOrder: 5,
      zIndex: 5,
      sourceNodeId: "fa1b482b-0830-4610-a6ac-086a532b1f3f",
      targetNodeId: "06c1d1a2-a280-419f-95a3-7e3cda0c3330",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M755,-1410 L1020,-1410",
      sourcePoint: {
        x: 755,
        y: -1410
      },
      targetPoint: {
        x: 1020,
        y: -1410
      },
      waypoints: [
        {
          x: 755,
          y: -1410
        },
        {
          x: 1020,
          y: -1410
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            1015,-1415\n            1020,-1410\n            1015,-1405\n          ",
        transform: "rotate(0, 1020, -1410)"
      }
    },
    {
      sourceEdgeId: "a1462cf9-60b8-4674-9702-aef9ff742de0",
      domOrder: 6,
      zIndex: 6,
      sourceNodeId: "c636c16f-3b4a-4e46-bff2-70462f108900",
      targetNodeId: "06c1d1a2-a280-419f-95a3-7e3cda0c3330",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M1335,-1410 L1080,-1410",
      sourcePoint: {
        x: 1335,
        y: -1410
      },
      targetPoint: {
        x: 1080,
        y: -1410
      },
      waypoints: [
        {
          x: 1335,
          y: -1410
        },
        {
          x: 1080,
          y: -1410
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points:
          "\n            1075,-1415\n            1080,-1410\n            1075,-1405\n          ",
        transform: "rotate(180, 1080, -1410)"
      }
    },
    {
      sourceEdgeId: "b5678005-1e73-4ad8-90b0-95da53b43938",
      domOrder: 7,
      zIndex: 7,
      sourceNodeId: "262e64a9-86bc-4bc5-b7e1-82e26ddedb06",
      targetNodeId: "06c1d1a2-a280-419f-95a3-7e3cda0c3330",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M1050,-1600 L1050,-1440",
      sourcePoint: {
        x: 1050,
        y: -1600
      },
      targetPoint: {
        x: 1050,
        y: -1440
      },
      waypoints: [
        {
          x: 1050,
          y: -1600
        },
        {
          x: 1050,
          y: -1440
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 90,
      rawArrow: {
        points:
          "\n            1045,-1445\n            1050,-1440\n            1045,-1435\n          ",
        transform: "rotate(90, 1050, -1440)"
      }
    },
    {
      sourceEdgeId: "df0c665c-7e8e-4b92-8f54-f151648ef5a2",
      domOrder: 8,
      zIndex: 8,
      sourceNodeId: "4940107a-b41a-4e29-b53b-5618978ed6c3",
      targetNodeId: "06c1d1a2-a280-419f-95a3-7e3cda0c3330",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M1050,-1210 L1050,-1380",
      sourcePoint: {
        x: 1050,
        y: -1210
      },
      targetPoint: {
        x: 1050,
        y: -1380
      },
      waypoints: [
        {
          x: 1050,
          y: -1210
        },
        {
          x: 1050,
          y: -1380
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points:
          "\n            1045,-1385\n            1050,-1380\n            1045,-1375\n          ",
        transform: "rotate(-90, 1050, -1380)"
      }
    },
    {
      sourceEdgeId: "e5629b09-e138-4ee3-83d1-b99543053c53",
      domOrder: 9,
      zIndex: 9,
      sourceNodeId: "ef48c7ff-a34a-49fb-94fd-ea9c35cedc11",
      targetNodeId: "06c1d1a2-a280-419f-95a3-7e3cda0c3330",
      sourcePort: "left",
      targetPort: "right",
      svgPath:
        "M1280,-1180 L1187,-1180 Q1179,-1180 1179,-1188 L1179,-1402 Q1179,-1410 1171,-1410 L1080,-1410",
      sourcePoint: {
        x: 1280,
        y: -1180
      },
      targetPoint: {
        x: 1080,
        y: -1410
      },
      waypoints: [
        {
          x: 1280,
          y: -1180
        },
        {
          x: 1187,
          y: -1180
        },
        {
          x: 1179,
          y: -1180
        },
        {
          x: 1179,
          y: -1188
        },
        {
          x: 1179,
          y: -1402
        },
        {
          x: 1179,
          y: -1410
        },
        {
          x: 1171,
          y: -1410
        },
        {
          x: 1080,
          y: -1410
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points:
          "\n            1075,-1415\n            1080,-1410\n            1075,-1405\n          ",
        transform: "rotate(180, 1080, -1410)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_s3_bucket_acl" "s3_bucket_acl" {\n  bucket = aws_s3_bucket.s3_bucket.id\n  acl    = "private"\n}\n\n',
        sha256: "b152d5f1b1900447f4e360c1c9d9bc57f4b6642380e10165660a0ddabf1434df",
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
        code: 'terraform {\n  required_providers {\n    aws = {\n      version = "= 5.79.0"\n    }\n  }\n}\n\nprovider "aws" {\n  region = "us-east-1"\n}\n',
        sha256: "e1c3c9db34f93f9358126738e9b6d26d8543aebaf69a0ad00a0745927ae661ef",
        includeInWorkspace: true
      },
      {
        fileName: "s3_bucket.tf",
        code: 'resource "aws_s3_bucket" "s3_bucket" {\n  tags   = merge(var.tags, {})\n  bucket = "${var.prefix}-brainboard"\n}\n\nresource "aws_s3_bucket_notification" "s3_bucket_notification" {\n  bucket = aws_s3_bucket.s3_bucket.id\n\n  topic {\n    topic_arn     = aws_sns_topic.sns_topic.arn\n    filter_prefix = "logs/"\n\n    events = [\n      "s3:ObjectCreated:*",\n    ]\n  }\n}\n\nresource "aws_s3_bucket_versioning" "s3_bucket_versioning" {\n  bucket = aws_s3_bucket.s3_bucket.id\n\n  versioning_configuration {\n    status = "Enabled"\n  }\n}\n\nresource "aws_sns_topic" "sns_topic" {\n  tags              = merge(var.tags, {})\n  name              = "bucket-notification"\n  kms_master_key_id = "/secure_messaging"\n}\n\nresource "aws_s3_bucket_replication_configuration" "replication_configuration" {\n  role   = aws_iam_role.iam_role.arn\n  bucket = aws_s3_bucket.s3_bucket.id\n\n  rule {\n    status = "Enabled"\n\n    destination {\n      storage_class = "STANDARD"\n      bucket        = aws_s3_bucket.s3_bucket.arn\n    }\n  }\n}\n\nresource "aws_s3_bucket_public_access_block" "s3_bucket_public_access_block" {\n  restrict_public_buckets = true\n  ignore_public_acls      = true\n  bucket                  = aws_s3_bucket.s3_bucket.bucket_domain_name\n  block_public_policy     = true\n  block_public_acls       = true\n}\n\nresource "aws_iam_role" "iam_role" {\n  tags = merge(var.tags, {})\n  assume_role_policy = jsonencode({\n    "Version" : "2012-10-17",\n    "Statement" : [\n      {\n        "Effect" : "Allow",\n        "Action" : [\n          "s3:GetReplicationConfiguration",\n          "s3:ListBucket"\n        ],\n        "Resource" : [\n          "arn:aws:s3:::amzn-s3-demo-bucket1"\n        ]\n      },\n      {\n        "Effect" : "Allow",\n        "Action" : [\n          "s3:GetObjectVersionForReplication",\n          "s3:GetObjectVersionAcl",\n          "s3:GetObjectVersionTagging"\n        ],\n        "Resource" : [\n          "arn:aws:s3:::amzn-s3-demo-bucket1/*"\n        ]\n      },\n      {\n        "Effect" : "Allow",\n        "Action" : [\n          "s3:ReplicateObject",\n          "s3:ReplicateDelete",\n          "s3:ReplicateTags"\n        ],\n        "Resource" : "arn:aws:s3:::amzn-s3-demo-bucket2/*"\n      }\n    ]\n  })\n}\n\nresource "aws_s3_bucket_logging" "s3_bucket_logging" {\n  target_prefix = "logs/"\n  target_bucket = aws_s3_bucket.s3_bucket.id\n  bucket        = "existing_s3_bucket"\n}\n\nresource "aws_s3_bucket_lifecycle_configuration" "s3_bucket_lifecycle_configuration" {\n  bucket = aws_s3_bucket.s3_bucket.id\n\n  rule {\n    status = "Enabled"\n    id     = "expire"\n\n    expiration {\n      days = 90\n    }\n\n    filter {\n      and {\n        prefix = "logs/"\n      }\n    }\n\n    transition {\n      storage_class = "STANDARD_IA"\n      days          = 30\n    }\n  }\n}\n\nresource "aws_s3_bucket_server_side_encryption_configuration" "s3_bucket_server_side_encryption_configuration" {\n  bucket = aws_s3_bucket.s3_bucket.id\n\n  rule {\n    apply_server_side_encryption_by_default {\n      sse_algorithm     = "aws:kms"\n      kms_master_key_id = "kms"\n    }\n  }\n}\n\n',
        sha256: "304b2650094576b2b9aa9f615afa5c9ba8f6c16d5c1cf175f47235ed80e03e93",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "40361bdd-1e39-479c-869a-05763f43f8bb"\n  env      = "Production"\n}\n',
        sha256: "2eab960fbfe9452dbcd744b6401d0fdd33125163e5b71c01dbcad82a655e8c0e",
        includeInWorkspace: false
      },
      {
        fileName: "variables.tf",
        code: 'variable "prefix" {\n  type    = string\n  default = "bb"\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n}\n\n',
        sha256: "9399b299a2e3b1ece298c7d7274bfb609964f442b032015b53015df32d0d779f",
        includeInWorkspace: true
      }
    ],
    resourceAddresses: [
      "aws_s3_bucket_acl.s3_bucket_acl",
      "aws_s3_bucket.s3_bucket",
      "aws_s3_bucket_notification.s3_bucket_notification",
      "aws_s3_bucket_versioning.s3_bucket_versioning",
      "aws_sns_topic.sns_topic",
      "aws_s3_bucket_replication_configuration.replication_configuration",
      "aws_s3_bucket_public_access_block.s3_bucket_public_access_block",
      "aws_iam_role.iam_role",
      "aws_s3_bucket_logging.s3_bucket_logging",
      "aws_s3_bucket_lifecycle_configuration.s3_bucket_lifecycle_configuration",
      "aws_s3_bucket_server_side_encryption_configuration.s3_bucket_server_side_encryption_configuration"
    ]
  },
  bindings: {
    "d688c36c-abf5-43d6-8c47-15e8b5911a50": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "06c1d1a2-a280-419f-95a3-7e3cda0c3330": {
      kind: "resource",
      address: "aws_s3_bucket.s3_bucket",
      fileName: "s3_bucket.tf",
      addressMapping: "reviewed-override"
    },
    "262e64a9-86bc-4bc5-b7e1-82e26ddedb06": {
      kind: "resource",
      address: "aws_s3_bucket_notification.s3_bucket_notification",
      fileName: "s3_bucket.tf",
      addressMapping: "reviewed-override"
    },
    "2bad56b6-e6ee-4248-9659-56171ccca61c": {
      kind: "resource",
      address: "aws_s3_bucket_lifecycle_configuration.s3_bucket_lifecycle_configuration",
      fileName: "s3_bucket.tf",
      addressMapping: "single-residual"
    },
    "4940107a-b41a-4e29-b53b-5618978ed6c3": {
      kind: "resource",
      address: "aws_s3_bucket_versioning.s3_bucket_versioning",
      fileName: "s3_bucket.tf",
      addressMapping: "single-residual"
    },
    "6d669ff4-d4d1-44a6-b483-d16ca60e815a": {
      kind: "resource",
      address:
        "aws_s3_bucket_server_side_encryption_configuration.s3_bucket_server_side_encryption_configuration",
      fileName: "s3_bucket.tf",
      addressMapping: "single-residual"
    },
    "c636c16f-3b4a-4e46-bff2-70462f108900": {
      kind: "resource",
      address: "aws_s3_bucket_public_access_block.s3_bucket_public_access_block",
      fileName: "s3_bucket.tf",
      addressMapping: "single-residual"
    },
    "e06758f9-5a60-4934-8ac3-af746693a4a9": {
      kind: "resource",
      address: "aws_sns_topic.sns_topic",
      fileName: "s3_bucket.tf",
      addressMapping: "reviewed-override"
    },
    "e4f7100a-1573-46ab-96db-116709afa0e8": {
      kind: "resource",
      address: "aws_s3_bucket_acl.s3_bucket_acl",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "ef48c7ff-a34a-49fb-94fd-ea9c35cedc11": {
      kind: "resource",
      address: "aws_s3_bucket_replication_configuration.replication_configuration",
      fileName: "s3_bucket.tf",
      addressMapping: "single-residual"
    },
    "f079d191-2684-4c89-8e19-370d63c1d764": {
      kind: "resource",
      address: "aws_iam_role.iam_role",
      fileName: "s3_bucket.tf",
      addressMapping: "reviewed-override"
    },
    "fa1b482b-0830-4610-a6ac-086a532b1f3f": {
      kind: "resource",
      address: "aws_s3_bucket_logging.s3_bucket_logging",
      fileName: "s3_bucket.tf",
      addressMapping: "single-residual"
    }
  }
});
