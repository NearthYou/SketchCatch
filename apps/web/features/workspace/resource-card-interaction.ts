export type ResourceCardKeyboardActivation = "ignore" | "select-only";

export function getResourceCardKeyboardActivation(key: string): ResourceCardKeyboardActivation {
  if (key === "Enter" || key === " " || key === "Spacebar") {
    return "select-only";
  }

  return "ignore";
}
