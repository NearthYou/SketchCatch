import { defineCapturedBrainboardTemplate } from "./define-source.ts";

export const awsIamUsersSource = defineCapturedBrainboardTemplate({
  id: "brainboard-aws-iam-users",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "46009873-0596-40b3-bcf4-b466428c54b4",
    sourceUrl: "https://app.brainboard.co/templates/46009873-0596-40b3-bcf4-b466428c54b4",
    cloneArchitectureId: "c7168e71-572e-4dc3-b171-3dad08516551",
    downloads: 56,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS IAM users creation",
  description: null,
  provider: "aws",
  viewport: {
    x: -469.23,
    y: -1515.97,
    width: 3338.5806451612902,
    height: 1826.9455197132618
  },
  nodes: [
    {
      sourceNodeId: "89087529-31fb-4b85-abed-3418eee9a00f",
      domOrder: 0,
      label: "Global",
      position: {
        x: 500,
        y: -960
      },
      size: {
        width: 1210,
        height: 695
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(500, -960), rotate(0 605 347.5)",
      rotation: 0,
      rawResourceType: "brainboard_group"
    },
    {
      sourceNodeId: "fc0d1fe3-09ac-4ee4-a83f-c04900b17d19",
      domOrder: 1,
      label: "User Accounts",
      position: {
        x: 1095,
        y: -715
      },
      size: {
        width: 540,
        height: 355
      },
      parentSourceNodeId: null,
      zIndex: 1,
      rawTransform: "translate(1095, -715), rotate(0 270 177.5)",
      rotation: 0,
      rawResourceType: "brainboard_group"
    },
    {
      sourceNodeId: "1c28c7ec-2e94-4ac1-95ed-09370ec23e35",
      domOrder: 2,
      label: "User IAM Group",
      position: {
        x: 715,
        y: -415
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: null,
      zIndex: 2,
      rawTransform: "translate(715, -415), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_group"
    },
    {
      sourceNodeId: "38a919c0-d6ae-430e-ba56-5a42ddda95d4",
      domOrder: 3,
      label: "MFA Required IAM Policy",
      position: {
        x: 595,
        y: -815
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: null,
      zIndex: 3,
      rawTransform: "translate(595, -815), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_policy"
    },
    {
      sourceNodeId: "8f00e827-caf6-40fd-9677-c8484b42f94c",
      domOrder: 4,
      label: "Password Change Policy Attachment",
      position: {
        x: 835,
        y: -635
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: null,
      zIndex: 4,
      rawTransform: "translate(835, -635), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_group_policy_attachment"
    },
    {
      sourceNodeId: "b1fc8d2d-aa45-40dd-b38c-780b160f02e2",
      domOrder: 5,
      label: "Password Change Managed IAM Policy",
      position: {
        x: 835,
        y: -815
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: null,
      zIndex: 5,
      rawTransform: "translate(835, -815), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_policy"
    },
    {
      sourceNodeId: "f1b74bf3-c510-4da8-baaa-d199ffaa6267",
      domOrder: 6,
      label: "MFA Required Policy Attachment",
      position: {
        x: 595,
        y: -635
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: null,
      zIndex: 6,
      rawTransform: "translate(595, -635), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_group_policy_attachment"
    },
    {
      sourceNodeId: "76efa2d0-4ef5-414c-af9b-7e5467b8adb1",
      domOrder: 7,
      label: "IAM User Account",
      position: {
        x: 1443.2571075439453,
        y: -641.3308456420898
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: null,
      zIndex: 7,
      rawTransform: "translate(1443.2571075439453, -641.3308456420898), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_user"
    },
    {
      sourceNodeId: "b80b763b-bc6e-47c3-bdbd-ac5fe8bf37f7",
      domOrder: 8,
      label: "IAM User Group Membership",
      position: {
        x: 1203.2571075439453,
        y: -641.3308456420898
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: null,
      zIndex: 8,
      rawTransform: "translate(1203.2571075439453, -641.3308456420898), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_user_group_membership"
    },
    {
      sourceNodeId: "f851591c-6a06-4091-874b-a9a3acce7c18",
      domOrder: 9,
      label: "IAM Console Login Profile",
      position: {
        x: 1443.2571075439453,
        y: -471.3308456420898
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: null,
      zIndex: 9,
      rawTransform: "translate(1443.2571075439453, -471.3308456420898), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_iam_user_login_profile"
    }
  ],
  edges: [
    {
      sourceEdgeId: "659387c3-e27a-4912-9a10-5eef01011730",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "8f00e827-caf6-40fd-9677-c8484b42f94c",
      targetNodeId: "1c28c7ec-2e94-4ac1-95ed-09370ec23e35",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M865,-575 L865,-503 Q865,-495 857,-495 L753,-495 Q745,-495 745,-487 L745,-415",
      sourcePoint: {
        x: 865,
        y: -575
      },
      targetPoint: {
        x: 745,
        y: -415
      },
      waypoints: [
        {
          x: 865,
          y: -575
        },
        {
          x: 865,
          y: -503
        },
        {
          x: 865,
          y: -495
        },
        {
          x: 857,
          y: -495
        },
        {
          x: 753,
          y: -495
        },
        {
          x: 745,
          y: -495
        },
        {
          x: 745,
          y: -487
        },
        {
          x: 745,
          y: -415
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            740,-420\n            745,-415\n            740,-410\n          ",
        transform: "rotate(90, 745, -415)"
      }
    },
    {
      sourceEdgeId: "695424ca-87b1-4a4f-a6f0-b2ce9b8f96e9",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "b80b763b-bc6e-47c3-bdbd-ac5fe8bf37f7",
      targetNodeId: "1c28c7ec-2e94-4ac1-95ed-09370ec23e35",
      sourcePort: "bottom",
      targetPort: "right",
      svgPath:
        "M1233.2571075439453,-581.3308456420898 L1233.2571075439453,-393 Q1233.2571075439453,-385 1225.2571075439453,-385 L775,-385",
      sourcePoint: {
        x: 1233.2571075439453,
        y: -581.3308456420898
      },
      targetPoint: {
        x: 775,
        y: -385
      },
      waypoints: [
        {
          x: 1233.2571075439453,
          y: -581.3308456420898
        },
        {
          x: 1233.2571075439453,
          y: -393
        },
        {
          x: 1233.2571075439453,
          y: -385
        },
        {
          x: 1225.2571075439453,
          y: -385
        },
        {
          x: 775,
          y: -385
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            770,-390\n            775,-385\n            770,-380\n          ",
        transform: "rotate(180, 775, -385)"
      }
    },
    {
      sourceEdgeId: "838da824-4bc8-4aec-99a1-b694091ec9e1",
      domOrder: 2,
      zIndex: 2,
      sourceNodeId: "f1b74bf3-c510-4da8-baaa-d199ffaa6267",
      targetNodeId: "38a919c0-d6ae-430e-ba56-5a42ddda95d4",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M625,-635 L625,-755",
      sourcePoint: {
        x: 625,
        y: -635
      },
      targetPoint: {
        x: 625,
        y: -755
      },
      waypoints: [
        {
          x: 625,
          y: -635
        },
        {
          x: 625,
          y: -755
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            620,-760\n            625,-755\n            620,-750\n          ",
        transform: "rotate(-90, 625, -755)"
      }
    },
    {
      sourceEdgeId: "969a5274-1789-458b-8268-d1e637b63e6c",
      domOrder: 3,
      zIndex: 3,
      sourceNodeId: "8f00e827-caf6-40fd-9677-c8484b42f94c",
      targetNodeId: "b1fc8d2d-aa45-40dd-b38c-780b160f02e2",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M865,-635 L865,-755",
      sourcePoint: {
        x: 865,
        y: -635
      },
      targetPoint: {
        x: 865,
        y: -755
      },
      waypoints: [
        {
          x: 865,
          y: -635
        },
        {
          x: 865,
          y: -755
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points: "\n            860,-760\n            865,-755\n            860,-750\n          ",
        transform: "rotate(-90, 865, -755)"
      }
    },
    {
      sourceEdgeId: "9a40f5e2-e3b6-4d49-9601-3c383b8f87f3",
      domOrder: 4,
      zIndex: 4,
      sourceNodeId: "f1b74bf3-c510-4da8-baaa-d199ffaa6267",
      targetNodeId: "1c28c7ec-2e94-4ac1-95ed-09370ec23e35",
      sourcePort: "bottom",
      targetPort: "top",
      svgPath: "M625,-575 L625,-503 Q625,-495 633,-495 L737,-495 Q745,-495 745,-487 L745,-415",
      sourcePoint: {
        x: 625,
        y: -575
      },
      targetPoint: {
        x: 745,
        y: -415
      },
      waypoints: [
        {
          x: 625,
          y: -575
        },
        {
          x: 625,
          y: -503
        },
        {
          x: 625,
          y: -495
        },
        {
          x: 633,
          y: -495
        },
        {
          x: 737,
          y: -495
        },
        {
          x: 745,
          y: -495
        },
        {
          x: 745,
          y: -487
        },
        {
          x: 745,
          y: -415
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            740,-420\n            745,-415\n            740,-410\n          ",
        transform: "rotate(90, 745, -415)"
      }
    },
    {
      sourceEdgeId: "ce493937-0d26-436c-8d74-29e1e65adaef",
      domOrder: 5,
      zIndex: 5,
      sourceNodeId: "b80b763b-bc6e-47c3-bdbd-ac5fe8bf37f7",
      targetNodeId: "76efa2d0-4ef5-414c-af9b-7e5467b8adb1",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M1263.2571075439453,-611.3308456420898 L1443.2571075439453,-611.3308456420898",
      sourcePoint: {
        x: 1263.2571075439453,
        y: -611.3308456420898
      },
      targetPoint: {
        x: 1443.2571075439453,
        y: -611.3308456420898
      },
      waypoints: [
        {
          x: 1263.2571075439453,
          y: -611.3308456420898
        },
        {
          x: 1443.2571075439453,
          y: -611.3308456420898
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: 0,
      rawArrow: {
        points:
          "\n            1438.2571075439453,-616.3308456420898\n            1443.2571075439453,-611.3308456420898\n            1438.2571075439453,-606.3308456420898\n          ",
        transform: "rotate(0, 1443.2571075439453, -611.3308456420898)"
      }
    },
    {
      sourceEdgeId: "dc5d21ca-8e4b-470d-a50c-658dc2ab770b",
      domOrder: 6,
      zIndex: 6,
      sourceNodeId: "f851591c-6a06-4091-874b-a9a3acce7c18",
      targetNodeId: "76efa2d0-4ef5-414c-af9b-7e5467b8adb1",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M1473.2571075439453,-471.3308456420898 L1473.2571075439453,-581.3308456420898",
      sourcePoint: {
        x: 1473.2571075439453,
        y: -471.3308456420898
      },
      targetPoint: {
        x: 1473.2571075439453,
        y: -581.3308456420898
      },
      waypoints: [
        {
          x: 1473.2571075439453,
          y: -471.3308456420898
        },
        {
          x: 1473.2571075439453,
          y: -581.3308456420898
        }
      ],
      arrowDirection: "source-to-target",
      arrowAngle: -90,
      rawArrow: {
        points:
          "\n            1468.2571075439453,-586.3308456420898\n            1473.2571075439453,-581.3308456420898\n            1468.2571075439453,-576.3308456420898\n          ",
        transform: "rotate(-90, 1473.2571075439453, -581.3308456420898)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_iam_group" "default" {\n  name = var.iam_group\n}\n\ndata "aws_iam_policy" "change_password" {\n  arn = "arn:aws:iam::aws:policy/IAMUserChangePassword"\n}\n\nresource "aws_iam_user" "users" {\n  tags  = merge(var.tags, {})\n  path  = "/"\n  name  = var.users[count.index]\n  count = length(var.users)\n}\n\nresource "aws_iam_user_group_membership" "default" {\n  user  = aws_iam_user.users[count.index].name\n  count = length(var.users)\n\n  groups = [\n    aws_iam_group.default.id,\n  ]\n}\n\nresource "aws_iam_user_login_profile" "default" {\n  user                    = aws_iam_user.users[count.index].name\n  password_reset_required = true\n  count                   = length(var.users)\n}\n\nresource "aws_iam_group_policy_attachment" "iam_group_policy_attachment_13_c_c" {\n  policy_arn = data.aws_iam_policy.change_password.arn\n  group      = aws_iam_group.default.id\n}\n\nresource "aws_iam_group_policy_attachment" "default" {\n  policy_arn = aws_iam_policy.mfa.arn\n  group      = aws_iam_group.default.id\n}\n\nresource "aws_iam_policy" "mfa" {\n  tags = merge(var.tags, {})\n  policy = jsonencode({\n    "Version" : "2012-10-17",\n    "Statement" : [\n      {\n        "Sid" : "",\n        "Effect" : "Allow",\n        "Action" : "*",\n        "Resource" : "*",\n        "Condition" : {\n          "Bool" : {\n            "aws:MultiFactorAuthPresent" : ["true"]\n          }\n        }\n      }\n    ]\n  })\n  name        = "mfa"\n  description = "Policy to enforce MFA for all Brainboard users"\n}\n\n',
        sha256: "600dfa895c056aabb2626fe5e622b72244a056052490984c3d7658bc14830432",
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
        code: 'terraform {\n  required_providers {\n    aws = {\n      version = "= 4.48.0"\n    }\n  }\n}\n\nprovider "aws" {\n  region = "us-east-1"\n}\n',
        sha256: "68867cb7d66961e84179b6ff157047f16fea6cfae3ddc338319cabd8c48ec731",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "c7168e71-572e-4dc3-b171-3dad08516551"\n  env      = "Production"\n}\n',
        sha256: "3bf133d4ad9fa47f93f6a43294ae57201cba47353c5455313e6ad4cea5a9b95a",
        includeInWorkspace: false
      },
      {
        fileName: "variables.tf",
        code: 'variable "iam_group" {\n  description = "The IAM group of the users"\n  type        = string\n  default     = "brainboard"\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    archuuid = "46009873-0596-40b3-bcf4-b466428c54b4"\n    env      = "Manage Champions access"\n  }\n}\n\nvariable "users" {\n  description = "The list of champions for which we create an account within our orga."\n  type        = list(string)\n  default = [\n    "user1",\n    "user2"\n  ]\n}\n\n',
        sha256: "300f230c84fd91aafe7b113d77865aee45406dfb8450c95159eed4030d0ba91e",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'variable "iam_group" {\n  description = "The IAM group of the users"\n  type        = string\n  default     = "brainboard"\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    env      = "Manage Champions access"\n  }\n}\n\nvariable "users" {\n  description = "The list of champions for which we create an account within our orga."\n  type        = list(string)\n  default = [\n    "user1",\n    "user2"\n  ]\n}\n\n',
          sha256: "422a144c39c5318f286ed433d7740c8cda597641dab2c6b0afbaf132c82078e1",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archuuid = "46009873-0596-40b3-bcf4-b466428c54b4"\n',
              occurrenceCount: 1
            }
          ]
        }
      }
    ],
    resourceAddresses: [
      "aws_iam_group.default",
      "data.aws_iam_policy.change_password",
      "aws_iam_user.users",
      "aws_iam_user_group_membership.default",
      "aws_iam_user_login_profile.default",
      "aws_iam_group_policy_attachment.iam_group_policy_attachment_13_c_c",
      "aws_iam_group_policy_attachment.default",
      "aws_iam_policy.mfa"
    ]
  },
  bindings: {
    "89087529-31fb-4b85-abed-3418eee9a00f": {
      kind: "presentation",
      catalogId: "design-group",
      aliasOf: null,
      style: null
    },
    "fc0d1fe3-09ac-4ee4-a83f-c04900b17d19": {
      kind: "presentation",
      catalogId: "design-group",
      aliasOf: null,
      style: null
    },
    "1c28c7ec-2e94-4ac1-95ed-09370ec23e35": {
      kind: "resource",
      address: "aws_iam_group.default",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "38a919c0-d6ae-430e-ba56-5a42ddda95d4": {
      kind: "resource",
      address: "aws_iam_policy.mfa",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "8f00e827-caf6-40fd-9677-c8484b42f94c": {
      kind: "resource",
      address: "aws_iam_group_policy_attachment.iam_group_policy_attachment_13_c_c",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "b1fc8d2d-aa45-40dd-b38c-780b160f02e2": {
      kind: "resource",
      address: "data.aws_iam_policy.change_password",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "f1b74bf3-c510-4da8-baaa-d199ffaa6267": {
      kind: "resource",
      address: "aws_iam_group_policy_attachment.default",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "76efa2d0-4ef5-414c-af9b-7e5467b8adb1": {
      kind: "resource",
      address: "aws_iam_user.users",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "b80b763b-bc6e-47c3-bdbd-ac5fe8bf37f7": {
      kind: "resource",
      address: "aws_iam_user_group_membership.default",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "f851591c-6a06-4091-874b-a9a3acce7c18": {
      kind: "resource",
      address: "aws_iam_user_login_profile.default",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    }
  }
});
