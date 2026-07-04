import assert from "node:assert/strict";
import { test } from "node:test";
import { toParameterRecord } from "./parameter-value-record";

test("toParameterRecord returns object values unchanged", () => {
  assert.deepEqual(toParameterRecord({ variables: { LOG_LEVEL: "info" } }), {
    variables: { LOG_LEVEL: "info" }
  });
});

test("toParameterRecord unwraps the first object from legacy array values", () => {
  assert.deepEqual(toParameterRecord([{ variables: { LOG_LEVEL: "info" } }]), {
    variables: { LOG_LEVEL: "info" }
  });
});

test("toParameterRecord ignores empty arrays and scalar values", () => {
  assert.deepEqual(toParameterRecord([]), {});
  assert.deepEqual(toParameterRecord("not-a-record"), {});
});
