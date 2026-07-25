import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
const modalStyles = readFileSync(
  new URL("./template-library-modal.module.css", import.meta.url),
  "utf8"
);

test("템플릿 목록 선택은 보드에 즉시 적용하지 않고 상세 미리보기를 연다", () => {
  const panelSource = getSourceBlock(source, "function TemplatesPanel(", "function TemplateLibraryModal(");

  assert.match(panelSource, /const \[selectedTemplate, setSelectedTemplate\] = useState<AvailableBoardTemplate \| null>\(null\)/);
  assert.match(panelSource, /aria-label=`?\{?`?\$\{template\.title\} 상세 미리보기/);
  assert.match(panelSource, /onClick=\{\(\) => \{\s*if \(isBoardTemplateAvailable\(template\)\) setSelectedTemplate\(template\);/);
  assert.doesNotMatch(panelSource, /onClick=\{\(\) => \{[\s\S]*?onTemplateApply\?\.\(template\);/);
});

test("전체보기에서 선택해도 개별 상세 미리보기로 전환한다", () => {
  const librarySource = getSourceBlock(
    source,
    "function TemplateLibraryModal(",
    "function TemplateDetailPreviewModal("
  );

  assert.match(librarySource, /readonly onTemplateSelect: \(template: AvailableBoardTemplate\) => void;/);
  assert.match(librarySource, /actionLabel="상세 미리보기"/);
  assert.match(librarySource, /onTemplateSelect\(template\)/);
  assert.doesNotMatch(librarySource, /onTemplateApply\(template\)/);
});

test("template library header stays separate from the scrollable gallery", () => {
  const librarySource = getSourceBlock(
    source,
    "function TemplateLibraryModal(",
    "function TemplateDetailPreviewModal("
  );

  assert.match(librarySource, /className=\{[^}]*modalStyles\.libraryDialog/);
  assert.match(librarySource, /<div className=\{modalStyles\.libraryContent\}>\s*<TemplateGallery/s);
  assert.match(modalStyles, /\.libraryDialog\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(modalStyles, /\.libraryContent\s*\{[^}]*overflow-y:\s*auto;/s);
});

test("개별 상세 창에서만 선택한 템플릿을 보드에 적용한다", () => {
  const detailSource = getSourceBlock(
    source,
    "function TemplateDetailPreviewModal(",
    "function ModuleCatalogPanel("
  );

  assert.match(detailSource, /<BoardThumbnailImage/);
  assert.match(detailSource, /\{template\.description\}/);
  assert.match(detailSource, /getBoardTemplateResourceCount\(template\)/);
  assert.match(detailSource, /getBoardTemplateRelationshipCount\(template\)/);
  assert.match(detailSource, /template\.tags\?\.map\(\(tag\) =>/);
  assert.match(detailSource, />\s*보드에 적용\s*<\/button>/);
  assert.match(detailSource, /onClick=\{onApply\}/);
});

function getSourceBlock(value: string, start: string, end: string): string {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);

  assert.notEqual(startIndex, -1, `시작 지점을 찾지 못했습니다: ${start}`);
  assert.notEqual(endIndex, -1, `종료 지점을 찾지 못했습니다: ${end}`);

  return value.slice(startIndex, endIndex);
}
