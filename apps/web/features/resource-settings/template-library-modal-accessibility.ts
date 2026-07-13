const templateLibraryModalFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(",");

export function setupTemplateLibraryModalAccessibility({
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
  readonly overlay: HTMLDivElement;
}): () => void {
  const previouslyFocusedElement = documentRoot.activeElement instanceof HTMLElement
    ? documentRoot.activeElement
    : null;
  const previousBodyOverflow = documentRoot.body.style.overflow;
  const bodySiblingInertStates = Array.from(documentRoot.body.children)
    .filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== overlay
    )
    .map((element) => ({ element, inert: element.inert }));

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
      dialog.querySelectorAll<HTMLElement>(templateLibraryModalFocusableSelector)
    );
    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement = focusableElements.at(-1);

    if (!firstFocusableElement || !lastFocusableElement) return;

    if (event.shiftKey && documentRoot.activeElement === firstFocusableElement) {
      event.preventDefault();
      lastFocusableElement.focus();
    } else if (!event.shiftKey && documentRoot.activeElement === lastFocusableElement) {
      event.preventDefault();
      firstFocusableElement.focus();
    }
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
