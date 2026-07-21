# Module Catalog 단순 모듈 우선 정렬 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 리소스가 적은 Module을 많이 포함한 Module Catalog 섹션을 먼저 표시한다.

**Architecture:** `module-catalog-view.ts`에서 섹션을 만든 직후 각 섹션의 Module Resource 수를 계산해 순서를 비교한다. Resource 수는 기존 `countModuleResources()`를 재사용해 presentation Area를 제외한다. 카드 내부의 Module 정렬과 화면 컴포넌트는 변경하지 않는다.

**Tech Stack:** TypeScript, React, Node.js built-in test runner, pnpm.

## Global Constraints

- `SIMPLE_MODULE_RESOURCE_LIMIT`은 3으로 고정한다.
- 현재 lens와 검색 결과로 남은 Module만 점수 계산에 사용한다.
- 동점은 label, key 순으로 결정해 입력 순서와 무관하게 한다.
- Module의 실제 Resource·관계·Terraform 생성은 변경하지 않는다.

---

### Task 1: 섹션 단순성 정렬 계약과 구현

**Files:**
- Modify: `apps/web/features/resource-settings/module-catalog-view.ts`
- Test: `apps/web/features/resource-settings/module-catalog-view.test.ts`

**Interfaces:**
- Consumes: `countModuleResources(moduleDefinition): number`
- Produces: `createModuleCatalogGroups(input): readonly ModuleCatalogGroup[]`의 단순성 우선 섹션 순서

- [ ] **Step 1: Write the failing test**

```ts
test("단순 Module이 많은 Catalog 섹션을 복잡한 섹션보다 먼저 표시한다", () => {
  const groups = createModuleCatalogGroups({ modules: curatedModules, view: "functional" });
  assert.ok(groups.findIndex(({ label }) => label === "보안") < groups.findIndex(({ label }) => label === "네트워크"));
  assert.ok(groups.findIndex(({ label }) => label === "컴퓨트") < groups.findIndex(({ label }) => label === "데이터베이스"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/module-catalog-view.test.ts`

Expected: the alphabetical group order leaves `네트워크` before `보안`.

- [ ] **Step 3: Write minimal implementation**

```ts
const SIMPLE_MODULE_RESOURCE_LIMIT = 3;

function compareGroups(left: ModuleCatalogGroup, right: ModuleCatalogGroup): number {
  const leftScore = createGroupSimplicityScore(left);
  const rightScore = createGroupSimplicityScore(right);
  return (
    rightScore.simpleModuleCount - leftScore.simpleModuleCount ||
    leftScore.averageResourceCount - rightScore.averageResourceCount ||
    leftScore.maximumResourceCount - rightScore.maximumResourceCount ||
    compareCatalogText(left.label, right.label) ||
    compareCatalogText(left.key, right.key)
  );
}
```

`createGroupSimplicityScore()`는 `group.modules`의 `countModuleResources()` 결과로 simple count, average, maximum을 반환한다.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/module-catalog-view.test.ts`

Expected: all tests pass, including reversed input and search/lens behavior.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/resource-settings/module-catalog-view.ts apps/web/features/resource-settings/module-catalog-view.test.ts
git commit -m "Feat: Module Catalog 단순 모듈 우선 정렬"
```

### Task 2: 회귀 검증

**Files:**
- Verify: `apps/web/features/resource-settings/module-catalog-view.test.ts`
- Verify: `apps/web/features/resource-settings/module-catalog.test.ts`

**Interfaces:**
- Consumes: Task 1의 `createModuleCatalogGroups()` 정렬 계약
- Produces: 검색·lens·카드 선택 동작이 유지된다는 검증 결과

- [ ] **Step 1: Run focused Catalog tests**

Run: `pnpm --filter @sketchcatch/web exec tsx --test features/resource-settings/module-catalog-view.test.ts features/resource-settings/module-catalog.test.ts`

Expected: all tests pass.

- [ ] **Step 2: Run repository checks**

Run: `pnpm --filter @sketchcatch/web typecheck`

Expected: TypeScript errors are absent in the Web package.

- [ ] **Step 3: Check staged scope and whitespace**

Run: `git diff --check`

Expected: no output.

