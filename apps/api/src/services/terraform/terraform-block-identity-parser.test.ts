import assert from "node:assert/strict";
import { test } from "node:test";
import { scanTerraformBlockIdentities } from "./terraform-block-identity-parser.js";

test("scans resource and data headers split by whitespace and comments", () => {
  assert.deepEqual(
    scanTerraformBlockIdentities(`
resource /* type follows */
  "aws_lambda_function"
  // logical name follows
  "legacy_lambda"
  {
    function_name = "legacy"
  }

data
  # type follows
  "aws_ami"
  /* logical name follows */
  "current"
  {
  }
`),
    [
      {
        terraformBlockType: "resource",
        resourceType: "aws_lambda_function",
        resourceName: "legacy_lambda"
      },
      {
        terraformBlockType: "data",
        resourceType: "aws_ami",
        resourceName: "current"
      }
    ]
  );
});

test("ignores resource-like text in comments, strings, heredocs, and nested blocks", () => {
  assert.deepEqual(
    scanTerraformBlockIdentities(`
/* resource "aws_lambda_function" "commented_block" {} */
// resource "aws_lambda_function" "line_commented" {}
message = "resource \\"aws_lambda_function\\" \\"string_value\\" {}"
script = <<-SCRIPT // shell script follows
  resource "aws_lambda_function" "heredoc_value" {
    nested = true
  }
SCRIPT

resource "aws_vpc" "main" {
  resource "aws_lambda_function" "nested_resource" {}
  dynamic "tag" {
    for_each = []
    content {
      value = "resource \\"aws_lambda_function\\" \\"nested_string\\" {}"
    }
  }
}
`),
    [
      {
        terraformBlockType: "resource",
        resourceType: "aws_vpc",
        resourceName: "main"
      }
    ]
  );
});

test("does not throw or infer an identity from malformed editor input", () => {
  assert.deepEqual(
    scanTerraformBlockIdentities('resource "aws_lambda_function" /* unfinished'),
    []
  );
});

test("keeps scanning after a CRLF heredoc before an excluded-resource header", () => {
  assert.deepEqual(
    scanTerraformBlockIdentities(
      "script = <<SCRIPT\r\nresource \"aws_lambda_function\" \"heredoc_value\" {}\r\nSCRIPT\r\nresource \"aws_lambda_function\" \"legacy_lambda\" {}\r\n"
    ),
    [
      {
        terraformBlockType: "resource",
        resourceType: "aws_lambda_function",
        resourceName: "legacy_lambda"
      }
    ]
  );
});

test("keeps scanning after a template interpolation with an inner string and brace", () => {
  assert.deepEqual(
    scanTerraformBlockIdentities(
      'locals {\n  rendered = "${format("{")}"\n}\nresource "aws_lambda_function" "legacy_lambda" {}\n'
    ),
    [
      {
        terraformBlockType: "resource",
        resourceType: "aws_lambda_function",
        resourceName: "legacy_lambda"
      }
    ]
  );
});

test("keeps scanning after template directives with nested interpolation braces", () => {
  assert.deepEqual(
    scanTerraformBlockIdentities(
      'locals {\n  rendered = "%{ if true }${jsonencode({ value = "}" })}%{ endif }"\n}\nresource "aws_lambda_function" "legacy_lambda" {}\n'
    ),
    [
      {
        terraformBlockType: "resource",
        resourceType: "aws_lambda_function",
        resourceName: "legacy_lambda"
      }
    ]
  );
});

test("decodes Terraform quoted-string escapes in resource identities", () => {
  assert.deepEqual(
    scanTerraformBlockIdentities(
      'resource "aws_\\u006cambda_function" "legacy\\u005flambda\\nname" {}\n' +
        'data "aws_ami" "quoted\\"name\\\\path\\/slash\\tvalue\\r\\b\\f\\U00000041" {}'
    ),
    [
      {
        terraformBlockType: "resource",
        resourceType: "aws_lambda_function",
        resourceName: "legacy_lambda\nname"
      },
      {
        terraformBlockType: "data",
        resourceType: "aws_ami",
        resourceName: 'quoted"name\\path/slash\tvalue\r\b\fA'
      }
    ]
  );
});
