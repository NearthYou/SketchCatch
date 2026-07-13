import assert from "node:assert/strict";
import { test } from "node:test";
import { setupTemplateLibraryModalAccessibility } from "./template-library-modal-accessibility";

test("Template 전체보기 modal lifecycle traps focus and restores the surrounding document", () => {
  const originalHTMLElement = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  const documentRoot = new FakeDocument();

  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: FakeHTMLElement
  });

  try {
    const opener = new FakeHTMLElement(documentRoot);
    const appRoot = new FakeHTMLElement(documentRoot);
    const alreadyInertSibling = new FakeHTMLElement(documentRoot);
    const overlay = new FakeHTMLElement(documentRoot);
    const dialog = new FakeHTMLElement(documentRoot);
    const closeButton = new FakeHTMLElement(documentRoot);
    const middleButton = new FakeHTMLElement(documentRoot);
    const lastButton = new FakeHTMLElement(documentRoot);
    let firstCloseCount = 0;
    let latestCloseCount = 0;
    let currentOnClose = () => {
      firstCloseCount += 1;
    };

    alreadyInertSibling.inert = true;
    documentRoot.activeElement = opener;
    documentRoot.body.children.push(appRoot, alreadyInertSibling, overlay);
    documentRoot.body.style.overflow = "clip";
    dialog.focusableElements = [closeButton, middleButton, lastButton];

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
  }
});

class FakeDocument extends EventTarget {
  activeElement: FakeHTMLElement | null = null;
  readonly body = {
    children: [] as FakeHTMLElement[],
    style: { overflow: "" }
  };
}

class FakeHTMLElement extends EventTarget {
  focusableElements: FakeHTMLElement[] = [];
  inert = false;

  constructor(private readonly documentRoot: FakeDocument) {
    super();
  }

  focus(): void {
    this.documentRoot.activeElement = this;
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
