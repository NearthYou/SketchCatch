import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createFirstBlockingTerraformDiagnostic,
  createTerraformDiagnostics,
  createTerraformValidationDiagnostics
} from "./terraform-diagnostics.js";

test("returns no errors for generated Terraform code", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}`);

  assert.equal(diagnostics.some((diagnostic) => diagnostic.severity === "error"), false);
});

test("returns no errors for CRLF Terraform code", () => {
  const diagnostics = createTerraformDiagnostics(
    [
      `resource "aws_vpc" "main" {`,
      `  cidr_block = "10.0.0.0/16"`,
      `}`
    ].join("\r\n")
  );

  assert.equal(diagnostics.some((diagnostic) => diagnostic.severity === "error"), false);
});

test("returns an error for empty Terraform code", () => {
  assert.deepEqual(createTerraformDiagnostics(""), [
    {
      severity: "error",
      code: "terraform.empty",
      message: "Terraform 코드가 비어 있습니다."
    }
  ]);
});

test("detects unbalanced braces", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"`);

  assert.equal(diagnostics[0]?.code, "terraform.unbalanced");
  assert.equal(diagnostics[0]?.severity, "error");
});

test("returns the first blocking diagnostic in source order", () => {
  const diagnostic = createFirstBlockingTerraformDiagnostic(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" {
}`);

  assert.equal(diagnostic?.code, "terraform.block_header");
  assert.equal(diagnostic?.line, 5);
});

test("returns an earlier block diagnostic before a later token diagnostic", () => {
  const diagnostic = createFirstBlockingTerraformDiagnostic(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" {
}

resource "aws_route" "internet" {
  route_table_id = aws_route_table.public.id`);

  assert.equal(diagnostic?.code, "terraform.block_header");
  assert.equal(diagnostic?.line, 5);
});

test("detects invalid block headers", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" {
}`);

  assert.equal(diagnostics[0]?.code, "terraform.block_header");
  assert.equal(diagnostics[0]?.line, 1);
});

test("allows provider blocks as execution environment configuration", () => {
  const diagnostics = createTerraformDiagnostics(`provider "aws" {
  region = "ap-northeast-2"
  profile = "practice"

  assume_role {
    role_arn = "arn:aws:iam::123456789012:role/example"
  }
}`);

  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    []
  );
  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "terraform.unsupported_block"),
    false
  );
});

test("does not treat provider-prefixed attributes as provider block headers", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

provider_region = "ap-northeast-2"`);

  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "terraform.block_header"),
    false
  );
});

test("keeps unbalanced provider blocks as blocking diagnostics", () => {
  const diagnostics = createTerraformDiagnostics(`provider "aws" {
  region = "ap-northeast-2"`);

  assert.equal(diagnostics[0]?.code, "terraform.unbalanced");
  assert.equal(diagnostics[0]?.severity, "error");
});

test("detects unexpected tokens after a closed block", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_instance" "web" {
  ami = "ami-12345678"
}dfgdf`);

  assert.equal(diagnostics[0]?.code, "terraform.unexpected_token");
  assert.equal(diagnostics[0]?.line, 3);
  assert.equal(diagnostics[0]?.severity, "error");
});

test("detects trailing commas after attribute assignments", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_security_group_rule" "ssh" {
  type = "ingress",
}`);

  assert.equal(diagnostics[0]?.code, "terraform.trailing_comma");
  assert.equal(diagnostics[0]?.line, 2);
  assert.equal(diagnostics[0]?.severity, "error");
});

test("detects duplicate resource addresses", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_vpc" "main" {
  cidr_block = "10.1.0.0/16"
}`);

  const duplicateDiagnostic = diagnostics.find(
    (diagnostic) => diagnostic.code === "terraform.duplicate_address"
  );

  assert.equal(duplicateDiagnostic?.severity, "error");
});

test("detects quoted Terraform references", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_subnet" "public" {
  vpc_id = "aws_vpc.main.id"
}`);

  assert.equal(diagnostics[0]?.code, "terraform.quoted_reference");
  assert.equal(diagnostics[0]?.severity, "warning");
});

test("ignores braces in line comments when checking balance", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16" # ignored {
  tags = {
    Name = "main"
  }
}`);

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "terraform.unbalanced"), false);
});

test("accepts block headers with trailing comments", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" { // network boundary
  cidr_block = "10.0.0.0/16"
}`);

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "terraform.block_header"), false);
});

