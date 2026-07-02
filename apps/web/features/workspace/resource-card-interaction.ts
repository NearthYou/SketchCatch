export type ResourceCardKeyboardActivation = "ignore" | "open-settings" | "select-only";

export function getResourceCardKeyboardActivation(key: string): ResourceCardKeyboardActivation {
  if (key === "Enter") {
    return "open-settings";
  }

  if (key === " " || key === "Spacebar") {
    return "select-only";
  }

  return "ignore";
}
