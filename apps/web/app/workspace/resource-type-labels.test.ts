import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const resourceTypeLabelsPath = join(currentDir, "resource-type-labels.ts");

test("getResourceTypeLabel displays internal resource types as readable labels", () => {
	const resourceTypeLabelsSource = readFileSync(resourceTypeLabelsPath, "utf8");

	assert.match(resourceTypeLabelsSource, /SECURITY_GROUP:\s*"Security Group"/);
	assert.match(resourceTypeLabelsSource, /CLOUDFRONT:\s*"CloudFront"/);
	assert.match(resourceTypeLabelsSource, /EC2:\s*"EC2"/);
	assert.match(resourceTypeLabelsSource, /RDS:\s*"RDS"/);
});
