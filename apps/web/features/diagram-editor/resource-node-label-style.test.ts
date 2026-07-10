import assert from "node:assert/strict";
import { test } from "node:test";

import { getResourceNodeLabelStyle } from "./resource-node-label-style";

test("getResourceNodeLabelStyle makes compact icon labels two pixels larger", () => {
  assert.deepEqual(getResourceNodeLabelStyle("EC2", 112, "#172033"), {
    color: "#172033",
    fontSize: "14.50px"
  });
});

test("getResourceNodeLabelStyle keeps long compact labels readable", () => {
  assert.deepEqual(getResourceNodeLabelStyle("EC2 Instance", 56, "#172033"), {
    color: "#172033",
    fontSize: "10.00px"
  });
});
