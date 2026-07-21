import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { DiagramJson, DiagramNode } from "../../../../packages/types/src";
import {
  curatedModules,
  expandCuratedModuleIntoDiagram,
  type CuratedModuleDefinition
} from "./module-catalog";
import { createModuleCatalogPreview } from "./module-catalog-preview";
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

test("resource panel keeps its icon-only Resources and Modules view switch", () => {
  assert.match(panelSource, /useState<"resources" \| "modules">\("resources"\)/);
  assert.match(panelSource, /aria-label="리소스 보기 방식"/);
  assert.match(
    panelSource,
    /aria-label="리소스 목록 보기"[\s\S]*?onClick=\{\(\) => setActiveResourceView\("resources"\)\}/
  );
  assert.match(
    panelSource,
    /aria-label="모듈 목록 보기"[\s\S]*?onClick=\{\(\) => setActiveResourceView\("modules"\)\}/
  );
  assert.match(
    panelSource,
    /activeResourceView === "modules" \? \([\s\S]*?<ModuleCatalogPanel onModuleAdd=\{onModuleAdd\} \/>[\s\S]*?\) : \(/
  );
});

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

test("Module 카드의 Resource 수는 presentation Area를 제외한 preview를 사용한다", () => {
  for (const moduleDefinition of curatedModules) {
    assert.equal(
      createModuleCatalogPreview(moduleDefinition).resourceCount,
      moduleDefinition.nodes.filter(({ kind }) => kind === "resource").length
    );
  }
  assert.match(panelSource, /preview\.resourceCount/);
  assert.doesNotMatch(panelSource, /countModuleResources\(moduleDefinition\)/);
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

test("resource node가 정확히 3개인 Module은 simple이고 design Area는 수에 포함하지 않는다", () => {
  const threeResourcesWithAreas = createCatalogModule({
    id: "three-resources",
    resourceCount: 3,
    areaCount: 6,
    functionalGroup: { key: "simple", label: "Simple" }
  });
  const fourResources = createCatalogModule({
    id: "four-resources",
    resourceCount: 4,
    functionalGroup: { key: "complex", label: "Complex" }
  });

  assert.equal(countModuleResources(threeResourcesWithAreas), 3);
  assert.equal(countModuleResources(fourResources), 4);
  assert.deepEqual(
    createModuleCatalogGroups({
      modules: [fourResources, threeResourcesWithAreas],
      view: "functional"
    }).map(({ key }) => key),
    ["simple", "complex"]
  );
});

test("더 많은 simple Module은 낮은 평균 resource 수보다 먼저 정렬된다", () => {
  const groups = createModuleCatalogGroups({
    modules: [
      createCatalogModule({
        id: "simple-one",
        resourceCount: 3,
        functionalGroup: { key: "more-simple", label: "More simple" }
      }),
      createCatalogModule({
        id: "simple-two",
        resourceCount: 3,
        functionalGroup: { key: "more-simple", label: "More simple" }
      }),
      createCatalogModule({
        id: "lower-average-simple",
        resourceCount: 0,
        functionalGroup: { key: "lower-average", label: "Lower average" }
      }),
      createCatalogModule({
        id: "lower-average-complex",
        resourceCount: 4,
        functionalGroup: { key: "lower-average", label: "Lower average" }
      })
    ],
    view: "functional"
  });

  assert.deepEqual(groups.map(({ key }) => key), ["more-simple", "lower-average"]);
});

test("simple Module 수가 같으면 낮은 평균 resource 수가 먼저 정렬된다", () => {
  const groups = createModuleCatalogGroups({
    modules: [
      createCatalogModule({
        id: "low-average-simple",
        resourceCount: 0,
        functionalGroup: { key: "low-average", label: "Low average" }
      }),
      createCatalogModule({
        id: "low-average-complex",
        resourceCount: 4,
        functionalGroup: { key: "low-average", label: "Low average" }
      }),
      createCatalogModule({
        id: "high-average-simple",
        resourceCount: 3,
        functionalGroup: { key: "high-average", label: "High average" }
      }),
      createCatalogModule({
        id: "high-average-complex",
        resourceCount: 5,
        functionalGroup: { key: "high-average", label: "High average" }
      })
    ],
    view: "functional"
  });

  assert.deepEqual(groups.map(({ key }) => key), ["low-average", "high-average"]);
});

test("simple Module 수와 평균이 같으면 낮은 최대 resource 수가 먼저 정렬된다", () => {
  const groups = createModuleCatalogGroups({
    modules: [
      createCatalogModule({
        id: "low-maximum-simple",
        resourceCount: 1,
        functionalGroup: { key: "low-maximum", label: "Low maximum" }
      }),
      createCatalogModule({
        id: "low-maximum-complex",
        resourceCount: 5,
        functionalGroup: { key: "low-maximum", label: "Low maximum" }
      }),
      createCatalogModule({
        id: "high-maximum-simple",
        resourceCount: 0,
        functionalGroup: { key: "high-maximum", label: "High maximum" }
      }),
      createCatalogModule({
        id: "high-maximum-complex",
        resourceCount: 6,
        functionalGroup: { key: "high-maximum", label: "High maximum" }
      })
    ],
    view: "functional"
  });

  assert.deepEqual(groups.map(({ key }) => key), ["low-maximum", "high-maximum"]);
});

test("동점 Catalog 섹션은 label과 key 순으로 결정적으로 정렬된다", () => {
  const groups = createModuleCatalogGroups({
    modules: [
      createCatalogModule({
        id: "alpha-label",
        resourceCount: 2,
        functionalGroup: { key: "z-key", label: "Alpha" }
      }),
      createCatalogModule({
        id: "bravo-a",
        resourceCount: 2,
        functionalGroup: { key: "a-key", label: "Bravo" }
      }),
      createCatalogModule({
        id: "bravo-b",
        resourceCount: 2,
        functionalGroup: { key: "b-key", label: "Bravo" }
      })
    ],
    view: "functional"
  });

  assert.deepEqual(groups.map(({ key }) => key), ["z-key", "a-key", "b-key"]);
});

test("검색된 visible Module만으로 Catalog 섹션 점수를 다시 계산한다", () => {
  const modules = [
    createCatalogModule({
      id: "alpha-visible",
      title: "Visible Alpha",
      resourceCount: 1,
      functionalGroup: { key: "alpha", label: "Alpha" }
    }),
    createCatalogModule({
      id: "alpha-hidden",
      title: "Hidden Alpha",
      resourceCount: 10,
      functionalGroup: { key: "alpha", label: "Alpha" }
    }),
    createCatalogModule({
      id: "beta-visible",
      title: "Visible Beta",
      resourceCount: 3,
      functionalGroup: { key: "beta", label: "Beta" }
    })
  ];

  assert.deepEqual(
    createModuleCatalogGroups({ modules, view: "functional" }).map(({ key }) => key),
    ["beta", "alpha"]
  );
  assert.deepEqual(
    createModuleCatalogGroups({ modules, query: "visible", view: "functional" }).map(({ key }) => key),
    ["alpha", "beta"]
  );
});

test("같은 Catalog 섹션의 Module 카드는 title과 id 순서를 유지한다", () => {
  const groups = createModuleCatalogGroups({
    modules: [
      createCatalogModule({ id: "b", title: "Beta", functionalGroup: sameFunctionalGroup }),
      createCatalogModule({ id: "a-2", title: "Alpha", functionalGroup: sameFunctionalGroup }),
      createCatalogModule({ id: "a-1", title: "Alpha", functionalGroup: sameFunctionalGroup })
    ],
    view: "functional"
  });

  assert.deepEqual(groups, [
    {
      key: "same-group",
      label: "Same group",
      modules: [
        createCatalogModule({ id: "a-1", title: "Alpha", functionalGroup: sameFunctionalGroup }),
        createCatalogModule({ id: "a-2", title: "Alpha", functionalGroup: sameFunctionalGroup }),
        createCatalogModule({ id: "b", title: "Beta", functionalGroup: sameFunctionalGroup })
      ]
    }
  ]);
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

const sameFunctionalGroup = { key: "same-group", label: "Same group" };

function createCatalogModule(input: {
  readonly id: string;
  readonly title?: string | undefined;
  readonly resourceCount?: number | undefined;
  readonly areaCount?: number | undefined;
  readonly functionalGroup?: { readonly key: string; readonly label: string } | undefined;
}): CuratedModuleDefinition {
  const resourceCount = input.resourceCount ?? 0;
  const areaCount = input.areaCount ?? 0;
  const functionalGroup = input.functionalGroup ?? sameFunctionalGroup;

  return {
    id: input.id,
    title: input.title ?? input.id,
    description: `${input.id} description`,
    lenses: [{ kind: "functional", ...functionalGroup }],
    structuralFingerprint: `${input.id}-fingerprint`,
    nodes: [
      ...Array.from({ length: resourceCount }, (_, index) =>
        createCatalogResourceNode(input.id, index)
      ),
      ...Array.from({ length: areaCount }, (_, index) => createCatalogAreaNode(input.id, index))
    ],
    edges: [],
    variables: [],
    provenance: {
      extractorVersion: "architecture-board-module-pattern-extractor/v2",
      representativeTemplateId: `${input.id}-template`,
      sourceTemplateIds: [`${input.id}-template`]
    },
    version: "architecture-board-knowledge/v1"
  };
}

function createCatalogResourceNode(moduleId: string, index: number): DiagramNode {
  return {
    id: `${moduleId}-resource-${index}`,
    type: "aws_s3_bucket",
    kind: "resource",
    position: { x: index * 100, y: 0 },
    size: { width: 100, height: 60 },
    label: `Resource ${index}`,
    locked: false,
    zIndex: 0,
    parameters: {
      resourceType: "aws_s3_bucket",
      resourceName: `${moduleId}_resource_${index}`,
      fileName: "main.tf",
      values: {}
    }
  };
}

function createCatalogAreaNode(moduleId: string, index: number): DiagramNode {
  return {
    id: `${moduleId}-area-${index}`,
    type: "area",
    kind: "design",
    position: { x: index * 100, y: 100 },
    size: { width: 300, height: 200 },
    label: `Area ${index}`,
    locked: false,
    zIndex: 0
  };
}
