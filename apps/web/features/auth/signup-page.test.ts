import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const signupPageSource = readAppFile("signup/page.tsx");
const globalStyles = readLocalFile("../../app/globals.css");

test("signup route mirrors the DESIGN.md login experience", () => {
  assert.match(signupPageSource, /className="authDesignPage"/);
  assert.match(signupPageSource, /className="authDesignShell authDesignShellWide"/);
  assert.match(signupPageSource, /className="authDesignPanel authDesignPanelWide"/);
  assert.match(signupPageSource, /className="authDesignBrand" href="\/"/);
  assert.match(signupPageSource, /className="authDesignBadge">Terraform-first operations/);
  assert.match(signupPageSource, /<SignupForm \/>/);
  assert.match(signupPageSource, /className="authDesignSwitch"/);
  assert.match(signupPageSource, /href="\/login"/);
  assert.doesNotMatch(signupPageSource, /sketchcatch-logo\.svg/);
  assert.doesNotMatch(signupPageSource, /authBlueprintShell/);
});

test("signup controls and legal dialog use the DESIGN.md auth tokens", () => {
  const wideShellRule = extractCssRule(".authDesignShellWide");
  const checkButtonRule = extractCssRule(".authDesignPage .authCheckButton");
  const consentButtonRule = extractCssRule(".authDesignPage .authConsentViewButton");
  const legalDialogRule = extractCssRule(".authDesignPage .authLegalDialog");
  const legalConfirmRule = extractCssRule(".authDesignPage .authLegalConfirmButton");

  assert.match(wideShellRule, /max-width:\s*584px/);
  assert.match(checkButtonRule, /border-radius:\s*8px/);
  assert.match(checkButtonRule, /background:\s*var\(--auth-design-canvas\)/);
  assert.match(consentButtonRule, /color:\s*var\(--auth-design-link\)/);
  assert.match(legalDialogRule, /background:\s*var\(--auth-design-canvas\)/);
  assert.match(legalDialogRule, /border-radius:\s*8px/);
  assert.match(legalConfirmRule, /background:\s*var\(--auth-design-primary\)/);
  assert.match(legalConfirmRule, /border-radius:\s*8px/);
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
