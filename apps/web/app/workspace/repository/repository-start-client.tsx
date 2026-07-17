"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GitBranch,
  LoaderCircle,
  Search,
  Sparkles
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CreateArchitectureDraftRequest,
  GitHubInstallationConnection,
  GitHubInstalledRepositoryCandidate,
  RepositoryAnalysisQuestion,
  RepositoryDeploymentType,
  RepositoryTemplateRecommendationResult,
  SaveRepositoryAnalysisRecordRequest,
  DiagramJson,
  SourceRepositoryAnalysisResult,
  SourceRepository,
  TemplateId
} from "@sketchcatch/types";
import { ProductBrand } from "../../../components/ui/ProductBrand";
import { ProductState } from "../../../components/ui/ProductState";
import { SelectMenu } from "../../../components/ui/SelectMenu";
import { getApiErrorMessage } from "../../../lib/api-client";
import {
  analyzePublicSourceRepository,
  analyzeSourceRepository,
  connectGitHubSourceRepository,
  createAiArchitectureDraft,
  createGitHubSourceRepositoryInstallUrl,
  listGitHubAccountInstallations,
  listGitHubInstalledRepositories,
  listSourceRepositories,
  recommendRepositoryTemplate,
  saveProjectDraft,
  saveRepositoryAnalysisRecord
} from "../../../features/workspace/api";
import {
  applyRepositoryAnalysis,
  findActiveGitHubRepository
} from "../../projects/[projectId]/repository/project-source-repository-state";
import { buildBoardTemplateDiagram } from "../../../features/resource-settings/template-library";
import {
  createPublicRepositoryArchitectureDraftRequest,
  createPublicRepositoryRecommendation,
  getPublicRepositoryDeploymentDefault,
  getPublicRepositoryTemplateDeploymentType,
  isBuiltInTemplateId,
  localizePublicRepositoryQuestion,
  shouldAskPublicRepositoryDeploymentType,
  type PublicRepositoryTemplateId
} from "../../../features/workspace/public-repository-recommendation";
import { getDiagramJsonForArchitectureDraft } from "../../../features/workspace/workspace-ai-diagram-adapter";
import { createWorkspaceAiStartHref } from "../../../features/workspace/workspace-ai-start-entry";
import { AiDraftBoardPreview } from "../ai/ai-draft-board-preview";
import { getRepositoryDraftBlockingIssue } from "./repository-draft-readiness";
import {
  createConnectedRepositoryAnalysisResult,
  createRepositoryAnalysisRecordPayload
} from "./repository-analysis-record-payload";
import {
  selectRepositoryRecoveryAction,
  type RepositoryRecoveryAction
} from "./repository-recovery-action";
import {
  consumeRepositoryAnalysisResume,
  createRepositoryAnalysisResumeKey,
  writeRepositoryAnalysisResume
} from "./repository-analysis-resume";
import styles from "./repository-start.module.css";

type RequestState = "idle" | "loading" | "error";
type PublicRecommendationStage = "configuration" | "questions";
type RepositoryQuestionView = Pick<
  RepositoryAnalysisQuestion,
  "answerType" | "id" | "options" | "prompt"
>;

class RepositoryAnalysisRecordPersistenceError extends Error {
  constructor(readonly cause: unknown) {
    super("Repository Analysis Record persistence failed");
    this.name = "RepositoryAnalysisRecordPersistenceError";
  }
}

type RepositoryStartClientProps = {
  readonly initialDefaultBranch?: string;
  readonly initialRepositoryUrl?: string;
  readonly initialResumeKey?: string;
  readonly projectId: string;
  readonly projectName: string;
};

