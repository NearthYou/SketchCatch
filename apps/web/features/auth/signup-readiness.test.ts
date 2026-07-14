import assert from "node:assert/strict";
import { test } from "node:test";
import { getSignupReadiness } from "./signup-readiness";

const completeInput = {
  emailEntered: true,
  emailAvailable: true,
  nicknameEntered: true,
  passwordConfirmed: true,
  passwordValid: true,
  privacyAccepted: true,
  termsAccepted: true,
  usernameAvailable: true,
  usernameEntered: true
} as const;

test("signup readiness accepts a form only when every required condition is complete", () => {
  assert.deepEqual(getSignupReadiness(completeInput), {
    isReady: true,
    unmetRequirements: []
  });
});

test("signup readiness reports user-facing unmet requirements in form order", () => {
  assert.deepEqual(
    getSignupReadiness({
      ...completeInput,
      emailAvailable: false,
      nicknameEntered: false,
      privacyAccepted: false,
      usernameAvailable: false
    }),
    {
      isReady: false,
      unmetRequirements: ["nickname", "usernameAvailability", "emailAvailability", "agreements"]
    }
  );
});
