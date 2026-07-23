import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(join(currentDir, "repository-start.module.css"), "utf8");
const component = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

test("additional repository questions use a readable text hierarchy", () => {
  assert.match(styles, /\.publicAnalysisResult > \.publicQuestionSummary\s*\{[^}]*gap:\s*12px/s);
  assert.match(styles, /\.publicBackAction\s*\{[^}]*width:\s*40px[^}]*height:\s*40px/s);
  assert.match(component, /<ArrowLeft aria-hidden="true" size=\{18\} \/>/);
  assert.match(styles, /\.questionList\s*\{[^}]*gap:\s*20px/s);
  assert.doesNotMatch(styles, /\.questionField(?:\s+legend)?::before/);
  assert.match(
    styles,
    /\.questionSectionHeader strong\s*\{[^}]*font-size:\s*calc\(18px \+ var\(--presentation-font-size-increase\)\)/s
  );
  assert.match(
    styles,
    /\.questionField legend\s*\{[^}]*font-size:\s*calc\(16px \+ var\(--presentation-font-size-increase\)\)[^}]*line-height:\s*1\.5/s
  );
  assert.match(
    styles,
    /\.questionChoice\s*\{[^}]*font-size:\s*calc\(15px \+ var\(--presentation-font-size-increase\)\)/s
  );
  assert.match(
    styles,
    /\.questionChoice > span\s*\{[^}]*font-size:\s*inherit[^}]*text-transform:\s*none/s
  );
  assert.match(
    styles,
    /\.questionList input\s*\{[^}]*font-size:\s*calc\(15px \+ var\(--presentation-font-size-increase\)\)/s
  );
});

test("board creation action has balanced desktop emphasis and mobile width", () => {
  assert.match(component, /className=\{`\$\{styles\.publicAnalysisResult\} \$\{styles\.publicQuestionStage\}`\}/);
  assert.match(styles, /\.publicQuestionStage\s*\{[^}]*border-top:\s*0[^}]*padding-top:\s*0/s);
  assert.match(
    component,
    /<div className=\{styles\.publicBoardActionArea\}>[\s\S]*className=\{styles\.publicBoardAction\}[\s\S]*<\/div>/
  );
  assert.match(
    styles,
    /\.publicAnalysisResult > \.publicBoardActionArea\s*\{[^}]*border-top:\s*1px solid var\(--color-hairline\)[^}]*padding-top:\s*20px/s
  );
  assert.match(
    styles,
    /\.publicBoardAction\s*\{[^}]*width:\s*min\(100%, 220px\)[^}]*min-height:\s*48px/s
  );
  assert.match(
    styles,
    /\.publicBoardAction\s*\{[^}]*padding:\s*0 18px[^}]*font-size:\s*calc\(14px \+ var\(--presentation-font-size-increase\)\)/s
  );
  assert.match(component, /LoaderCircle className=\{styles\.spin\} size=\{17\}/);
  assert.match(component, /<Search size=\{17\} \/>/);
  assert.match(
    styles,
    /@media \(max-width: 640px\)[\s\S]*\.publicBoardAction,[\s\S]*\{\s*width:\s*100%;\s*\}/
  );
});