test("treats comment-only block bodies as empty", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  # cidr_block will be filled later
} # end`);

  assert.equal(diagnostics[0]?.code, "terraform.empty_block");
});

test("ignores quoted Terraform references inside comments", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
  # "aws_vpc.main.id" is documented here
}`);

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "terraform.quoted_reference"), false);
});

test("ignores braces and quotes inside block comments", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  /*
    ignored " quote {
    ignored aws_vpc.missing.id
  */
  cidr_block = "10.0.0.0/16"
}`);

  assert.equal(diagnostics.some((diagnostic) => diagnostic.severity === "error"), false);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "terraform.undefined_reference"), false);
});

test("detects unbalanced parentheses", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  tags = merge(var.tags, {
    Name = "main"
  }
}`);

  assert.equal(diagnostics[0]?.code, "terraform.unbalanced");
  assert.equal(diagnostics[0]?.line, 2);
});

test("does not cascade brace errors after an unclosed string", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  tags = {
    Name = "demo-vpc
  }
}`);

  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [
      {
        severity: "error",
        code: "terraform.unbalanced",
        line: 4,
        message: "문자열 따옴표가 닫히지 않았습니다."
      }
    ]
  );
});

test("reports an unclosed string on its own line before the next resource header", () => {
  const diagnostics = createTerraformDiagnostics(createTerraformWithLine20UnclosedString());

  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [
      {
        severity: "error",
        code: "terraform.unbalanced",
        line: 20,
        message: "문자열 따옴표가 닫히지 않았습니다."
      }
    ]
  );
});

test("does not cascade body syntax errors after an unclosed block", () => {
  const diagnostics = createTerraformDiagnostics(createTerraformWithLine17UnclosedBlock());

  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [
      {
        severity: "error",
        code: "terraform.unbalanced",
        line: 17,
        message: "{에 대응하는 닫는 기호가 없습니다."
      }
    ]
  );
});

test("handles escaped quotes when detecting unclosed strings", () => {
  const validDiagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  tags = { Name = "demo \\"vpc\\"" }
}`);

  assert.equal(
    validDiagnostics.some((diagnostic) => diagnostic.code === "terraform.unbalanced"),
    false
  );

  const invalidDiagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  tags = { Name = "demo \\"vpc
  }
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
}`);

  assert.deepEqual(
    invalidDiagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [
      {
        severity: "error",
        code: "terraform.unbalanced",
        line: 2,
        message: "문자열 따옴표가 닫히지 않았습니다."
      }
    ]
  );
});

test("detects malformed attribute lines inside resource blocks", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block "10.0.0.0/16"
  tags ==
  name =
}`);

  assert.deepEqual(
    diagnostics
      .filter((diagnostic) => diagnostic.code?.startsWith("terraform.attribute"))
      .map((diagnostic) => ({ code: diagnostic.code, line: diagnostic.line })),
    [
      { code: "terraform.attribute_syntax", line: 2 },
      { code: "terraform.attribute_syntax", line: 3 },
      { code: "terraform.attribute_empty", line: 4 }
    ]
  );
});

test("detects nested block attributes written as object assignments", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route = {}
}`);

  assert.deepEqual(
    diagnostics.find((diagnostic) => diagnostic.code === "terraform.nested_block_assignment"),
    {
      severity: "error",
      code: "terraform.nested_block_assignment",
      line: 3,
      resourceAddress: "resource.aws_route_table.public",
      message: "route는 attribute가 아니라 nested block 형식으로 작성해야 합니다."
    }
  );
});

test("allows nested block syntax inside resource blocks", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}`);

  assert.equal(
    diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "terraform.unsupported_block" ||
        diagnostic.code === "terraform.nested_block_assignment" ||
        diagnostic.severity === "error"
    ),
    false
  );
});

test("warns about references to undeclared local Terraform resources", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
}`);

  assert.deepEqual(
    diagnostics.find((diagnostic) => diagnostic.code === "terraform.undefined_reference"),
    {
      severity: "error",
      code: "terraform.undefined_reference",
      line: 2,
      resourceAddress: "aws_vpc.main",
      message: "aws_vpc.main reference가 현재 Terraform 코드에 선언되어 있지 않습니다."
    }
  );
});

