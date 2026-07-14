import { defineCapturedBrainboardTemplate } from "./define-source.ts";

export const crossAccountAwsS3Source = defineCapturedBrainboardTemplate({
  id: "brainboard-cross-account-aws-s3",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "6e3d35f1-eeb7-4015-9814-c3959928a3ac",
    sourceUrl: "https://app.brainboard.co/templates/6e3d35f1-eeb7-4015-9814-c3959928a3ac",
    cloneArchitectureId: "8480972d-c3ac-42e5-b9a3-c5a4b30c26dd",
    downloads: 68,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "Cross account AWS S3",
  description: null,
  provider: "aws",
  viewport: {
    x: -951.26,
    y: -703.99,
    width: 2499.870967741935,
    height: 1367.984946236559
  },
  nodes: [
    {
      sourceNodeId: "0f0bd504-1e5b-4eb7-b82b-c34e5673d088",
      domOrder: 0,
      label: "US East (N. Virginia)",
      position: {
        x: -215,
        y: -395
      },
      size: {
        width: 885,
        height: 730
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(-215, -395), rotate(0 442.5 365)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "abd36fbe-31bb-4fe3-b43e-9e77644f51b5",
      domOrder: 1,
      label: "",
      position: {
        x: -10,
        y: -260
      },
      size: {
        width: 500,
        height: 215
      },
      parentSourceNodeId: "0f0bd504-1e5b-4eb7-b82b-c34e5673d088",
      zIndex: 1,
      rawTransform: "translate(-10, -260), rotate(0 250 107.5)",
      rotation: 0,
      rawResourceType: "brainboard_shape"
    },
    {
      sourceNodeId: "6e055294-83c2-4d44-beac-e292b11dcb50",
      domOrder: 2,
      label: "",
      position: {
        x: -10,
        y: 30
      },
      size: {
        width: 495,
        height: 145
      },
      parentSourceNodeId: "0f0bd504-1e5b-4eb7-b82b-c34e5673d088",
      zIndex: 2,
      rawTransform: "translate(-10, 30), rotate(0 247.5 72.5)",
      rotation: 0,
      rawResourceType: "brainboard_shape"
    },
    {
      sourceNodeId: "5418dbae-f0eb-4864-8a8e-a9897008c92a",
      domOrder: 3,
      label: "S3 bucket Prod",
      position: {
        x: 90,
        y: -160
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "0f0bd504-1e5b-4eb7-b82b-c34e5673d088",
      zIndex: 3,
      rawTransform: "translate(90, -160), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket"
    },
    {
      sourceNodeId: "d1f9a61d-3dd0-4c39-bcca-83356b94db6c",
      domOrder: 4,
      label: "",
      position: {
        x: 10,
        y: -240
      },
      size: {
        width: 155,
        height: 60
      },
      parentSourceNodeId: "0f0bd504-1e5b-4eb7-b82b-c34e5673d088",
      zIndex: 4,
      rawTransform: "translate(10, -240), rotate(0 77.5 30)",
      rotation: 0,
      rawResourceType: "text"
    },
    {
      sourceNodeId: "0ff5c7a0-b03e-4e19-acc7-8c089bb7f92e",
      domOrder: 5,
      label: "Test",
      position: {
        x: 90,
        y: 80
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "0f0bd504-1e5b-4eb7-b82b-c34e5673d088",
      zIndex: 5,
      rawTransform: "translate(90, 80), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_object"
    },
    {
      sourceNodeId: "8b881706-f98a-48f1-9995-abf026d7768a",
      domOrder: 6,
      label: "Prod",
      position: {
        x: 360,
        y: -160
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "0f0bd504-1e5b-4eb7-b82b-c34e5673d088",
      zIndex: 6,
      rawTransform: "translate(360, -160), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_s3_bucket_object"
    },
    {
      sourceNodeId: "9b321598-8cb3-4d4f-9305-39e31c71f1e7",
      domOrder: 7,
      label: "",
      position: {
        x: 340,
        y: 40
      },
      size: {
        width: 135,
        height: 60
      },
      parentSourceNodeId: "0f0bd504-1e5b-4eb7-b82b-c34e5673d088",
      zIndex: 7,
      rawTransform: "translate(340, 40), rotate(0 67.5 30)",
      rotation: 0,
      rawResourceType: "text"
    }
  ],
  edges: [
    {
      sourceEdgeId: "5c1a830a-6e04-48a7-81fa-0517487b94ec",
      domOrder: 0,
      zIndex: 0,
      sourceNodeId: "8b881706-f98a-48f1-9995-abf026d7768a",
      targetNodeId: "5418dbae-f0eb-4864-8a8e-a9897008c92a",
      sourcePort: "left",
      targetPort: "right",
      svgPath: "M360,-130 L150,-130",
      sourcePoint: {
        x: 360,
        y: -130
      },
      targetPoint: {
        x: 150,
        y: -130
      },
      waypoints: [
        {
          x: 360,
          y: -130
        },
        {
          x: 150,
          y: -130
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 0,
      rawArrow: {
        points: "\n            355,-135\n            360,-130\n            355,-125\n          ",
        transform: "rotate(0, 360, -130)"
      }
    },
    {
      sourceEdgeId: "b621a6ca-ad1d-4d2b-ac17-71b5758b9638",
      domOrder: 1,
      zIndex: 1,
      sourceNodeId: "0ff5c7a0-b03e-4e19-acc7-8c089bb7f92e",
      targetNodeId: "5418dbae-f0eb-4864-8a8e-a9897008c92a",
      sourcePort: "top",
      targetPort: "bottom",
      svgPath: "M120,80 L120,-100",
      sourcePoint: {
        x: 120,
        y: 80
      },
      targetPoint: {
        x: 120,
        y: -100
      },
      waypoints: [
        {
          x: 120,
          y: 80
        },
        {
          x: 120,
          y: -100
        }
      ],
      arrowDirection: "target-to-source",
      arrowAngle: 90,
      rawArrow: {
        points: "\n            115,75\n            120,80\n            115,85\n          ",
        transform: "rotate(90, 120, 80)"
      }
    }
  ],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_s3_bucket" "bucket_prod" {\n  tags   = merge(var.tags, {})\n  policy = <<EOT\n{\n  "Version": "2012-10-17",\n  "Statement": [\n    {\n      "Sid": "AllowTest",\n      "Effect": "Allow",\n      "Principal": {\n        "AWS": "arn:aws:iam::${var.test_account_id}:root"\n      },\n      "Action": "s3:*",\n      "Resource": "arn:aws:s3:::${var.bucket_name}/*"\n    }\n  ]\n}\nEOT\n  bucket = var.bucket_name\n  acl    = "private"\n}\n\nresource "aws_s3_bucket_object" "s3_object_prod" {\n  tags    = merge(var.tags, {})\n  key     = "prod.txt"\n  content = "prod"\n  bucket  = aws_s3_bucket.bucket_prod.id\n}\n\nresource "aws_s3_bucket_object" "s3_object_prod_c" {\n  tags    = merge(var.tags, {})\n  key     = "test.txt"\n  content = "test"\n  bucket  = aws_s3_bucket.bucket_prod.id\n}\n\n',
        sha256: "8a9d04a54deddbca5f6e6ff7bc57a6ed27c84714fe357456bb68ccac42edfd72",
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
        code: 'provider "aws" {\n  alias = "prod"\n\n  region = "us-east-1"\n  # Optional, will use the credentials linked/scoped to this architecture injected by Brainboard\n  # access_key = "${var.prod_access_key}"\n  # secret_key = "${var.prod_secret_key}"\n}\n\nprovider "aws" {\n  alias = "test"\n\n  region     = "us-east-1"\n  access_key = "${var.test_access_key}"\n  secret_key = "${var.test_secret_key}"\n}\n',
        sha256: "788e157eb22c09c97b840a7e41488ff1bcc4f804cff50d934d49b0345a0cf89d",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "8480972d-c3ac-42e5-b9a3-c5a4b30c26dd"\n  env      = "Production"\n}\n',
        sha256: "74e66f6a578222fefc0f7be83f643bd27e7573c2b7e7f35074b042d0ae161f92",
        includeInWorkspace: false
      },
      {
        fileName: "variables.tf",
        code: 'variable "bucket_name" {\n  type = string\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    archuuid = "6e3d35f1-eeb7-4015-9814-c3959928a3ac"\n    env      = "Support"\n  }\n}\n\nvariable "test_access_key" {\n  type      = string\n  sensitive = true\n}\n\nvariable "test_account_id" {\n  type = string\n}\n\nvariable "test_secret_key" {\n  type      = string\n  sensitive = true\n}\n\n',
        sha256: "2c2a91422f7d8d7d94ecd684ff406311a4b980ea1c6f869681ed111ebc4ec452",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'variable "bucket_name" {\n  type = string\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    env      = "Support"\n  }\n}\n\nvariable "test_access_key" {\n  type      = string\n  sensitive = true\n}\n\nvariable "test_account_id" {\n  type = string\n}\n\nvariable "test_secret_key" {\n  type      = string\n  sensitive = true\n}\n\n',
          sha256: "52409a70aebff0d87af2a45c6dd95d179a641605c7af21f8fd0a68bab6adacb8",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archuuid = "6e3d35f1-eeb7-4015-9814-c3959928a3ac"\n',
              occurrenceCount: 1
            }
          ]
        }
      }
    ],
    resourceAddresses: [
      "aws_s3_bucket.bucket_prod",
      "aws_s3_bucket_object.s3_object_prod",
      "aws_s3_bucket_object.s3_object_prod_c"
    ]
  },
  bindings: {
    "0f0bd504-1e5b-4eb7-b82b-c34e5673d088": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "abd36fbe-31bb-4fe3-b43e-9e77644f51b5": {
      kind: "presentation",
      catalogId: null,
      aliasOf: null,
      style: null
    },
    "6e055294-83c2-4d44-beac-e292b11dcb50": {
      kind: "presentation",
      catalogId: null,
      aliasOf: null,
      style: null
    },
    "5418dbae-f0eb-4864-8a8e-a9897008c92a": {
      kind: "resource",
      address: "aws_s3_bucket.bucket_prod",
      fileName: "main.tf",
      addressMapping: "single-residual"
    },
    "d1f9a61d-3dd0-4c39-bcca-83356b94db6c": {
      kind: "presentation",
      catalogId: null,
      aliasOf: null,
      style: null
    },
    "0ff5c7a0-b03e-4e19-acc7-8c089bb7f92e": {
      kind: "resource",
      address: "aws_s3_bucket_object.s3_object_prod_c",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "8b881706-f98a-48f1-9995-abf026d7768a": {
      kind: "resource",
      address: "aws_s3_bucket_object.s3_object_prod",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "9b321598-8cb3-4d4f-9305-39e31c71f1e7": {
      kind: "presentation",
      catalogId: null,
      aliasOf: null,
      style: null
    }
  }
});
