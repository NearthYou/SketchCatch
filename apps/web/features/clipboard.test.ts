import assert from "node:assert/strict";
import test from "node:test";
import { copyTextToClipboard, writePlainTextToCopyEvent } from "../lib/clipboard";

test("copyTextToClipboard uses the Clipboard API when available", async () => {
  const originalNavigator = globalThis.navigator;
  let copied = "";
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText: async (value: string) => { copied = value; } } }
  });

  try {
    await copyTextToClipboard("terraform");
    assert.equal(copied, "terraform");
  } finally {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
  }
});

test("copyTextToClipboard falls back when Clipboard API is unavailable", async () => {
  const originalNavigator = globalThis.navigator;
  const originalDocument = globalThis.document;
  let copied = "";
  const textarea = {
    value: "",
    style: {} as CSSStyleDeclaration,
    setAttribute: () => undefined,
    select: () => undefined,
    remove: () => undefined
  } as unknown as HTMLTextAreaElement;
  const fakeDocument = {
    body: { appendChild: () => undefined },
    createElement: () => textarea,
    execCommand: (command: string) => {
      copied = command === "copy" ? textarea.value : "";
      return command === "copy";
    }
  } as unknown as Document;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });

  try {
    await copyTextToClipboard("fallback text");
    assert.equal(copied, "fallback text");
  } finally {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  }
});

test("copyTextToClipboard falls back when the Clipboard API rejects", async () => {
  const originalNavigator = globalThis.navigator;
  const originalDocument = globalThis.document;
  let copied = "";
  const textarea = {
    value: "",
    style: {} as CSSStyleDeclaration,
    setAttribute: () => undefined,
    select: () => undefined,
    remove: () => undefined
  } as unknown as HTMLTextAreaElement;
  const fakeDocument = {
    body: { appendChild: () => undefined },
    createElement: () => textarea,
    execCommand: (command: string) => {
      copied = command === "copy" ? textarea.value : "";
      return command === "copy";
    }
  } as unknown as Document;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText: async () => { throw new DOMException("Denied", "NotAllowedError"); } } }
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });

  try {
    await copyTextToClipboard("recovered text");
    assert.equal(copied, "recovered text");
  } finally {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  }
});

test("writePlainTextToCopyEvent replaces the rich copy payload with text/plain", () => {
  let prevented = false;
  const data = new Map<string, string>();
  const event = {
    clipboardData: { setData: (type: string, value: string) => data.set(type, value) },
    preventDefault: () => { prevented = true; }
  } as unknown as ClipboardEvent;

  assert.equal(writePlainTextToCopyEvent(event, "visible text"), true);
  assert.equal(prevented, true);
  assert.equal(data.get("text/plain"), "visible text");
  assert.equal(data.has("text/html"), false);
});
