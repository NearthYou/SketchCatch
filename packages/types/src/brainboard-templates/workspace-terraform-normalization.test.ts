import assert from "node:assert/strict";
import { test } from "node:test";
import { adaptBrainboardTemplateSource } from "./adapter.ts";
import { brainboardTemplateRegistry } from "./registry.ts";

const correctedWorkspaceFiles = [
  {
    templateId: "brainboard-aws-jenkins-ec2",
    fileName: "main.tf",
    forbidden: ['ignore_changes = ""']
  },
  {
    templateId: "brainboard-aws-rest-api-documentdb",
    fileName: "main.tf",
    forbidden: [
      "enable_classiclink",
      "var.role",
      "var.handler",
      'filename      = "rest-api-lambda.zip"',
      'resource "aws_iam_role"'
    ],
    required: [
      'data "archive_file" "rest_api_lambda"',
      'variable "rest_api_lambda_role_arn"',
      "role          = var.rest_api_lambda_role_arn",
      "filename      = data.archive_file.rest_api_lambda.output_path",
      "source_code_hash = data.archive_file.rest_api_lambda.output_base64sha256"
    ]
  },
  {
    templateId: "brainboard-aws-rest-api-documentdb",
    fileName: "providers.tf",
    required: ['archive = {', 'source  = "hashicorp/archive"']
  },
  {
    templateId: "brainboard-aws-three-tier-database",
    fileName: "variables.tf",
    forbidden: ["default = 3\n  default = 3"]
  },
  {
    templateId: "brainboard-aws-three-tier-database",
    fileName: "main.tf",
    required: ['set_identifier = "a-record-us-east-1"', 'set_identifier = "cname-us-east-1"']
  },
  {
    templateId: "brainboard-aws-s3-api-gateway",
    fileName: "main.tf",
    forbidden: ["{ folder }", "{ item }"],
    required: ['path_part   = "folder"', 'path_part   = "item"']
  },
  {
    templateId: "brainboard-aws-multi-account-management",
    fileName: "providers.tf",
    forbidden: ["aws_organizations_account.prod.id", "aws_organizations_account.staging.id", "aws_organizations_account.dev.id"],
    required: [
      'alias  = "us-east-2"',
      "role_arn = var.prod_role_arn",
      "role_arn = var.staging_role_arn",
      "role_arn = var.dev_role_arn"
    ]
  },
  {
    templateId: "brainboard-aws-multi-account-management",
    fileName: "variables.tf",
    required: [
      'variable "prod_role_arn"',
      'variable "staging_role_arn"',
      'variable "dev_role_arn"'
    ]
  },
  {
    templateId: "brainboard-aws-dashcam-video-pipeline",
    fileName: "main.tf",
    forbidden: ["filebase64sha256", 'filename         = "video_processor.zip"'],
    required: [
      'data "archive_file" "video_processor"',
      "filename         = data.archive_file.video_processor.output_path",
      "source_code_hash = data.archive_file.video_processor.output_base64sha256"
    ]
  },
  {
    templateId: "brainboard-aws-dashcam-video-pipeline",
    fileName: "providers.tf",
    required: ['archive = {', 'source  = "hashicorp/archive"']
  }
] as const;

for (const { fileName, forbidden = [], required = [], templateId } of correctedWorkspaceFiles) {
  test(`${templateId}/${fileName} is normalized for a Terraform validation workspace`, () => {
    const entry = brainboardTemplateRegistry.find((candidate) => candidate.id === templateId);
    assert.ok(entry?.status === "available");

    const file = adaptBrainboardTemplateSource(entry.source).terraformFiles.find(
      (candidate) => candidate.fileName === fileName
    );
    assert.ok(file);

    for (const value of forbidden) {
      assert.equal(file.terraformCode.includes(value), false, `still contains ${value}`);
    }
    for (const value of required) {
      assert.equal(file.terraformCode.includes(value), true, `does not contain ${value}`);
    }
  });
}

test("captured AWS provider 5.52 pins use the workspace provider baseline", () => {
  for (const entry of brainboardTemplateRegistry) {
    if (entry.status !== "available") {
      continue;
    }

    for (const file of adaptBrainboardTemplateSource(entry.source).terraformFiles) {
      assert.equal(
        file.terraformCode.includes('version = "= 5.52.0"') ||
          file.terraformCode.includes('version = "~> 5.52.0"'),
        false,
        `${entry.id}/${file.fileName} retained the captured provider pin`
      );
    }
  }
});
