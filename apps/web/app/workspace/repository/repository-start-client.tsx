"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DiagramJson,
  GitHubAppAvailability,
  GitHubInstallationConnection,
  GitHubInstalledRepositoryCandidate,
  RepositoryAnalysisQuestion,
  RepositoryDeploymentType,
  RepositoryTemplateRecommendationResult,
  SaveRepositoryAnalysisRecordRequest,
  SourceRepository,
  SourceRepositoryAnalysisResult
} from "@sketchcatch/types";
import { getApiErrorMessage } from "../../../lib/api-client";
import {
  analyzePublicSourceRepository,
  analyzeSourceRepository,
  connectGitHubSourceRepository,
  createGitHubSourceRepositoryInstallUrl,
  getProjectDraft,
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
  createPublicRepositoryRecommendation,
  getPublicRepositoryDeploymentDefault,
  localizePublicRepositoryQuestion,
  shouldAskPublicRepositoryDeploymentType,
  type PublicRepositoryTemplateId
} from "../../../features/workspace/public-repository-recommendation";
import { createWorkspaceAiStartHref } from "../../../features/workspace/workspace-ai-start-entry";
import { getRepositoryDraftBlockingIssue } from "./repository-draft-readiness";
import {
  createConnectedRepositoryAnalysisResult,
  createRepositoryAnalysisRecordPayload
} from "./repository-analysis-record-payload";
import { getRepositoryRequiredRuntimeSecrets } from "../../../features/workspace/repository-template-handoff";
import { ProductBrand } from "../../../components/ui/ProductBrand";
import {
  selectRepositoryRecoveryAction,
  type RepositoryRecoveryAction
} from "./repository-recovery-action";
import {
  consumeRepositoryAnalysisResume,
  createRepositoryAnalysisResumeKey,
  writeRepositoryAnalysisResume
} from "./repository-analysis-resume";
import {
  RepositoryAnalysisForm,
  RepositoryAnalysisResult,
  RepositoryAnalysisSummary
} from "./repository-analysis-screen";
import styles from "./repository-analysis-screen.module.css";

