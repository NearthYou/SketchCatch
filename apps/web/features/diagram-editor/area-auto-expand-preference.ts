export const AREA_AUTO_EXPAND_STORAGE_KEY =
  "sketchcatch.diagramEditor.autoExpandAreas.brainboardV1";

export function readAutoExpandAreasEnabled(storage: Pick<Storage, "getItem"> | null): boolean {
  return storage?.getItem(AREA_AUTO_EXPAND_STORAGE_KEY) !== "false";
}

export function writeAutoExpandAreasEnabled(
  storage: Pick<Storage, "setItem"> | null,
  enabled: boolean
): void {
  storage?.setItem(AREA_AUTO_EXPAND_STORAGE_KEY, String(enabled));
}
