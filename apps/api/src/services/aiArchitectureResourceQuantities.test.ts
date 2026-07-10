import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveArchitectureResourceQuantities } from "./aiArchitectureResourceQuantities.js";

test("resolveArchitectureResourceQuantities reads explicit EC2 and S3 counts near resource names", () => {
  assert.deepEqual(resolveArchitectureResourceQuantities("EC2 3대와 S3 2개가 필요해"), {
    ec2Instances: 3,
    s3Buckets: 2
  });
  assert.deepEqual(resolveArchitectureResourceQuantities("3 EC2 instances and 2 S3 buckets"), {
    ec2Instances: 3,
    s3Buckets: 2
  });
  assert.deepEqual(resolveArchitectureResourceQuantities("three EC2 instances and two S3 buckets"), {
    ec2Instances: 3,
    s3Buckets: 2
  });
});

