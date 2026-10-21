import assert from "node:assert/strict";
import test from "node:test";
import {
  createTerraformImportBlocks,
  type VerifiedTerraformImportTarget
} from "./terraform-import-blocks.js";

test("검증된 기존 AWS 리소스를 주소 순서대로 import block으로 만든다", () => {
  const terraform = createTerraformImportBlocks([
    target({
      terraformAddress: "aws_vpc.main",
      importId: "vpc-0123456789abcdef0"
    }),
    target({
      resourceId: "bucket",
      terraformAddress: "aws_s3_bucket.assets",
      importId: "existing-assets"
    })
  ]);

  assert.equal(
    terraform,
    [
      "import {",
      "  to = aws_s3_bucket.assets",
      '  id = "existing-assets"',
      "}",
      "",
      "import {",
      "  to = aws_vpc.main",
      '  id = "vpc-0123456789abcdef0"',
      "}",
      ""
    ].join("\n")
  );
});

test("import ID의 HCL 허용 escape를 안전한 quoted string으로 만든다", () => {
  const terraform = createTerraformImportBlocks([
    target({ importId: 'name"with\\slash\nand-newline\rwith-return\tand-tab' })
  ]);

  assert.match(terraform, /id = "name\\"with\\\\slash\\nand-newline\\rwith-return\\tand-tab"/u);
});

test("Terraform template marker를 평가하지 않고 import ID 문자 그대로 유지한다", () => {
  const terraform = createTerraformImportBlocks([
    target({ importId: "bucket-${var.name}-%{ if true }enabled%{ endif }" })
  ]);

  assert.match(terraform, /id = "bucket-\$\$\{var\.name\}-%%\{ if true \}enabled%%\{ endif \}"/u);
});

test("HCL quoted string에 넣을 수 없는 제어문자를 거부한다", () => {
  for (const importId of [
    "before\bafter",
    "before\fafter",
    "before\u0001after",
    "before\u007fafter"
  ]) {
    assert.throws(
      () => createTerraformImportBlocks([target({ importId })]),
      /HCL 문자열에 사용할 수 없는 제어문자/u
    );
  }
});

test("같은 Terraform 주소를 두 번 import하지 못하게 막는다", () => {
  assert.throws(
    () =>
      createTerraformImportBlocks([
        target({ resourceId: "one", importId: "one" }),
        target({ resourceId: "two", importId: "two" })
      ]),
    /같은 Terraform 주소/u
  );
});

test("같은 실제 AWS 리소스를 서로 다른 주소로 두 번 import하지 못하게 막는다", () => {
  assert.throws(
    () =>
      createTerraformImportBlocks([
        target({ terraformAddress: "aws_s3_bucket.one", importId: "same-resource" }),
        target({ terraformAddress: "aws_s3_bucket.two", importId: "same-resource" })
      ]),
    /같은 AWS 리소스/u
  );
});

test("서로 다른 AWS Resource 종류는 같은 import 이름을 사용할 수 있다", () => {
  const terraform = createTerraformImportBlocks([
    target({ terraformAddress: "aws_s3_bucket.main", importId: "main" }),
    target({
      resourceId: "role",
      terraformAddress: "aws_iam_role.main",
      importId: "main",
      providerResourceType: "AWS::IAM::Role",
      resourceType: "IAM_ROLE"
    })
  ]);

  assert.match(terraform, /to = aws_iam_role\.main/u);
  assert.match(terraform, /to = aws_s3_bucket\.main/u);
});

test("resource 주소가 아닌 data, module, index 표현식과 빈 import ID를 거부한다", () => {
  for (const terraformAddress of [
    "data.aws_ami.current",
    "module.network.aws_vpc.main",
    "aws_subnet.private[0]",
    'aws_subnet.private["a"]'
  ]) {
    assert.throws(
      () => createTerraformImportBlocks([target({ terraformAddress })]),
      /Terraform resource 주소/u
    );
  }

  assert.throws(() => createTerraformImportBlocks([target({ importId: " " })]), /AWS import ID/u);
});

function target(
  overrides: Partial<VerifiedTerraformImportTarget> = {}
): VerifiedTerraformImportTarget {
  return {
    resourceId: "resource-one",
    terraformAddress: "aws_s3_bucket.assets",
    importId: "assets-bucket",
    providerResourceType: "AWS::S3::Bucket",
    resourceType: "S3",
    ...overrides
  };
}
