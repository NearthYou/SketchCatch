type DiagramCopyShortcutInput = {
  readonly ctrlKey: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly selectedNodeCount: number;
  readonly selectedText: string;
};

export function resolveDiagramCopyShortcut({
  ctrlKey,
  key,
  metaKey,
  selectedNodeCount,
  selectedText
}: DiagramCopyShortcutInput): "native" | "copy_nodes" | "ignore" {
  if ((!ctrlKey && !metaKey) || key.toLocaleLowerCase() !== "c") {
    return "ignore";
  }

  if (selectedText.length > 0) {
    return "native";
  }

  return selectedNodeCount > 0 ? "copy_nodes" : "native";
}
