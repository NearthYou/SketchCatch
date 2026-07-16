import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createArchitectureBoardKnowledgeArtifactFromSource,
  renderArchitectureBoardKnowledgeArtifact
} from "./architecture-board-knowledge-source-generator";
import { generatedArchitectureBoardKnowledgeArtifact } from "./architecture-board-knowledge.generated";
import {
  architectureBoardKnowledge,
  createArchitectureBoardKnowledgeArtifact
} from "./architecture-board-knowledge";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const generatedArtifactPath = path.join(
  repoRoot,
  "apps/web/features/architecture-board-compiler/architecture-board-knowledge.generated.ts"
);
const runtimeKnowledgePath = path.join(
  repoRoot,
  "apps/web/features/architecture-board-compiler/architecture-board-knowledge.ts"
);

test("generator는 실제 6개 authored와 23개 usable Brainboard 사례를 정적 artifact로 고정한다", () => {
  const sourceArtifact = createArchitectureBoardKnowledgeArtifactFromSource();
  const repositoryCases = sourceArtifact.cases.filter(({ id }) => id.startsWith("repository:"));
  const brainboardCases = sourceArtifact.cases.filter(({ id }) => id.startsWith("brainboard:"));

  assert.equal(repositoryCases.length, 6);
  assert.equal(brainboardCases.length, 23);
  assert.equal(sourceArtifact.unavailableTemplateIds.length, 1);
  assert.ok(
    sourceArtifact.cases.find(({ id }) => id === "brainboard:brainboard-aws-asg-lb-vpc-subnets")!
      .areaCount > 0
  );
  assert.ok(
    sourceArtifact.cases.every((entry) =>
      [
        entry.maxContainmentDepth,
        entry.meanAreaPadding,
        entry.meanCaptionWidth,
        entry.meanEdgeLength,
        entry.horizontalFlowRatio,
        entry.viewportAspectRatio,
        entry.whitespaceRatio
      ].every(Number.isFinite)
    )
  );
  assert.deepEqual(sourceArtifact, generatedArchitectureBoardKnowledgeArtifact);
  assert.equal(
    renderArchitectureBoardKnowledgeArtifact(sourceArtifact),
    readFileSync(generatedArtifactPath, "utf8")
  );
});

test("browser runtime은 checked-in artifact만 노출하고 API 호출마다 detached copy를 반환한다", () => {
  const created = createArchitectureBoardKnowledgeArtifact();

  assert.equal(architectureBoardKnowledge, generatedArchitectureBoardKnowledgeArtifact);
  assert.notEqual(created, architectureBoardKnowledge);
  assert.notEqual(created.cases, architectureBoardKnowledge.cases);
  assert.deepEqual(created, architectureBoardKnowledge);
});

test("browser runtime module은 source fixture registry를 import하지 않는다", () => {
  const runtimeSource = readFileSync(runtimeKnowledgePath, "utf8");

  assert.doesNotMatch(
    runtimeSource,
    /brainboardTemplateRegistry|templateDefinitions|adaptBrainboardTemplateSource|buildTemplateDiagramJson/
  );
});
