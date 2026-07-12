"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitBranch, LoaderCircle, Search, Settings2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type {
  GitHubInstalledRepositoryCandidate,
  RepositoryAnalysisQuestion,
  RepositoryDeploymentType,
  RepositoryTemplateRecommendationResult,
  SourceRepositoryAnalysisResult,
  SourceRepository
} from "@sketchcatch/types";
import { ProductBrand } from "../../../components/ui/ProductBrand";
import { ProductState } from "../../../components/ui/ProductState";
import { getApiErrorMessage } from "../../../lib/api-client";
import {
  analyzePublicSourceRepository,
  analyzeSourceRepository,
  connectGitHubSourceRepository,
  listGitHubInstalledRepositories,
  listSourceRepositories,
  recommendRepositoryTemplate,
  saveProjectDraft
} from "../../../features/workspace/api";
import {
  applyRepositoryAnalysis,
  findActiveGitHubRepository
} from "../../projects/[projectId]/settings/project-github-settings-state";
import { buildBoardTemplateDiagram } from "../../../features/resource-settings/template-library";
import { AiDraftBoardPreview } from "../ai/ai-draft-board-preview";
import styles from "./repository-start.module.css";

type RequestState = "idle" | "loading" | "error";

type RepositoryStartClientProps = {
  readonly projectId: string;
  readonly projectName: string;
};

