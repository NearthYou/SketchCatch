import assert from "node:assert/strict";
import test from "node:test";
import {
  isTerraformNestedBlockAttribute,
  isTerraformSingleNestedBlockAttribute
} from "./terraform-nested-blocks.js";

test("Lambda 상세 설정을 Terraform nested block으로 렌더링한다", () => {
  for (const attributeName of [
    "deadLetterConfig",
    "environment",
    "ephemeralStorage",
    "fileSystemConfig",
    "imageConfig",
    "loggingConfig",
    "snapStart",
    "tracingConfig",
    "vpcConfig"
  ]) {
    assert.equal(
      isTerraformNestedBlockAttribute("aws_lambda_function", attributeName),
      true,
      attributeName
    );
  }

  for (const attributeName of [
    "deadLetterConfig",
    "environment",
    "ephemeralStorage",
    "imageConfig",
    "loggingConfig",
    "snapStart",
    "tracingConfig",
    "vpcConfig"
  ]) {
    assert.equal(
      isTerraformSingleNestedBlockAttribute("aws_lambda_function", attributeName),
      true,
      attributeName
    );
  }
  assert.equal(
    isTerraformSingleNestedBlockAttribute("aws_lambda_function", "fileSystemConfig"),
    false
  );
});

test("API Gateway Integration TLS 설정을 단일 nested block으로 렌더링한다", () => {
  assert.equal(isTerraformNestedBlockAttribute("aws_api_gateway_integration", "tlsConfig"), true);
  assert.equal(
    isTerraformSingleNestedBlockAttribute("aws_api_gateway_integration", "tlsConfig"),
    true
  );
});

test("ECR 암호화와 Application Auto Scaling 중지 상태를 nested block으로 등록한다", () => {
  assert.equal(
    isTerraformNestedBlockAttribute("aws_ecr_repository", "encryptionConfiguration"),
    true
  );
  assert.equal(
    isTerraformNestedBlockAttribute("aws_appautoscaling_target", "suspendedState"),
    true
  );
});
