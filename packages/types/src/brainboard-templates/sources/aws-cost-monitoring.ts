import { defineCapturedBrainboardTemplate } from "./define-source.ts";

export const awsCostMonitoringSource = defineCapturedBrainboardTemplate({
  id: "brainboard-aws-costs-monitoring",
  origin: {
    platform: "brainboard",
    author: "Chafik Belhaoues",
    sourceTemplateId: "6e651e34-318d-41e2-b229-86d30aa0520f",
    sourceUrl: "https://app.brainboard.co/templates/6e651e34-318d-41e2-b229-86d30aa0520f",
    cloneArchitectureId: "cb973376-0fdd-4651-aaa2-d204bfc8c89b",
    downloads: 292,
    capturedAt: "2026-07-14"
  },
  captureStatus: "captured",
  title: "AWS costs monitoring",
  description: null,
  provider: "aws",
  viewport: {
    x: -162.05,
    y: -109.97,
    width: 1854.7096774193546,
    height: 1014.9383512544803
  },
  nodes: [
    {
      sourceNodeId: "0d74f9f8-6756-42e7-81e7-795b61a33519",
      domOrder: 0,
      label: "US East (N. Virginia)",
      position: {
        x: 395,
        y: 110
      },
      size: {
        width: 635,
        height: 555
      },
      parentSourceNodeId: null,
      zIndex: 0,
      rawTransform: "translate(395, 110), rotate(0 317.5 277.5)",
      rotation: 0,
      rawResourceType: "region"
    },
    {
      sourceNodeId: "40a8b4ea-aefa-4353-a717-96958029031e",
      domOrder: 1,
      label: "전체 월간 비용 Budget",
      position: {
        x: 530,
        y: 270
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "0d74f9f8-6756-42e7-81e7-795b61a33519",
      zIndex: 1,
      rawTransform: "translate(530, 270), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_budgets_budget"
    },
    {
      sourceNodeId: "cbaf89e8-4fb7-45c6-8b27-dd90bca3a555",
      domOrder: 2,
      label: "EC2 월간 비용 Budget",
      position: {
        x: 530,
        y: 450
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "0d74f9f8-6756-42e7-81e7-795b61a33519",
      zIndex: 2,
      rawTransform: "translate(530, 450), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_budgets_budget"
    },
    {
      sourceNodeId: "1943248e-7456-4588-a76b-1b8a92a5522c",
      domOrder: 3,
      label: "S3 월간 사용량 Budget",
      position: {
        x: 830,
        y: 270
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "0d74f9f8-6756-42e7-81e7-795b61a33519",
      zIndex: 3,
      rawTransform: "translate(830, 270), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_budgets_budget"
    },
    {
      sourceNodeId: "821379fd-a325-4e2e-a3bb-565d3dcea13d",
      domOrder: 4,
      label: "RI 사용률 Budget",
      position: {
        x: 830,
        y: 450
      },
      size: {
        width: 60,
        height: 60
      },
      parentSourceNodeId: "0d74f9f8-6756-42e7-81e7-795b61a33519",
      zIndex: 4,
      rawTransform: "translate(830, 450), rotate(0 30 30)",
      rotation: 0,
      rawResourceType: "aws_budgets_budget"
    }
  ],
  edges: [],
  terraform: {
    files: [
      {
        fileName: "main.tf",
        code: 'resource "aws_budgets_budget" "ec2" {\n  time_unit         = "MONTHLY"\n  time_period_start = "2021-11-01_00:00"\n  name              = "ec2"\n  limit_unit        = "USD"\n  limit_amount      = var.ec2_amount_limitation\n  budget_type       = "COST"\n\n  cost_filter {\n    name = "Service"\n\n    values = [\n      "Amazon Elastic Compute Cloud - Compute",\n    ]\n  }\n\n  cost_types {\n    include_upfront      = true\n    include_subscription = true\n    include_discount     = true\n    include_credit       = true\n  }\n\n  notification {\n    threshold_type      = "PERCENTAGE"\n    threshold           = var.ec2_threshold\n    notification_type   = "FORECASTED"\n    comparison_operator = "GREATER_THAN"\n\n    subscriber_email_addresses = [\n      var.email,\n    ]\n  }\n}\n\nresource "aws_budgets_budget" "monthly" {\n  time_unit         = "MONTHLY"\n  time_period_start = "2021-11-01_00:00"\n  name              = "monthly"\n  limit_unit        = "USD"\n  limit_amount      = var.amount_limitation\n  budget_type       = "COST"\n\n  cost_types {\n    include_upfront      = true\n    include_subscription = true\n    include_discount     = true\n    include_credit       = true\n  }\n\n  notification {\n    threshold_type      = "PERCENTAGE"\n    threshold           = var.threshold\n    notification_type   = "ACTUAL"\n    comparison_operator = "GREATER_THAN"\n\n    subscriber_email_addresses = [\n      var.email,\n    ]\n  }\n}\n\nresource "aws_budgets_budget" "ri_utilization" {\n  time_unit    = "MONTHLY"\n  name         = "ri_utilization"\n  limit_unit   = "PERCENTAGE"\n  limit_amount = "100.0"\n  budget_type  = "RI_UTILIZATION"\n\n  cost_types {\n    use_blended                = false\n    use_amortized              = false\n    include_upfront            = false\n    include_tax                = false\n    include_support            = false\n    include_subscription       = true\n    include_refund             = false\n    include_recurring          = false\n    include_other_subscription = false\n    include_discount           = false\n    include_credit             = false\n  }\n}\n\nresource "aws_budgets_budget" "s3" {\n  time_unit    = "MONTHLY"\n  name         = "s3"\n  limit_unit   = "GB"\n  limit_amount = var.s3_amount\n  budget_type  = "USAGE"\n\n  cost_types {\n    include_subscription = true\n    include_refund       = true\n    include_discount     = true\n    include_credit       = true\n  }\n}\n\n',
        sha256: "f00e564d0c88fff104730a1cb78e922357b2ac1f9d216ce4cef917118e6ebe85",
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
        code: 'terraform {\n  required_providers {\n    aws = {\n      version = "= 5.52.0"\n    }\n  }\n}\n\nprovider "aws" {\n  region = "us-east-1"\n}\n',
        sha256: "48a1ad8474f71e7904ac0639c3460b7a75ce71df8f5720658e9f012904229dfd",
        includeInWorkspace: true
      },
      {
        fileName: "terraform.tfvars",
        code: '# All variables as it would be defined in the .tfvars file.\n\ntags = {\n  archuuid = "cb973376-0fdd-4651-aaa2-d204bfc8c89b"\n  env      = "Production"\n}\n',
        sha256: "2146abbb007b805f15d1184c62c62ee960c4a7e5bc473c93cf01cdccb3f35a31",
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
        code: 'variable "amount_limitation" {\n  type    = number\n  default = 1000\n}\n\nvariable "ec2_amount_limitation" {\n  type    = number\n  default = 500\n}\n\nvariable "ec2_threshold" {\n  type    = number\n  default = 400\n}\n\nvariable "email" {\n  type    = string\n  default = "contact@brainboard.co"\n}\n\nvariable "s3_amount" {\n  type    = number\n  default = 100\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    archuuid = "6e651e34-318d-41e2-b229-86d30aa0520f"\n    env      = "Examples"\n  }\n}\n\nvariable "threshold" {\n  type    = number\n  default = 800\n}\n\n',
        sha256: "51f7cff4ca1b2042d7b21c5b795ff756a096a045427353d082e8db3d01734db6",
        includeInWorkspace: true,
        workspaceSeed: {
          code: 'variable "amount_limitation" {\n  type    = number\n  default = 1000\n}\n\nvariable "ec2_amount_limitation" {\n  type    = number\n  default = 500\n}\n\nvariable "ec2_threshold" {\n  type    = number\n  default = 400\n}\n\nvariable "email" {\n  type    = string\n  default = "contact@brainboard.co"\n}\n\nvariable "s3_amount" {\n  type    = number\n  default = 100\n}\n\nvariable "tags" {\n  description = "Default tags to apply to all resources."\n  type        = map(any)\n  default = {\n    env      = "Examples"\n  }\n}\n\nvariable "threshold" {\n  type    = number\n  default = 800\n}\n\n',
          sha256: "c138be1e62a02eff8bf3069befe1647bf07d64b90c583442c5b8aecbed668be6",
          omissions: [
            {
              reason: "brainboard-architecture-uuid",
              sourceText: '    archuuid = "6e651e34-318d-41e2-b229-86d30aa0520f"\n',
              occurrenceCount: 1
            }
          ]
        }
      }
    ],
    resourceAddresses: [
      "aws_budgets_budget.ec2",
      "aws_budgets_budget.monthly",
      "aws_budgets_budget.ri_utilization",
      "aws_budgets_budget.s3"
    ]
  },
  bindings: {
    "0d74f9f8-6756-42e7-81e7-795b61a33519": {
      kind: "presentation",
      catalogId: "aws-region",
      aliasOf: null,
      style: null
    },
    "40a8b4ea-aefa-4353-a717-96958029031e": {
      kind: "resource",
      address: "aws_budgets_budget.monthly",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "cbaf89e8-4fb7-45c6-8b27-dd90bca3a555": {
      kind: "resource",
      address: "aws_budgets_budget.ec2",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "1943248e-7456-4588-a76b-1b8a92a5522c": {
      kind: "resource",
      address: "aws_budgets_budget.s3",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    },
    "821379fd-a325-4e2e-a3bb-565d3dcea13d": {
      kind: "resource",
      address: "aws_budgets_budget.ri_utilization",
      fileName: "main.tf",
      addressMapping: "reviewed-override"
    }
  }
});
