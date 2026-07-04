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
	assert.match(resourceTypeLabelsSource, /INTERNET_GATEWAY:\s*"Internet Gateway"/);
	assert.match(resourceTypeLabelsSource, /ROUTE_TABLE:\s*"Route Table"/);
	assert.match(resourceTypeLabelsSource, /ROUTE_TABLE_ASSOCIATION:\s*"Route Table Association"/);
	assert.match(resourceTypeLabelsSource, /CLOUDFRONT:\s*"CloudFront"/);
	assert.match(resourceTypeLabelsSource, /EC2:\s*"EC2"/);
	assert.match(resourceTypeLabelsSource, /AMI:\s*"AMI"/);
	assert.match(resourceTypeLabelsSource, /IAM_ROLE:\s*"IAM Role"/);
	assert.match(resourceTypeLabelsSource, /IAM_POLICY:\s*"IAM Policy"/);
	assert.match(resourceTypeLabelsSource, /IAM_INSTANCE_PROFILE:\s*"IAM Instance Profile"/);
	assert.match(resourceTypeLabelsSource, /KMS_KEY:\s*"KMS Key"/);
	assert.match(resourceTypeLabelsSource, /CLOUDWATCH_LOG_GROUP:\s*"CloudWatch Log Group"/);
	assert.match(resourceTypeLabelsSource, /CLOUDWATCH_METRIC_ALARM:\s*"CloudWatch Metric Alarm"/);
	assert.match(resourceTypeLabelsSource, /API_GATEWAY_REST_API:\s*"API Gateway REST API"/);
	assert.match(resourceTypeLabelsSource, /LAMBDA_PERMISSION:\s*"Lambda Permission"/);
	assert.match(resourceTypeLabelsSource, /RDS:\s*"RDS"/);
});
