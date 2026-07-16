const modalFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(",");

export function setupModalAccessibility({
  closeButton,
  dialog,
  documentRoot,
  onClose,
  overlay
}: {
  readonly closeButton: HTMLButtonElement;
  readonly dialog: HTMLElement;
  readonly documentRoot: Document;
  readonly onClose: () => void;
  readonly overlay: HTMLElement;
}): () => void {
  const previouslyFocusedElement =
    documentRoot.activeElement instanceof HTMLElement ? documentRoot.activeElement : null;
  const previousBodyOverflow = documentRoot.body.style.overflow;
  const bodySiblingInertStates: Array<{ element: HTMLElement; inert: boolean }> = [];
  let modalBranch: HTMLElement = overlay;
  let parent = modalBranch.parentElement;
  while (parent) {
    for (const sibling of Array.from(parent.children)) {
      if (sibling instanceof HTMLElement && sibling !== modalBranch) {
        bodySiblingInertStates.push({ element: sibling, inert: sibling.inert });
      }
    }
    if (parent === documentRoot.body) break;
    modalBranch = parent;
    parent = parent.parentElement;
  }

  bodySiblingInertStates.forEach(({ element }) => {
    element.inert = true;
  });
  documentRoot.body.style.overflow = "hidden";

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(modalFocusableSelector)
    ).filter((element) => element.tabIndex >= 0);
    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement = focusableElements.at(-1);

    if (!firstFocusableElement || !lastFocusableElement) return;

    const activeElement = documentRoot.activeElement;

    if (event.shiftKey && activeElement === firstFocusableElement) {
      event.preventDefault();
      lastFocusableElement.focus();
      return;
    }

    if (!event.shiftKey && activeElement === lastFocusableElement) {
      event.preventDefault();
      firstFocusableElement.focus();
      return;
    }

    if (focusableElements.some((element) => element === activeElement)) return;

    const wrapTarget = event.shiftKey ? lastFocusableElement : firstFocusableElement;

    if (!activeElement || !dialog.contains(activeElement)) {
      event.preventDefault();
      wrapTarget.focus();
      return;
    }

    const direction = event.shiftKey
      ? Node.DOCUMENT_POSITION_PRECEDING
      : Node.DOCUMENT_POSITION_FOLLOWING;
    const hasFocusableElementInDirection = focusableElements.some((element) =>
      Boolean(activeElement.compareDocumentPosition(element) & direction)
    );

    if (hasFocusableElementInDirection) return;

    event.preventDefault();
    wrapTarget.focus();
  };

  documentRoot.addEventListener("keydown", handleKeyDown);
  closeButton.focus();

  return () => {
    documentRoot.removeEventListener("keydown", handleKeyDown);
    bodySiblingInertStates.forEach(({ element, inert }) => {
      element.inert = inert;
    });
    documentRoot.body.style.overflow = previousBodyOverflow;
    previouslyFocusedElement?.focus();
  };
}
