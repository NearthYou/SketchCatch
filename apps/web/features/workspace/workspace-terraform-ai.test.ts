import assert from "node:assert/strict";
import test from "node:test";
import { createTerraformPreviewAiRequest } from "./workspace-terraform-ai";

test("에이전트 리뷰 요청은 최신 Terraform 전체 파일을 하나의 스냅샷으로 만든다", () => {
  const request = createTerraformPreviewAiRequest(
    [
      { fileName: "main.tf", terraformCode: 'resource "aws_vpc" "main" {}' },
      { fileName: "outputs.tf", terraformCode: "   " },
      { fileName: "variables.tf", terraformCode: 'variable "region" {}' }
    ],
    42
  );

  assert.deepEqual(request, {
    id: 42,
    label: "전체 Terraform · 2개 파일",
    terraformCode: 'resource "aws_vpc" "main" {}\n\nvariable "region" {}'
  });
});

test("에이전트 리뷰 요청은 검토할 Terraform 코드가 없으면 생성하지 않는다", () => {
  assert.equal(
    createTerraformPreviewAiRequest([{ fileName: "main.tf", terraformCode: "\n" }], 42),
    null
  );
});
