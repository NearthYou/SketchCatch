import assert from "node:assert/strict";
import { test } from "node:test";
import { setupTemplateLibraryModalAccessibility } from "./template-library-modal-accessibility";

test("Template 전체보기 modal lifecycle traps focus and restores the surrounding document", () => {
  const originalHTMLElement = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  const originalNode = Object.getOwnPropertyDescriptor(globalThis, "Node");
  const documentRoot = new FakeDocument();

  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: FakeHTMLElement
  });
  Object.defineProperty(globalThis, "Node", {
    configurable: true,
    value: FakeNode
  });

  try {
    const opener = new FakeHTMLElement(documentRoot);
    const appRoot = new FakeHTMLElement(documentRoot);
    const alreadyInertSibling = new FakeHTMLElement(documentRoot);
    const overlay = new FakeHTMLElement(documentRoot);
    const dialog = new FakeHTMLElement(documentRoot);
    const leadingSelectMenuOption = new FakeHTMLElement(documentRoot);
    const closeButton = new FakeHTMLElement(documentRoot);
    const middleButton = new FakeHTMLElement(documentRoot);
    const lastButton = new FakeHTMLElement(documentRoot);
    const trailingSelectMenuOption = new FakeHTMLElement(documentRoot);
    let firstCloseCount = 0;
    let latestCloseCount = 0;
    let currentOnClose = () => {
      firstCloseCount += 1;
    };

    alreadyInertSibling.inert = true;
    documentRoot.activeElement = opener;
    documentRoot.body.children.push(appRoot, alreadyInertSibling, overlay);
    documentRoot.body.style.overflow = "clip";
    appRoot.append(opener);
    overlay.append(dialog);
    leadingSelectMenuOption.tabIndex = -1;
    trailingSelectMenuOption.tabIndex = -1;
    dialog.append(
      leadingSelectMenuOption,
      closeButton,
      middleButton,
      lastButton,
      trailingSelectMenuOption
    );
    dialog.focusableElements = [
      leadingSelectMenuOption,
      closeButton,
      middleButton,
      lastButton,
      trailingSelectMenuOption
    ];

    const cleanup = setupTemplateLibraryModalAccessibility({
      closeButton: closeButton as unknown as HTMLButtonElement,
      dialog: dialog as unknown as HTMLElement,
      documentRoot: documentRoot as unknown as Document,
      onClose: () => currentOnClose(),
      overlay: overlay as unknown as HTMLDivElement
    });

    assert.equal(documentRoot.activeElement, closeButton);
    assert.equal(appRoot.inert, true);
    assert.equal(alreadyInertSibling.inert, true);
    assert.equal(overlay.inert, false);
    assert.equal(documentRoot.body.style.overflow, "hidden");

    documentRoot.activeElement = lastButton;
    const tabFromLast = new FakeKeyboardEvent("Tab");
    documentRoot.dispatchEvent(tabFromLast);
    assert.equal(tabFromLast.defaultPrevented, true);
    assert.equal(documentRoot.activeElement, closeButton);

    documentRoot.activeElement = closeButton;
    const shiftTabFromFirst = new FakeKeyboardEvent("Tab", true);
    documentRoot.dispatchEvent(shiftTabFromFirst);
    assert.equal(shiftTabFromFirst.defaultPrevented, true);
    assert.equal(documentRoot.activeElement, lastButton);

    documentRoot.activeElement = trailingSelectMenuOption;
    const tabFromTrailingRovingOption = new FakeKeyboardEvent("Tab");
    documentRoot.dispatchEvent(tabFromTrailingRovingOption);
    assert.equal(tabFromTrailingRovingOption.defaultPrevented, true);
    assert.equal(documentRoot.activeElement, closeButton);

    documentRoot.activeElement = leadingSelectMenuOption;
    const shiftTabFromLeadingRovingOption = new FakeKeyboardEvent("Tab", true);
    documentRoot.dispatchEvent(shiftTabFromLeadingRovingOption);
    assert.equal(shiftTabFromLeadingRovingOption.defaultPrevented, true);
    assert.equal(documentRoot.activeElement, lastButton);

    documentRoot.activeElement = leadingSelectMenuOption;
    const tabTowardInternalStop = new FakeKeyboardEvent("Tab");
    documentRoot.dispatchEvent(tabTowardInternalStop);
    assert.equal(tabTowardInternalStop.defaultPrevented, false);
    assert.equal(documentRoot.activeElement, leadingSelectMenuOption);

    documentRoot.activeElement = trailingSelectMenuOption;
    const shiftTabTowardInternalStop = new FakeKeyboardEvent("Tab", true);
    documentRoot.dispatchEvent(shiftTabTowardInternalStop);
    assert.equal(shiftTabTowardInternalStop.defaultPrevented, false);
    assert.equal(documentRoot.activeElement, trailingSelectMenuOption);

    documentRoot.activeElement = opener;
    const tabFromOutside = new FakeKeyboardEvent("Tab");
    documentRoot.dispatchEvent(tabFromOutside);
    assert.equal(tabFromOutside.defaultPrevented, true);
    assert.equal(documentRoot.activeElement, closeButton);

    documentRoot.activeElement = opener;
    const shiftTabFromOutside = new FakeKeyboardEvent("Tab", true);
    documentRoot.dispatchEvent(shiftTabFromOutside);
    assert.equal(shiftTabFromOutside.defaultPrevented, true);
    assert.equal(documentRoot.activeElement, lastButton);

    currentOnClose = () => {
      latestCloseCount += 1;
    };
    const escape = new FakeKeyboardEvent("Escape");
    documentRoot.dispatchEvent(escape);
    assert.equal(escape.defaultPrevented, true);
    assert.equal(firstCloseCount, 0);
    assert.equal(latestCloseCount, 1);

    cleanup();
    assert.equal(appRoot.inert, false);
    assert.equal(alreadyInertSibling.inert, true);
    assert.equal(overlay.inert, false);
    assert.equal(documentRoot.body.style.overflow, "clip");
    assert.equal(documentRoot.activeElement, opener);

    documentRoot.dispatchEvent(new FakeKeyboardEvent("Escape"));
    assert.equal(latestCloseCount, 1);
  } finally {
    if (originalHTMLElement) {
      Object.defineProperty(globalThis, "HTMLElement", originalHTMLElement);
    } else {
      Reflect.deleteProperty(globalThis, "HTMLElement");
    }
    if (originalNode) {
      Object.defineProperty(globalThis, "Node", originalNode);
    } else {
      Reflect.deleteProperty(globalThis, "Node");
    }
  }
});