type RequestState = "idle" | "loading" | "error";
type PublicAnalysisState =
  | "idle"
  | "loading"
  | "repository_error"
  | "architecture_error";
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
  const [githubAppAvailability, setGitHubAppAvailability] =
    useState<GitHubAppAvailability | null>(null);
  const [projectDraftRevision, setProjectDraftRevision] = useState<number | null | undefined>(
    undefined
  );
  const [candidates, setCandidates] = useState<GitHubInstalledRepositoryCandidate[]>([]);
  const [installationState, setInstallationState] = useState("");
  const [actionState, setActionState] = useState<RequestState>("idle");
  const [publicAnalysisState, setPublicAnalysisState] =
    useState<PublicAnalysisState>("idle");
  const [repositoryUrl, setRepositoryUrl] = useState(initialRepositoryUrl);
  const [defaultBranch, setDefaultBranch] = useState(initialDefaultBranch);
  const [publicAnalysis, setPublicAnalysis] = useState<SourceRepositoryAnalysisResult | null>(null);
  const [recommendationState, setRecommendationState] = useState<RequestState>("idle");
  const [deploymentType, setDeploymentType] = useState<RepositoryDeploymentType>("serverless");
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [selectedPublicTemplateId, setSelectedPublicTemplateId] =
    useState<PublicRepositoryTemplateId | null>(null);
  const [isEditingPublicAnalysis, setIsEditingPublicAnalysis] = useState(false);
  const [publicRecommendationStage, setPublicRecommendationStage] =
    useState<PublicRecommendationStage>("configuration");
  const [recommendation, setRecommendation] =
    useState<RepositoryTemplateRecommendationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingAnalysisRecord, setPendingAnalysisRecord] = useState<
    SaveRepositoryAnalysisRecordRequest | null
  >(null);
  const [restoredProjectName, setRestoredProjectName] = useState("");
  const effectiveProjectName = restoredProjectName || projectName;
  const activeRepository = useMemo(() => findActiveGitHubRepository(repositories), [repositories]);
  const activeHandoff = activeRepository?.analysis?.aiHandoff;
  const questions =
    activeHandoff?.questions?.map(localizePublicRepositoryQuestion).slice(0, 5) ?? [];
  const activeRecommendation = recommendation ?? activeHandoff?.recommendation ?? null;
  const isPublicAnalysisBusy = publicAnalysisState === "loading";
  const showUrlAnalysis = Boolean(
    projectId && (!activeRepository || publicAnalysis || isEditingPublicAnalysis)
  );
  const publicRecommendation = publicAnalysis
    ? createPublicRepositoryRecommendation({
        analysis: publicAnalysis,
        answers,
        deploymentType,
        selectedTemplateId: selectedPublicTemplateId
      })
    : null;
  const selectedPublicCandidate = publicRecommendation?.candidates.find(
    (candidate) => candidate.templateId === selectedPublicTemplateId
  );
  const aiDesignHref = createWorkspaceAiStartHref({
    projectId,
    projectName: effectiveProjectName
  });
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
    if (publicAnalysisState !== "repository_error") return;
    const recheckPermissions = () => void loadCandidates();
    window.addEventListener("focus", recheckPermissions);
    return () => window.removeEventListener("focus", recheckPermissions);
  }, [publicAnalysisState]);

  async function loadRepositories(): Promise<void> {
    setErrorMessage("");

    try {
      const [loadedRepositories, projectDraftResponse] = await Promise.all([
        listSourceRepositories(projectId),
        getProjectDraft(projectId)
      ]);
      const active = findActiveGitHubRepository(loadedRepositories);
      const handoff = active?.analysis?.aiHandoff;
      let nextRecommendation = handoff?.recommendation ?? null;

      setRepositories(loadedRepositories);
      setProjectDraftRevision(projectDraftResponse.draft?.revision ?? null);

      if (initialResumeKey && !hasRestoredRepositoryAnalysis.current) {
        hasRestoredRepositoryAnalysis.current = true;

        if (!active) {
          setErrorMessage("연결된 Repository를 확인할 수 없어 이전 분석으로 돌아가지 못했습니다.");
        } else {
          const resume = consumeRepositoryAnalysisResume(window.sessionStorage, {
            resumeKey: initialResumeKey,
            projectId,
            repositoryUrl:
              active.repositoryUrl ?? `https://github.com/${active.owner}/${active.name}`
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
      const loadedInstallations = await listGitHubAccountInstallations();
      setInstallations(loadedInstallations.installations);
      setGitHubAppAvailability(loadedInstallations.availability);

      if (loadedInstallations.availability.installationRead !== "ready") {
        setCandidates([]);
        setInstallationState("");
        setActionState("idle");
        return;
      }

      const result = await listGitHubInstalledRepositories(projectId);
      setCandidates(result.repositories);
      setInstallationState(result.state);
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
      let availability = githubAppAvailability;
      if (!availability) {
        const response = await listGitHubAccountInstallations();
        setInstallations(response.installations);
        setGitHubAppAvailability(response.availability);
        availability = response.availability;
      }

      if (
        availability.installationRead !== "ready" ||
        availability.connectionSetup !== "ready"
      ) {
        setActionState("error");
        setErrorMessage(
          "GitHub App 서버 설정이 필요합니다. 설정이 완료된 뒤 다시 시도해 주세요."
        );
        return;
      }

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

  async function analyzePublicRepositoryUrl(
    nextRepositoryUrl: string,
    nextDefaultBranch: string
  ): Promise<void> {
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
      setIsEditingPublicAnalysis(false);
      setDefaultBranch(result.defaultBranch);
      const nextDeploymentType = getPublicRepositoryDeploymentDefault(result);
      setDeploymentType(nextDeploymentType);
      setSelectedPublicTemplateId(null);
      setPublicAnalysisState("idle");
    } catch (error) {
      setPublicAnalysisState("repository_error");
      setErrorMessage(
        getApiErrorMessage(
          error,
          "Repository를 확인할 수 없습니다. URL이 잘못되었거나 비공개 Repository일 수 있습니다."
        )
      );
      void loadCandidates();
    }
  }

  async function createPublicRepositoryBoard(
    templateId: PublicRepositoryTemplateId
  ): Promise<void> {
    if (!publicAnalysis || isPublicAnalysisBusy) return;

    const recommendation = createPublicRepositoryRecommendation({
      analysis: publicAnalysis,
      answers,
      deploymentType,
      selectedTemplateId: templateId
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
    setPublicAnalysisState("loading");
    setErrorMessage("");

    try {
      await saveTemplateBoard(templateId, publicAnalysis);
      setPublicAnalysisState("idle");
    } catch (error) {
      setPublicAnalysisState("architecture_error");
      setErrorMessage(
        error instanceof RepositoryAnalysisRecordPersistenceError
          ? "보드는 저장했지만 Repository 정보를 저장하지 못했습니다. 보드 생성을 다시 누르면 안전하게 재시도합니다."
          : getApiErrorMessage(error, "선택한 Fixed Template 보드를 생성하지 못했습니다. Template 구성을 확인해 주세요.")
      );
    }
  }

  async function createConnectedRepositoryBoard(
    templateId: PublicRepositoryTemplateId
  ): Promise<void> {
    if (!activeRepository?.analysis || actionState === "loading") return;

    setActionState("loading");
    setErrorMessage("");

    try {
      await saveTemplateBoard(
        templateId,
        createConnectedRepositoryAnalysisResult(activeRepository, templateId),
        activeRepository.analysis.analyzedAt
      );
      setActionState("idle");
    } catch (error) {
      setActionState("error");
      setErrorMessage(
        getApiErrorMessage(error, "선택한 Fixed Template 보드를 생성하지 못했습니다. Template 구성을 확인해 주세요.")
      );
    }
  }

  async function saveTemplateBoard(
    templateId: PublicRepositoryTemplateId,
    publicRepositoryAnalysis?: SourceRepositoryAnalysisResult,
    analyzedAt?: string
  ): Promise<void> {
    const requiredRuntimeSecrets = publicRepositoryAnalysis
      ? getRepositoryRequiredRuntimeSecrets(publicRepositoryAnalysis.aiHandoff)
      : [];
    const diagram = buildBoardTemplateDiagram(templateId, {
      projectSlug: effectiveProjectName,
      shortId: "repository",
      requiredRuntimeSecrets
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
    const response = await saveProjectDraft({
      diagramJson,
      expectedRevision: requireProjectDraftRevision(),
      projectId
    });
    setProjectDraftRevision(response.draft?.revision ?? null);

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

  function requireProjectDraftRevision(): number | null {
    if (projectDraftRevision === undefined) {
      throw new Error("PROJECT_DRAFT_REVISION_UNAVAILABLE");
    }

    return projectDraftRevision;
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

  function confirmPublicRecommendationConfiguration(
    templateId: PublicRepositoryTemplateId
  ): void {
    setSelectedPublicTemplateId(templateId);
    setAnswers({});
    setErrorMessage("");

    if (!publicAnalysis) return;
    const nextRecommendation = createPublicRepositoryRecommendation({
      analysis: publicAnalysis,
      answers: {},
      deploymentType,
      selectedTemplateId: templateId
    });

    if (nextRecommendation.questions.length === 0) {
      void createPublicRepositoryBoard(templateId);
      return;
    }

    setPublicRecommendationStage("questions");
  }

  function resetPublicRepositoryAnalysis(): void {
    setPublicAnalysis(null);
    setIsEditingPublicAnalysis(true);
    setDefaultBranch("");
    setAnswers({});
    setSelectedPublicTemplateId(null);
    setPublicRecommendationStage("configuration");
    setPublicAnalysisState("idle");
    setErrorMessage("");
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <ProductBrand />
        <Link className={styles.startModeLink} href="/workspace/new">
          시작 방식 다시 선택
        </Link>
      </header>
      <div className={styles.shell}>
        <header className={styles.pageHeading}>
          <h1 id="repository-start-title">GitHub 저장소</h1>
        </header>

        {showUrlAnalysis && !publicAnalysis &&
        publicRecommendationStage === "configuration" ? (
          <RepositoryAnalysisForm
            branch={defaultBranch}
            errorMessage={publicAnalysisState === "repository_error" ? "" : errorMessage}
            isBusy={isPublicAnalysisBusy}
            onBranchChange={setDefaultBranch}
            onRepositoryUrlChange={(nextRepositoryUrl) => {
              setRepositoryUrl(nextRepositoryUrl);
              setPublicAnalysis(null);
              setDefaultBranch("");
              setPublicAnalysisState("idle");
              setErrorMessage("");
            }}
            onSubmit={(event) => void analyzeRepositoryUrl(event)}
            repositoryUrl={repositoryUrl}
          />
        ) : null}

        {publicAnalysis &&
        publicRecommendation &&
        publicRecommendationStage === "configuration" ? (
          <RepositoryAnalysisResult
            aiDesignHref={aiDesignHref}
            analysis={publicAnalysis}
            candidates={publicRecommendation.candidates}
            isBusy={isPublicAnalysisBusy}
            onAnalyzeAnother={resetPublicRepositoryAnalysis}
            onUseTemplate={confirmPublicRecommendationConfiguration}
            resetKey={`${publicAnalysis.repositoryRevision}:${deploymentType}:${publicRecommendation.candidates
              .map((candidate) => candidate.templateId)
              .join(",")}`}
            statusLabel={isPublicAnalysisBusy ? "처리 중" : "분석 완료"}
            toolbar={
              shouldAskPublicRepositoryDeploymentType(publicAnalysis) ? (
                <label htmlFor="public-repository-deployment-type">
                  배포 방식
                  <select
                    id="public-repository-deployment-type"
                    disabled={isPublicAnalysisBusy}
                    name="deploymentType"
                    onChange={(event) => {
                      setDeploymentType(event.target.value as RepositoryDeploymentType);
                      setSelectedPublicTemplateId(null);
                      setAnswers({});
                    }}
                    value={deploymentType}
                  >
                    <option value="ec2_vm">EC2/VM 기반</option>
                    <option value="container">컨테이너 기반</option>
                    <option value="serverless">서버리스 기반</option>
                  </select>
                </label>
              ) : undefined
            }
          />
        ) : null}

        {publicAnalysis &&
        publicRecommendation &&
        publicRecommendationStage === "questions" ? (
          <section
            aria-labelledby="repository-questions-repository-title"
            className={styles.resultSection}
          >
            <RepositoryAnalysisSummary
              actionLabel="다른 저장소 분석"
              analysis={publicAnalysis}
              headingId="repository-questions-repository-title"
              isBusy={isPublicAnalysisBusy}
              onAction={resetPublicRepositoryAnalysis}
              statusLabel={isPublicAnalysisBusy ? "처리 중" : "분석 완료"}
            />
            <div className={styles.questionStepBody}>
              <h3>{selectedPublicCandidate?.displayTitle ?? "선택한 Template"}</h3>
              <RepositoryQuestions
                answers={answers}
                onAnswer={(questionId, value) => {
                  setAnswers((current) => ({ ...current, [questionId]: value }));
                  setErrorMessage("");
                }}
                questions={publicRecommendation.questions}
              />
              <div className={styles.panelActions}>
                <button
                  className={styles.secondaryButton}
                  disabled={isPublicAnalysisBusy}
                  onClick={() => {
                    setSelectedPublicTemplateId(null);
                    setAnswers({});
                    setPublicRecommendationStage("configuration");
                  }}
                  type="button"
                >
                  Template 다시 선택
                </button>
                <Link className={styles.aiAction} href={aiDesignHref}>
                  AI 새 설계
                </Link>
                <button
                  className={styles.primaryButton}
                  disabled={isPublicAnalysisBusy || !selectedPublicTemplateId}
                  onClick={() => {
                    if (selectedPublicTemplateId) {
                      void createPublicRepositoryBoard(selectedPublicTemplateId);
                    }
                  }}
                  type="button"
                >
                  {isPublicAnalysisBusy ? "생성 중" : "보드 생성"}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {publicAnalysisState === "architecture_error" && !pendingAnalysisRecord ? (
          <section
            aria-labelledby="repository-board-error-title"
            className={styles.errorPanel}
            role="alert"
          >
            <h2 id="repository-board-error-title">보드를 생성할 수 없습니다</h2>
            <p>{errorMessage}</p>
            <button
              className={styles.primaryButton}
              disabled={isPublicAnalysisBusy}
              onClick={() => {
                if (selectedPublicTemplateId) {
                  void createPublicRepositoryBoard(selectedPublicTemplateId);
                }
              }}
              type="button"
            >
              다시 생성
            </button>
          </section>
        ) : null}

        {publicAnalysisState === "repository_error" && !pendingAnalysisRecord ? (
          <RepositoryAnalysisRecovery
            action={recoveryAction}
            connectionSetupAvailability={githubAppAvailability?.connectionSetup}
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

        {activeRepository && !publicAnalysis ? (
          !isEditingPublicAnalysis ? (
            activeRecommendation ? (
              <>
                <RepositoryAnalysisResult
                  aiDesignHref={aiDesignHref}
                  analysis={activeRepository}
                  analyzeAnotherLabel="저장소 다시 분석"
                  candidates={activeRecommendation.candidates}
                  isBusy={
                    actionState === "loading" || recommendationState === "loading"
                  }
                  onAnalyzeAnother={() => void analyzeRepository()}
                  onUseTemplate={(templateId) =>
                    void createConnectedRepositoryBoard(templateId)
                  }
                  resetKey={`${activeRepository.analysis?.repositoryRevision ?? "pending"}:${activeRepository.analysis?.analyzedAt ?? "not-analyzed"}:${deploymentType}:${activeRecommendation.candidates
                    .map((candidate) => candidate.templateId)
                    .join(",")}`}
                  statusLabel={actionState === "loading" ? "처리 중" : "분석 완료"}
                />
                {activeHandoff ? (
                  <section
                    aria-labelledby="repository-recommendation-settings-title"
                    className={styles.secondarySettingsPanel}
                  >
                    <h2 id="repository-recommendation-settings-title">추천 설정</h2>
                    <div className={styles.settingsFields}>
                      <label htmlFor="repository-deployment-type">
                        배포 방식
                        <select
                          id="repository-deployment-type"
                          name="deploymentType"
                          onChange={(event) =>
                            setDeploymentType(event.target.value as RepositoryDeploymentType)
                          }
                          value={deploymentType}
                        >
                          <option value="ec2_vm">EC2/VM 기반</option>
                          <option value="container">컨테이너 기반</option>
                          <option value="serverless">서버리스 기반</option>
                        </select>
                      </label>
                      <RepositoryQuestions
                        answers={answers}
                        onAnswer={(questionId, value) =>
                          setAnswers((current) => ({ ...current, [questionId]: value }))
                        }
                        questions={questions}
                      />
                      <button
                        className={`${styles.secondaryButton} ${styles.refreshRecommendationButton}`}
                        disabled={recommendationState === "loading"}
                        onClick={() => void submitRecommendation()}
                        type="button"
                      >
                        {recommendationState === "loading" ? "추천 중" : "추천 갱신"}
                      </button>
                    </div>
                  </section>
                ) : null}
              </>
            ) : (
              <section
                aria-labelledby="connected-repository-title"
                className={styles.connectedPrompt}
              >
                <h2 id="connected-repository-title">
                  {activeRepository.owner}/{activeRepository.name}
                </h2>
                <p>{activeRepository.defaultBranch}</p>
                <button
                  className={styles.primaryButton}
                  disabled={actionState === "loading"}
                  onClick={() => void analyzeRepository()}
                  type="button"
                >
                  {actionState === "loading" ? "분석 중" : "저장소 분석"}
                </button>
                {actionState === "loading" ? (
                  <p aria-live="polite" role="status">
                    분석 중입니다.
                  </p>
                ) : null}
              </section>
            )
          ) : null
        ) : null}

        {errorMessage && (
          (publicAnalysisState !== "repository_error" &&
            publicAnalysisState !== "architecture_error") ||
          pendingAnalysisRecord
        ) ? (
          <section
            aria-labelledby="repository-analysis-error-title"
            className={styles.errorPanel}
            role="alert"
          >
            <h2 id="repository-analysis-error-title">작업 실패</h2>
            <p>{errorMessage}</p>
            {pendingAnalysisRecord ? (
              <button
                className={styles.primaryButton}
                disabled={actionState === "loading"}
                onClick={() => void retryRepositoryAnalysisRecord()}
                type="button"
              >
                Repository 정보 저장 재시도
              </button>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}

function RepositoryAnalysisRecovery({
  action,
  connectionSetupAvailability,
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
  readonly connectionSetupAvailability: GitHubAppAvailability["connectionSetup"] | undefined;
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
    <button
      className={styles.primaryButton}
      disabled={isBusy}
      onClick={onRetry}
      type="button"
    >
      다시 분석
    </button>
  );

  if (action.kind === "connect_github") {
    if (connectionSetupAvailability === "not_configured") {
      guidance = "GitHub App 서버 설정이 필요합니다. 설정이 완료된 뒤 다시 확인해 주세요.";
      primaryAction = null;
    } else {
      guidance = "비공개 Repository라면 GitHub를 연결한 뒤 정확한 Repository 권한을 확인합니다.";
      primaryAction = (
        <button
          className={styles.primaryButton}
          disabled={isBusy}
          onClick={onConnectGitHub}
          type="button"
        >
          GitHub 연결하기
        </button>
      );
    }
  } else if (action.kind === "add_repository_permission") {
    guidance = "GitHub에서 권한을 추가한 뒤 이 화면으로 돌아오면 자동으로 다시 확인합니다.";
    primaryAction = (
      <>
        <button
          className={styles.primaryButton}
          disabled={isBusy}
          onClick={() => onAddPermission(action.managementUrl)}
          type="button"
        >
          Repository 권한 추가
        </button>
        <button
          className={styles.secondaryButton}
          disabled={isBusy}
          onClick={onVerifyPermission}
          type="button"
        >
          권한 다시 확인
        </button>
      </>
    );
  } else if (action.kind === "connect_exact_repository") {
    guidance = "GitHub App이 입력한 Repository에 접근할 수 있습니다. 프로젝트에 명시적으로 연결한 뒤 분석합니다.";
    primaryAction = (
      <button
        className={styles.primaryButton}
        disabled={isBusy}
        onClick={() => onConnect(action.candidate)}
        type="button"
      >
        이 Repository 연결하고 분석
      </button>
    );
  } else if (action.kind === "analyze_connected_repository") {
    guidance = "프로젝트에 연결된 Repository와 입력한 URL이 일치합니다.";
    primaryAction = (
      <button
        className={styles.primaryButton}
        disabled={isBusy}
        onClick={onAnalyzeConnected}
        type="button"
      >
        연결된 Repository 분석
      </button>
    );
  } else if (action.kind === "resolve_multiple_installations") {
    guidance = "여러 GitHub installation 중 하나를 임의로 선택하지 않습니다. 환경설정에서 연결을 정리한 뒤 다시 확인해주세요.";
    primaryAction = (
      <button
        className={styles.primaryButton}
        disabled={isBusy}
        onClick={onVerifyPermission}
        type="button"
      >
        연결 상태 다시 확인
      </button>
    );
  }

  return (
    <section
      aria-labelledby="repository-recovery-title"
      className={styles.errorPanel}
      role="alert"
    >
      <h2 id="repository-recovery-title">{title}</h2>
      <p>{`${errorMessage} ${guidance}`.trim()}</p>
      <div className={styles.panelActions}>{primaryAction}</div>
    </section>
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
    <section aria-labelledby="repository-questions-title" className={styles.questionList}>
      <h3 id="repository-questions-title">추가 질문</h3>
      {questions.map((question) => (
        <fieldset className={styles.questionField} key={question.id}>
          <legend>{question.prompt}</legend>
          {question.answerType === "boolean" || question.answerType === "single_select" ? (
            (question.answerType === "boolean"
              ? [
                  { label: "예", value: "true" },
                  { label: "아니요", value: "false" }
                ]
              : (question.options ?? [])
            ).map((option) => {
              const id = `repository-question-${question.id}-${option.value}`;
              const selected = String(answers[question.id] ?? "") === option.value;

              return (
                <label className={styles.questionOption} htmlFor={id} key={option.value}>
                  <input
                    checked={selected}
                    id={id}
                    name={`repository-question-${question.id}`}
                    onChange={() =>
                      onAnswer(
                        question.id,
                        question.answerType === "boolean" ? option.value === "true" : option.value
                      )
                    }
                    type="radio"
                    value={option.value}
                  />
                  {option.label}
                </label>
              );
            })
          ) : (
            <>
              <label htmlFor={`repository-question-${question.id}`}>답변</label>
              <input
                id={`repository-question-${question.id}`}
                name={`repository-question-${question.id}`}
                onChange={(event) => onAnswer(question.id, event.target.value)}
                type="text"
                value={String(answers[question.id] ?? "")}
              />
            </>
          )}
        </fieldset>
      ))}
    </section>
  );
}
