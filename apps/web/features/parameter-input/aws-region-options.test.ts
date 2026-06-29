import assert from "node:assert/strict";
import { test } from "node:test";
import {
  awsRegionOptions,
  defaultAwsRegion,
  filterAwsRegionOptions,
  getAwsRegionLabel,
  isAwsRegionCode
} from "./aws-region-options";

test("awsRegionOptions exposes the supported workspace Region choices in product order", () => {
  assert.deepEqual(awsRegionOptions, [
    { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
    { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
    { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
    { value: "us-east-1", label: "US East (N. Virginia)" },
    { value: "us-west-2", label: "US West (Oregon)" },
    { value: "eu-west-1", label: "Europe (Ireland)" },
    { value: "eu-central-1", label: "Europe (Frankfurt)" }
  ]);
  assert.equal(defaultAwsRegion, "ap-northeast-2");
});

test("filterAwsRegionOptions returns all options for an empty query", () => {
  assert.deepEqual(filterAwsRegionOptions("  "), awsRegionOptions);
});

test("filterAwsRegionOptions matches by label and region code case-insensitively", () => {
  assert.deepEqual(filterAwsRegionOptions("tokyo"), [
    { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" }
  ]);
  assert.deepEqual(filterAwsRegionOptions("US-WEST"), [
    { value: "us-west-2", label: "US West (Oregon)" }
  ]);
});

test("filterAwsRegionOptions returns multiple matching regions in stable order", () => {
  assert.deepEqual(filterAwsRegionOptions("europe"), [
    { value: "eu-west-1", label: "Europe (Ireland)" },
    { value: "eu-central-1", label: "Europe (Frankfurt)" }
  ]);
});

test("filterAwsRegionOptions returns no options when no region matches", () => {
  assert.deepEqual(filterAwsRegionOptions("cape town"), []);
});

test("isAwsRegionCode narrows supported region codes", () => {
  assert.equal(isAwsRegionCode("ap-northeast-2"), true);
  assert.equal(isAwsRegionCode("af-south-1"), false);
  assert.equal(isAwsRegionCode(undefined), false);
});

test("getAwsRegionLabel returns the display label and falls back to the default region", () => {
  assert.equal(getAwsRegionLabel("eu-central-1"), "Europe (Frankfurt)");
  assert.equal(getAwsRegionLabel("unknown"), "Asia Pacific (Seoul)");
});
