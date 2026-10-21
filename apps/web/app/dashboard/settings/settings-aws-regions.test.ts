import assert from "node:assert/strict";
import test from "node:test";
import { AWS_CONNECTION_REGION_OPTIONS } from "./settings-aws-regions";

test("AWS connection setup only offers regions supported by the connection service", () => {
  assert.deepEqual(AWS_CONNECTION_REGION_OPTIONS, [
    { label: "서울", value: "ap-northeast-2" }
  ]);
});
