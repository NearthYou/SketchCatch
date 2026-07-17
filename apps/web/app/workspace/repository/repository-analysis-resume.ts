import type {
  RepositoryDeploymentType,
  SourceRepositoryAnalysisResult
} from "@sketchcatch/types";
import type { PublicRepositoryTemplateId } from "../../../features/workspace/public-repository-recommendation";

const repositoryAnalysisResumeKeyPrefix = "sketchcatch:repository-analysis-resume:v1:";
const repositoryAnalysisResumeTtlMs = 30 * 60 * 1000;

type RepositoryAnalysisResumeStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type RepositoryAnalysisResumeState = {
  readonly schemaVersion: 1;
  readonly resumeKey: string;
  readonly createdAt: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly repositoryUrl: string;
  readonly defaultBranch: string;
  readonly publicAnalysis: SourceRepositoryAnalysisResult | null;
  readonly selectedTemplateId: PublicRepositoryTemplateId | null;
  readonly deploymentType: RepositoryDeploymentType;
  readonly answers: Readonly<Record<string, string | boolean>>;
  readonly stage: "configuration" | "questions";
};

type ReadRepositoryAnalysisResumeInput = {
  readonly resumeKey: string;
  readonly projectId: string;
  readonly repositoryUrl: string;
  readonly now?: Date | undefined;
};

export function createRepositoryAnalysisResumeKey(): string {
  return globalThis.crypto.randomUUID();
}

export function writeRepositoryAnalysisResume(
  storage: RepositoryAnalysisResumeStorage,
  state: RepositoryAnalysisResumeState
): void {
  storage.setItem(createStorageKey(state.resumeKey), JSON.stringify(state));
}

export function readRepositoryAnalysisResume(
  storage: RepositoryAnalysisResumeStorage,
  input: ReadRepositoryAnalysisResumeInput
): RepositoryAnalysisResumeState | null {
  const storageKey = createStorageKey(input.resumeKey);
  const storedValue = storage.getItem(storageKey);

  if (!storedValue) return null;

  try {
    const parsed: unknown = JSON.parse(storedValue);
    const state = parseRepositoryAnalysisResumeState(parsed);
    const now = input.now ?? new Date();
    const createdAt = new Date(state.createdAt);
    const ageMs = now.getTime() - createdAt.getTime();

    if (
      ageMs < 0 ||
      ageMs > repositoryAnalysisResumeTtlMs ||
      state.resumeKey !== input.resumeKey ||
      state.projectId !== input.projectId ||
      normalizeGitHubRepositoryUrl(state.repositoryUrl) !== normalizeGitHubRepositoryUrl(input.repositoryUrl) ||
      (state.publicAnalysis !== null &&
        normalizeGitHubRepositoryUrl(state.publicAnalysis.repositoryUrl) !== normalizeGitHubRepositoryUrl(input.repositoryUrl))
    ) {
      storage.removeItem(storageKey);
      return null;
    }

    return state;
  } catch {
    storage.removeItem(storageKey);
    return null;
  }
}

export function consumeRepositoryAnalysisResume(
  storage: RepositoryAnalysisResumeStorage,
  input: ReadRepositoryAnalysisResumeInput
): RepositoryAnalysisResumeState | null {
  const state = readRepositoryAnalysisResume(storage, input);

  if (state) {
    storage.removeItem(createStorageKey(input.resumeKey));
  }

  return state;
}

function createStorageKey(resumeKey: string): string {
  return `${repositoryAnalysisResumeKeyPrefix}${resumeKey}`;
}

function parseRepositoryAnalysisResumeState(value: unknown): RepositoryAnalysisResumeState {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("Invalid Repository analysis resume state");
  }

  const createdAt = requireString(value.createdAt);
  const parsedCreatedAt = new Date(createdAt);
  const publicAnalysis = value.publicAnalysis === null
    ? null
    : parsePublicAnalysis(value.publicAnalysis);
  const answers = parseAnswers(value.answers);
  const deploymentType = value.deploymentType;
  const stage = value.stage;
  const selectedTemplateId = value.selectedTemplateId;

  if (
    Number.isNaN(parsedCreatedAt.getTime()) ||
    (deploymentType !== "ec2_vm" && deploymentType !== "container" && deploymentType !== "serverless") ||
    (stage !== "configuration" && stage !== "questions") ||
    (selectedTemplateId !== null && (typeof selectedTemplateId !== "string" || !selectedTemplateId))
  ) {
    throw new Error("Invalid Repository analysis resume state");
  }

  return {
    schemaVersion: 1,
    resumeKey: requireString(value.resumeKey),
    createdAt,
    projectId: requireString(value.projectId),
    projectName: requireString(value.projectName),
    repositoryUrl: requireString(value.repositoryUrl),
    defaultBranch: requireString(value.defaultBranch),
    publicAnalysis,
    selectedTemplateId: selectedTemplateId as PublicRepositoryTemplateId | null,
    deploymentType,
    answers,
    stage
  };
}

function parsePublicAnalysis(value: unknown): SourceRepositoryAnalysisResult {
  if (
    !isRecord(value) ||
    !Array.isArray(value.availableBranches) ||
    !value.availableBranches.every((branch) => typeof branch === "string") ||
    !Array.isArray(value.evidenceFiles) ||
    !Array.isArray(value.detectedSignals) ||
    !value.detectedSignals.every((signal) => typeof signal === "string")
  ) {
    throw new Error("Invalid public Repository analysis");
  }

  requireString(value.repositoryUrl);
  requireString(value.repositoryRevision);
  requireString(value.defaultBranch);
  requireString(value.recommendationReason);

  return value as unknown as SourceRepositoryAnalysisResult;
}

function parseAnswers(value: unknown): Record<string, string | boolean> {
  if (!isRecord(value)) throw new Error("Invalid Repository analysis answers");

  const answers: Record<string, string | boolean> = {};

  for (const [questionId, answer] of Object.entries(value)) {
    if (!questionId || (typeof answer !== "string" && typeof answer !== "boolean")) {
      throw new Error("Invalid Repository analysis answers");
    }

    answers[questionId] = answer;
  }

  return answers;
}

function normalizeGitHubRepositoryUrl(repositoryUrl: string): string {
  const url = new URL(repositoryUrl);
  const [owner, rawName, ...rest] = url.pathname.split("/").filter(Boolean);
  const name = rawName?.replace(/\.git$/iu, "");

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !owner ||
    !name ||
    rest.length > 0
  ) {
    throw new Error("Invalid GitHub Repository URL");
  }

  return `https://github.com/${owner.toLowerCase()}/${name.toLowerCase()}`;
}

function requireString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid Repository analysis resume state");
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
