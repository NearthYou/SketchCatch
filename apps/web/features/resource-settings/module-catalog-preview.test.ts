import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { curatedModules } from "./module-catalog";
import { createModuleCatalogPreview } from "./module-catalog-preview";

const moduleCatalogPanelSource = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");

test("Module 미리보기는 실제 Board fragment에서 리소스·관계·Provider·입출력·버전을 만든다", () => {
  const moduleDefinition = curatedModules.find(({ id }) => id === "static-web-delivery");
  assert.ok(moduleDefinition);

  const preview = createModuleCatalogPreview(moduleDefinition);
  const resourceNodes = moduleDefinition.nodes.filter(({ kind }) => kind === "resource");

  assert.deepEqual(
    preview.resources.map(({ label, type }) => ({ label, type })),
    resourceNodes.map((node) => ({
      label: node.label,
      type: node.parameters?.resourceType ?? node.type
    }))
  );
  assert.deepEqual(preview.providers, ["AWS"]);
  assert.deepEqual(
    preview.inputs,
    moduleDefinition.variables.map(({ name, type }) => ({ name, type }))
  );
  assert.deepEqual(preview.outputs, []);
  assert.equal(preview.version, moduleDefinition.version);

  assert.ok(preview.relationships.length > 0);
  assert.ok(
    preview.relationships.every(({ sourceLabel, targetLabel }) => sourceLabel.length > 0 && targetLabel.length > 0)
  );
  assert.equal(preview.thumbnail.nodes.length, resourceNodes.length);
  assert.ok(
    preview.thumbnail.edges.every(
      ({ sourceNodeId, targetNodeId }) =>
        preview.thumbnail.nodes.some(({ id }) => id === sourceNodeId) &&
        preview.thumbnail.nodes.some(({ id }) => id === targetNodeId)
    )
  );
});

test("Module 카드는 Board에 추가하기 전에 구성 정보를 펼쳐서 보여준다", () => {
  assert.match(moduleCatalogPanelSource, /createModuleCatalogPreview\(moduleDefinition\)/);
  assert.match(moduleCatalogPanelSource, /<details/);
  assert.match(moduleCatalogPanelSource, /모듈 구성 미리보기/);
  assert.match(moduleCatalogPanelSource, /포함 Resource/);
  assert.match(moduleCatalogPanelSource, /주요 관계/);
  assert.match(moduleCatalogPanelSource, /Provider/);
  assert.match(moduleCatalogPanelSource, /입력값/);
  assert.match(moduleCatalogPanelSource, /출력값/);
  assert.match(moduleCatalogPanelSource, /버전/);
  assert.match(moduleCatalogPanelSource, /보드에 추가/);
});

test("리소스가 없는 미래 Module도 빈 썸네일과 관계 목록으로 안전하게 표시한다", () => {
  const moduleDefinition = curatedModules.find(({ id }) => id === "static-web-delivery");
  assert.ok(moduleDefinition);

  const preview = createModuleCatalogPreview({
    ...moduleDefinition,
    edges: [],
    nodes: moduleDefinition.nodes.filter(({ kind }) => kind === "design")
  });

  assert.deepEqual(preview.resources, []);
  assert.deepEqual(preview.relationships, []);
  assert.deepEqual(preview.thumbnail, { nodes: [], edges: [] });
});
