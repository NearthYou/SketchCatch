import { defineCapturedBrainboardTemplate } from "./define-source.ts";

export const awsRestApiDocumentDbSource = defineCapturedBrainboardTemplate({
  id: "brainboard-aws-rest-api-documentdb",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "9447b484-b256-42b3-b933-ced015820d0b",
    sourceUrl: "https://app.brainboard.co/templates/9447b484-b256-42b3-b933-ced015820d0b",
    cloneArchitectureId: "14351cfb-9a6d-4946-9654-c8a7a4911581",
    downloads: 631,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS REST API for DocumentDB",
  description: null,
  provider: "aws",
  viewport: {
    x: -351.53,
    y: -220.63,
    width: 2770.838709677419,
    height: 1516.2645161290322
  },
  nodes: [
    {
      sourceNodeId: "9adcf8e5-26cb-484e-9ae5-6535a6a1894d",
      domOrder: 0,
      label: "EU (Frankfurt)",
      position: {
        x: 615,
        y: 290
      },
      size: {
        width: 835,
        height: 545
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(615, 290), rotate(0 417.5 272.5)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "8cc66a70-095a-4dd1-b32d-9be569d07d43",
      domOrder: 1,
      label: "VPC",
      position: {
        x: 960,
        y: 340
      },
      size: {
        width: 450,
        height: 460
      },
      parentSourceNodeId: "9adcf8e5-26cb-484e-9ae5-6535a6a1894d",
      zIndex: 1,
      rawTransform: "translate(960, 340), rotate(0 225 230)",
      rotation: 0,
      rawResourceType: "aws_vpc"
    },
    {
      sourceNodeId: "6a793bea-ff9a-4951-bf42-7ff3f987219d",
      domOrder: 2,
      label: "DocumentDB API Subnet",
      position: {
        x: 1010,
        y: 460
      },
      size: {
        width: 345,
        height: 200
      },
      parentSourceNodeId: "8cc66a70-095a-4dd1-b32d-9be569d07d43",
      zIndex: 2,
      rawTransform: "translate(1010, 460), rotate(0 172.5 100)",
      rotation: 0,
      rawResourceType: "aws_subnet"
    },
    {
      sourceNodeId: "352c51ca-9f42-4d1d-b2ea-cddba97c5f91",
      domOrder: 3,
      label: "DocumentDB Handler Lambda Function",
      position: {
        x: 1060,
        y: 530
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "6a793bea-ff9a-4951-bf42-7ff3f987219d",
      zIndex: 3,
      rawTransform: "translate(1060, 530), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_lambda_function"
    },
    {
      sourceNodeId: "08ec8f09-61cc-4bca-aa03-bba22b030378",
      domOrder: 4,
      label: "External Integration Lambda Function",
      position: {
        x: 760,
        y: 360
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "9adcf8e5-26cb-484e-9ae5-6535a6a1894d",
      zIndex: 4,
      rawTransform: "translate(760, 360), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_lambda_function"
    },
    {
      sourceNodeId: "82fc5147-833e-4d85-a63e-7809cecbc533",
      domOrder: 5,
      label: "HTTP API",
      position: {
        x: 760,
        y: 530
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "9adcf8e5-26cb-484e-9ae5-6535a6a1894d",
      zIndex: 5,
      rawTransform: "translate(760, 530), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_apigatewayv2_api"
    },
    {
      sourceNodeId: "9ae294ea-de55-47ee-ac40-9fdc891717fa",
      domOrder: 6,
      label: "Credentials Secret",
      position: {
        x: 760,
        y: 710
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "9adcf8e5-26cb-484e-9ae5-6535a6a1894d",
      zIndex: 6,
      rawTransform: "translate(760, 710), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_secretsmanager_secret"
    },
    {
      sourceNodeId: "c3987042-939e-4ef9-bf00-40bae8f06412",
      domOrder: 7,
      label: "DocumentDB Cluster",
      position: {
        x: 1240,
        y: 530
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "6a793bea-ff9a-4951-bf42-7ff3f987219d",
      zIndex: 7,
      rawTransform: "translate(1240, 530), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_docdb_cluster"
    },
    {
      sourceNodeId: "e350f53e-754f-421b-b01d-46f66ce0c2a4",
      domOrder: 8,
      label: "Client",
      position: {
        x: 460,
        y: 530
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: null,
      zIndex: 8,
      rawTransform: "translate(460, 530), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "brainboard_icon"
    },
    {
      sourceNodeId: "15908d66-a92a-4177-9a30-abfc0f29eabc",
      domOrder: 9,
      label: "",
      position: {
        x: 880,
        y: 220
      },
      size: {
        width: 264.265625,
        height: 60
      },
      parentSourceNodeId: null,
      zIndex: 9,
      rawTransform: "translate(880, 220), rotate(0 132.1328125 30)",
      rotation: 0,
      rawResourceType: "text"
    }
  ],
  edges: [
    {
      sourceEdgeId: "2975fffe-3e7e-4baf-80cc-6921f05c2189",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "82fc5147-833e-4d85-a63e-7809cecbc533",
      targetNodeId: "08ec8f09-61cc-4bca-aa03-bba22b030378",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M790,530 L790,420",
      sourcePoint: {
        x: 790,
        y: 530
      },
      targetPoint: {
        x: 790,
        y: 420
      },
      waypoints: [
        {
          x: 790,
          y: 530
        },
        {
          x: 790,
          y: 420
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            785,525\n            790,530\n            785,535\n          ",
        transform: "rotate(90, 790, 530)"
      }
    },
    {
      sourceEdgeId: "2de8daf4-7956-4afd-acb0-6ad7e1a15268",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "352c51ca-9f42-4d1d-b2ea-cddba97c5f91",
      targetNodeId: "c3987042-939e-4ef9-bf00-40bae8f06412",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M1120,560 L1240,560",
      sourcePoint: {
        x: 1120,
        y: 560
      },
      targetPoint: {
        x: 1240,
        y: 560
      },
      waypoints: [
        {
          x: 1120,
          y: 560
        },
        {
          x: 1240,
          y: 560
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            1115,555\n            1120,560\n            1115,565\n          ",
        transform: "rotate(180, 1120, 560)"
      }
    },
    {
      sourceEdgeId: "97cb48c5-ae03-4178-9fad-4047e3d7fb3d",
      domOrder: 2,
      zIndex: 2,
      sourceNodeId: "82fc5147-833e-4d85-a63e-7809cecbc533",
      targetNodeId: "352c51ca-9f42-4d1d-b2ea-cddba97c5f91",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M820,560 L1060,560",
      sourcePoint: {
        x: 820,
        y: 560
      },
      targetPoint: {
        x: 1060,
        y: 560
      },
      waypoints: [
        {
          x: 820,
          y: 560
        },
        {
          x: 1060,
          y: 560
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            815,555\n            820,560\n            815,565\n          ",
        transform: "rotate(180, 820, 560)"
      }
    },
    {
      sourceEdgeId: "db7b08eb-2cf8-4038-b259-7c3abef7c8f1",
      domOrder: 3,
      zIndex: 3,
      sourceNodeId: "e350f53e-754f-421b-b01d-46f66ce0c2a4",
      targetNodeId: "82fc5147-833e-4d85-a63e-7809cecbc533",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M520,560 L760,560",
      sourcePoint: {
        x: 520,
        y: 560
      },
      targetPoint: {
        x: 760,
        y: 560
      },
      waypoints: [
        {
          x: 520,
          y: 560
        },
        {
          x: 760,
          y: 560
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            515,555\n            520,560\n            515,565\n          ",
        transform: "rotate(180, 520, 560)"
      }
    },
    {
      sourceEdgeId: "fc5bf73a-c480-411d-b573-47d461780982",
      domOrder: 4,
      zIndex: 4,
      sourceNodeId: "9ae294ea-de55-47ee-ac40-9fdc891717fa",
      targetNodeId: "352c51ca-9f42-4d1d-b2ea-cddba97c5f91",
      sourcePort: "right",
      targetPort: "left",
      svgPath: "M820,740 L932,740 Q940,740 940,732 L940,568 Q940,560 948,560 L1060,560",
      sourcePoint: {
        x: 820,
        y: 740
      },
      targetPoint: {
        x: 1060,
        y: 560
      },
      waypoints: [
        {
          x: 820,
          y: 740
        },
        {
          x: 932,
          y: 740
        },
        {
          x: 940,
          y: 740
        },
        {
          x: 940,
          y: 732
        },
        {
          x: 940,
          y: 568
        },
        {
          x: 940,
          y: 560
        },
        {
          x: 948,
          y: 560
        },
        {
          x: 1060,
          y: 560
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 180,
      rawArrow: {
        points: "\n            815,735\n            820,740\n            815,745\n          ",
        transform: "rotate(180, 820, 740)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_apigatewayv2_api" "restAPI-gw" {\n  protocol_type = "HTTP"\n  name          = "restAPI--gw"\n\n  tags = {\n    env      = "development"\n    archUUID = "1d36075c-54dd-4bf7-a797-c19d1ff008a3"\n  }\n}\n\nresource "aws_docdb_cluster" "restAPI-documentdb" {\n  tags = {\n    env      = "development"\n    archUUID = "1d36075c-54dd-4bf7-a797-c19d1ff008a3"\n  }\n}\n\nresource "aws_lambda_function" "restAPI-lambda" {\n  runtime       = "nodejs12.x"\n  role          = var.role\n  handler       = var.handler\n  function_name = "restAPI-function"\n\n  tags = {\n    env      = "development"\n    archUUID = "1d36075c-54dd-4bf7-a797-c19d1ff008a3"\n  }\n}\n\nresource "aws_lambda_function" "restAPI-lambda-ext" {\n  runtime       = "nodejs12.x"\n  role          = var.role-ext\n  handler       = var.handler-ext\n  function_name = "restAPI-function-ext"\n\n  tags = {\n    env      = "development"\n    archUUID = "1d36075c-54dd-4bf7-a797-c19d1ff008a3"\n  }\n}\n\nresource "aws_secretsmanager_secret" "restAPI-db-creds" {\n  tags = {\n    env      = "development"\n    archUUID = "1d36075c-54dd-4bf7-a797-c19d1ff008a3"\n  }\n}\n\nresource "aws_subnet" "restAPI-subnet" {\n  vpc_id     = aws_vpc.restAPI-vpc.id\n  cidr_block = "10.0.2.0/24"\n\n  tags = {\n    env      = "development"\n    archUUID = "1d36075c-54dd-4bf7-a797-c19d1ff008a3"\n  }\n}\n\nresource "aws_vpc" "restAPI-vpc" {\n  enable_dns_support = true\n  enable_classiclink = true\n  cidr_block         = "10.0.0.0/16"\n\n  tags = {\n    env      = "development"\n    archUUID = "1d36075c-54dd-4bf7-a797-c19d1ff008a3"\n  }\n}\n\n',
        sha256: "6b65c1627106f798e95e4cfab1b099e18d3f9021c812b6550e2cf97d33fdf04d",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'resource "aws_apigatewayv2_api" "restAPI-gw" {\n  protocol_type = "HTTP"\n  name          = "restAPI--gw"\n\n  tags = {\n    env      = "development"\n  }\n}\n\nresource "aws_docdb_cluster" "restAPI-documentdb" {\n  tags = {\n    env      = "development"\n  }\n}\n\nresource "aws_lambda_function" "restAPI-lambda" {\n  runtime       = "nodejs12.x"\n  role          = var.role\n  handler       = var.handler\n  function_name = "restAPI-function"\n\n  tags = {\n    env      = "development"\n  }\n}\n\nresource "aws_lambda_function" "restAPI-lambda-ext" {\n  runtime       = "nodejs12.x"\n  role          = var.role-ext\n  handler       = var.handler-ext\n  function_name = "restAPI-function-ext"\n\n  tags = {\n    env      = "development"\n  }\n}\n\nresource "aws_secretsmanager_secret" "restAPI-db-creds" {\n  tags = {\n    env      = "development"\n  }\n}\n\nresource "aws_subnet" "restAPI-subnet" {\n  vpc_id     = aws_vpc.restAPI-vpc.id\n  cidr_block = "10.0.2.0/24"\n\n  tags = {\n    env      = "development"\n  }\n}\n\nresource "aws_vpc" "restAPI-vpc" {\n  enable_dns_support = true\n  enable_classiclink = true\n  cidr_block         = "10.0.0.0/16"\n\n  tags = {\n    env      = "development"\n  }\n}\n\n',
          sha256: "15314e422186dcf19e94528fd8a023830d07fab61661ef3b80ac7c2d537d762f",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archUUID = "1d36075c-54dd-4bf7-a797-c19d1ff008a3"\n',
              occurrenceCount: 7
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
        code: 'terraform {\n  required_providers {\n    aws = {\n      version = "= 5.52.0"\n    }\n  }\n}\n\nprovider "aws" {\n  region = "eu-central-1"\n}\n',
        sha256: "e44edbd1fa01ff8a71630a9c3f9f717d85382cb69f5e3d0ba31145221067e5ac",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "14351cfb-9a6d-4946-9654-c8a7a4911581"\n  env      = "Production"\n}\n',
        sha256: "299170bd43a3e010ab7cc405cba8e3de665e957aa27e3c470dca7b1b9ffd93d2",
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
        code: 'variable "ext_runtime" {\n  type    = string\n  default = "nodejs18.x"\n}\n\nvariable "runtime" {\n  type    = string\n  default = "nodejs18.x"\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    archuuid = "9447b484-b256-42b3-b933-ced015820d0b"\n    env      = "Development"\n  }\n}\n\n',
        sha256: "c8fa2c4bee64d015fd7d0f2d95cfe63cd0f69721930649f3fe1e760f0f2b3f09",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'variable "ext_runtime" {\n  type    = string\n  default = "nodejs18.x"\n}\n\nvariable "runtime" {\n  type    = string\n  default = "nodejs18.x"\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    env      = "Development"\n  }\n}\n\n',
          sha256: "3d0b11ebb8cef95e412c2ee3af8e5166318a23d3580405211cf6c6bbe61d453e",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archuuid = "9447b484-b256-42b3-b933-ced015820d0b"\n',
              occurrenceCount: 1
            }
          ]
        }
      }
    ],
    resourceAddresses: [
      "aws_apigatewayv2_api.restAPI-gw",
      "aws_docdb_cluster.restAPI-documentdb",
      "aws_lambda_function.restAPI-lambda",
      "aws_lambda_function.restAPI-lambda-ext",
      "aws_secretsmanager_secret.restAPI-db-creds",
      "aws_subnet.restAPI-subnet",
      "aws_vpc.restAPI-vpc"
    ]
  },
  bindings: {
    "9adcf8e5-26cb-484e-9ae5-6535a6a1894d": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "8cc66a70-095a-4dd1-b32d-9be569d07d43": {
      kind: "resource",
      address: "aws_vpc.restAPI-vpc",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "6a793bea-ff9a-4951-bf42-7ff3f987219d": {
      kind: "resource",
      address: "aws_subnet.restAPI-subnet",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "352c51ca-9f42-4d1d-b2ea-cddba97c5f91": {
      kind: "resource",
      address: "aws_lambda_function.restAPI-lambda",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "08ec8f09-61cc-4bca-aa03-bba22b030378": {
      kind: "resource",
      address: "aws_lambda_function.restAPI-lambda-ext",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "82fc5147-833e-4d85-a63e-7809cecbc533": {
      kind: "resource",
      address: "aws_apigatewayv2_api.restAPI-gw",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "9ae294ea-de55-47ee-ac40-9fdc891717fa": {
      kind: "resource",
      address: "aws_secretsmanager_secret.restAPI-db-creds",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "c3987042-939e-4ef9-bf00-40bae8f06412": {
      kind: "resource",
      address: "aws_docdb_cluster.restAPI-documentdb",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "e350f53e-754f-421b-b01d-46f66ce0c2a4": {
      kind: "presentation",
      catalogId: "design-user-client",
      aliasOf: null,
      style: null
    },
    "15908d66-a92a-4177-9a30-abfc0f29eabc": {
      kind: "presentation",
      catalogId: null,
      aliasOf: null,
      style: null
    }
  }
});
