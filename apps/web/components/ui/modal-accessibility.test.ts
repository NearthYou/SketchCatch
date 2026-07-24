import assert from "node:assert/strict";
import test from "node:test";
import { setupModalAccessibility } from "./modal-accessibility";

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly style: { overflow: string } = { overflow: "" };
  inert = false;
  parentElement: FakeElement | null = null;
  tabIndex = 0;

  constructor(
    readonly documentRoot: FakeDocument,
    readonly name: string
  ) {}

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  contains(target: unknown): boolean {
    return target === this || this.children.some((child) => child.contains(target));
  }

  compareDocumentPosition(target: unknown): number {
    const ownIndex = this.parentElement?.children.indexOf(this) ?? -1;
    const targetIndex =
      target instanceof FakeElement ? (this.parentElement?.children.indexOf(target) ?? -1) : -1;

    return targetIndex > ownIndex ? Node.DOCUMENT_POSITION_FOLLOWING : Node.DOCUMENT_POSITION_PRECEDING;
  }

  focus(): void {
    this.documentRoot.activeElement = this;
  }

  querySelectorAll(): FakeElement[] {
    return this.children;
  }
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  readonly body = new FakeElement(this, "body");
  private keyDownListener: ((event: KeyboardEvent) => void) | null = null;

  addEventListener(type: string, listener: (event: KeyboardEvent) => void): void {
    if (type === "keydown") this.keyDownListener = listener;
  }

  removeEventListener(type: string, listener: (event: KeyboardEvent) => void): void {
    if (type === "keydown" && listener === this.keyDownListener) {
      this.keyDownListener = null;
    }
  }

  dispatchKeyDown(event: KeyboardEvent): void {
    this.keyDownListener?.(event);
  }
}

function createKeyEvent(key: string, shiftKey = false): KeyboardEvent & { prevented: boolean } {
  return {
    key,
    shiftKey,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    }
  } as KeyboardEvent & { prevented: boolean };
}

test("modal accessibility traps Tab, closes on Escape, and restores focus", () => {
  const originalHTMLElement = globalThis.HTMLElement;
  const originalNode = globalThis.Node;
  const documentRoot = new FakeDocument();
  const trigger = new FakeElement(documentRoot, "trigger");
  const overlay = new FakeElement(documentRoot, "overlay");
  const dialog = new FakeElement(documentRoot, "dialog");
  const closeButton = new FakeElement(documentRoot, "close");
  const lastFocusable = new FakeElement(documentRoot, "last");
  const outside = new FakeElement(documentRoot, "outside");
  let closeCount = 0;

  documentRoot.body.append(trigger, overlay, outside);
  overlay.append(dialog);
  dialog.append(closeButton, lastFocusable);
  trigger.focus();

  Object.assign(globalThis, {
    HTMLElement: FakeElement,
    Node: {
      DOCUMENT_POSITION_FOLLOWING: 4,
      DOCUMENT_POSITION_PRECEDING: 2
    }
  });

  try {
    const cleanup = setupModalAccessibility({
      closeButton: closeButton as unknown as HTMLButtonElement,
      dialog: dialog as unknown as HTMLElement,
      documentRoot: documentRoot as unknown as Document,
      onClose: () => {
        closeCount += 1;
      },
      overlay: overlay as unknown as HTMLElement
    });

    assert.equal(documentRoot.activeElement, closeButton);
    assert.equal(outside.inert, true);
    assert.equal(documentRoot.body.style.overflow, "hidden");

    lastFocusable.focus();
    const tabFromLast = createKeyEvent("Tab");
    documentRoot.dispatchKeyDown(tabFromLast);
    assert.equal(tabFromLast.prevented, true);
    assert.equal(documentRoot.activeElement, closeButton);

    closeButton.focus();
    const shiftTabFromFirst = createKeyEvent("Tab", true);
    documentRoot.dispatchKeyDown(shiftTabFromFirst);
    assert.equal(shiftTabFromFirst.prevented, true);
    assert.equal(documentRoot.activeElement, lastFocusable);

    const escape = createKeyEvent("Escape");
    documentRoot.dispatchKeyDown(escape);
    assert.equal(escape.prevented, true);
    assert.equal(closeCount, 1);

    cleanup();
    assert.equal(documentRoot.activeElement, trigger);
    assert.equal(outside.inert, false);
    assert.equal(documentRoot.body.style.overflow, "");
  } finally {
    Object.assign(globalThis, { HTMLElement: originalHTMLElement, Node: originalNode });
  }
});
