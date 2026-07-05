import assert from "node:assert/strict";
import { test } from "node:test";
import {
  awsAvailabilityZoneOptions,
  defaultAwsAvailabilityZone,
  getAwsAvailabilityZoneLabel,
  isAwsAvailabilityZoneCode
} from "./aws-availability-zone-options";

test("awsAvailabilityZoneOptions exposes supported workspace AZ choices", () => {
  assert.equal(defaultAwsAvailabilityZone, "ap-northeast-2a");
  assert.deepEqual(
    awsAvailabilityZoneOptions.slice(0, 3).map((option) => option.value),
    ["ap-northeast-2a", "ap-northeast-2b", "ap-northeast-2c"]
  );
});

test("isAwsAvailabilityZoneCode narrows supported AZ codes", () => {
  assert.equal(isAwsAvailabilityZoneCode("us-east-1b"), true);
  assert.equal(isAwsAvailabilityZoneCode("us-east-9z"), false);
  assert.equal(isAwsAvailabilityZoneCode(undefined), false);
});

test("getAwsAvailabilityZoneLabel returns the display label and falls back to the default AZ", () => {
  assert.equal(getAwsAvailabilityZoneLabel("eu-central-1c"), "Europe (Frankfurt) / eu-central-1c");
  assert.equal(getAwsAvailabilityZoneLabel("unknown"), "Asia Pacific (Seoul) / ap-northeast-2a");
});