export function RepositoryStartClient({
  initialDefaultBranch = "",
  initialRepositoryUrl = "",
  initialResumeKey = "",
  projectId,
  projectName
}: RepositoryStartClientProps) {
  const router = useRouter();
  const hasAutoAnalyzedPublicUrl = useRef(false);
  const hasRestoredRepositoryAnalysis = useRef(false);
  const [repositories, setRepositories] = useState<SourceRepository[]>([]);
  const [installations, setInstallations] = useState<GitHubInstallationConnection[]>([]);
  const [candidates, setCandidates] = useState<GitHubInstalledRepositoryCandidate[]>([]);
  const [connectionOptionsLoaded, setConnectionOptionsLoaded] = useState(false);
  const [installationState, setInstallationState] = useState("");
  const [actionState, setActionState] = useState<RequestState>("idle");
  const [publicAnalysisState, setPublicAnalysisState] = useState<RequestState>("idle");
  const [repositoryUrl, setRepositoryUrl] = useState(initialRepositoryUrl);
  const [defaultBranch, setDefaultBranch] = useState(initialDefaultBranch);
  const [publicAnalysis, setPublicAnalysis] = useState<SourceRepositoryAnalysisResult | null>(null);
  const [recommendationState, setRecommendationState] = useState<RequestState>("idle");
  const [deploymentType, setDeploymentType] = useState<RepositoryDeploymentType>("serverless");
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [selectedPublicTemplateId, setSelectedPublicTemplateId] = useState<PublicRepositoryTemplateId | null>(null);
  const [publicRecommendationStage, setPublicRecommendationStage] = useState<PublicRecommendationStage>("configuration");
  const [recommendation, setRecommendation] = useState<RepositoryTemplateRecommendationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingAnalysisRecord, setPendingAnalysisRecord] = useState<
    SaveRepositoryAnalysisRecordRequest | null
  >(null);
  const [restoredProjectName, setRestoredProjectName] = useState("");
  const effectiveProjectName = restoredProjectName || projectName;
  const activeRepository = useMemo(
    () => findActiveGitHubRepository(repositories),
    [repositories]
  );
  const activeHandoff = activeRepository?.analysis?.aiHandoff;
  const questions = activeHandoff?.questions
    ?.map(localizePublicRepositoryQuestion)
    .slice(0, 5) ?? [];
  const activeRecommendation = recommendation ?? activeHandoff?.recommendation ?? null;
  const previewDiagram = createRepositoryPreviewDiagram(effectiveProjectName, activeRepository);
  const isPublicAnalysisBusy = publicAnalysisState === "loading";
  const showUrlAnalysis = Boolean(projectId && (!activeRepository || publicAnalysis));
  const recoveryAction = useMemo<RepositoryRecoveryAction>(() => {
    try {
      return selectRepositoryRecoveryAction({
        repositoryUrl,
        installations,
        candidates,
        activeRepository
      });
    } catch {
      return { kind: "retry_only" };
    }
  }, [activeRepository, candidates, installations, repositoryUrl]);

  useEffect(() => {
    if (!projectId) {
      setErrorMessage("프로젝트 정보가 없습니다. 새 프로젝트 화면에서 다시 시작해주세요.");
      return;
    }

    void loadRepositories();
  }, [projectId]);

  useEffect(() => {
    if (initialResumeKey) return;

    if (!projectId || !initialRepositoryUrl.trim() || hasAutoAnalyzedPublicUrl.current) {
      return;
    }

    hasAutoAnalyzedPublicUrl.current = true;
    void analyzePublicRepositoryUrl(initialRepositoryUrl, initialDefaultBranch);
  }, [initialDefaultBranch, initialRepositoryUrl, initialResumeKey, projectId]);

  useEffect(() => {
    if (publicAnalysisState !== "error") return;
    const recheckPermissions = () => void loadCandidates();
    window.addEventListener("focus", recheckPermissions);
    return () => window.removeEventListener("focus", recheckPermissions);
  }, [publicAnalysisState]);

  async function loadRepositories(): Promise<void> {
    setErrorMessage("");

    try {
      const loadedRepositories = await listSourceRepositories(projectId);
      const active = findActiveGitHubRepository(loadedRepositories);
      const handoff = active?.analysis?.aiHandoff;
      let nextRecommendation = handoff?.recommendation ?? null;

      setRepositories(loadedRepositories);

      if (initialResumeKey && !hasRestoredRepositoryAnalysis.current) {
        hasRestoredRepositoryAnalysis.current = true;

        if (!active) {
          setErrorMessage("연결된 Repository를 확인할 수 없어 이전 분석으로 돌아가지 못했습니다.");
        } else {
          const resume = consumeRepositoryAnalysisResume(window.sessionStorage, {
            resumeKey: initialResumeKey,
            projectId,
            repositoryUrl: active.repositoryUrl ?? `https://github.com/${active.owner}/${active.name}`
          });

          if (resume) {
            setPublicAnalysis(resume.publicAnalysis);
            setRepositoryUrl(resume.repositoryUrl);
            setDefaultBranch(resume.defaultBranch);
            setSelectedPublicTemplateId(resume.selectedTemplateId);
            setDeploymentType(resume.deploymentType);
            setAnswers({ ...resume.answers });
            setPublicRecommendationStage(resume.stage);
            setRestoredProjectName(resume.projectName);
            setPublicAnalysisState("idle");

            if (!resume.publicAnalysis) {
              const authenticatedAnalysis = await analyzeSourceRepository(projectId, active.id);
              const analyzedRepositories = applyRepositoryAnalysis(
                loadedRepositories,
                authenticatedAnalysis
              );
              setRepositories(analyzedRepositories);
              nextRecommendation = authenticatedAnalysis.aiHandoff.recommendation ?? null;
              setDeploymentType(
                authenticatedAnalysis.aiHandoff.deploymentTypeDefault ?? "serverless"
              );
            }
          } else {
            setErrorMessage("이전 Repository 분석 복귀 정보가 만료되었거나 일치하지 않습니다.");
          }
        }
      }

      setRecommendation(nextRecommendation);
      if (!initialResumeKey) {
        setDeploymentType(handoff?.deploymentTypeDefault ?? "serverless");
      }
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "저장소 연결 상태를 불러오지 못했습니다."));
    }
  }

  async function loadCandidates(): Promise<void> {
    setActionState("loading");
    setErrorMessage("");

    try {
      const [result, loadedInstallations] = await Promise.all([
        listGitHubInstalledRepositories(projectId),
        listGitHubAccountInstallations()
      ]);
      setCandidates(result.repositories);
      setInstallations(loadedInstallations);
      setInstallationState(result.state);
      setConnectionOptionsLoaded(true);
      setActionState("idle");
    } catch (error) {
      setActionState("error");
      setErrorMessage(getApiErrorMessage(error, "연결 가능한 저장소를 불러오지 못했습니다."));
    }
  }

  async function openGitHubConnection(): Promise<void> {
    const targetRepositoryUrl = publicAnalysis?.repositoryUrl ?? repositoryUrl.trim();
    if (actionState === "loading" || !targetRepositoryUrl) return;
    setActionState("loading");
    setErrorMessage("");

    try {
      const resumeKey = createRepositoryAnalysisResumeKey();
      writeRepositoryAnalysisResume(window.sessionStorage, {
        schemaVersion: 1,
        resumeKey,
        createdAt: new Date().toISOString(),
        projectId,
        projectName: effectiveProjectName,
        repositoryUrl: targetRepositoryUrl,
        defaultBranch,
        publicAnalysis,
        selectedTemplateId: selectedPublicTemplateId,
        deploymentType,
        answers,
        stage: publicRecommendationStage
      });
      const { installUrl } = await createGitHubSourceRepositoryInstallUrl(projectId, {
        repositoryUrl: targetRepositoryUrl,
        resumeKey
      });
      window.location.assign(installUrl);
    } catch (error) {
      setActionState("error");
      setErrorMessage(getApiErrorMessage(error, "GitHub 연결 화면을 열지 못했습니다."));
    }
  }

  async function analyzeRepositoryUrl(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await analyzePublicRepositoryUrl(repositoryUrl, defaultBranch);
  }

  async function analyzePublicRepositoryUrl(nextRepositoryUrl: string, nextDefaultBranch: string): Promise<void> {
    const trimmedRepositoryUrl = nextRepositoryUrl.trim();
    const trimmedDefaultBranch = nextDefaultBranch.trim();

    if (!trimmedRepositoryUrl || isPublicAnalysisBusy) return;

    setPublicAnalysisState("loading");
    setPublicAnalysis(null);
    setAnswers({});
    setSelectedPublicTemplateId(null);
    setPublicRecommendationStage("configuration");
    setErrorMessage("");

    try {
      const result = await analyzePublicSourceRepository({
        repositoryUrl: trimmedRepositoryUrl,
        ...(trimmedDefaultBranch ? { defaultBranch: trimmedDefaultBranch } : {})
      });
      setPublicAnalysis(result);
      setDefaultBranch(result.defaultBranch);
      const nextDeploymentType = getPublicRepositoryDeploymentDefault(result);
      setDeploymentType(nextDeploymentType);
      setSelectedPublicTemplateId(
        createPublicRepositoryRecommendation({
          analysis: result,
          answers: {},
          deploymentType: nextDeploymentType
        }).candidates[0]?.templateId ?? null
      );
      setPublicAnalysisState("idle");
      void loadCandidates();
    } catch (error) {
      setPublicAnalysisState("error");
      setErrorMessage(
        getApiErrorMessage(
          error,
          "Repository를 확인할 수 없습니다. URL이 잘못되었거나 비공개 Repository일 수 있습니다."
        )
      );
      void loadCandidates();
    }
  }

  async function createPublicRepositoryBoard(): Promise<void> {
    if (!publicAnalysis || isPublicAnalysisBusy) return;

    const recommendation = createPublicRepositoryRecommendation({
      analysis: publicAnalysis,
      answers,
      deploymentType,
      selectedTemplateId: selectedPublicTemplateId
    });
    const blockingIssue = getRepositoryDraftBlockingIssue({
      answers,
      hasConnectedRepository: Boolean(activeRepository),
      questions: recommendation.questions
    });

    if (blockingIssue) {
      setErrorMessage(blockingIssue.message);
      return;
    }
    const templateId = selectedPublicTemplateId ?? recommendation.candidates[0]?.templateId;

    if (!templateId) {
      setErrorMessage("추천 템플릿으로 보드를 만들 수 없습니다.");
      return;
    }

    const effectiveDeploymentType = shouldAskPublicRepositoryDeploymentType(publicAnalysis)
      ? deploymentType
      : getPublicRepositoryTemplateDeploymentType(templateId);
    setPublicAnalysisState("loading");
    setErrorMessage("");

    try {
      if (!isBuiltInTemplateId(templateId)) {
        await saveTemplateBoard(templateId, publicAnalysis);
        setPublicAnalysisState("idle");
        return;
      }

      const draft = await createAiArchitectureDraft(
        createPublicRepositoryArchitectureDraftRequest({
          analysis: publicAnalysis,
          answers,
          deploymentType: effectiveDeploymentType,
          templateId,
          usesCiCd: false
        })
      );

      if ("status" in draft) {
        setPublicAnalysisState("error");
        setErrorMessage(`Amazon Q가 추가 확인을 요청했습니다: ${draft.question}`);
        return;
      }

      if (draft.metadata.source !== "amazon_q") {
        setPublicAnalysisState("error");
        setErrorMessage("Amazon Q가 현재 다이어그램을 생성하지 못했습니다. AWS 인증과 Amazon Q 설정을 확인해주세요.");
        return;
      }

      const diagram = getDiagramJsonForArchitectureDraft(draft);
      await saveRepositoryBoard(diagram, {
        analysis: publicAnalysis,
        templateId
      });
      setPublicAnalysisState("idle");
    } catch (error) {
      setPublicAnalysisState("error");
      setErrorMessage(
        error instanceof RepositoryAnalysisRecordPersistenceError
          ? "보드는 저장했지만 Repository 정보를 저장하지 못했습니다. 보드 생성을 다시 누르면 안전하게 재시도합니다."
          : getApiErrorMessage(error, "Amazon Q로 저장소 다이어그램을 생성하지 못했습니다.")
      );
    }
  }

  async function createConnectedRepositoryBoard(templateId: PublicRepositoryTemplateId): Promise<void> {
    if (!activeRepository?.analysis || actionState === "loading") return;

    setActionState("loading");
    setErrorMessage("");

    try {
      if (!isBuiltInTemplateId(templateId)) {
        await saveTemplateBoard(
          templateId,
          createConnectedRepositoryAnalysisResult(activeRepository, templateId),
          activeRepository.analysis.analyzedAt
        );
        setActionState("idle");
        return;
      }

      const draft = await createAiArchitectureDraft(
        createConnectedRepositoryArchitectureDraftRequest({
          projectId,
          repository: activeRepository,
          templateId
        })
      );

      if ("status" in draft) {
        setActionState("error");
        setErrorMessage(`Amazon Q가 추가 확인을 요청했습니다: ${draft.question}`);
        return;
      }

      const diagram = getDiagramJsonForArchitectureDraft(draft);
      await saveRepositoryBoard(diagram, {
        analysis: createConnectedRepositoryAnalysisResult(activeRepository, templateId),
        analyzedAt: activeRepository.analysis.analyzedAt,
        templateId
      });
      setActionState("idle");
    } catch (error) {
      setActionState("error");
      setErrorMessage(getApiErrorMessage(error, "Amazon Q로 저장소 다이어그램을 생성하지 못했습니다."));
    }
  }

  async function saveTemplateBoard(
    templateId: PublicRepositoryTemplateId,
    publicRepositoryAnalysis?: SourceRepositoryAnalysisResult,
    analyzedAt?: string
  ): Promise<void> {
    const diagram = buildBoardTemplateDiagram(templateId, {
      projectSlug: effectiveProjectName,
      shortId: "repository"
    });

    if (!diagram) {
      throw new Error("REPOSITORY_ANALYSIS_TEMPLATE_UNAVAILABLE");
    }

    await saveRepositoryBoard(
      diagram,
      publicRepositoryAnalysis
        ? {
          analysis: publicRepositoryAnalysis,
          ...(analyzedAt ? { analyzedAt } : {}),
          templateId
        }
        : undefined
    );
  }

  async function saveRepositoryBoard(
    diagramJson: DiagramJson,
    provenance?: {
      readonly analysis: SourceRepositoryAnalysisResult;
      readonly analyzedAt?: string;
      readonly templateId: PublicRepositoryTemplateId;
    }
  ): Promise<void> {
    await saveProjectDraft({ diagramJson, projectId });

    if (provenance) {
      const payload = createRepositoryAnalysisRecordPayload({
        analysis: provenance.analysis,
        analyzedAt: provenance.analyzedAt ?? new Date().toISOString(),
        selectedTemplateId: provenance.templateId
      });
      try {
        await saveRepositoryAnalysisRecord(projectId, payload);
        setPendingAnalysisRecord(null);
      } catch (cause) {
        setPendingAnalysisRecord(payload);
        throw new RepositoryAnalysisRecordPersistenceError(cause);
      }
    }

    router.push(
      `/workspace?${new URLSearchParams({
        projectId,
        projectName: effectiveProjectName
      }).toString()}`
    );
  }

  async function retryRepositoryAnalysisRecord(): Promise<void> {
    if (!pendingAnalysisRecord || actionState === "loading") return;
    setActionState("loading");
    setErrorMessage("");
    try {
      await saveRepositoryAnalysisRecord(projectId, pendingAnalysisRecord);
      setPendingAnalysisRecord(null);
      router.push(`/workspace?${new URLSearchParams({
        projectId,
        projectName: effectiveProjectName
      }).toString()}`);
    } catch (error) {
      setActionState("error");
      setErrorMessage(getApiErrorMessage(error, "Repository 정보를 저장하지 못했습니다."));
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
      const analysis = await analyzeSourceRepository(projectId, connected.id);
      const analyzedRepositories = applyRepositoryAnalysis([connected], analysis);
      setRepositories(analyzedRepositories);
      setRecommendation(analysis.aiHandoff.recommendation ?? null);
      setDeploymentType(analysis.aiHandoff.deploymentTypeDefault ?? "serverless");
      setErrorMessage("");
      setActionState("idle");
    } catch (error) {
      setActionState("error");
      setErrorMessage(getApiErrorMessage(error, "저장소를 연결하지 못했습니다."));
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
      setAnswers({});
      setActionState("idle");
    } catch (error) {
      setActionState("error");
      setErrorMessage(getApiErrorMessage(error, "저장소 분석에 실패했습니다."));
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
        usesCiCd: true,
        answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value }))
      });
      setRecommendation(result.recommendation);
      setRecommendationState("idle");
    } catch (error) {
      setRecommendationState("error");
      setErrorMessage(getApiErrorMessage(error, "템플릿 후보를 추천하지 못했습니다."));
    }
  }

  function confirmPublicRecommendationConfiguration(): void {
    setPublicRecommendationStage("questions");
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <ProductBrand />
        <Link href="/workspace/new">시작 방식 다시 선택</Link>
      </header>

      <section className={styles.content} aria-labelledby="repository-start-title">
        <header className={styles.heading}>
          <h1 id="repository-start-title">GitHub 저장소</h1>
          <p>{effectiveProjectName}</p>
        </header>

        {showUrlAnalysis ? (
          <section className={styles.publicUrlPanel}>
            {publicRecommendationStage === "configuration" ? (
              <>
                <GitBranch aria-hidden="true" size={24} />
                <h2>GitHub 저장소 URL 분석</h2>
                <form
                  className={styles.publicUrlForm}
                  data-has-branches={publicAnalysis !== null}
                  onSubmit={(event) => void analyzeRepositoryUrl(event)}
                >
                  <label>
                    <span>저장소 URL</span>
                    <input
                      onChange={(event) => {
                        const nextRepositoryUrl = event.target.value;
                        setRepositoryUrl(nextRepositoryUrl);

                        if (nextRepositoryUrl !== publicAnalysis?.repositoryUrl) {
                          setPublicAnalysis(null);
                          setDefaultBranch("");
                        }
                      }}
                      placeholder="https://github.com/owner/repository"
                      type="url"
                      value={repositoryUrl}
                    />
                  </label>
                  {publicAnalysis ? (
                    <label>
                      <span>브랜치</span>
                      <SelectMenu
                        ariaLabel="분석할 브랜치"
                        className={styles.branchSelect}
                        disabled={isPublicAnalysisBusy}
                        emptyLabel="브랜치 선택"
                        onChange={setDefaultBranch}
                        options={publicAnalysis.availableBranches.map((branch) => ({
                          label: branch,
                          value: branch
                        }))}
                        size="large"
                        tone="workspace"
                        value={defaultBranch}
                      />
                    </label>
                  ) : null}
                  <button disabled={isPublicAnalysisBusy || !repositoryUrl.trim()} type="submit">
                    {isPublicAnalysisBusy ? <LoaderCircle className={styles.spin} size={16} /> : <Search size={16} />}
                    {isPublicAnalysisBusy ? "분석 중" : "URL 분석"}
                  </button>
                </form>
                <p className={styles.inlineHint}>
                  공개 저장소는 GitHub 연결 없이 분석하고 보드를 만들 수 있습니다. CI/CD는 보드 생성 후 Delivery에서 연결합니다.
                </p>
              </>
            ) : null}
            {publicAnalysis ? (
              <PublicRepositoryRecommendationStep
                aiDesignHref={createWorkspaceAiStartHref({ projectId, projectName: effectiveProjectName })}
                answers={answers}
                analysis={publicAnalysis}
                deploymentType={deploymentType}
                isBusy={isPublicAnalysisBusy}
                onAnswer={(questionId, value) => {
                  setAnswers((current) => ({ ...current, [questionId]: value }));
                  setErrorMessage("");
                }}
                onCreateBoard={() => void createPublicRepositoryBoard()}
                onConfirmConfiguration={confirmPublicRecommendationConfiguration}
                onDeploymentTypeChange={(nextDeploymentType) => {
                  setDeploymentType(nextDeploymentType);
                  setSelectedPublicTemplateId(null);
                  setAnswers({});
                }}
                onEditConfiguration={() => setPublicRecommendationStage("configuration")}
                onSelectTemplate={(templateId) => {
                  setSelectedPublicTemplateId(templateId);
                  setAnswers({});
                }}
                selectedTemplateId={selectedPublicTemplateId}
                stage={publicRecommendationStage}
              />
            ) : null}
            {publicAnalysisState === "error" && !pendingAnalysisRecord ? (
              <RepositoryAnalysisRecovery
                action={recoveryAction}
                errorMessage={errorMessage}
                isBusy={actionState === "loading" || isPublicAnalysisBusy}
                onAddPermission={(managementUrl) => {
                  window.open(managementUrl, "_blank", "noopener,noreferrer");
                }}
                onAnalyzeConnected={() => void analyzeRepository()}
                onConnect={(candidate) => void connectRepository(candidate)}
                onConnectGitHub={() => void openGitHubConnection()}
                onRetry={() => void analyzePublicRepositoryUrl(repositoryUrl, defaultBranch)}
                onVerifyPermission={() => void loadCandidates()}
              />
            ) : null}
            {publicAnalysis && publicAnalysisState === "idle" ? (
              connectionOptionsLoaded ? (
                <RepositoryAnalysisRecovery
                  action={recoveryAction}
                  errorMessage=""
                  isBusy={actionState === "loading"}
                  onAddPermission={(managementUrl) => {
                    window.open(managementUrl, "_blank", "noopener,noreferrer");
                  }}
                  onAnalyzeConnected={() => void analyzeRepository()}
                  onConnect={(candidate) => void connectRepository(candidate)}
                  onConnectGitHub={() => void openGitHubConnection()}
                  onRetry={() => void loadCandidates()}
                  onVerifyPermission={() => void loadCandidates()}
                  title="Delivery용 Repository 연결"
                />
              ) : (
                <button
                  className={styles.secondaryAction}
                  disabled={actionState === "loading"}
                  onClick={() => void loadCandidates()}
                  type="button"
                >
                  Delivery용 Repository 연결 확인
                </button>
              )
            ) : null}
          </section>
        ) : null}

        {activeRepository && !publicAnalysis ? (
          <section className={styles.analysisPanel}>
            <div>
              <span>연결된 저장소</span>
              <h2>{activeRepository.owner}/{activeRepository.name}</h2>
              <p>{activeRepository.defaultBranch}</p>
            </div>
            <button disabled={actionState === "loading"} onClick={() => void analyzeRepository()} type="button">
              {actionState === "loading" ? <LoaderCircle className={styles.spin} size={16} /> : <Search size={16} />}
              {actionState === "loading" ? "분석 중" : "저장소 분석"}
            </button>

            {activeHandoff ? (
              <section className={styles.recommendationForm} aria-label="템플릿 추천 설정">
                <label>
                  <span>배포 방식</span>
                  <select value={deploymentType} onChange={(event) => setDeploymentType(event.target.value as RepositoryDeploymentType)}>
                    <option value="ec2_vm">EC2/VM 기반</option>
                    <option value="container">컨테이너 기반</option>
                    <option value="serverless">서버리스 기반</option>
                  </select>
                </label>
                <RepositoryCiCdConnectedState repository={activeRepository} />
                <RepositoryQuestions
                  answers={answers}
                  onAnswer={(questionId, value) =>
                    setAnswers((current) => ({ ...current, [questionId]: value }))
                  }
                  questions={questions}
                />
                <button disabled={recommendationState === "loading"} onClick={() => void submitRecommendation()} type="button">
                  {recommendationState === "loading" ? <LoaderCircle className={styles.spin} size={16} /> : <Search size={16} />}
                  템플릿 추천
                </button>
              </section>
            ) : null}

            {activeRecommendation ? (
              <RepositoryTemplateCandidates
                actionState={actionState}
                onCreateBoard={(templateId) => void createConnectedRepositoryBoard(templateId)}
                recommendation={activeRecommendation}
              />
            ) : null}

            {previewDiagram ? (
              <section className={styles.previewPanel} aria-label="저장소 분석 아키텍처 미리보기">
                <div>
                  <span>아키텍처 미리보기</span>
                  <strong>
                    {activeRepository.analysis?.aiHandoff.status === "template_selected"
                      ? activeRepository.analysis.aiHandoff.selectionReasons.join(" / ")
                      : "분석 근거로 하나의 템플릿을 선택하지 못했습니다."}
                  </strong>
                </div>
                <AiDraftBoardPreview diagram={previewDiagram} />
              </section>
            ) : null}
          </section>
        ) : null}

        {errorMessage && (publicAnalysisState !== "error" || pendingAnalysisRecord) ? (
          <ProductState
            action={pendingAnalysisRecord ? (
              <button
                disabled={actionState === "loading"}
                onClick={() => void retryRepositoryAnalysisRecord()}
                type="button"
              >
                Repository 정보 저장 재시도
              </button>
            ) : undefined}
            compact
            description={errorMessage}
            kind="error"
            title="작업 실패"
          />
        ) : null}
      </section>
    </main>
  );
}

