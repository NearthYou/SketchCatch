import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getPasswordPolicyCategoryCount,
  getPasswordPolicyErrorMessage,
  isPasswordPolicySatisfied,
  PASSWORD_POLICY_ERROR_MESSAGE
} from "@sketchcatch/types";

test("password policy accepts any three of uppercase, lowercase, number, and special character", () => {
  assert.equal(isPasswordPolicySatisfied("Password12"), true);
  assert.equal(isPasswordPolicySatisfied("password12!"), true);
  assert.equal(isPasswordPolicySatisfied("PASSWORD12!"), true);
  assert.equal(isPasswordPolicySatisfied("Password!!"), true);
});

test("password policy rejects short passwords and passwords with fewer than three categories", () => {
  assert.equal(isPasswordPolicySatisfied("Pass123!"), false);
  assert.equal(isPasswordPolicySatisfied("password123"), false);
  assert.equal(isPasswordPolicySatisfied("abcdefghij"), false);
});

test("password policy counts character categories independently", () => {
  assert.equal(getPasswordPolicyCategoryCount("password123"), 2);
  assert.equal(getPasswordPolicyCategoryCount("Password123"), 3);
  assert.equal(getPasswordPolicyCategoryCount("Password123!"), 4);
});

test("password policy returns a user-facing error message for invalid passwords", () => {
  assert.equal(getPasswordPolicyErrorMessage("password123"), PASSWORD_POLICY_ERROR_MESSAGE);
  assert.equal(getPasswordPolicyErrorMessage("Password123"), null);
});
