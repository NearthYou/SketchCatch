export const RESOURCE_NAME_VISIBILITY_STORAGE_KEY =
  "sketchcatch.diagramEditor.resourceNameVisibility.brainboardV1";

export function readResourceNamesVisible(storage: Pick<Storage, "getItem"> | null): boolean {
  return storage?.getItem(RESOURCE_NAME_VISIBILITY_STORAGE_KEY) === "true";
}

export function writeResourceNamesVisible(
  storage: Pick<Storage, "setItem"> | null,
  visible: boolean
): void {
  storage?.setItem(RESOURCE_NAME_VISIBILITY_STORAGE_KEY, String(visible));
}