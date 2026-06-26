import { test } from "node:test";
import assert from "node:assert/strict";
import { createResourceCatalogProvider } from "./catalog-provider";
import type { ResourceItem } from "../../../../packages/types/src";

const fakeResource: ResourceItem = {
  id: "aws-test-resource",
  name: "Test Resource",
  cloudProvider: "aws",
  area: "compute",
  category: "Compute",
  iconUrl: "/test.svg",
  enabled: true,
  nodeDefaults: {
    type: "aws_test_resource",
    label: "Test Resource",
    size: {
      width: 112,
      height: 108
    }
  }
};

test("createResourceCatalogProvider exposes the supplied resource catalog", () => {
  const provider = createResourceCatalogProvider([fakeResource]);

  assert.deepEqual(provider.listResources(), [fakeResource]);
});
