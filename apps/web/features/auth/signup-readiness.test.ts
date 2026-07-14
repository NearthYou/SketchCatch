import assert from "node:assert/strict";
import { test } from "node:test";
import { getSignupReadiness, getSignupRequirementMessage } from "./signup-readiness";

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

test("signup requirement messages explain the next action", () => {
  assert.equal(getSignupRequirementMessage("usernameAvailability"), "아이디 중복 확인을 완료해주세요.");
  assert.equal(getSignupRequirementMessage("agreements"), "필수 약관에 모두 동의해주세요.");
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
