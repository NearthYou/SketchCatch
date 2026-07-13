import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_EXPECTED_USER_COUNT,
  normalizeExpectedUserCount
} from "./cost-estimate-input";

test("normalizeExpectedUserCount accepts direct integer and comma-formatted input", () => {
  assert.equal(normalizeExpectedUserCount("2500"), 2500);
  assert.equal(normalizeExpectedUserCount("10,000"), 10000);
});

test("normalizeExpectedUserCount rejects empty, zero, and non-number input", () => {
  assert.equal(normalizeExpectedUserCount(""), null);
  assert.equal(normalizeExpectedUserCount("0"), null);
  assert.equal(normalizeExpectedUserCount("users"), null);
});

test("normalizeExpectedUserCount rounds decimals and caps the API maximum", () => {
  assert.equal(normalizeExpectedUserCount("42.6"), 43);
  assert.equal(normalizeExpectedUserCount("2000000"), MAX_EXPECTED_USER_COUNT);
});
