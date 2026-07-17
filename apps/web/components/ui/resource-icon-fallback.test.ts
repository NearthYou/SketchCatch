import assert from "node:assert/strict";
import test from "node:test";
import { shouldRenderResourceIconImage } from "./resource-icon-fallback";

test("resource icon falls back when a URL is absent or the current URL failed", () => {
  assert.equal(shouldRenderResourceIconImage(undefined, null), false);
  assert.equal(shouldRenderResourceIconImage("/icons/vpc.svg", null), true);
  assert.equal(shouldRenderResourceIconImage("/icons/vpc.svg", "/icons/vpc.svg"), false);
});

test("resource icon retries when a node receives a different icon URL", () => {
  assert.equal(
    shouldRenderResourceIconImage("/icons/subnet.svg", "/icons/vpc.svg"),
    true
  );
});
