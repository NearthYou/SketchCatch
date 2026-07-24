import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  RepositoryTemplateRecommendationCandidate,
  SourceRepositoryAnalysisResult
} from "@sketchcatch/types";

import {
  RepositoryAnalysisForm,
  RepositoryAnalysisResult
} from "./repository-analysis-screen";

Object.assign(globalThis, { React });

const analysis: SourceRepositoryAnalysisResult = {
  repositoryUrl: "https://github.com/NearthYou/SketchCatch",
  repositoryRevision: "revision-1",
  defaultBranch: "dev",
  availableBranches: ["dev"],
  evidenceFiles: [],
  detectedSignals: ["Container", "Node API"],
  recommendedTemplateId: "ecs-fargate-container-app",
  recommendationReason: "컨테이너 런타임이 확인되었습니다."
};

const candidates: readonly RepositoryTemplateRecommendationCandidate[] = [
  {
    templateId: "ecs-fargate-container-app",
    displayTitle: "ECS Fargate container app",
    confidence: 0.92,
    reasons: ["컨테이너 런타임과 일치합니다."],
    tradeoffs: []
  },
  {
    templateId: "eks-container-app",
    displayTitle: "EKS container app",
    confidence: 0.78,
    reasons: ["Kubernetes 확장 후보입니다."],
    tradeoffs: []
  }
];

test("pre-analysis form renders URL and branch without result content", () => {
  const html = renderToStaticMarkup(
    <RepositoryAnalysisForm
      branch=""
      errorMessage=""
      isBusy={false}
      onBranchChange={() => undefined}
      onRepositoryUrlChange={() => undefined}
      onSubmit={() => undefined}
      repositoryUrl=""
    />
  );

  assert.match(html, /name="repositoryUrl"/);
  assert.match(html, /name="branch"/);
  assert.match(html, /data-icon="github"/);
  assert.match(html, /lucide-git-branch/);
  assert.match(html, />URL 분석</);
  assert.doesNotMatch(html, /Template Preview|적합도|이 Template 사용/);
});

test("completed result renders repository evidence and the real Template thumbnail", () => {
  const html = renderToStaticMarkup(
    <RepositoryAnalysisResult
      aiDesignHref="/workspace/ai"
      analysis={analysis}
      candidates={candidates}
      isBusy={false}
      onAnalyzeAnother={() => undefined}
      onUseTemplate={() => undefined}
      resetKey="revision-1"
    />
  );

  assert.match(html, /NearthYou/);
  assert.match(html, /SketchCatch/);
  assert.match(html, /분석 완료/);
  assert.match(html, /role="status"/);
  assert.match(html, /실행 방식/);
  assert.match(html, /ECS Fargate container app/);
  assert.match(html, />1순위 추천</);
  assert.doesNotMatch(html, /Template Preview/);
  assert.match(html, /적합도 92%/);
  assert.match(html, /컨테이너 런타임과 일치합니다/);
  assert.match(html, /<img[^>]+Template 미리보기/);
  assert.match(html, /aria-label="이전 Template"/);
  assert.match(html, /aria-label="다음 Template"/);
  assert.match(html, />1 \/ 2</);
  assert.match(html, />AI로 직접 설계</);
});

test("one recommendation hides candidate navigation", () => {
  const html = renderToStaticMarkup(
    <RepositoryAnalysisResult
      aiDesignHref="/workspace/ai"
      analysis={analysis}
      candidates={candidates.slice(0, 1)}
      isBusy={false}
      onAnalyzeAnother={() => undefined}
      onUseTemplate={() => undefined}
      resetKey="revision-1"
    />
  );

  assert.doesNotMatch(html, /aria-label="이전 Template"|aria-label="다음 Template"|1 \/ 1/);
});
