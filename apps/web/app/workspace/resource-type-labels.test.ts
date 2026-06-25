import assert from "node:assert/strict";
import { test } from "node:test";
import { getResourceTypeLabel } from "./resource-type-labels";

test("getResourceTypeLabel displays internal resource types as readable labels", () => {
	assert.equal(getResourceTypeLabel("SECURITY_GROUP"), "Security Group");
	assert.equal(getResourceTypeLabel("CLOUDFRONT"), "CloudFront");
	assert.equal(getResourceTypeLabel("EC2"), "EC2");
	assert.equal(getResourceTypeLabel("RDS"), "RDS");
});
