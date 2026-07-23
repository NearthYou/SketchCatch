import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("Repository 분석 화면은 보드 생성 확정 전까지 Project를 저장하지 않는다", () => {
  const source = readFileSync(join(currentDir, "repository-start-client.tsx"), "utf8");

  const initialLoadBody = source.slice(
    source.indexOf("useEffect(() => {"),
    source.indexOf("useEffect(() => {", source.indexOf("useEffect(() => {") + 1)
  );
  const saveBoardBody = source.slice(
    source.indexOf("async function saveRepositoryBoard"),
    source.indexOf("async function retryRepositoryAnalysisRecord")
  );

  assert.match(source, /const showUrlAnalysis = Boolean\(!activeRepository \|\| publicAnalysis\)/);
  assert.doesNotMatch(initialLoadBody, /setErrorMessage/);
  assert.match(saveBoardBody, /await createProject\(\{ name: effectiveProjectName \}\)/);
  assert.match(saveBoardBody, /await deleteProject\(createdProject\.id\)/);
});
