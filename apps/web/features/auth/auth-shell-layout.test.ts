import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const authStylesSource = readWebFile("components/auth/auth.css");

test("authentication cards keep compact top and bottom spacing", () => {
  assert.match(authStylesSource, /\.authLayout\s*\{[^}]*padding-block:\s*32px;/s);
  assert.match(authStylesSource, /\.authIntro\s*\{[^}]*margin-bottom:\s*24px;/s);
  assert.match(
    authStylesSource,
    /\.authSwitch\s*\{[^}]*margin-top:\s*16px;[^}]*padding-top:\s*12px;/s
  );
  assert.match(
    authStylesSource,
    /@media \(max-width: 639px\)[\s\S]*\.authLayout,[\s\S]*?padding-block:\s*20px;[\s\S]*?\.authIntro\s*\{[^}]*margin-bottom:\s*20px;/
  );
});

function readWebFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
}
