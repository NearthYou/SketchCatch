import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const pageSource = readLocalFile("../../app/page.tsx");
const productEntrySource = readLocalFile("./product-entry.tsx");

test("root route renders the product entry instead of a temporary placeholder", () => {
  assert.match(pageSource, /ProductEntry/);
  assert.doesNotMatch(pageSource, /RoutePlaceholder/);
});

test("product entry exposes authentication actions and redirects signed-in users", () => {
  assert.match(productEntrySource, /const \{ status \} = useAuth\(\)/);
  assert.match(productEntrySource, /router\.replace\("\/dashboard"\)/);
  assert.match(productEntrySource, /href="\/login"/);
  assert.match(productEntrySource, /href="\/signup"/);
  assert.match(productEntrySource, /설계부터 배포까지/);
});

function readLocalFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}
