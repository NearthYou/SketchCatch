import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAPS_LOCK_WARNING_MESSAGE,
  getCapsLockWarningMessage,
  isCapsLockActive
} from "./caps-lock";

test("isCapsLockActive reads the CapsLock keyboard modifier", () => {
  const event = {
    getModifierState: (modifier: string) => modifier === "CapsLock"
  };

  assert.equal(isCapsLockActive(event), true);
});

test("isCapsLockActive ignores other keyboard modifiers", () => {
  const event = {
    getModifierState: (modifier: string) => modifier === "Shift"
  };

  assert.equal(isCapsLockActive(event), false);
});

test("getCapsLockWarningMessage returns the login warning only while Caps Lock is active", () => {
  assert.equal(getCapsLockWarningMessage(true), CAPS_LOCK_WARNING_MESSAGE);
  assert.equal(getCapsLockWarningMessage(false), null);
});
