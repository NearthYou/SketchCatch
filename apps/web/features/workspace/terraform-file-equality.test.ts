import assert from "node:assert/strict";
import { test } from "node:test";

import { areTerraformSyncFilesEqual } from "./terraform-file-equality";

test("Terraform files compare as a normalized path-keyed set", () => {
  const current = [
    { fileName: "main.tf", terraformCode: "resource \"a\" \"one\" {}\r\n" },
    { fileName: "modules/network.tf", terraformCode: "resource \"b\" \"two\" {}\r\n" }
  ];
  const reordered = [
    { fileName: ".\\modules\\network.tf", terraformCode: "resource \"b\" \"two\" {}\n" },
    { fileName: "./main.tf", terraformCode: "resource \"a\" \"one\" {}\n" }
  ];

  assert.equal(areTerraformSyncFilesEqual(current, reordered), true);
});

test("Terraform content and file membership changes are not ignored", () => {
  const current = [{ fileName: "main.tf", terraformCode: "resource \"a\" \"one\" {}\n" }];

  assert.equal(
    areTerraformSyncFilesEqual(current, [
      { fileName: "main.tf", terraformCode: "resource \"a\" \"two\" {}\n" }
    ]),
    false
  );
  assert.equal(
    areTerraformSyncFilesEqual(current, [
      ...current,
      { fileName: "outputs.tf", terraformCode: "output \"id\" {}\n" }
    ]),
    false
  );
});
