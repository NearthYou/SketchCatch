import { test } from "node:test";
import assert from "node:assert/strict";
import { hasRefreshSessionCookieHint } from "../../lib/api-client";

test("hasRefreshSessionCookieHint is false without a browser document", (context) => {
  const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");

  context.after(() => {
    restoreDocument(originalDocumentDescriptor);
  });

  Reflect.deleteProperty(globalThis, "document");

  assert.equal(hasRefreshSessionCookieHint(), false);
});

test("hasRefreshSessionCookieHint only depends on the readable CSRF cookie", (context) => {
  const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");

  context.after(() => {
    restoreDocument(originalDocumentDescriptor);
  });

  setDocumentCookie("unrelated=value; sketchcatch_csrf_token=csrf-token");
  assert.equal(hasRefreshSessionCookieHint(), true);

  setDocumentCookie("unrelated=value");
  assert.equal(hasRefreshSessionCookieHint(), false);
});

function setDocumentCookie(cookie: string): void {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      cookie
    }
  });
}

function restoreDocument(descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(globalThis, "document", descriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, "document");
}
