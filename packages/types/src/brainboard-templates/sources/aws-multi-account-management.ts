import { defineCapturedBrainboardTemplate } from "./define-source.js";

export const awsMultiAccountManagementSource = defineCapturedBrainboardTemplate(
{
  "id": "brainboard-aws-multi-account-management",
  "origin": {
    "platform": "brainboard",
    "author": "Chafik Belhaoues",
    "sourceTemplateId": "a432a178-bbcb-4353-a6e4-fd6a557941e6",
    "sourceUrl": "https://app.brainboard.co/templates/a432a178-bbcb-4353-a6e4-fd6a557941e6",
    "cloneArchitectureId": "27865202-035e-4865-9f8f-253bea5cd997",
    "downloads": 220,
    "capturedAt": "2026-07-14"
  },
  "captureStatus": "captured",
  "title": "AWS multi-account management",
  "description": null,
  "provider": "aws",
  "viewport": {
    "x": -3021.13,
    "y": -2206.39,
    "width": 6693.41935483871,
    "height": 3662.787813620072
  },
  "nodes": [
    {
      "sourceNodeId": "258ffd07-ae27-412c-8c6e-192ffbbb76de",
      "domOrder": 0,
      "label": "Prod account",
      "position": {
        "x": -1120,
        "y": -545
      },
      "size": {
        "width": 800,
        "height": 600
      },
      "parentSourceNodeId": null,
      "zIndex": 0,
      "rawTransform": "translate(-1120, -545), rotate(0 400 300)",
      "rotation": 0,
      "rawResourceType": "region"
    },
    {
      "sourceNodeId": "4072261f-b484-4e8f-a25d-2e038ba119b4",
      "domOrder": 1,
      "label": "AWS accounts",
      "position": {
        "x": -160,
        "y": -825
      },
      "size": {
        "width": 595,
        "height": 200
      },
      "parentSourceNodeId": null,
      "zIndex": 1,
      "rawTransform": "translate(-160, -825), rotate(0 297.5 100)",
      "rotation": 0,
      "rawResourceType": "brainboard_group"
    },
    {
      "sourceNodeId": "c50301f8-0517-4fb9-8a05-3123e0c7dedd",
      "domOrder": 2,
      "label": "Dev account",
      "position": {
        "x": 590,
        "y": -545
      },
      "size": {
        "width": 800,
        "height": 600
      },
      "parentSourceNodeId": null,
      "zIndex": 2,
      "rawTransform": "translate(590, -545), rotate(0 400 300)",
      "rotation": 0,
      "rawResourceType": "region"
    },
    {
      "sourceNodeId": "d2ec1630-f50e-4c5f-b898-8a9a65dbb2ce",
      "domOrder": 3,
      "label": "Staging account",
      "position": {
        "x": -265,
        "y": -545
      },
      "size": {
        "width": 800,
        "height": 600
      },
      "parentSourceNodeId": null,
      "zIndex": 3,
      "rawTransform": "translate(-265, -545), rotate(0 400 300)",
      "rotation": 0,
      "rawResourceType": "region"
    },
    {
      "sourceNodeId": "18592886-fb21-48dc-8fab-059177b9634b",
      "domOrder": 4,
      "label": "staging_vpc",
      "position": {
        "x": -220,
        "y": -475
      },
      "size": {
        "width": 715,
        "height": 490
      },
      "parentSourceNodeId": "d2ec1630-f50e-4c5f-b898-8a9a65dbb2ce",
      "zIndex": 4,
      "rawTransform": "translate(-220, -475), rotate(0 357.5 245)",
      "rotation": 0,
      "rawResourceType": "aws_vpc"
    },
    {
      "sourceNodeId": "bfac85f0-4bdd-4b46-8507-8926a71e8b72",
      "domOrder": 5,
      "label": "dev_vpc",
      "position": {
        "x": 635,
        "y": -490
      },
      "size": {
        "width": 715,
        "height": 490
      },
      "parentSourceNodeId": "c50301f8-0517-4fb9-8a05-3123e0c7dedd",
      "zIndex": 5,
      "rawTransform": "translate(635, -490), rotate(0 357.5 245)",
      "rotation": 0,
      "rawResourceType": "aws_vpc"
    },
    {
      "sourceNodeId": "ddc96bd1-f6ae-4e61-8944-b779f74bf50c",
      "domOrder": 6,
      "label": "prod_vpc",
      "position": {
        "x": -1080,
        "y": -475
      },
      "size": {
        "width": 715,
        "height": 490
      },
      "parentSourceNodeId": "258ffd07-ae27-412c-8c6e-192ffbbb76de",
      "zIndex": 6,
      "rawTransform": "translate(-1080, -475), rotate(0 357.5 245)",
      "rotation": 0,
      "rawResourceType": "aws_vpc"
    },
    {
      "sourceNodeId": "114ce859-8066-4c14-94da-52b3638dd9ee",
      "domOrder": 7,
      "label": "var.az2",
      "position": {
        "x": 200,
        "y": -405
      },
      "size": {
        "width": 260,
        "height": 380
      },
      "parentSourceNodeId": "18592886-fb21-48dc-8fab-059177b9634b",
      "zIndex": 7,
      "rawTransform": "translate(200, -405), rotate(0 130 190)",
      "rotation": 0,
      "rawResourceType": "availability_zone"
    },
    {
      "sourceNodeId": "1dba0c64-caab-49ce-b64a-84c2f72ec1cc",
      "domOrder": 8,
      "label": "var.az1",
      "position": {
        "x": -1040,
        "y": -405
      },
      "size": {
        "width": 260,
        "height": 380
      },
      "parentSourceNodeId": "ddc96bd1-f6ae-4e61-8944-b779f74bf50c",
      "zIndex": 8,
      "rawTransform": "translate(-1040, -405), rotate(0 130 190)",
      "rotation": 0,
      "rawResourceType": "availability_zone"
    },
    {
      "sourceNodeId": "46b74daa-6c97-4991-af63-d172eb3e8b1d",
      "domOrder": 9,
      "label": "var.az2",
      "position": {
        "x": -660,
        "y": -405
      },
      "size": {
        "width": 260,
        "height": 380
      },
      "parentSourceNodeId": "ddc96bd1-f6ae-4e61-8944-b779f74bf50c",
      "zIndex": 9,
      "rawTransform": "translate(-660, -405), rotate(0 130 190)",
      "rotation": 0,
      "rawResourceType": "availability_zone"
    },
    {
      "sourceNodeId": "6c1d860b-04c2-4975-acd9-da97fcb87e28",
      "domOrder": 10,
      "label": "var.az1",
      "position": {
        "x": 675,
        "y": -420
      },
      "size": {
        "width": 260,
        "height": 380
      },
      "parentSourceNodeId": "bfac85f0-4bdd-4b46-8507-8926a71e8b72",
      "zIndex": 10,
      "rawTransform": "translate(675, -420), rotate(0 130 190)",
      "rotation": 0,
      "rawResourceType": "availability_zone"
    },
    {
      "sourceNodeId": "8daa8193-2ae3-4554-8bc8-8d5c5ea49fc4",
      "domOrder": 11,
      "label": "var.az2",
      "position": {
        "x": 1055,
        "y": -420
      },
      "size": {
        "width": 260,
        "height": 380
      },
      "parentSourceNodeId": "bfac85f0-4bdd-4b46-8507-8926a71e8b72",
      "zIndex": 11,
      "rawTransform": "translate(1055, -420), rotate(0 130 190)",
      "rotation": 0,
      "rawResourceType": "availability_zone"
    },
    {
      "sourceNodeId": "9a55fdc1-61fd-48dc-ba55-4fd900303cd1",
      "domOrder": 12,
      "label": "var.az1",
      "position": {
        "x": -180,
        "y": -405
      },
      "size": {
        "width": 260,
        "height": 380
      },
      "parentSourceNodeId": "18592886-fb21-48dc-8fab-059177b9634b",
      "zIndex": 12,
      "rawTransform": "translate(-180, -405), rotate(0 130 190)",
      "rotation": 0,
      "rawResourceType": "availability_zone"
    },
    {
      "sourceNodeId": "0c7dce6c-a8a7-4a8f-82d5-c49cba3bb928",
      "domOrder": 13,
      "label": "staging_snet1",
      "position": {
        "x": -160,
        "y": -275
      },
      "size": {
        "width": 215,
        "height": 155
      },
      "parentSourceNodeId": "9a55fdc1-61fd-48dc-ba55-4fd900303cd1",
      "zIndex": 13,
      "rawTransform": "translate(-160, -275), rotate(0 107.5 77.5)",
      "rotation": 0,
      "rawResourceType": "aws_subnet"
    },
    {
      "sourceNodeId": "3001c016-1493-4d58-8768-b2931b576bd4",
      "domOrder": 14,
      "label": "staging_snet2",
      "position": {
        "x": 220,
        "y": -270
      },
      "size": {
        "width": 215,
        "height": 155
      },
      "parentSourceNodeId": "114ce859-8066-4c14-94da-52b3638dd9ee",
      "zIndex": 14,
      "rawTransform": "translate(220, -270), rotate(0 107.5 77.5)",
      "rotation": 0,
      "rawResourceType": "aws_subnet"
    },
    {
      "sourceNodeId": "3607f798-6454-4e9b-a6eb-ca801c34d712",
      "domOrder": 15,
      "label": "prod_snet1",
      "position": {
        "x": -1020,
        "y": -275
      },
      "size": {
        "width": 215,
        "height": 155
      },
      "parentSourceNodeId": "1dba0c64-caab-49ce-b64a-84c2f72ec1cc",
      "zIndex": 15,
      "rawTransform": "translate(-1020, -275), rotate(0 107.5 77.5)",
      "rotation": 0,
      "rawResourceType": "aws_subnet"
    },
    {
      "sourceNodeId": "b49067a3-6b76-4dec-acd7-dde436c44ca9",
      "domOrder": 16,
      "label": "prod_snet2",
      "position": {
        "x": -635,
        "y": -275
      },
      "size": {
        "width": 215,
        "height": 155
      },
      "parentSourceNodeId": "46b74daa-6c97-4991-af63-d172eb3e8b1d",
      "zIndex": 16,
      "rawTransform": "translate(-635, -275), rotate(0 107.5 77.5)",
      "rotation": 0,
      "rawResourceType": "aws_subnet"
    },
    {
      "sourceNodeId": "bf6846e5-0f9e-445a-a19d-63417cd4a3f2",
      "domOrder": 17,
      "label": "dev_snet2",
      "position": {
        "x": 1080,
        "y": -290
      },
      "size": {
        "width": 215,
        "height": 155
      },
      "parentSourceNodeId": "8daa8193-2ae3-4554-8bc8-8d5c5ea49fc4",
      "zIndex": 17,
      "rawTransform": "translate(1080, -290), rotate(0 107.5 77.5)",
      "rotation": 0,
      "rawResourceType": "aws_subnet"
    },
    {
      "sourceNodeId": "dd728495-b7d3-4836-a45e-8678e3c8856c",
      "domOrder": 18,
      "label": "dev_snet1",
      "position": {
        "x": 695,
        "y": -290
      },
      "size": {
        "width": 215,
        "height": 155
      },
      "parentSourceNodeId": "6c1d860b-04c2-4975-acd9-da97fcb87e28",
      "zIndex": 18,
      "rawTransform": "translate(695, -290), rotate(0 107.5 77.5)",
      "rotation": 0,
      "rawResourceType": "aws_subnet"
    },
    {
      "sourceNodeId": "086875d3-7510-45d7-ad0f-2292bf5c5df3",
      "domOrder": 19,
      "label": "dev account",
      "position": {
        "x": 240,
        "y": -755
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": null,
      "zIndex": 19,
      "rawTransform": "translate(240, -755), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_organizations_account"
    },
    {
      "sourceNodeId": "229ad76b-75e3-4009-994f-3d15fe4bdc45",
      "domOrder": 20,
      "label": "staging account",
      "position": {
        "x": 105,
        "y": -755
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": null,
      "zIndex": 20,
      "rawTransform": "translate(105, -755), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_organizations_account"
    },
    {
      "sourceNodeId": "91e0f16f-fc9d-4138-ad10-314b294cf868",
      "domOrder": 21,
      "label": "prod account",
      "position": {
        "x": -30,
        "y": -755
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": null,
      "zIndex": 21,
      "rawTransform": "translate(-30, -755), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_organizations_account"
    },
    {
      "sourceNodeId": "01fcba84-c396-4fe3-8548-fd7f8f8dd0d6",
      "domOrder": 22,
      "label": "staging_vm1",
      "position": {
        "x": -80,
        "y": -220
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "0c7dce6c-a8a7-4a8f-82d5-c49cba3bb928",
      "zIndex": 22,
      "rawTransform": "translate(-80, -220), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_instance"
    },
    {
      "sourceNodeId": "02bfe5e0-3cab-412d-9f1a-4a255e2fd0ed",
      "domOrder": 23,
      "label": "dev_vm1",
      "position": {
        "x": 775,
        "y": -235
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "dd728495-b7d3-4836-a45e-8678e3c8856c",
      "zIndex": 23,
      "rawTransform": "translate(775, -235), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_instance"
    },
    {
      "sourceNodeId": "07e49279-4122-4ddc-ae62-aa9aa697e2f8",
      "domOrder": 24,
      "label": "dev_vm2",
      "position": {
        "x": 1160,
        "y": -235
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "bf6846e5-0f9e-445a-a19d-63417cd4a3f2",
      "zIndex": 24,
      "rawTransform": "translate(1160, -235), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_instance"
    },
    {
      "sourceNodeId": "2b80a185-bfe7-46f3-b0ef-24ff013e49d0",
      "domOrder": 25,
      "label": "staging_vm2",
      "position": {
        "x": 300,
        "y": -215
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "3001c016-1493-4d58-8768-b2931b576bd4",
      "zIndex": 25,
      "rawTransform": "translate(300, -215), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_instance"
    },
    {
      "sourceNodeId": "4b301033-2e1b-4db8-94f9-d512723b13e0",
      "domOrder": 26,
      "label": "prod_vm1",
      "position": {
        "x": -940,
        "y": -220
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "3607f798-6454-4e9b-a6eb-ca801c34d712",
      "zIndex": 26,
      "rawTransform": "translate(-940, -220), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_instance"
    },
    {
      "sourceNodeId": "943ef3bf-c56d-4691-927b-14f5555cf725",
      "domOrder": 27,
      "label": "prod_vm2",
      "position": {
        "x": -555,
        "y": -220
      },
      "size": {
        "width": 60,
        "height": 60
      },
      "parentSourceNodeId": "b49067a3-6b76-4dec-acd7-dde436c44ca9",
      "zIndex": 27,
      "rawTransform": "translate(-555, -220), rotate(0 30 30)",
      "rotation": 0,
      "rawResourceType": "aws_instance"
    }
  ],
  "edges": [
    {
      "sourceEdgeId": "0cb6ecb8-9f69-4556-aa26-5fb32a6d84e2",
      "domOrder": 0,
      "zIndex": 0,
      "sourceNodeId": "229ad76b-75e3-4009-994f-3d15fe4bdc45",
      "targetNodeId": "d2ec1630-f50e-4c5f-b898-8a9a65dbb2ce",
      "sourcePort": "bottom",
      "targetPort": "top",
      "svgPath": "M135,-695 L135,-545",
      "sourcePoint": {
        "x": 135,
        "y": -695
      },
      "targetPoint": {
        "x": 135,
        "y": -545
      },
      "waypoints": [
        {
          "x": 135,
          "y": -695
        },
        {
          "x": 135,
          "y": -545
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 90,
      "rawArrow": {
        "points": "\n            130,-550\n            135,-545\n            130,-540\n          ",
        "transform": "rotate(90, 135, -545)"
      }
    },
    {
      "sourceEdgeId": "0f283144-d112-4ad3-8426-d96cc663eb8f",
      "domOrder": 1,
      "zIndex": 1,
      "sourceNodeId": "91e0f16f-fc9d-4138-ad10-314b294cf868",
      "targetNodeId": "258ffd07-ae27-412c-8c6e-192ffbbb76de",
      "sourcePort": "left",
      "targetPort": "top",
      "svgPath": "M-30,-725 L-712,-725 Q-720,-725 -720,-717 L-720,-545",
      "sourcePoint": {
        "x": -30,
        "y": -725
      },
      "targetPoint": {
        "x": -720,
        "y": -545
      },
      "waypoints": [
        {
          "x": -30,
          "y": -725
        },
        {
          "x": -712,
          "y": -725
        },
        {
          "x": -720,
          "y": -725
        },
        {
          "x": -720,
          "y": -717
        },
        {
          "x": -720,
          "y": -545
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 90,
      "rawArrow": {
        "points": "\n            -725,-550\n            -720,-545\n            -725,-540\n          ",
        "transform": "rotate(90, -720, -545)"
      }
    },
    {
      "sourceEdgeId": "7ab41dab-3b54-4980-9ff7-f6bf74af1279",
      "domOrder": 2,
      "zIndex": 2,
      "sourceNodeId": "086875d3-7510-45d7-ad0f-2292bf5c5df3",
      "targetNodeId": "c50301f8-0517-4fb9-8a05-3123e0c7dedd",
      "sourcePort": "right",
      "targetPort": "top",
      "svgPath": "M300,-725 L982,-725 Q990,-725 990,-717 L990,-545",
      "sourcePoint": {
        "x": 300,
        "y": -725
      },
      "targetPoint": {
        "x": 990,
        "y": -545
      },
      "waypoints": [
        {
          "x": 300,
          "y": -725
        },
        {
          "x": 982,
          "y": -725
        },
        {
          "x": 990,
          "y": -725
        },
        {
          "x": 990,
          "y": -717
        },
        {
          "x": 990,
          "y": -545
        }
      ],
      "arrowDirection": "source-to-target",
      "arrowAngle": 90,
      "rawArrow": {
        "points": "\n            985,-550\n            990,-545\n            985,-540\n          ",
        "transform": "rotate(90, 990, -545)"
      }
    }
  ],
  "terraform": {
    "files": [
      {
        "fileName": "main.tf",
        "code": "",
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "includeInWorkspace": true
      },
      {
        "fileName": "accounts.tf",
        "code": "resource \"aws_organizations_account\" \"dev\" {\n  provider = aws.us-east-2\n\n  tags      = merge(var.tags, {})\n  role_name = \"admin\"\n  name      = \"brainboard-dev-env\"\n  email     = \"dev@brainboard.co\"\n}\n\nresource \"aws_organizations_account\" \"prod\" {\n  provider = aws.us-east-2\n\n  tags      = merge(var.tags, {})\n  role_name = \"admin\"\n  name      = \"brainboard-prod-env\"\n  email     = \"prod@brainboard.co\"\n}\n\nresource \"aws_organizations_account\" \"staging\" {\n  provider = aws.us-east-2\n\n  tags      = merge(var.tags, {})\n  role_name = \"admin\"\n  name      = \"brainboard-staging-env\"\n  email     = \"staging@brainboard.co\"\n}\n\n",
        "sha256": "b99482eff0d05267309b7d6b188a780d6c0bf83152458fd0ddfe9bea50a1b60e",
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
        "fileName": "prod-account.tf",
        "code": "resource \"aws_vpc\" \"prod_vpc\" {\n  provider = aws.prod\n\n  tags       = merge(var.tags, {})\n  cidr_block = var.cidr_block\n}\n\nresource \"aws_subnet\" \"prod_snet1\" {\n  provider = aws.prod\n\n  vpc_id            = aws_vpc.prod_vpc.id\n  tags              = merge(var.tags, {})\n  availability_zone = var.az1\n}\n\nresource \"aws_instance\" \"prod_vm1\" {\n  provider = aws.prod\n\n  tags              = merge(var.tags, {})\n  subnet_id         = aws_subnet.staging_snet2.id\n  instance_type     = var.instance_size\n  availability_zone = var.az1\n  ami               = var.default_ami\n}\n\nresource \"aws_subnet\" \"prod_snet2\" {\n  provider = aws.prod\n\n  vpc_id            = aws_vpc.prod_vpc.id\n  tags              = merge(var.tags, {})\n  availability_zone = var.az2\n}\n\nresource \"aws_instance\" \"prod_vm2\" {\n  provider = aws.prod\n\n  tags              = merge(var.tags, {})\n  subnet_id         = aws_subnet.staging_snet2.id\n  instance_type     = var.instance_size\n  availability_zone = var.az2\n  ami               = var.default_ami\n}\n\nresource \"aws_vpc\" \"staging_vpc\" {\n  provider = aws.staging\n\n  tags       = merge(var.tags, {})\n  cidr_block = var.cidr_block\n}\n\nresource \"aws_subnet\" \"staging_snet1\" {\n  provider = aws.staging\n\n  vpc_id            = aws_vpc.staging_vpc.id\n  tags              = merge(var.tags, {})\n  availability_zone = var.az1\n}\n\nresource \"aws_instance\" \"staging_vm1\" {\n  provider = aws.staging\n\n  tags              = merge(var.tags, {})\n  subnet_id         = aws_subnet.staging_snet1.id\n  instance_type     = var.instance_size\n  availability_zone = var.az1\n  ami               = var.default_ami\n}\n\nresource \"aws_subnet\" \"staging_snet2\" {\n  provider = aws.staging\n\n  vpc_id            = aws_vpc.staging_vpc.id\n  tags              = merge(var.tags, {})\n  availability_zone = var.az2\n}\n\nresource \"aws_instance\" \"staging_vm2\" {\n  provider = aws.staging\n\n  tags              = merge(var.tags, {})\n  subnet_id         = aws_subnet.staging_snet2.id\n  instance_type     = var.instance_size\n  availability_zone = var.az2\n  ami               = var.default_ami\n}\n\nresource \"aws_vpc\" \"dev_vpc\" {\n  provider = aws.dev\n\n  tags       = merge(var.tags, {})\n  cidr_block = var.cidr_block\n}\n\nresource \"aws_subnet\" \"dev_snet1\" {\n  provider = aws.dev\n\n  vpc_id            = aws_vpc.dev_vpc.id\n  tags              = merge(var.tags, {})\n  availability_zone = var.az1\n}\n\nresource \"aws_instance\" \"dev_vm1\" {\n  provider = aws.dev\n\n  tags              = merge(var.tags, {})\n  subnet_id         = aws_subnet.dev_snet1.id\n  instance_type     = var.instance_size\n  availability_zone = var.az1\n  ami               = var.default_ami\n}\n\nresource \"aws_subnet\" \"dev_snet2\" {\n  provider = aws.dev\n\n  vpc_id            = aws_vpc.dev_vpc.id\n  tags              = merge(var.tags, {})\n  availability_zone = var.az2\n}\n\nresource \"aws_instance\" \"dev_vm2\" {\n  provider = aws.dev\n\n  tags              = merge(var.tags, {})\n  subnet_id         = aws_subnet.dev_snet2.id\n  instance_type     = var.instance_size\n  availability_zone = var.az2\n  ami               = var.default_ami\n}\n\n",
        "sha256": "16497fcd8f76a444beeade3c1a3c10536bcc72f0e2488848bb631d2cc6492919",
        "includeInWorkspace": true
      },
      {
        "fileName": "providers.tf",
        "code": "terraform {\n  required_providers {\n    aws = {\n      version = \"~> 5.52.0\"\n    }\n  }\n}\n\nprovider \"aws\" {\n  region = \"us-east-2\"\n}\n\nprovider \"aws\" {\n  assume_role {\n    role_arn = \"arn:aws:iam::${aws_organizations_account.prod.id}:role/admin\"\n  }\n\n  alias  = \"prod\"\n  region = \"us-east-2\"\n}\n\nprovider \"aws\" {\n  assume_role {\n    role_arn = \"arn:aws:iam::${aws_organizations_account.staging.id}:role/admin\"\n  }\n\n  alias  = \"staging\"\n  region = \"us-east-2\"\n}\n\nprovider \"aws\" {\n  assume_role {\n    role_arn = \"arn:aws:iam::${aws_organizations_account.dev.id}:role/admin\"\n  }\n\n  alias  = \"dev\"\n  region = \"us-east-2\"\n}\n",
        "sha256": "80113d379901fa3bf2a578f4eaf2e94cbd322d54cde22afe9d1383ab3e3195df",
        "includeInWorkspace": true
      },
      {
        "fileName": "terraform.tfvars",
        "code": "# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = \"27865202-035e-4865-9f8f-253bea5cd997\"\n  env      = \"Production\"\n}\n",
        "sha256": "1946f290a6264fa56bcbf9069ece8e119f4b367a51d5717fc143197d7408fd6d",
        "includeInWorkspace": false
      },
      {
        "fileName": "variables.tf",
        "code": "variable \"az1\" {\n  type    = string\n  default = \"us-east-2a\"\n}\n\nvariable \"az2\" {\n  type    = string\n  default = \"us-east-2b\"\n}\n\nvariable \"cidr_block\" {\n  type    = string\n  default = \"10.0.0.0/16\"\n}\n\nvariable \"default_ami\" {\n  description = \"The default AMI in Ohio region.\"\n  type        = string\n  default     = \"ami-0a695f0d95cefc163\"\n}\n\nvariable \"instance_size\" {\n  type    = string\n  default = \"a1.medium\"\n}\n\nvariable \"tags\" {\n  type    = map(any)\n  default = {}\n}\n\n",
        "sha256": "44c34302ccc9c005058bfa38eba647046c44aaa82b0ffce311b4a60baafdfbb5",
        "includeInWorkspace": true
      }
    ],
    "resourceAddresses": [
      "aws_organizations_account.dev",
      "aws_organizations_account.prod",
      "aws_organizations_account.staging",
      "aws_vpc.prod_vpc",
      "aws_subnet.prod_snet1",
      "aws_instance.prod_vm1",
      "aws_subnet.prod_snet2",
      "aws_instance.prod_vm2",
      "aws_vpc.staging_vpc",
      "aws_subnet.staging_snet1",
      "aws_instance.staging_vm1",
      "aws_subnet.staging_snet2",
      "aws_instance.staging_vm2",
      "aws_vpc.dev_vpc",
      "aws_subnet.dev_snet1",
      "aws_instance.dev_vm1",
      "aws_subnet.dev_snet2",
      "aws_instance.dev_vm2"
    ]
  },
  "bindings": {
    "258ffd07-ae27-412c-8c6e-192ffbbb76de": {
      "kind": "presentation",
      "catalogId": "aws-region",
      "aliasOf": null,
      "style": null
    },
    "4072261f-b484-4e8f-a25d-2e038ba119b4": {
      "kind": "presentation",
      "catalogId": "design-group",
      "aliasOf": null,
      "style": null
    },
    "c50301f8-0517-4fb9-8a05-3123e0c7dedd": {
      "kind": "presentation",
      "catalogId": "aws-region",
      "aliasOf": null,
      "style": null
    },
    "d2ec1630-f50e-4c5f-b898-8a9a65dbb2ce": {
      "kind": "presentation",
      "catalogId": "aws-region",
      "aliasOf": null,
      "style": null
    },
    "18592886-fb21-48dc-8fab-059177b9634b": {
      "kind": "resource",
      "address": "aws_vpc.staging_vpc",
      "fileName": "prod-account.tf",
      "addressMapping": "exact-title"
    },
    "bfac85f0-4bdd-4b46-8507-8926a71e8b72": {
      "kind": "resource",
      "address": "aws_vpc.dev_vpc",
      "fileName": "prod-account.tf",
      "addressMapping": "exact-title"
    },
    "ddc96bd1-f6ae-4e61-8944-b779f74bf50c": {
      "kind": "resource",
      "address": "aws_vpc.prod_vpc",
      "fileName": "prod-account.tf",
      "addressMapping": "exact-title"
    },
    "114ce859-8066-4c14-94da-52b3638dd9ee": {
      "kind": "presentation",
      "catalogId": "aws-availability-zone",
      "aliasOf": null,
      "style": null
    },
    "1dba0c64-caab-49ce-b64a-84c2f72ec1cc": {
      "kind": "presentation",
      "catalogId": "aws-availability-zone",
      "aliasOf": null,
      "style": null
    },
    "46b74daa-6c97-4991-af63-d172eb3e8b1d": {
      "kind": "presentation",
      "catalogId": "aws-availability-zone",
      "aliasOf": null,
      "style": null
    },
    "6c1d860b-04c2-4975-acd9-da97fcb87e28": {
      "kind": "presentation",
      "catalogId": "aws-availability-zone",
      "aliasOf": null,
      "style": null
    },
    "8daa8193-2ae3-4554-8bc8-8d5c5ea49fc4": {
      "kind": "presentation",
      "catalogId": "aws-availability-zone",
      "aliasOf": null,
      "style": null
    },
    "9a55fdc1-61fd-48dc-ba55-4fd900303cd1": {
      "kind": "presentation",
      "catalogId": "aws-availability-zone",
      "aliasOf": null,
      "style": null
    },
    "0c7dce6c-a8a7-4a8f-82d5-c49cba3bb928": {
      "kind": "resource",
      "address": "aws_subnet.staging_snet1",
      "fileName": "prod-account.tf",
      "addressMapping": "exact-title"
    },
    "3001c016-1493-4d58-8768-b2931b576bd4": {
      "kind": "resource",
      "address": "aws_subnet.staging_snet2",
      "fileName": "prod-account.tf",
      "addressMapping": "exact-title"
    },
    "3607f798-6454-4e9b-a6eb-ca801c34d712": {
      "kind": "resource",
      "address": "aws_subnet.prod_snet1",
      "fileName": "prod-account.tf",
      "addressMapping": "exact-title"
    },
    "b49067a3-6b76-4dec-acd7-dde436c44ca9": {
      "kind": "resource",
      "address": "aws_subnet.prod_snet2",
      "fileName": "prod-account.tf",
      "addressMapping": "exact-title"
    },
    "bf6846e5-0f9e-445a-a19d-63417cd4a3f2": {
      "kind": "resource",
      "address": "aws_subnet.dev_snet2",
      "fileName": "prod-account.tf",
      "addressMapping": "exact-title"
    },
    "dd728495-b7d3-4836-a45e-8678e3c8856c": {
      "kind": "resource",
      "address": "aws_subnet.dev_snet1",
      "fileName": "prod-account.tf",
      "addressMapping": "exact-title"
    },
    "086875d3-7510-45d7-ad0f-2292bf5c5df3": {
      "kind": "resource",
      "address": "aws_organizations_account.dev",
      "fileName": "accounts.tf",
      "addressMapping": "reviewed-override"
    },
    "229ad76b-75e3-4009-994f-3d15fe4bdc45": {
      "kind": "resource",
      "address": "aws_organizations_account.staging",
      "fileName": "accounts.tf",
      "addressMapping": "reviewed-override"
    },
    "91e0f16f-fc9d-4138-ad10-314b294cf868": {
      "kind": "resource",
      "address": "aws_organizations_account.prod",
      "fileName": "accounts.tf",
      "addressMapping": "reviewed-override"
    },
    "01fcba84-c396-4fe3-8548-fd7f8f8dd0d6": {
      "kind": "resource",
      "address": "aws_instance.staging_vm1",
      "fileName": "prod-account.tf",
      "addressMapping": "exact-title"
    },
    "02bfe5e0-3cab-412d-9f1a-4a255e2fd0ed": {
      "kind": "resource",
      "address": "aws_instance.dev_vm1",
      "fileName": "prod-account.tf",
      "addressMapping": "exact-title"
    },
    "07e49279-4122-4ddc-ae62-aa9aa697e2f8": {
      "kind": "resource",
      "address": "aws_instance.dev_vm2",
      "fileName": "prod-account.tf",
      "addressMapping": "exact-title"
    },
    "2b80a185-bfe7-46f3-b0ef-24ff013e49d0": {
      "kind": "resource",
      "address": "aws_instance.staging_vm2",
      "fileName": "prod-account.tf",
      "addressMapping": "exact-title"
    },
    "4b301033-2e1b-4db8-94f9-d512723b13e0": {
      "kind": "resource",
      "address": "aws_instance.prod_vm1",
      "fileName": "prod-account.tf",
      "addressMapping": "exact-title"
    },
    "943ef3bf-c56d-4691-927b-14f5555cf725": {
      "kind": "resource",
      "address": "aws_instance.prod_vm2",
      "fileName": "prod-account.tf",
      "addressMapping": "exact-title"
    }
  }
}
);