export function RepositoryStartClient({ projectId, projectName }: RepositoryStartClientProps) {
  const router = useRouter();
  const [repositories, setRepositories] = useState<SourceRepository[]>([]);
  const [candidates, setCandidates] = useState<GitHubInstalledRepositoryCandidate[]>([]);
  const [installationState, setInstallationState] = useState("");
  const [loadState, setLoadState] = useState<RequestState>("loading");
  const [actionState, setActionState] = useState<RequestState>("idle");
  const [publicAnalysisState, setPublicAnalysisState] = useState<RequestState>("idle");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [publicAnalysis, setPublicAnalysis] = useState<SourceRepositoryAnalysisResult | null>(null);
  const [repositoryConnectionError, setRepositoryConnectionError] = useState("");
  const [recommendationState, setRecommendationState] = useState<RequestState>("idle");
  const [deploymentType, setDeploymentType] = useState<RepositoryDeploymentType>("serverless");
  const [usesCiCd, setUsesCiCd] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [recommendation, setRecommendation] = useState<RepositoryTemplateRecommendationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const activeRepository = useMemo(
    () => findActiveGitHubRepository(repositories),
    [repositories]
  );
  const activeHandoff = activeRepository?.analysis?.aiHandoff;
  const questions = activeHandoff?.questions?.slice(0, 5) ?? [];
  const activeRecommendation = recommendation ?? activeHandoff?.recommendation ?? null;
  const previewDiagram = createRepositoryPreviewDiagram(projectName, activeRepository);
  const githubSettingsHref = createProjectGitHubSettingsHref(projectId);
  const isPublicAnalysisBusy = publicAnalysisState === "loading";
  const showUrlAnalysis = Boolean(projectId && !activeRepository);

  useEffect(() => {
    if (!projectId) {
      setLoadState("error");
      setErrorMessage("Project information is missing. Please start again from the new project screen.");
      return;
    }

    void loadRepositories();
  }, [projectId]);

  async function loadRepositories(): Promise<void> {
    setLoadState("loading");
    setRepositoryConnectionError("");

    try {
      const loadedRepositories = await listSourceRepositories(projectId);
      const active = findActiveGitHubRepository(loadedRepositories);
      const handoff = active?.analysis?.aiHandoff;

      setRepositories(loadedRepositories);
      setRecommendation(handoff?.recommendation ?? null);
      setDeploymentType(handoff?.deploymentTypeDefault ?? "serverless");
      setUsesCiCd(handoff?.usesCiCdDefault ?? false);
      setLoadState("idle");
    } catch (error) {
      setLoadState("error");
      setRepositoryConnectionError(getApiErrorMessage(error, "Repository connection status could not be loaded."));
    }
  }

  async function loadCandidates(): Promise<void> {
    setActionState("loading");
    setErrorMessage("");

    try {
      const result = await listGitHubInstalledRepositories(projectId);
      setCandidates(result.repositories);
      setInstallationState(result.state);
      setActionState("idle");
    } catch (error) {
      setActionState("error");
      setErrorMessage(getApiErrorMessage(error, "Available repositories could not be loaded."));
    }
  }

  async function analyzeRepositoryUrl(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedRepositoryUrl = repositoryUrl.trim();
    const trimmedDefaultBranch = defaultBranch.trim();

    if (!trimmedRepositoryUrl || isPublicAnalysisBusy) return;

    setPublicAnalysisState("loading");
    setPublicAnalysis(null);
    setErrorMessage("");

    try {
      const result = await analyzePublicSourceRepository({
        repositoryUrl: trimmedRepositoryUrl,
        ...(trimmedDefaultBranch ? { defaultBranch: trimmedDefaultBranch } : {})
      });
      setPublicAnalysis(result);
      setPublicAnalysisState("idle");
    } catch (error) {
      setPublicAnalysisState("error");
      setErrorMessage(getApiErrorMessage(error, "Repository URL could not be analyzed."));
    }
  }

  async function openPublicRepositoryBoard(): Promise<void> {
    if (!publicAnalysis?.recommendedTemplateId || isPublicAnalysisBusy) return;
    const diagram = buildBoardTemplateDiagram(publicAnalysis.recommendedTemplateId, {
      projectSlug: projectName,
      shortId: "public-repo"
    });

    if (!diagram) {
      setErrorMessage("Recommended template could not be opened.");
      return;
    }

    setPublicAnalysisState("loading");
    setErrorMessage("");

    try {
      await saveProjectDraft({ diagramJson: diagram, projectId });
      router.push(
        `/workspace?${new URLSearchParams({
          projectId,
          projectName
        }).toString()}`
      );
    } catch (error) {
      setPublicAnalysisState("error");
      setErrorMessage(getApiErrorMessage(error, "Repository board could not be opened."));
    }
  }

  async function connectRepository(candidate: GitHubInstalledRepositoryCandidate): Promise<void> {
    if (!installationState || candidate.archived) return;
    setActionState("loading");
    setErrorMessage("");

    try {
      const connected = await connectGitHubSourceRepository({
        githubRepositoryId: candidate.githubRepositoryId,
        installationId: candidate.installationId,
        projectId,
        state: installationState
      });
      setRepositories([connected]);
      setRecommendation(null);
      setActionState("idle");
    } catch (error) {
      setActionState("error");
      setErrorMessage(getApiErrorMessage(error, "Repository could not be connected."));
    }
  }

  async function analyzeRepository(): Promise<void> {
    if (!activeRepository || actionState === "loading") return;
    setActionState("loading");
    setErrorMessage("");

    try {
      const result = await analyzeSourceRepository(projectId, activeRepository.id);
      setRepositories((current) => applyRepositoryAnalysis(current, result));
      setRecommendation(result.aiHandoff.recommendation ?? null);
      setDeploymentType(result.aiHandoff.deploymentTypeDefault ?? "serverless");
      setUsesCiCd(result.aiHandoff.usesCiCdDefault ?? false);
      setAnswers({});
      setActionState("idle");
    } catch (error) {
      setActionState("error");
      setErrorMessage(getApiErrorMessage(error, "Repository analysis failed."));
    }
  }

  async function submitRecommendation(): Promise<void> {
    if (!activeRepository || recommendationState === "loading") return;
    setRecommendationState("loading");
    setErrorMessage("");

    try {
      const result = await recommendRepositoryTemplate({
        projectId,
        sourceRepositoryId: activeRepository.id,
        deploymentType,
        usesCiCd,
        answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value }))
      });
      setRecommendation(result.recommendation);
      setRecommendationState("idle");
    } catch (error) {
      setRecommendationState("error");
      setErrorMessage(getApiErrorMessage(error, "Template candidates could not be recommended."));
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <ProductBrand />
        <Link href="/workspace/new">Choose another start path</Link>
      </header>

      <section className={styles.content} aria-labelledby="repository-start-title">
        <header className={styles.heading}>
          <span>GitHub Repository</span>
          <h1 id="repository-start-title">Start from code evidence</h1>
          <p>{projectName}</p>
        </header>

        {showUrlAnalysis ? (
          <section className={styles.publicUrlPanel}>
            <GitBranch aria-hidden="true" size={24} />
            <h2>Analyze a GitHub repository URL</h2>
            <form className={styles.publicUrlForm} onSubmit={(event) => void analyzeRepositoryUrl(event)}>
              <label>
                <span>Repository URL</span>
                <input
                  onChange={(event) => setRepositoryUrl(event.target.value)}
                  placeholder="https://github.com/owner/repository"
                  type="url"
                  value={repositoryUrl}
                />
              </label>
              <label>
                <span>Branch</span>
                <input
                  onChange={(event) => setDefaultBranch(event.target.value)}
                  placeholder="main"
                  type="text"
                  value={defaultBranch}
                />
              </label>
              <button disabled={isPublicAnalysisBusy || !repositoryUrl.trim()} type="submit">
                {isPublicAnalysisBusy ? <LoaderCircle className={styles.spin} size={16} /> : <Search size={16} />}
                {isPublicAnalysisBusy ? "Analyzing" : "Analyze URL"}
              </button>
            </form>
            <p className={styles.inlineHint}>
              Public repositories are analyzed without a GitHub account connection. Private repositories and Git handoff need GitHub access from project settings.
            </p>
            {publicAnalysis ? (
              <PublicRepositoryAnalysisResult
                analysis={publicAnalysis}
                githubSettingsHref={githubSettingsHref}
                isBusy={isPublicAnalysisBusy}
                onOpenBoard={() => void openPublicRepositoryBoard()}
              />
            ) : null}
          </section>
        ) : null}

        {showUrlAnalysis ? (
          <section className={styles.connectionPanel}>
            <GitBranch aria-hidden="true" size={24} />
            <h2>Optional: use a connected GitHub App repository</h2>
            <p className={styles.inlineHint}>
              Use this for private repositories, PR creation, CI/CD handoff, or repository settings changes.
            </p>
            {loadState === "loading" ? (
              <p className={styles.inlineHint} role="status">Checking connected repositories.</p>
            ) : null}
            {loadState === "error" ? (
              <ProductState
                action={<button onClick={() => void loadRepositories()} type="button">Retry</button>}
                compact
                description={repositoryConnectionError}
                kind="error"
                title="Connected repository status unavailable"
              />
            ) : null}
            <div className={styles.actions}>
              <button disabled={actionState === "loading" || loadState !== "idle"} onClick={() => void loadCandidates()} type="button">
                Show available repositories
              </button>
              <Link className={styles.secondaryAction} href={githubSettingsHref}>
                <Settings2 aria-hidden="true" size={16} /> Manage permissions in settings
              </Link>
            </div>
            <RepositoryCandidates
              actionState={actionState}
              candidates={candidates}
              onConnect={(candidate) => void connectRepository(candidate)}
            />
          </section>
        ) : null}

        {activeRepository ? (
          <section className={styles.analysisPanel}>
            <div>
              <span>Connected repository</span>
              <h2>{activeRepository.owner}/{activeRepository.name}</h2>
              <p>{activeRepository.defaultBranch}</p>
            </div>
            <button disabled={actionState === "loading"} onClick={() => void analyzeRepository()} type="button">
              {actionState === "loading" ? <LoaderCircle className={styles.spin} size={16} /> : <Search size={16} />}
              {actionState === "loading" ? "Analyzing" : "Analyze repository"}
            </button>

            {activeHandoff ? (
              <section className={styles.recommendationForm} aria-label="Template recommendation controls">
                <label>
                  <span>Deployment type</span>
                  <select value={deploymentType} onChange={(event) => setDeploymentType(event.target.value as RepositoryDeploymentType)}>
                    <option value="ec2_vm">EC2/VM based</option>
                    <option value="container">Container based</option>
                    <option value="serverless">Serverless based</option>
                  </select>
                </label>
                <label className={styles.checkboxLabel}>
                  <input checked={usesCiCd} onChange={(event) => setUsesCiCd(event.target.checked)} type="checkbox" />
                  <span>Use CI/CD handoff</span>
                </label>
                <RepositoryQuestions
                  answers={answers}
                  onAnswer={(questionId, value) =>
                    setAnswers((current) => ({ ...current, [questionId]: value }))
                  }
                  questions={questions}
                />
                <button disabled={recommendationState === "loading"} onClick={() => void submitRecommendation()} type="button">
                  {recommendationState === "loading" ? <LoaderCircle className={styles.spin} size={16} /> : <Search size={16} />}
                  Recommend templates
                </button>
              </section>
            ) : null}

            {activeRecommendation ? (
              <RepositoryTemplateCandidates
                projectId={projectId}
                projectName={projectName}
                recommendation={activeRecommendation}
                repository={activeRepository}
              />
            ) : null}

            {previewDiagram ? (
              <section className={styles.previewPanel} aria-label="Repository analysis architecture preview">
                <div>
                  <span>Practice Architecture Preview</span>
                  <strong>
                    {activeRepository.analysis?.aiHandoff.status === "template_selected"
                      ? activeRepository.analysis.aiHandoff.selectionReasons.join(" / ")
                      : "Analysis evidence could not select one template."}
                  </strong>
                </div>
                <AiDraftBoardPreview diagram={previewDiagram} />
              </section>
            ) : null}
          </section>
        ) : null}

        {errorMessage && loadState !== "error" ? (
          <ProductState compact description={errorMessage} kind="error" title="Action failed" />
        ) : null}
      </section>
    </main>
  );
}

