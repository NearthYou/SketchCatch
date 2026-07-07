export type DiagramInteractionMode = "select" | "pan";

export type AreaBlankInteractionTarget = "blank-space";

export type AreaBlankInteractionInput = {
  button: number;
  ctrlKey: boolean;
  interactionMode: DiagramInteractionMode;
  metaKey: boolean;
  shiftKey: boolean;
  target: unknown;
  temporaryPanPreviousMode: DiagramInteractionMode | null;
};

export type TemporaryPanReleaseInput = {
  button: number;
  buttons: number;
  previousMode: DiagramInteractionMode | null;
};

const MIDDLE_MOUSE_BUTTON_MASK = 4;

const INTERACTIVE_CANVAS_TARGET_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "[contenteditable]",
  ".nodrag",
  ".react-flow__node:not(.diagramAreaFlowNode)",
  ".react-flow__edge",
  ".react-flow__handle"
].join(", ");

export function getAreaBlankInteractionTarget({
  button,
  ctrlKey,
  interactionMode,
  metaKey,
  shiftKey,
  target,
  temporaryPanPreviousMode
}: AreaBlankInteractionInput): AreaBlankInteractionTarget | null {
  if (
    button !== 0 ||
    interactionMode !== "select" ||
    temporaryPanPreviousMode !== null ||
    shiftKey ||
    metaKey ||
    ctrlKey ||
    isCanvasInteractiveElementTarget(target)
  ) {
    return null;
  }

  return "blank-space";
}

export function getTemporaryPanReleaseMode({
  button,
  buttons,
  previousMode
}: TemporaryPanReleaseInput): DiagramInteractionMode | null {
  if (previousMode === null) {
    return null;
  }

  if (button === 1 || (buttons & MIDDLE_MOUSE_BUTTON_MASK) === 0) {
    return previousMode;
  }

  return null;
}

export function isCanvasInteractiveElementTarget(target: unknown): boolean {
  if (!hasClosest(target)) {
    return false;
  }

  return Boolean(target.closest(INTERACTIVE_CANVAS_TARGET_SELECTOR));
}

function hasClosest(target: unknown): target is { closest: (selector: string) => unknown } {
  return (
    typeof target === "object" &&
    target !== null &&
    "closest" in target &&
    typeof target.closest === "function"
  );
}