function RepositoryAnalysisRecovery({
  action,
  errorMessage,
  isBusy,
  onAddPermission,
  onAnalyzeConnected,
  onConnect,
  onConnectGitHub,
  onRetry,
  onVerifyPermission,
  title = "Repository를 확인할 수 없습니다"
}: {
  readonly action: RepositoryRecoveryAction;
  readonly errorMessage: string;
  readonly isBusy: boolean;
  readonly onAddPermission: (managementUrl: string) => void;
  readonly onAnalyzeConnected: () => void;
  readonly onConnect: (candidate: GitHubInstalledRepositoryCandidate) => void;
  readonly onConnectGitHub: () => void;
  readonly onRetry: () => void;
  readonly onVerifyPermission: () => void;
  readonly title?: string;
}) {
  let guidance = "URL과 branch를 확인한 뒤 다시 분석해주세요.";
  let primaryAction: ReactNode = (
    <button disabled={isBusy} onClick={onRetry} type="button">다시 분석</button>
  );

  if (action.kind === "connect_github") {
    guidance = "비공개 Repository라면 GitHub를 연결한 뒤 정확한 Repository 권한을 확인합니다.";
    primaryAction = (
      <button disabled={isBusy} onClick={onConnectGitHub} type="button">GitHub 연결하기</button>
    );
  } else if (action.kind === "add_repository_permission") {
    guidance = "GitHub에서 권한을 추가한 뒤 이 화면으로 돌아오면 자동으로 다시 확인합니다.";
    primaryAction = (
      <div className={styles.actions}>
        <button
          disabled={isBusy}
          onClick={() => onAddPermission(action.managementUrl)}
          type="button"
        >
          Repository 권한 추가
        </button>
        <button disabled={isBusy} onClick={onVerifyPermission} type="button">권한 다시 확인</button>
      </div>
    );
  } else if (action.kind === "connect_exact_repository") {
    guidance = "GitHub App이 입력한 Repository에 접근할 수 있습니다. 프로젝트에 명시적으로 연결한 뒤 분석합니다.";
    primaryAction = (
      <button disabled={isBusy} onClick={() => onConnect(action.candidate)} type="button">
        이 Repository 연결하고 분석
      </button>
    );
  } else if (action.kind === "analyze_connected_repository") {
    guidance = "프로젝트에 연결된 Repository와 입력한 URL이 일치합니다.";
    primaryAction = (
      <button disabled={isBusy} onClick={onAnalyzeConnected} type="button">연결된 Repository 분석</button>
    );
  } else if (action.kind === "resolve_multiple_installations") {
    guidance = "여러 GitHub installation 중 하나를 임의로 선택하지 않습니다. 환경설정에서 연결을 정리한 뒤 다시 확인해주세요.";
    primaryAction = (
      <button disabled={isBusy} onClick={onVerifyPermission} type="button">연결 상태 다시 확인</button>
    );
  }

  return (
    <ProductState
      action={primaryAction}
      description={`${errorMessage} ${guidance}`.trim()}
      kind={errorMessage ? "error" : "empty"}
      title={title}
    />
  );
}

