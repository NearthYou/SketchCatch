import { test } from "node:test";
import assert from "node:assert/strict";
import { PROJECT_DRAFT_CONFLICT_COPY } from "./project-draft-conflict";

test("project draft conflict explains the stale tab and offers reload or local editing", () => {
  assert.equal(PROJECT_DRAFT_CONFLICT_COPY.title, "다른 탭에서 이 프로젝트가 변경되었습니다");
  assert.match(PROJECT_DRAFT_CONFLICT_COPY.description, /아직 서버에 저장되지 않았습니다/);
  assert.equal(PROJECT_DRAFT_CONFLICT_COPY.keepEditingAction, "현재 편집 유지");
  assert.equal(PROJECT_DRAFT_CONFLICT_COPY.reloadAction, "최신 상태 불러오기");
});