test("detects undeclared two-part Terraform references", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_subnet" "public" {
  vpc_id = aws_vpc.not_existing_vpc
}`);

  const diagnostic = diagnostics.find(
    (candidate) => candidate.code === "terraform.undefined_reference"
  );

  assert.equal(diagnostic?.severity, "error");
  assert.equal(diagnostic?.line, 2);
  assert.equal(diagnostic?.resourceAddress, "aws_vpc.not_existing_vpc");
});

test("keeps collecting resource attributes after object attributes", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_subnet" "public" {
  cidr_block = "10.0.1.0/24"
  tags = {
    Name = "public"
  }
  vpc_id = aws_vpc.missing.id
}`);

  const diagnostic = diagnostics.find(
    (candidate) => candidate.code === "terraform.undefined_reference"
  );

  assert.equal(diagnostic?.severity, "error");
  assert.equal(diagnostic?.line, 6);
  assert.equal(diagnostic?.resourceAddress, "aws_vpc.missing");
});

test("detects AWS attribute type mismatches without Terraform init", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_security_group_rule" "web" {
  type = "ingress"
  from_port = "eighty"
  to_port = 80
  protocol = "tcp"
  cidr_blocks = ["0.0.0.0/0"]
}`);

  assert.deepEqual(
    diagnostics.find((diagnostic) => diagnostic.code === "terraform.attribute_type"),
    {
      severity: "error",
      code: "terraform.attribute_type",
      line: 3,
      resourceAddress: "resource.aws_security_group_rule.web",
      message: "aws_security_group_rule.from_port must be a number, but received a string."
    }
  );
});

test("detects invalid IAM JSON policy strings without Terraform init", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_iam_policy" "bad" {
  name = "bad-policy"
  policy = <<POLICY
{"Version":"2012-10-17","Statement":[}
POLICY
}`);

  assert.deepEqual(
    diagnostics.find((diagnostic) => diagnostic.code === "terraform.invalid_json"),
    {
      severity: "error",
      code: "terraform.invalid_json",
      line: 3,
      resourceAddress: "resource.aws_iam_policy.bad",
      message: "aws_iam_policy.policy must contain valid JSON."
    }
  );
});

test("detects unsupported generated AWS arguments without Terraform init", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_s3_bucket" "assets" {
  bucket = "demo-assets"
  bucket_purpose = "static-site"
  public_access_block = true
  origin_resource_id = aws_cloudfront_distribution.cdn.id
}`);

  assert.deepEqual(
    diagnostics
      .filter((diagnostic) => diagnostic.code === "terraform.unsupported_argument")
      .map((diagnostic) => ({
        line: diagnostic.line,
        message: diagnostic.message,
        resourceAddress: diagnostic.resourceAddress,
        severity: diagnostic.severity
      })),
    [
      {
        severity: "error",
        line: 3,
        resourceAddress: "resource.aws_s3_bucket.assets",
        message: "aws_s3_bucket.bucket_purpose is not supported by the AWS Terraform provider."
      },
      {
        severity: "error",
        line: 4,
        resourceAddress: "resource.aws_s3_bucket.assets",
        message: "aws_s3_bucket.public_access_block is not supported by the AWS Terraform provider."
      },
      {
        severity: "error",
        line: 5,
        resourceAddress: "resource.aws_s3_bucket.assets",
        message: "aws_s3_bucket.origin_resource_id is not supported by the AWS Terraform provider."
      }
    ]
  );
});

test("detects unknown EC2 instance types from the fast AWS catalog", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_instance" "web" {
  ami = "ami-1234567890abcdef0"
  instance_type = "not-real-instance-type"
}`);

  assert.deepEqual(
    diagnostics.find((diagnostic) => diagnostic.code === "terraform.invalid_catalog_value"),
    {
      severity: "error",
      code: "terraform.invalid_catalog_value",
      line: 3,
      resourceAddress: "resource.aws_instance.web",
      message: "aws_instance.instance_type is not a known EC2 instance type: not-real-instance-type."
    }
  );
});

test("does not warn when referenced local Terraform resources are declared", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
}`);

  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "terraform.undefined_reference"),
    false
  );
});

test("warns about aws resources that are not in the shared resource definitions", () => {
  const diagnostics = createTerraformDiagnostics(`resource "aws_neverland" "main" {
  name = "unknown"
}`);

  assert.deepEqual(
    diagnostics.find((diagnostic) => diagnostic.code === "terraform.unsupported_resource"),
    {
      severity: "warning",
      code: "terraform.unsupported_resource",
      line: 1,
      resourceAddress: "resource.aws_neverland.main",
      message: "resource.aws_neverland.main은 현재 SketchCatch Terraform editor가 아는 리소스가 아닙니다."
    }
  );
});

test("recognizes service stack resource and data block types from pasted Terraform", () => {
  const diagnostics = createTerraformDiagnostics(`