class FakeDocument extends EventTarget {
  activeElement: FakeHTMLElement | null = null;
  readonly body = {
    children: [] as FakeHTMLElement[],
    style: { overflow: "" }
  };

  getDocumentOrder(): FakeHTMLElement[] {
    return this.body.children.flatMap((element) => element.getDocumentOrder());
  }
}

class FakeNode {
  static readonly DOCUMENT_POSITION_PRECEDING = 2;
  static readonly DOCUMENT_POSITION_FOLLOWING = 4;
}

class FakeHTMLElement extends EventTarget {
  readonly childElements: FakeHTMLElement[] = [];
  focusableElements: FakeHTMLElement[] = [];
  inert = false;
  tabIndex = 0;

  constructor(private readonly documentRoot: FakeDocument) {
    super();
  }

  append(...elements: FakeHTMLElement[]): void {
    this.childElements.push(...elements);
  }

  compareDocumentPosition(element: FakeHTMLElement): number {
    const documentOrder = this.documentRoot.getDocumentOrder();
    const currentIndex = documentOrder.indexOf(this);
    const elementIndex = documentOrder.indexOf(element);

    if (currentIndex === -1 || elementIndex === -1) return 1;
    if (elementIndex < currentIndex) return FakeNode.DOCUMENT_POSITION_PRECEDING;
    if (elementIndex > currentIndex) return FakeNode.DOCUMENT_POSITION_FOLLOWING;
    return 0;
  }

  contains(element: FakeHTMLElement | null): boolean {
    return (
      element === this || this.childElements.some((child) => child.contains(element))
    );
  }

  focus(): void {
    this.documentRoot.activeElement = this;
  }

  getDocumentOrder(): FakeHTMLElement[] {
    return [
      this,
      ...this.childElements.flatMap((element) => element.getDocumentOrder())
    ];
  }

  querySelectorAll<T extends Element>(_selector: string): T[] {
    return this.focusableElements as unknown as T[];
  }
}

class FakeKeyboardEvent extends Event {
  constructor(
    readonly key: string,
    readonly shiftKey = false
  ) {
    super("keydown", { cancelable: true });
  }
}
