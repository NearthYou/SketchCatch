import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const loginPageSource = readAppFile("login/page.tsx");
const globalStyles = readLocalFile("../../app/globals.css");

test("login route renders the DESIGN.md based auth experience", () => {
  assert.doesNotMatch(loginPageSource, /return null/);
  assert.match(loginPageSource, /import Link from "next\/link"/);
  assert.match(loginPageSource, /import \{ LoginForm \} from "\.\/login-form"/);
  assert.match(loginPageSource, /className="authDesignPage"/);
  assert.match(loginPageSource, /className="authDesignBrand" href="\/"/);
  assert.match(loginPageSource, /SketchCatch/);
  assert.match(loginPageSource, /로그인/);
  assert.match(loginPageSource, /<LoginForm \/>/);
  assert.match(loginPageSource, /href="\/signup"/);
  assert.doesNotMatch(loginPageSource, /authDesignPreview/);
  assert.doesNotMatch(loginPageSource, /Secure workspace/);
  assert.match(loginPageSource, /Practice Architecture부터 IaC Preview, Pre-Deployment Check까지/);
  assert.doesNotMatch(loginPageSource, /terraform plan/i);
  assert.doesNotMatch(loginPageSource, /sketchcatch-logo\.svg/);
});

test("login route styles follow the DESIGN.md visual tokens", () => {
  const pageRule = extractCssRule(".authDesignPage");
  const shellRule = extractCssRule(".authDesignShell");
  const panelRule = extractCssRule(".authDesignPanel");
  const titleRule = extractCssRule(".authDesignIntro h1");
  const submitRule = extractCssRule(".authDesignPage .authSubmit");

  assert.match(pageRule, /--auth-design-primary:\s*#000000/);
  assert.match(pageRule, /--auth-design-ink:\s*#171717/);
  assert.match(pageRule, /--auth-design-link:\s*#0d74ce/);
  assert.match(pageRule, /--auth-design-sky-light:\s*#cfe7ff/);
  assert.match(pageRule, /--auth-design-sans:\s*"Pretendard", "Noto Sans KR", Inter, Geist, sans-serif/);
  assert.match(pageRule, /font-family:\s*var\(--auth-design-sans\)/);
  assert.match(pageRule, /radial-gradient\(circle at 50% 0%, var\(--auth-design-sky-light\)/);
  assert.match(shellRule, /grid-template-columns:\s*minmax\(0,\s*448px\)/);
  assert.match(shellRule, /max-width:\s*448px/);
  assert.match(panelRule, /background:\s*var\(--auth-design-canvas\)/);
  assert.match(panelRule, /border-radius:\s*8px/);
  assert.match(titleRule, /font-size:\s*clamp\(2\.4rem,\s*5vw,\s*4rem\)/);
  assert.match(submitRule, /background:\s*var\(--auth-design-primary\)/);
  assert.match(submitRule, /border-radius:\s*8px/);
  assert.doesNotMatch(globalStyles, /\.authDesignPreview/);
  assert.doesNotMatch(globalStyles, /\.authDesignFlow/);
  assert.doesNotMatch(globalStyles, /\.authDesignCode/);
  assert.doesNotMatch(globalStyles, /\.authDesignSafety/);
});

function readAppFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/${path}`, import.meta.url)), "utf8");
}

function readLocalFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function extractCssRule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalStyles.match(new RegExp(`${escapedSelector}\\s*{[^}]*}`, "s"));
  assert.ok(match, `Expected ${selector} rule to exist`);
  return match[0];
}
