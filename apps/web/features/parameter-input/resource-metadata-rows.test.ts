import assert from "node:assert/strict";
import { test } from "node:test";
import { buildResourceMetadataRows } from "./resource-metadata-rows";

test("buildResourceMetadataRows exposes editable resource identity and read-only resource type", () => {
  assert.deepEqual(
    buildResourceMetadataRows({
      fileName: "network.tf",
      resourceName: "main_vpc",
      resourceType: "aws_vpc"
    }),
    [
      {
        editable: true,
        key: "resourceName",
        label: "Resource name",
        value: "main_vpc"
      },
      {
        editable: true,
        key: "fileName",
        label: "File name",
        value: "network.tf"
      },
      {
        editable: false,
        key: "resourceType",
        label: "Resource type",
        value: "aws_vpc"
      }
    ]
  );
});
