import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeRepositoryAnalysisResume,
  readRepositoryAnalysisResume,
  type RepositoryAnalysisResumeState,
  writeRepositoryAnalysisResume
} from "./repository-analysis-resume.js";

class MemoryStorage implements Pick<Storage, "getItem" | "removeItem" | "setItem"> {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const fixtureResumeState: RepositoryAnalysisResumeState = {
  schemaVersion: 1,
  resumeKey: "resume-12345678",
  createdAt: "2026-07-15T00:00:00.000Z",
  projectId: "project-1",
  projectName: "Audience Live Check",
  repositoryUrl: "https://github.com/NearthYou/SketchCatch",
  defaultBranch: "main",
  publicAnalysis: {
    repositoryUrl: "https://github.com/NearthYou/SketchCatch",
    repositoryRevision: "a".repeat(40),
    defaultBranch: "main",
    availableBranches: ["main"],
    evidenceFiles: [{ path: "Dockerfile", found: true }],
    detectedSignals: ["Container"],
    recommendedTemplateId: "ecs-fargate-container-app",
    recommendationReason: "Dockerfile"
  },
  selectedTemplateId: "ecs-fargate-container-app",
  deploymentType: "container",
  answers: {},
  stage: "configuration"
};

test("resume state round-trips once for the same project and Repository", () => {
  const storage = new MemoryStorage();
  writeRepositoryAnalysisResume(storage, fixtureResumeState);

  assert.deepEqual(
    consumeRepositoryAnalysisResume(storage, {
      resumeKey: fixtureResumeState.resumeKey,
      projectId: fixtureResumeState.projectId,
      repositoryUrl: "https://github.com/nearthyou/sketchcatch",
      now: new Date("2026-07-15T00:10:00.000Z")
    }),
    fixtureResumeState
  );
  assert.equal(storage.values.size, 0);
});

test("resume state rejects records older than 30 minutes", () => {
  const storage = new MemoryStorage();
  writeRepositoryAnalysisResume(storage, fixtureResumeState);

  assert.equal(
    consumeRepositoryAnalysisResume(storage, {
      resumeKey: fixtureResumeState.resumeKey,
      projectId: fixtureResumeState.projectId,
      repositoryUrl: fixtureResumeState.repositoryUrl,
      now: new Date("2026-07-15T00:31:00.000Z")
    }),
    null
  );
  assert.equal(storage.values.size, 0);
});

test("resume state rejects a different Repository without exposing the record", () => {
  const storage = new MemoryStorage();
  writeRepositoryAnalysisResume(storage, fixtureResumeState);

  assert.equal(
    consumeRepositoryAnalysisResume(storage, {
      resumeKey: fixtureResumeState.resumeKey,
      projectId: fixtureResumeState.projectId,
      repositoryUrl: "https://github.com/nearthyou/other",
      now: new Date("2026-07-15T00:10:00.000Z")
    }),
    null
  );
  assert.equal(storage.values.size, 0);
});

test("resume state keeps a private Repository target before authenticated analysis", () => {
  const storage = new MemoryStorage();
  const state: RepositoryAnalysisResumeState = {
    ...fixtureResumeState,
    publicAnalysis: null
  };
  writeRepositoryAnalysisResume(storage, state);

  assert.deepEqual(
    readRepositoryAnalysisResume(storage, {
      resumeKey: state.resumeKey,
      projectId: state.projectId,
      repositoryUrl: state.repositoryUrl,
      now: new Date("2026-07-15T00:05:00.000Z")
    }),
    state
  );
});
