import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const pageSource = readLocalFile("../../app/page.tsx");
const productEntrySource = readLocalFile("./product-entry.tsx");
const productSectionsSource = readLocalFile("./landing-product-sections.tsx");
const workspacePreviewSource = readLocalFile("./landing-workspace-preview.tsx");
const workflowSource = readLocalFile("./landing-workflow-section.tsx");
const landingStylesSource = readLocalFile("./product-entry.module.css");

test("root route renders the product entry instead of a temporary placeholder", () => {
  assert.match(pageSource, /ProductEntry/);
  assert.doesNotMatch(pageSource, /RoutePlaceholder/);
});

test("product entry exposes the start action and redirects signed-in users", () => {
  assert.match(productEntrySource, /const \{ status \} = useAuth\(\)/);
  assert.match(productEntrySource, /router\.replace\("\/dashboard"\)/);
  assert.match(productEntrySource, /href="\/signup"/);
  assert.match(productEntrySource, /Practice Architecture를 눈으로 설계하고/);
});

test("product entry carries the landing preview Board, IaC, and Check interaction", () => {
  assert.match(workspacePreviewSource, /PREVIEW_TABS/);
  assert.match(workspacePreviewSource, /setMode/);
  assert.match(workspacePreviewSource, /Practice Architecture/);
  assert.match(workspacePreviewSource, /IaC Preview/);
  assert.match(workspacePreviewSource, /Pre-Deployment Check/);
});

test("landing header keeps a visible login entry next to signup", () => {
  assert.match(productEntrySource, /href="\/login"/);
  assert.match(productEntrySource, />\s*로그인\s*<\/Link>/s);
  assert.match(productEntrySource, /href="\/signup"/);
});

test("landing preview tabs stay on one line inside the workspace top bar", () => {
  assert.match(landingStylesSource, /grid-template-columns:\s*180px minmax\(0, 1fr\) max-content/);
  assert.match(landingStylesSource, /\.modeTab\s*\{[^}]*white-space:\s*nowrap/s);
});

test("product entry carries every section from the landing reference", () => {
  assert.match(productEntrySource, /LandingWorkflowSection/);
  assert.match(productEntrySource, /LandingProductSections/);
  assert.match(workflowSource, /AI Architecture Recommendation/);
  assert.match(productSectionsSource, /Reverse Engineering/);
  assert.match(productSectionsSource, /Two deployment paths/);
});

test("rebuilt landing keeps the brand text without rendering a logo image", () => {
  const rebuiltLandingSource = [productEntrySource, productSectionsSource, workspacePreviewSource, workflowSource].join("\n");

  assert.doesNotMatch(rebuiltLandingSource, /sketchcatch-logo\.svg/);
  assert.doesNotMatch(rebuiltLandingSource, /sketchcatch-logo\.png/);
  assert.match(productEntrySource, />SketchCatch<\/span>/);
});

test("public brand assets contain only the new PNG logo and favicon", () => {
  assert.equal(existsSync(readLocalPath("../../public/sketchcatch-logo.svg")), false);
  assert.equal(existsSync(readLocalPath("../../public/favicon.svg")), false);
  assert.equal(existsSync(readLocalPath("../../public/sketchcatch-logo.png")), true);
  assert.equal(existsSync(readLocalPath("../../public/favicon.png")), true);
});

function readLocalFile(relativePath: string): string {
  return readFileSync(readLocalPath(relativePath), "utf8");
}

function readLocalPath(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}
