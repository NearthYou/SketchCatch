import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  createDecorativeOrbitComposition,
  getDecorativeOrbitResourcePool,
  getOptionResourceCategories
} from "./option-resource-presentation";
import type { SelectedAssistantOption } from "./selected-option-model";

const PUBLIC_DIRECTORY = join(process.cwd(), "public");

function selection(
  label: string,
  order = 1,
  questionMessageId = `question-${order}`
): SelectedAssistantOption {
  return {
    id: `selection-${order}`,
    label,
    order,
    questionMessageId,
    selectedAt: `2026-07-17T01:0${order}:00.000Z`
  };
}

function changedSlotCount(
  left: ReturnType<typeof createDecorativeOrbitComposition>,
  right: ReturnType<typeof createDecorativeOrbitComposition>
): number {
  return left.glyphs.filter((glyph, index) => glyph.resourceId !== right.glyphs[index]?.resourceId)
    .length;
}

test("Orbit 후보와 초기 10개 구성은 catalog의 실제 AWS Resource icon만 사용한다", () => {
  const pool = getDecorativeOrbitResourcePool();
  const initial = createDecorativeOrbitComposition([]);

  assert.ok(pool.length >= 40);
  assert.equal(initial.glyphs.length, 10);
  assert.equal(initial.responseGlyphIndex, null);

  for (const resource of [...pool, ...initial.glyphs]) {
    assert.ok(resource.resourceId.startsWith("aws-"));
    assert.ok(resource.iconUrl.startsWith("/Resource-Icons_07312025/"));
    assert.equal(resource.iconUrl.includes("Architecture-Service-Icons"), false);
    assert.equal(existsSync(join(PUBLIC_DIRECTORY, resource.iconUrl)), true, resource.iconUrl);
  }
});

test("같은 누적 선택은 hydration이나 rerender와 무관하게 같은 구성을 만든다", () => {
  const selections = [selection("서버리스와 관리 최소화"), selection("관계형 DB", 2)];

  assert.deepEqual(
    createDecorativeOrbitComposition(selections),
    createDecorativeOrbitComposition(selections)
  );
});

test("명확한 option hint는 category를 찾고 선택마다 기존 구성의 2~4개만 바꾼다", () => {
  assert.deepEqual(getOptionResourceCategories("컨테이너와 메시지 처리"), [
    "container",
    "messaging"
  ]);

  const initial = createDecorativeOrbitComposition([]);
  const afterContainer = createDecorativeOrbitComposition([selection("컨테이너로 운영")]);
  const afterDatabase = createDecorativeOrbitComposition([
    selection("컨테이너로 운영"),
    selection("관계형 DB와 Aurora", 2)
  ]);

  assert.ok(changedSlotCount(initial, afterContainer) >= 2);
  assert.ok(changedSlotCount(initial, afterContainer) <= 4);
  assert.ok(changedSlotCount(afterContainer, afterDatabase) >= 2);
  assert.ok(changedSlotCount(afterContainer, afterDatabase) <= 4);
  assert.ok(afterContainer.glyphs.some(({ resourceId }) => resourceId.startsWith("aws-ecs-")));
  assert.ok(afterDatabase.glyphs.some(({ resourceId }) => resourceId.startsWith("aws-rds-")));
  assert.ok(afterContainer.responseGlyphIndex !== null);
  assert.ok((afterContainer.responseGlyphIndex ?? -1) < 7);
});

test("알 수 없는 option도 누적 label hash로 안정적인 fallback 교체를 만든다", () => {
  const initial = createDecorativeOrbitComposition([]);
  const unknown = [selection("푸른 고래 방식")];
  const first = createDecorativeOrbitComposition(unknown);
  const second = createDecorativeOrbitComposition(unknown);
  const other = createDecorativeOrbitComposition([selection("붉은 여우 방식")]);

  assert.deepEqual(first, second);
  assert.ok(changedSlotCount(initial, first) >= 2);
  assert.notDeepEqual(
    first.glyphs.map(({ resourceId }) => resourceId),
    other.glyphs.map(({ resourceId }) => resourceId)
  );
});

test("연속 option 각각은 이전 장면에서 실제 icon slot 2~4개만 교체한다", () => {
  const labels = [
    "첫 번째 알 수 없는 방식",
    "서버리스와 관리 최소화",
    "관계형 데이터베이스",
    "컨테이너 메시지 처리",
    "마지막 알 수 없는 방식"
  ];
  let selections: SelectedAssistantOption[] = [];
  let previous = createDecorativeOrbitComposition(selections);

  labels.forEach((label, index) => {
    selections = [...selections, selection(label, index + 1)];
    const next = createDecorativeOrbitComposition(selections);
    const changed = changedSlotCount(previous, next);

    assert.ok(changed >= 2, `${label}: ${changed}`);
    assert.ok(changed <= 4, `${label}: ${changed}`);
    previous = next;
  });
});
