export const CAPS_LOCK_WARNING_MESSAGE = "Caps Lock이 켜져 있어요.";

export type CapsLockReadableEvent = {
  getModifierState: (modifier: "CapsLock") => boolean;
};

export function isCapsLockActive(event: CapsLockReadableEvent): boolean {
  return event.getModifierState("CapsLock");
}

export function getCapsLockWarningMessage(isCapsLockOn: boolean): string | null {
  return isCapsLockOn ? CAPS_LOCK_WARNING_MESSAGE : null;
}
