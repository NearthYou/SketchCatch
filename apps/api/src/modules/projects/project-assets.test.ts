import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProjectAssetObjectKey } from "./project-assets.js";

test("buildProjectAssetObjectKey scopes and sanitizes project asset paths", () => {
  assert.equal(
    buildProjectAssetObjectKey({
      assetId: "asset-1",
      assetType: "terraform_file",
      fileName: "main prod?.tf",
      projectId: "project-1"
    }),
    "projects/project-1/assets/terraform_file/asset-1-main_prod_.tf"
  );
});
