export function isProjectDraftSaveShortcut(input: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return (input.ctrlKey || input.metaKey) && input.key.toLowerCase() === "s";
}