function RepositoryQuestions({
  answers,
  onAnswer,
  questions
}: {
  readonly answers: Record<string, string | boolean>;
  readonly onAnswer: (questionId: string, value: string | boolean) => void;
  readonly questions: readonly RepositoryQuestionView[];
}) {
  if (questions.length === 0) return null;

  return (
    <section className={styles.questionSection} aria-label="추가 질문">
      <div className={styles.questionSectionHeader}>
        <strong>추가 질문</strong>
      </div>
      <div className={styles.questionList}>
        {questions.map((question) => (
          <fieldset className={styles.questionField} key={question.id}>
            <legend>{question.prompt}</legend>
            {question.answerType === "boolean" || question.answerType === "single_select" ? (
              <span className={styles.questionChoices} role="radiogroup" aria-label={question.prompt}>
                {(question.answerType === "boolean"
                  ? [
                      { label: "예", value: "true" },
                      { label: "아니요", value: "false" }
                    ]
                  : question.options ?? []
                ).map((option) => {
                  const selected = String(answers[question.id] ?? "") === option.value;

                  return (
                    <button
                      aria-checked={selected}
                      className={selected
                        ? `${styles.questionChoice} ${styles.questionChoiceSelected}`
                        : styles.questionChoice}
                      key={option.value}
                      onClick={() => onAnswer(
                        question.id,
                        question.answerType === "boolean" ? option.value === "true" : option.value
                      )}
                      role="radio"
                      type="button"
                    >
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </span>
            ) : (
              <input
                aria-label={question.prompt}
                value={String(answers[question.id] ?? "")}
                onChange={(event) => onAnswer(question.id, event.target.value)}
                type="text"
              />
            )}
          </fieldset>
        ))}
      </div>
    </section>
  );
}

function RepositoryCiCdConnectedState({ repository }: { readonly repository: SourceRepository }) {
  return (
    <section className={styles.ciCdSection} aria-label="CI/CD 연결">
      <ProductState
        compact
        description={`${repository.owner}/${repository.name} · ${repository.defaultBranch}`}
        kind="success"
        title="CI/CD 연결 완료"
      />
    </section>
  );
}

function RepositoryTemplateCandidates({
  actionState,
  onCreateBoard,
  recommendation,
}: {
  readonly actionState: RequestState;
  readonly onCreateBoard: (templateId: PublicRepositoryTemplateId) => void;
  readonly recommendation: RepositoryTemplateRecommendationResult;
}) {
  const isBusy = actionState === "loading";

  return (
    <section className={styles.recommendationPanel} aria-label="템플릿 후보">
      {recommendation.candidates.map((candidate) => (
        <article key={candidate.templateId}>
          <div>
            <span>{Math.round(candidate.confidence * 100)}% 일치</span>
            <strong>{candidate.displayTitle}</strong>
            <p>{candidate.reasons.join(" ")}</p>
            <small>{candidate.tradeoffs.join(" ")}</small>
          </div>
          <button
            className={styles.boardAction}
            disabled={isBusy}
            onClick={() => onCreateBoard(candidate.templateId)}
            type="button"
          >
            {isBusy ? <LoaderCircle className={styles.spin} size={16} /> : null}
            AI로 보드 생성
          </button>
        </article>
      ))}
    </section>
  );
}

function PublicRepositoryRecommendationStep({
  aiDesignHref,
  answers,
  analysis,
  deploymentType,
  isBusy,
  onAnswer,
  onConfirmConfiguration,
  onCreateBoard,
  onDeploymentTypeChange,
  onEditConfiguration,
  onSelectTemplate,
  selectedTemplateId,
  stage
}: {
  readonly aiDesignHref: string;
  readonly answers: Record<string, string | boolean>;
  readonly analysis: SourceRepositoryAnalysisResult;
  readonly deploymentType: RepositoryDeploymentType;
  readonly isBusy: boolean;
  readonly onAnswer: (questionId: string, value: string | boolean) => void;
  readonly onConfirmConfiguration: () => void;
  readonly onCreateBoard: () => void;
  readonly onDeploymentTypeChange: (deploymentType: RepositoryDeploymentType) => void;
  readonly onEditConfiguration: () => void;
  readonly onSelectTemplate: (templateId: PublicRepositoryTemplateId) => void;
  readonly selectedTemplateId: PublicRepositoryTemplateId | null;
  readonly stage: PublicRecommendationStage;
}) {
  const recommendation = createPublicRepositoryRecommendation({
    analysis,
    answers,
    deploymentType,
    selectedTemplateId
  });
  const shouldAskDeploymentType = shouldAskPublicRepositoryDeploymentType(analysis);
  const selectedCandidate = recommendation.candidates.find(
    (candidate) => candidate.templateId === selectedTemplateId
  ) ?? recommendation.candidates[0];

  if (stage === "questions") {
    return (
      <section className={styles.publicAnalysisResult} aria-label="public 저장소 추가 질문">
        <div className={styles.publicQuestionSummary}>
          <button
            aria-label="템플릿 선택으로 돌아가기"
            className={styles.publicBackAction}
            onClick={onEditConfiguration}
            title="템플릿 선택으로 돌아가기"
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={16} />
          </button>
          <div>
            <span>선택한 템플릿</span>
            <strong>{selectedCandidate?.displayTitle ?? "추천 템플릿"}</strong>
          </div>
        </div>
        <RepositoryQuestions answers={answers} onAnswer={onAnswer} questions={recommendation.questions} />
        <button
          className={styles.publicBoardAction}
          disabled={isBusy || !analysis.recommendedTemplateId}
          onClick={onCreateBoard}
          type="button"
        >
          {isBusy ? <LoaderCircle className={styles.spin} size={16} /> : <Search size={16} />}
          보드 생성
        </button>
      </section>
    );
  }

  return (
    <section className={styles.publicAnalysisResult} aria-label="public 저장소 추천">
      <div className={styles.publicRecommendationHeader}>
        <div>
          <span>추천 템플릿 후보</span>
          <strong>저장소 구조와 운영 조건에 가까운 순서입니다.</strong>
        </div>
        <p>{recommendation.candidates.length}개 후보 중 하나를 선택하세요.</p>
      </div>
      {recommendation.candidates.length > 0 ? (
        <div className={styles.publicCandidateList} role="radiogroup" aria-label="추천 템플릿 후보">
          {recommendation.candidates.map((candidate, index) => {
            const selected = selectedCandidate?.templateId === candidate.templateId;

            return (
              <button
                aria-checked={selected}
                className={selected ? `${styles.publicCandidate} ${styles.publicCandidateSelected}` : styles.publicCandidate}
                key={candidate.templateId}
                onClick={() => onSelectTemplate(candidate.templateId)}
                role="radio"
                type="button"
              >
                <span className={styles.publicCandidateRank}>{index + 1}</span>
                <span className={styles.publicCandidateBody}>
                  <span className={styles.publicCandidateHeading}>
                    <strong>{candidate.displayTitle}</strong>
                    <span>{Math.round(candidate.confidence * 100)}% 적합</span>
                  </span>
                  <span className={styles.publicCandidateDetail}>
                    <span>
                      <b>추천 이유</b>
                      <span>{candidate.reasons.join(" ")}</span>
                    </span>
                    <span>
                      <b>고려할 점</b>
                      <span>{candidate.tradeoffs.join(" ")}</span>
                    </span>
                  </span>
                </span>
                <span className={styles.publicCandidateCheck} aria-hidden="true">
                  {selected ? <Check size={16} strokeWidth={2.5} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      {shouldAskDeploymentType ? (
        <label>
          <span>원하는 배포 방식</span>
          <select
            value={deploymentType}
            onChange={(event) => onDeploymentTypeChange(event.target.value as RepositoryDeploymentType)}
          >
            <option value="ec2_vm">EC2/VM 기반</option>
            <option value="container">컨테이너 기반</option>
            <option value="serverless">서버리스 기반</option>
          </select>
        </label>
      ) : null}
      <button
        className={styles.publicBoardAction}
        disabled={!selectedCandidate}
        onClick={onConfirmConfiguration}
        type="button"
      >
        확인 <ArrowRight aria-hidden="true" size={16} />
      </button>
      <Link className={styles.publicAiFallbackAction} href={aiDesignHref}>
        <Sparkles aria-hidden="true" size={16} />
        원하는 구성이 없나요? AI로 새 설계 만들기
      </Link>
    </section>
  );
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

function createConnectedRepositoryArchitectureDraftRequest({
  projectId,
  repository,
  templateId
}: {
  readonly projectId: string;
  readonly repository: SourceRepository;
  readonly templateId: TemplateId;
}): CreateArchitectureDraftRequest {
  const analysis = repository.analysis;
  const handoff = analysis?.aiHandoff;
  const architectureFacts = handoff?.architectureFacts ?? [];
  const architectureFactLines = architectureFacts.map((fact) =>
    `- ${fact.kind}: ${fact.value} (source: ${fact.sourcePath})`
  );
  const applicationUnitLines = (handoff?.applicationUnits ?? []).map((unit) =>
    `- ${unit.kind} at ${unit.rootPath || "."}; frameworks: ${unit.frameworks.join(", ") || "unknown"}`
  );
  const evidenceLines = (handoff?.evidence ?? []).map((evidence) =>
    `- ${evidence.kind}: ${evidence.path}; signals: ${evidence.signals.join(", ") || "none"}`
  );
  const repositoryName = repository.repositoryUrl ?? `${repository.owner}/${repository.name}`;

  return {
    templateId,
    ...(architectureFacts.length > 0
      ? {
          repositoryEvidence: {
            mode: "strict" as const,
            facts: architectureFacts,
            repositoryName
          }
        }
      : {}),
    repositoryAnalysis: {
      projectId,
      sourceRepositoryId: repository.id
    },
    prompt: [
      "Generate a production-quality Practice Architecture for this connected source repository.",
      "Priority rules:",
      "1. The selected Template is the highest-priority constraint. Keep its core service and deployment model.",
      "2. Use Repository Analysis evidence to refine runtime boundaries and resource connections without replacing the selected Template.",
      "3. Rebuild the final Board through the Architecture Draft conversion path so AI diagram layout and resource rules apply.",
      `Selected Template: ${templateId}.`,
      `Repository: ${repositoryName} at ${repository.defaultBranch}.`,
      `Repository revision: ${analysis?.repositoryRevision ?? "unknown"}.`,
      "Detected application units:",
      ...(applicationUnitLines.length > 0 ? applicationUnitLines : ["- none"]),
      "Repository evidence:",
      ...(evidenceLines.length > 0 ? evidenceLines : ["- none"]),
      "Repository architecture facts (authoritative; do not replace with generic production assumptions):",
      ...(architectureFactLines.length > 0 ? architectureFactLines : ["- none"]),
      "Required Components:",
      `- Preserve every core resource and relationship from ${templateId}.`,
      "- Add only the supporting resources required by Repository Analysis.",
      "Architecture Flow:",
      "- Keep the selected Template traffic and deployment flow, then connect repository-driven resources to the appropriate workload.",
      "Validation Checklist:",
      "- The selected Template core remains visible and connected.",
      "- Every repository architecture fact is reflected or documented as a Template conflict assumption.",
      "Generate a connected, readable diagram with only supported resource types. Avoid unrelated resources and duplicate nodes."
    ].join("\n")
  };
}
