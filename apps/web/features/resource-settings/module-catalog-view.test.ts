import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { DiagramJson } from "../../../../packages/types/src";
import { curatedModules, expandCuratedModuleIntoDiagram } from "./module-catalog";
import {
  countModuleResources,
  createModuleCatalogGroups,
  moduleCatalogViews
} from "./module-catalog-view";

const catalogViewSource = readFileSync(new URL("./module-catalog-view.ts", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
const modulePanelSource = panelSource.slice(
  panelSource.indexOf("function ModuleCatalogPanel"),
  panelSource.indexOf("function ModuleCatalogCard")
);

test("catalog view는 기능별·용도별 사용자 언어로 모든 Module을 노출한다", () => {
  assert.deepEqual(moduleCatalogViews, [
    { id: "functional", label: "기능별" },
    { id: "purpose", label: "용도별" }
  ]);

  for (const view of moduleCatalogViews) {
    const groups = createModuleCatalogGroups({
      modules: curatedModules,
      view: view.id
    });
    assert.ok(groups.length > 0);
    assert.deepEqual(
      new Set(groups.flatMap(({ modules }) => modules.map(({ id }) => id))),
      new Set(curatedModules.map(({ id }) => id))
    );
  }
});

test("Module은 실제 lens마다 중복 분류되고 어느 view에서도 같은 정의를 선택한다", () => {
  const functionalGroups = createModuleCatalogGroups({
    modules: curatedModules,
    view: "functional"
  });
  const purposeGroups = createModuleCatalogGroups({
    modules: curatedModules,
    view: "purpose"
  });
  const moduleId = "static-web-delivery";
  const functionalMatches = functionalGroups.flatMap(({ modules }) =>
    modules.filter(({ id }) => id === moduleId)
  );
  const purposeMatch = purposeGroups
    .flatMap(({ modules }) => modules)
    .find(({ id }) => id === moduleId);

  assert.equal(functionalMatches.length, 2);
  assert.ok(purposeMatch);
  assert.ok(functionalMatches.every((moduleDefinition) => moduleDefinition === purposeMatch));

  const emptyDiagram: DiagramJson = {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    variables: []
  };
  const fromFunctionalView = expandCuratedModuleIntoDiagram({
    diagram: emptyDiagram,
    moduleId: functionalMatches[0]!.id
  });
  const fromPurposeView = expandCuratedModuleIntoDiagram({
    diagram: emptyDiagram,
    moduleId: purposeMatch.id
  });
  assert.deepEqual(normalizeExpandedAt(fromFunctionalView), normalizeExpandedAt(fromPurposeView));
});

test("Module 카드의 리소스 수는 presentation Area를 제외한다", () => {
  for (const moduleDefinition of curatedModules) {
    assert.equal(
      countModuleResources(moduleDefinition),
      moduleDefinition.nodes.filter(({ kind }) => kind === "resource").length
    );
  }
  assert.match(panelSource, /countModuleResources\(moduleDefinition\)/);
});

test("artifact 입력 순서가 달라도 group과 Module 정렬은 결정적이다", () => {
  for (const view of moduleCatalogViews) {
    const forward = createModuleCatalogGroups({ modules: curatedModules, view: view.id });
    const reversed = createModuleCatalogGroups({
      modules: [...curatedModules].reverse(),
      view: view.id
    });

    assert.deepEqual(
      forward.map(({ key, modules }) => ({ key, moduleIds: modules.map(({ id }) => id) })),
      reversed.map(({ key, modules }) => ({ key, moduleIds: modules.map(({ id }) => id) }))
    );
  }
});

test("검색은 Module 제목·설명·lens label을 대상으로 같은 그룹 구조를 유지한다", () => {
  const byTitle = createModuleCatalogGroups({
    modules: curatedModules,
    query: "Static Web",
    view: "functional"
  });
  assert.deepEqual(
    byTitle.flatMap(({ modules }) => modules.map(({ id }) => id)),
    ["static-web-delivery", "static-web-delivery"]
  );

  const byDescription = createModuleCatalogGroups({
    modules: curatedModules,
    query: "SCALING SIGNAL",
    view: "purpose"
  });
  assert.deepEqual(
    byDescription.flatMap(({ modules }) => modules.map(({ id }) => id)),
    ["operations-monitoring"]
  );

  const byLens = createModuleCatalogGroups({
    modules: curatedModules,
    query: "접근 권한 관리",
    view: "functional"
  });
  assert.deepEqual(
    byLens.flatMap(({ modules }) => modules.map(({ id }) => id)),
    ["identity-access-boundary"]
  );
});

test("검색과 view 전환은 locale 독립적이며 단순 pressed-button 접근성 계약을 사용한다", () => {
  assert.doesNotMatch(catalogViewSource, /toLocaleLowerCase/);
  assert.match(modulePanelSource, /aria-label="모듈 분류"[^>]*role="group"/);
  assert.match(modulePanelSource, /aria-pressed=\{activeView === view\.id\}/);
  assert.doesNotMatch(modulePanelSource, /role="tab(?:list)?"/);
});

function normalizeExpandedAt(diagram: DiagramJson): DiagramJson {
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => ({
      ...node,
      ...(node.metadata?.moduleSource
        ? {
            metadata: {
              ...node.metadata,
              moduleSource: {
                ...node.metadata.moduleSource,
                expandedAt: "<normalized>"
              }
            }
          }
        : {})
    }))
  };
}
