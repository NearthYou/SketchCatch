import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultAwsAvailabilityZone,
  getAwsAvailabilityZoneLabel,
  isAwsAvailabilityZoneCode
} from "./availability-zone-options";

test("defaultAwsAvailabilityZone uses the Seoul default AZ", () => {
  assert.equal(defaultAwsAvailabilityZone, "ap-northeast-2a");
});

test("isAwsAvailabilityZoneCode accepts AWS availability zone code format", () => {
  assert.equal(isAwsAvailabilityZoneCode("ap-northeast-2a"), true);
  assert.equal(isAwsAvailabilityZoneCode("us-east-1f"), true);
  assert.equal(isAwsAvailabilityZoneCode("ap-northeast-2"), false);
  assert.equal(isAwsAvailabilityZoneCode(undefined), false);
});

test("getAwsAvailabilityZoneLabel returns a valid code and falls back to default", () => {
  assert.equal(getAwsAvailabilityZoneLabel("eu-central-1c"), "eu-central-1c");
  assert.equal(getAwsAvailabilityZoneLabel("unknown"), "ap-northeast-2a");
});
