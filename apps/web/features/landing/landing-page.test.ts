import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const pageSource = readLocalFile("../../app/page.tsx");
const globalStyles = readLocalFile("../../app/globals.css");
const designGuide = readLocalFile("../../../../DESIGN.md");

test("root route renders the DESIGN.md based SketchCatch landing page", () => {
  assert.doesNotMatch(pageSource, /redirect\(/);
  assert.doesNotMatch(pageSource, /return null/);
  assert.match(pageSource, /className="sketchLandingPage"/);
  assert.match(pageSource, /SketchCatch/);
  assert.match(pageSource, /multi-cloud-ready IaC 운영 서비스/);
  assert.match(pageSource, /Practice Architecture/);
  assert.match(pageSource, /IaC Preview/);
  assert.match(pageSource, /Pre-Deployment Check/);
  assert.match(pageSource, /Direct Deployment Path/);
  assert.match(pageSource, /Git\/CI\/CD Deployment Path/);
  assert.match(pageSource, /Reverse Engineering/);
  assert.match(pageSource, /href="\/workspace\/new"/);
  assert.match(pageSource, /href="\/workspace\/reverse"/);
  assert.match(pageSource, /href="\/login"/);
});

test("root landing keeps the latest header and background constraints", () => {
  const landingPageRule = extractCssRule(".sketchLandingPage");
  const deviceRule = extractCssRule(".sketchLandingDevice");

  assert.doesNotMatch(pageSource, /sketchcatch-logo\.svg/);
  assert.doesNotMatch(pageSource, /sketchLandingNavCta/);
  assert.match(pageSource, /className="sketchLandingBrand" href="\/">\s*<span>SketchCatch<\/span>/s);
  assert.match(pageSource, /className="sketchLandingNavLogin" href="\/login"/);
  assert.doesNotMatch(landingPageRule, /linear-gradient\([^)]*1px|repeating-linear-gradient|background-size:\s*(?:72|28)px/);
  assert.doesNotMatch(deviceRule, /linear-gradient\([^)]*1px|repeating-linear-gradient|background-size:\s*(?:72|28)px/);
});

test("root landing styles map the DESIGN.md Expo-inspired tokens", () => {
  const landingPageRule = extractCssRule(".sketchLandingPage");
  const heroRule = extractCssRule(".sketchLandingHero");
  const brandRule = extractCssRule(".sketchLandingBrand");
  const deviceRule = extractCssRule(".sketchLandingDevice");

  assert.match(globalStyles, /\.sketchLandingPage/);
  assert.match(landingPageRule, /--sketch-landing-primary:\s*#000000/);
  assert.match(landingPageRule, /--sketch-landing-ink:\s*#171717/);
  assert.match(landingPageRule, /--sketch-landing-link:\s*#0d74ce/);
  assert.match(landingPageRule, /--sketch-landing-sky-light:\s*#cfe7ff/);
  assert.match(brandRule, /font-size:\s*2rem/);
  assert.match(heroRule, /#cfe7ff|var\(--sketch-landing-sky-light\)/);
  assert.match(deviceRule, /border-radius:\s*16px/);
  assert.match(globalStyles, /prefers-reduced-motion:\s*reduce/);
});

test("root landing keeps doubled horizontal page spacing", () => {
  const navRule = extractCssRule(".sketchLandingNav");
  const heroRule = extractCssRule(".sketchLandingHero");
  const proofRule = extractCssRule(".sketchLandingProof");

  assert.match(navRule, /padding:\s*20px clamp\(40px,\s*10vw,\s*144px\)/);
  assert.match(heroRule, /padding:\s*clamp\(76px,\s*11vw,\s*128px\) clamp\(40px,\s*10vw,\s*144px\) 96px/);
  assert.match(proofRule, /margin:\s*0 clamp\(40px,\s*10vw,\s*144px\)/);
  assert.match(
    globalStyles,
    /\.sketchLandingSection,\s*\.sketchLandingSafety,\s*\.sketchLandingFinal\s*{[\s\S]*padding:\s*96px clamp\(40px,\s*10vw,\s*144px\)/,
  );
  assert.match(globalStyles, /@media \(max-width:\s*780px\)[\s\S]*padding:\s*16px 40px/);
  assert.match(globalStyles, /@media \(max-width:\s*780px\)[\s\S]*padding:\s*68px 40px 72px/);
  assert.match(globalStyles, /@media \(max-width:\s*780px\)[\s\S]*margin-inline:\s*40px/);
  assert.match(globalStyles, /@media \(max-width:\s*780px\)[\s\S]*padding:\s*72px 40px/);
});

test("root landing follows the DESIGN.md two-family typography policy", () => {
  const landingPageRule = extractCssRule(".sketchLandingPage");
  const headingRule = extractCssRule(
    ".sketchLandingHero h1,\n.sketchLandingSection h2,\n.sketchLandingSafety h2,\n.sketchLandingFinal h2",
  );
  const codeRule = extractCssRule(".sketchLandingCode pre");

  assert.match(designGuide, /fontFamily:\s*"'Pretendard', 'Noto Sans KR', 'Inter', 'Geist', sans-serif"/);
  assert.match(designGuide, /fontFamily:\s*"'Inter', 'Geist', sans-serif"/);
  assert.match(designGuide, /maximum two font families/i);
  assert.match(designGuide, /Avoid decorative brand fonts/i);
  assert.doesNotMatch(designGuide, /JetBrains Mono|Fira Code|Space Grotesk/);
  assert.match(landingPageRule, /--sketch-landing-sans:\s*"Pretendard", "Noto Sans KR", Inter, Geist, sans-serif/);
  assert.match(landingPageRule, /--sketch-landing-technical:\s*Inter, Geist, sans-serif/);
  assert.match(landingPageRule, /font-family:\s*var\(--sketch-landing-sans\)/);
  assert.match(headingRule, /font-family:\s*var\(--sketch-landing-sans\)/);
  assert.match(codeRule, /font-family:\s*var\(--sketch-landing-technical\)/);
  assert.doesNotMatch(landingPageRule, /Spoqa Han Sans Neo|Space Grotesk|JetBrains Mono|한림명조|에스코어|Binggrae|롯데리아|평창/);
});

test("root landing applies the DESIGN.md line-breaking principles", () => {
  const readableTextRule = extractCssRule(
    ".sketchLandingHeroText,\n.sketchLandingSectionHeader p:not(.sketchLandingBadge),\n.sketchLandingSafety p,\n.sketchLandingFinal p:not(.sketchLandingBadge),\n.sketchLandingFlowCard p,\n.sketchLandingPathCard p,\n.sketchLandingPhone p,\n.sketchLandingSafetyPanel p",
  );
  const compactLabelRule = extractCssRule(
    ".sketchLandingPrimaryButton,\n.sketchLandingSecondaryButton,\n.sketchLandingNavLinks a,\n.sketchLandingNavLogin,\n.sketchLandingProof span,\n.sketchLandingNode",
  );
  const codeRule = extractCssRule(".sketchLandingCode pre");

  assert.match(designGuide, /### 줄바꿈 원칙/);
  assert.match(designGuide, /word-break:\s*keep-all/);
  assert.match(readableTextRule, /word-break:\s*keep-all/);
  assert.match(readableTextRule, /overflow-wrap:\s*break-word/);
  assert.match(compactLabelRule, /word-break:\s*keep-all/);
  assert.match(compactLabelRule, /text-align:\s*center/);
  assert.doesNotMatch(readableTextRule, /word-break:\s*break-all/);
  assert.doesNotMatch(compactLabelRule, /word-break:\s*break-all/);
  assert.match(codeRule, /overflow-x:\s*auto/);
  assert.match(codeRule, /word-break:\s*normal/);
  assert.match(codeRule, /overflow-wrap:\s*normal/);
});

function readLocalFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function extractCssRule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalStyles.match(new RegExp(`${escapedSelector}\\s*{[^}]*}`, "s"));
  assert.ok(match, `Expected ${selector} rule to exist`);
  return match[0];
}
