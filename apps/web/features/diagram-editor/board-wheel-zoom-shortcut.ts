export type BoardZoomModifierKey = "Control" | "Meta";

type BoardWheelZoomShortcutInput = {
  readonly activeModifierKeys: ReadonlySet<BoardZoomModifierKey>;
  readonly ctrlKey: boolean;
  readonly deltaY: number;
  readonly metaKey: boolean;
};

export function resolveBoardWheelZoomShortcut({
  activeModifierKeys,
  ctrlKey,
  deltaY,
  metaKey
}: BoardWheelZoomShortcutInput): "zoom_in" | "zoom_out" | null {
  const modifierKey: BoardZoomModifierKey | null = metaKey
    ? "Meta"
    : ctrlKey
      ? "Control"
      : null;

  if (modifierKey === null || !activeModifierKeys.has(modifierKey) || deltaY === 0) {
    return null;
  }

  return deltaY < 0 ? "zoom_in" : "zoom_out";
}