resource "aws_codepipeline" "pipeline" {
  name = "sketchcatch-pipeline"
}

resource "aws_codebuild_project" "build" {
  name = "sketchcatch-build"
}

resource "aws_codedeploy_app" "app" {
  name = "sketchcatch-app"
}

resource "aws_codedeploy_deployment_group" "group" {
  app_name = aws_codedeploy_app.app.name
}

resource "aws_cloudfront_origin_access_control" "oac" {
  name = "static-oac"
}

resource "aws_iam_role_policy" "policy" {
  role = aws_iam_role.role.id
}

resource "aws_iam_role_policy_attachment" "attachment" {
  role = aws_iam_role.role.name
}

resource "aws_codestarconnections_connection" "github" {
  name = "github"
}

resource "aws_secretsmanager_secret_version" "version" {
  secret_id = aws_secretsmanager_secret.secret.id
}

data "aws_caller_identity" "current" {}

data "aws_ssm_parameter" "ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

resource "aws_route" "default" {
  route_table_id = aws_route_table.public.id
}
`);

  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.code === "terraform.unsupported_resource"),
    []
  );
});

test("allows direct heredoc and function-wrapped heredoc values in editor diagnostics", () => {
  const diagnostics = createTerraformDiagnostics(`
resource "aws_codebuild_project" "build" {
  source {
    buildspec = <<-YAML
      version: 0.2
      phases:
        build:
          commands:
            - npm test
    YAML
  }
}

resource "aws_launch_template" "api" {
  user_data = base64encode(<<-EOF
    #!/bin/bash
    echo hello
  EOF
  )
}
`);

  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    []
  );
});

test("does not treat heredoc markers inside string literals as heredoc starts", () => {
  const diagnostics = createTerraformDiagnostics(`
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"

  tags = {
    Name = "My <<-EOF instance"
  }
}
`);

  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    []
  );
});

test("adds source file names while validating virtual Terraform files", () => {
  const diagnostics = createTerraformValidationDiagnostics({
    terraformCode: "",
    terraformFiles: [
      {
        fileName: "network.tf",
        terraformCode: `resource "aws_route_table" "public" {
  route = {}
}`
      }
    ]
  });

  assert.deepEqual(
    diagnostics.find((diagnostic) => diagnostic.code === "terraform.nested_block_assignment"),
    {
      severity: "error",
      code: "terraform.nested_block_assignment",
      line: 2,
      resourceAddress: "resource.aws_route_table.public",
      sourceFileName: "network.tf",
      message: "route는 attribute가 아니라 nested block 형식으로 작성해야 합니다."
    }
  );
});

test("keeps unclosed string lines and source files during virtual file validation", () => {
  const diagnostics = createTerraformValidationDiagnostics({
    terraformCode: "",
    terraformFiles: [
      {
        fileName: "main.tf",
        terraformCode: `resource "aws_s3_bucket" "assets" {
  bucket = "demo-assets"
}`
      },
      {
        fileName: "network.tf",
        terraformCode: createTerraformWithLine20UnclosedString()
      }
    ]
  });

  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [
      {
        severity: "error",
        code: "terraform.unbalanced",
        line: 20,
        sourceFileName: "network.tf",
        message: "문자열 따옴표가 닫히지 않았습니다."
      }
    ]
  );
});

function createTerraformWithLine20UnclosedString(): string {
  return `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  tags = {
    Name = "demo-vpc"
  }
}

resource "aws_subnet" "private" {
  vpc_id = aws_vpc.main.id
  cidr_block = "10.0.2.0/24"
  availability_zone = "ap-northeast-2a"
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
}

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
  cidr_block = "10.0.1.0/24
  availability_zone = "ap-northeast-2a"
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id
}`;
}

function createTerraformWithLine17UnclosedBlock(): string {
  return `resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
}

resource "aws_subnet" "private" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.2.0/24"
}
resource "aws_route" "internet" {
  route_table_id         = aws_route_table.public.id
  gateway_id             = aws_internet_gateway.igw.id
  destination_cidr_block = "0.0.0.0/0"
  region                 = "ap-northeast-2"

resource "aws_subnet" "public" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
}`;
}
