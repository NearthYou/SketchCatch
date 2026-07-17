type BrainboardWorkspaceTerraformInput = {
  readonly templateId: string;
  readonly fileName: string;
  readonly code: string;
};

const archiveProviderRequirement = `    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
`;

const restApiLambdaWorkspaceHelpers = `data "archive_file" "rest_api_lambda" {
  type        = "zip"
  output_path = "\${path.module}/rest-api-lambda.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: 'ok' });"
    filename = "index.js"
  }
}

variable "rest_api_lambda_role_arn" {
  description = "ARN of an existing IAM role that both REST API Lambda functions may assume."
  type        = string
}

`;

const dashcamLambdaWorkspaceHelper = `data "archive_file" "video_processor" {
  type        = "zip"
  output_path = "\${path.module}/video_processor.zip"

  source {
    content  = "def handler(event, context):\\n    return {'statusCode': 200, 'body': 'ok'}"
    filename = "video_processor.py"
  }
}

`;

/**
 * Keep captured Brainboard evidence immutable while repairing only the Terraform
 * copied into a new SketchCatch workspace. These corrections are intentionally
 * scoped: provider pins follow the shared SketchCatch workspace baseline, while
 * source corrections below are restricted to one captured Template and file.
 */
export function normalizeBrainboardWorkspaceTerraform({
  templateId,
  fileName,
  code
}: BrainboardWorkspaceTerraformInput): string {
  const key = `${templateId}/${fileName}`;
  const normalizedCode = fileName === "providers.tf"
    ? code
        .replace('version = "= 5.52.0"', 'version = "~> 5.0"')
        .replace('version = "~> 5.52.0"', 'version = "~> 5.0"')
    : code;

  switch (key) {
    case "brainboard-aws-jenkins-ec2/main.tf":
      return normalizedCode.replace(
        '\n  lifecycle {\n    ignore_changes = ""\n  }\n',
        ""
      );

    case "brainboard-aws-rest-api-documentdb/main.tf":
      return `${restApiLambdaWorkspaceHelpers}${normalizedCode
        .replace("  enable_classiclink = true\n", "")
        .replaceAll('  runtime       = "nodejs12.x"\n', '  runtime       = "nodejs20.x"\n')
        .replace("  role          = var.role\n", "  role          = var.rest_api_lambda_role_arn\n")
        .replace("  handler       = var.handler\n", '  handler       = "index.handler"\n')
        .replace(
          "  function_name = \"restAPI-function\"\n",
          "  function_name = \"restAPI-function\"\n  filename      = data.archive_file.rest_api_lambda.output_path\n  source_code_hash = data.archive_file.rest_api_lambda.output_base64sha256\n"
        )
        .replace("  role          = var.role-ext\n", "  role          = var.rest_api_lambda_role_arn\n")
        .replace("  handler       = var.handler-ext\n", '  handler       = "index.handler"\n')
        .replace(
          "  function_name = \"restAPI-function-ext\"\n",
          "  function_name = \"restAPI-function-ext\"\n  filename      = data.archive_file.rest_api_lambda.output_path\n  source_code_hash = data.archive_file.rest_api_lambda.output_base64sha256\n"
        )}`;

    case "brainboard-aws-rest-api-documentdb/providers.tf":
      return addArchiveProvider(normalizedCode);

    case "brainboard-aws-three-tier-database/variables.tf":
      return normalizedCode.replace("  default = 3\n  default = 3\n", "  default = 3\n");

    case "brainboard-aws-three-tier-database/main.tf":
      return normalizedCode
        .replace(
          '  name    = "a_record"\n\n  latency_routing_policy {',
          '  name    = "a_record"\n  set_identifier = "a-record-us-east-1"\n\n  latency_routing_policy {'
        )
        .replace(
          '  name    = "cname"\n\n  latency_routing_policy {',
          '  name    = "cname"\n  set_identifier = "cname-us-east-1"\n\n  latency_routing_policy {'
        );

    case "brainboard-aws-s3-api-gateway/main.tf":
      return normalizedCode
        .replace("  path_part   = { folder }\n", '  path_part   = "folder"\n')
        .replace("  path_part   = { item }\n", '  path_part   = "item"\n');

    case "brainboard-aws-multi-account-management/providers.tf":
      return normalizedCode
        .replace(
          'provider "aws" {\n  region = "us-east-2"\n}\n',
          'provider "aws" {\n  region = "us-east-2"\n}\n\nprovider "aws" {\n  alias  = "us-east-2"\n  region = "us-east-2"\n}\n'
        )
        .replace(
          'role_arn = "arn:aws:iam::${aws_organizations_account.prod.id}:role/admin"',
          "role_arn = var.prod_role_arn"
        )
        .replace(
          'role_arn = "arn:aws:iam::${aws_organizations_account.staging.id}:role/admin"',
          "role_arn = var.staging_role_arn"
        )
        .replace(
          'role_arn = "arn:aws:iam::${aws_organizations_account.dev.id}:role/admin"',
          "role_arn = var.dev_role_arn"
        );

    case "brainboard-aws-multi-account-management/variables.tf":
      return `${normalizedCode}
variable "prod_role_arn" {
  description = "Existing admin role ARN for the production target account."
  type        = string
}

variable "staging_role_arn" {
  description = "Existing admin role ARN for the staging target account."
  type        = string
}

variable "dev_role_arn" {
  description = "Existing admin role ARN for the development target account."
  type        = string
}
`;

    case "brainboard-aws-dashcam-video-pipeline/main.tf":
      return `${dashcamLambdaWorkspaceHelper}${normalizedCode
        .replace(
          '  source_code_hash = filebase64sha256("./video_processor.zip")\n',
          "  source_code_hash = data.archive_file.video_processor.output_base64sha256\n"
        )
        .replace('  runtime          = "python3.8"\n', '  runtime          = "python3.12"\n')
        .replace(
          '  filename         = "video_processor.zip"\n',
          "  filename         = data.archive_file.video_processor.output_path\n"
        )}`;

    case "brainboard-aws-dashcam-video-pipeline/providers.tf":
      return `terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
${archiveProviderRequirement}  }
}

${normalizedCode}`;

    default:
      return normalizedCode;
  }
}

function addArchiveProvider(code: string): string {
  return code.replace(
    "  required_providers {\n",
    `  required_providers {\n${archiveProviderRequirement}`
  );
}