function RepositoryQuestions({
  answers,
  onAnswer,
  questions
}: {
  readonly answers: Record<string, string | boolean>;
  readonly onAnswer: (questionId: string, value: string | boolean) => void;
  readonly questions: readonly RepositoryAnalysisQuestion[];
}) {
  if (questions.length === 0) return null;

  return (
    <div className={styles.questionList}>
      {questions.map((question) => (
        <label key={question.id}>
          <span>{question.prompt}</span>
          {question.answerType === "boolean" ? (
            <select
              value={String(answers[question.id] ?? "")}
              onChange={(event) => onAnswer(question.id, event.target.value === "true")}
            >
              <option value="">Select</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          ) : question.answerType === "single_select" ? (
            <select
              value={String(answers[question.id] ?? "")}
              onChange={(event) => onAnswer(question.id, event.target.value)}
            >
              <option value="">Select</option>
              {(question.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : (
            <input
              value={String(answers[question.id] ?? "")}
              onChange={(event) => onAnswer(question.id, event.target.value)}
              type="text"
            />
          )}
        </label>
      ))}
    </div>
  );
}

function RepositoryTemplateCandidates({
  projectId,
  projectName,
  recommendation,
  repository
}: {
  readonly projectId: string;
  readonly projectName: string;
  readonly recommendation: RepositoryTemplateRecommendationResult;
  readonly repository: SourceRepository;
}) {
  return (
    <section className={styles.recommendationPanel} aria-label="Template candidates">
      {recommendation.candidates.map((candidate) => (
        <article key={candidate.templateId}>
          <div>
            <span>{Math.round(candidate.confidence * 100)}% match</span>
            <strong>{candidate.displayTitle}</strong>
            <p>{candidate.reasons.join(" ")}</p>
            <small>{candidate.tradeoffs.join(" ")}</small>
          </div>
          <Link
            className={styles.boardAction}
            href={createRepositoryBoardHref(projectId, projectName, repository, candidate.templateId)}
          >
            Open board
          </Link>
        </article>
      ))}
    </section>
  );
}

function PublicRepositoryAnalysisResult({
  analysis,
  githubSettingsHref,
  isBusy,
  onOpenBoard
}: {
  readonly analysis: SourceRepositoryAnalysisResult;
  readonly githubSettingsHref: string;
  readonly isBusy: boolean;
  readonly onOpenBoard: () => void;
}) {
  const hasPublicEvidence = analysis.evidenceFiles.some((file) => file.found);

  return (
    <section className={styles.publicAnalysisResult} aria-label="Public repository analysis result">
      <div>
        <span>Recommendation</span>
        <strong>{formatPublicRepositoryTemplate(analysis.recommendedTemplateId)}</strong>
        <p>{analysis.recommendationReason}</p>
      </div>
      <div className={styles.signalList}>
        <span>Detected signals</span>
        <strong>{analysis.detectedSignals.length > 0 ? analysis.detectedSignals.join(" / ") : "No strong signal"}</strong>
      </div>
      <div className={styles.evidenceList}>
        {analysis.evidenceFiles.map((file) => (
          <span key={file.path} data-found={file.found}>
            {file.found ? "Found" : "Missing"} {file.path}
          </span>
        ))}
      </div>
      {!hasPublicEvidence ? (
        <div className={styles.accessHint}>
          <strong>Could not read public repository evidence.</strong>
          <p>
            If this repository is private, restricted, or uses another branch, connect GitHub access in project settings.
          </p>
          <Link href={githubSettingsHref}>Connect GitHub in settings</Link>
        </div>
      ) : null}
      <button
        disabled={isBusy || !analysis.recommendedTemplateId}
        onClick={onOpenBoard}
        type="button"
      >
        {isBusy ? <LoaderCircle className={styles.spin} size={16} /> : <Search size={16} />}
        Open recommended board
      </button>
    </section>
  );
}

function formatPublicRepositoryTemplate(
  templateId: SourceRepositoryAnalysisResult["recommendedTemplateId"]
): string {
  if (templateId === "template-static-website") return "Static website";
  if (templateId === "template-api-db") return "API with database";
  if (templateId === "template-3tier") return "Three-tier web service";
  return "No template match yet";
}

function createRepositoryPreviewDiagram(
  projectName: string,
  repository: SourceRepository | null
) {
  const handoff = repository?.analysis?.aiHandoff;
  if (!repository || handoff?.status !== "template_selected") return null;
  return buildBoardTemplateDiagram(handoff.templateId, {
    projectSlug: projectName,
    shortId: repository.id.slice(0, 8)
  }) ?? null;
}

function RepositoryCandidates({
  actionState,
  candidates,
  onConnect
}: {
  readonly actionState: RequestState;
  readonly candidates: readonly GitHubInstalledRepositoryCandidate[];
  readonly onConnect: (candidate: GitHubInstalledRepositoryCandidate) => void;
}) {
  if (candidates.length === 0) return null;

  return (
    <div className={styles.candidateList}>
      {candidates.map((candidate) => (
        <article key={`${candidate.installationId}-${candidate.githubRepositoryId}`}>
          <div><strong>{candidate.fullName}</strong><span>{candidate.defaultBranch}</span></div>
          <button disabled={actionState === "loading" || candidate.archived} onClick={() => onConnect(candidate)} type="button">
            {candidate.archived ? "Archived" : "Connect"}
          </button>
        </article>
      ))}
    </div>
  );
}

function createRepositoryBoardHref(
  projectId: string,
  projectName: string,
  repository: SourceRepository,
  templateId: string
): string {
  return `/workspace?${new URLSearchParams({
    projectId,
    projectName,
    sourceRepositoryId: repository.id,
    templateId
  }).toString()}`;
}

function createProjectGitHubSettingsHref(projectId: string): string {
  return `/dashboard/projects/${encodeURIComponent(projectId)}/settings?tab=github`;
}
