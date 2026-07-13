import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Pipeline Run page query keeps project-scoped keyset, descending order, bounded rows, and page stages", () => {
  const source = readFileSync(
    new URL("./git-cicd-pipeline-run-service.ts", import.meta.url),
    "utf8"
  );
  const pageQuery = source.slice(
    source.indexOf("async function listRunPage"),
    source.indexOf("return {", source.indexOf("async function listRunPage"))
  );

  assert.match(pageQuery, /eq\(gitCicdPipelineRuns\.projectId, input\.projectId\)/);
  assert.match(pageQuery, /lt\(gitCicdPipelineRuns\.createdAt, cursor\.createdAt\)/);
  assert.match(pageQuery, /lt\(gitCicdPipelineRuns\.id, cursor\.id\)/);
  assert.match(
    pageQuery,
    /orderBy\(desc\(gitCicdPipelineRuns\.createdAt\), desc\(gitCicdPipelineRuns\.id\)\)/
  );
  assert.match(pageQuery, /\.limit\(input\.limit\)/);
  assert.match(
    pageQuery,
    /inArray\(gitCicdPipelineStages\.pipelineRunId, runs\.map\(\(run\) => run\.id\)\)/
  );
});

test("Pipeline Run snapshot upsert conditionally rejects stale upstream revisions before stages and logs", () => {
  const source = readFileSync(
    new URL("./git-cicd-pipeline-run-service.ts", import.meta.url),
    "utf8"
  );
  const persistSnapshot = source.slice(
    source.indexOf("persistSnapshot(input)"),
    source.indexOf("function buildStages")
  );

  assert.match(persistSnapshot, /upstreamOrderingToken/);
  assert.match(persistSnapshot, /logRevision/);
  assert.match(persistSnapshot, /setWhere:\s*or\(/);
  assert.match(persistSnapshot, /gitCicdPipelineRuns\.upstreamOrderingToken/);
  assert.match(persistSnapshot, /terminalPipelineRunStatuses/);
  assert.match(persistSnapshot, /if \(!run\)[\s\S]*const \[persistedRun\]/);
  assert.match(persistSnapshot, /if \(!run\)[\s\S]*persistedStages[\s\S]*return/);
});
