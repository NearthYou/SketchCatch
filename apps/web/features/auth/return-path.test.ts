import assert from "node:assert/strict";
import { test } from "node:test";
import { getSafeReturnPath } from "./return-path";

test("getSafeReturnPath keeps an internal route and its query string", () => {
  assert.equal(
    getSafeReturnPath("/workspace?projectId=project-1"),
    "/workspace?projectId=project-1"
  );
});

test("getSafeReturnPath rejects external and protocol-relative redirects", () => {
  assert.equal(getSafeReturnPath("https://example.com"), "/dashboard");
  assert.equal(getSafeReturnPath("//example.com"), "/dashboard");
});

test("getSafeReturnPath falls back when no destination exists", () => {
  assert.equal(getSafeReturnPath(null), "/dashboard");
});
