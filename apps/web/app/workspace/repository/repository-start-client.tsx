"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, GitBranch, LoaderCircle, Search, Settings2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  createAiArchitectureDraft,
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
import {
  createPublicRepositoryArchitectureDraftRequest,
  createPublicRepositoryRecommendation,
  getPublicRepositoryDeploymentDefault,
  getPublicRepositoryTemplateDeploymentType,
  shouldAskPublicRepositoryDeploymentType,
  type PublicRepositoryTemplateId
} from "../../../features/workspace/public-repository-recommendation";
import { getDiagramJsonForArchitectureDraft } from "../../../features/workspace/workspace-ai-diagram-adapter";
import { AiDraftBoardPreview } from "../ai/ai-draft-board-preview";
import styles from "./repository-start.module.css";

type RequestState = "idle" | "loading" | "error";
type PublicRecommendationStage = "configuration" | "questions";
type RepositoryQuestionView = Pick<
  RepositoryAnalysisQuestion,
  "answerType" | "id" | "options" | "prompt"
>;

type RepositoryStartClientProps = {
  readonly initialDefaultBranch?: string;
  readonly initialRepositoryUrl?: string;
  readonly projectId: string;
  readonly projectName: string;
};

export function RepositoryStartClient({
  initialDefaultBranch = "main",
  initialRepositoryUrl = "",
  projectId,
  projectName
}: RepositoryStartClientProps) {
  const router = useRouter();
  const hasAutoAnalyzedPublicUrl = useRef(false);
  const [repositories, setRepositories] = useState<SourceRepository[]>([]);
  const [candidates, setCandidates] = useState<GitHubInstalledRepositoryCandidate[]>([]);
  const [installationState, setInstallationState] = useState("");
  const [loadState, setLoadState] = useState<RequestState>("loading");
  const [actionState, setActionState] = useState<RequestState>("idle");
  const [publicAnalysisState, setPublicAnalysisState] = useState<RequestState>("idle");
  const [repositoryUrl, setRepositoryUrl] = useState(initialRepositoryUrl);
  const [defaultBranch, setDefaultBranch] = useState(initialDefaultBranch);
  const [publicAnalysis, setPublicAnalysis] = useState<SourceRepositoryAnalysisResult | null>(null);
  const [repositoryConnectionError, setRepositoryConnectionError] = useState("");
  const [recommendationState, setRecommendationState] = useState<RequestState>("idle");
  const [deploymentType, setDeploymentType] = useState<RepositoryDeploymentType>("serverless");
  const [usesCiCd, setUsesCiCd] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [selectedPublicTemplateId, setSelectedPublicTemplateId] = useState<PublicRepositoryTemplateId | null>(null);
  const [publicRecommendationStage, setPublicRecommendationStage] = useState<PublicRecommendationStage>("configuration");
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
      setErrorMessage("프로젝트 정보가 없습니다. 새 프로젝트 화면에서 다시 시작해주세요.");
      return;
    }

    void loadRepositories();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !initialRepositoryUrl.trim() || hasAutoAnalyzedPublicUrl.current) {
      return;
    }

    hasAutoAnalyzedPublicUrl.current = true;
    void analyzePublicRepositoryUrl(initialRepositoryUrl, initialDefaultBranch);
  }, [initialDefaultBranch, initialRepositoryUrl, projectId]);

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
      setRepositoryConnectionError(getApiErrorMessage(error, "저장소 연결 상태를 불러오지 못했습니다."));
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
      setErrorMessage(getApiErrorMessage(error, "연결 가능한 저장소를 불러오지 못했습니다."));
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
    setUsesCiCd(false);
    setErrorMessage("");

    try {
      const result = await analyzePublicSourceRepository({
        repositoryUrl: trimmedRepositoryUrl,
        ...(trimmedDefaultBranch ? { defaultBranch: trimmedDefaultBranch } : {})
      });
      setPublicAnalysis(result);
      const nextDeploymentType = getPublicRepositoryDeploymentDefault(result);
      setDeploymentType(nextDeploymentType);
      setUsesCiCd(result.aiHandoff?.usesCiCdDefault ?? false);
      setSelectedPublicTemplateId(
        createPublicRepositoryRecommendation({
          analysis: result,
          answers: {},
          deploymentType: nextDeploymentType
        }).candidates[0]?.templateId ?? null
      );
      setPublicAnalysisState("idle");
    } catch (error) {
      setPublicAnalysisState("error");
      setErrorMessage(
        getApiErrorMessage(
          error,
          "저장소 URL을 분석하지 못했습니다. 비공개 저장소는 프로젝트 환경설정에서 GitHub 권한 연결이 필요합니다."
        )
      );
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
    if (!recommendation.questions.every((question) => hasRepositoryQuestionAnswer(answers[question.id]))) {
      setErrorMessage("모든 추가 질문에 답한 뒤 보드를 생성해주세요.");
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
      const draft = await createAiArchitectureDraft(
        createPublicRepositoryArchitectureDraftRequest({
          analysis: publicAnalysis,
          answers,
          deploymentType: effectiveDeploymentType,
          templateId,
          usesCiCd
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
      await saveProjectDraft({ diagramJson: diagram, projectId });
      setPublicAnalysisState("idle");
      router.push(
        `/workspace?${new URLSearchParams({
          projectId,
          projectName
        }).toString()}`
      );
    } catch (error) {
      setPublicAnalysisState("error");
      setErrorMessage(getApiErrorMessage(error, "Amazon Q로 저장소 다이어그램을 생성하지 못했습니다."));
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
      setUsesCiCd(result.aiHandoff.usesCiCdDefault ?? false);
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
        usesCiCd,
        answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value }))
      });
      setRecommendation(result.recommendation);
      setRecommendationState("idle");
    } catch (error) {
      setRecommendationState("error");
      setErrorMessage(getApiErrorMessage(error, "템플릿 후보를 추천하지 못했습니다."));
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <ProductBrand />
        <Link href="/workspace/new">시작 방식 다시 선택</Link>
      </header>

      <section className={styles.content} aria-labelledby="repository-start-title">
        <header className={styles.heading}>
          <span>GitHub 저장소</span>
          <h1 id="repository-start-title">코드 근거로 시작하기</h1>
          <p>{projectName}</p>
        </header>

        {showUrlAnalysis ? (
          <section className={styles.publicUrlPanel}>
            {publicRecommendationStage === "configuration" ? (
              <>
                <GitBranch aria-hidden="true" size={24} />
                <h2>GitHub 저장소 URL 분석</h2>
                <form className={styles.publicUrlForm} onSubmit={(event) => void analyzeRepositoryUrl(event)}>
                  <label>
                    <span>저장소 URL</span>
                    <input
                      onChange={(event) => setRepositoryUrl(event.target.value)}
                      placeholder="https://github.com/owner/repository"
                      type="url"
                      value={repositoryUrl}
                    />
                  </label>
                  <label>
                    <span>브랜치</span>
                    <input
                      onChange={(event) => setDefaultBranch(event.target.value)}
                      placeholder="main"
                      type="text"
                      value={defaultBranch}
                    />
                  </label>
                  <button disabled={isPublicAnalysisBusy || !repositoryUrl.trim()} type="submit">
                    {isPublicAnalysisBusy ? <LoaderCircle className={styles.spin} size={16} /> : <Search size={16} />}
                    {isPublicAnalysisBusy ? "분석 중" : "URL 분석"}
                  </button>
                </form>
                <p className={styles.inlineHint}>
                  공개 저장소는 GitHub 계정 연결 없이 분석합니다. 비공개 저장소, PR 생성, CI/CD 인계는 프로젝트 환경설정의 GitHub 권한 연결이 필요합니다.
                </p>
              </>
            ) : null}
            {publicAnalysis ? (
              <PublicRepositoryRecommendationStep
                answers={answers}
                analysis={publicAnalysis}
                deploymentType={deploymentType}
                isBusy={isPublicAnalysisBusy}
                onAnswer={(questionId, value) => {
                  setAnswers((current) => ({ ...current, [questionId]: value }));
                  setErrorMessage("");
                }}
                onCreateBoard={() => void createPublicRepositoryBoard()}
                onConfirmConfiguration={() => setPublicRecommendationStage("questions")}
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
                onUsesCiCdChange={setUsesCiCd}
                selectedTemplateId={selectedPublicTemplateId}
                stage={publicRecommendationStage}
                usesCiCd={usesCiCd}
              />
            ) : null}
          </section>
        ) : null}

        {showUrlAnalysis
        && publicAnalysis
        && publicRecommendationStage === "questions"
        && usesCiCd
        && !activeRepository ? (
          <section className={styles.connectionPanel}>
            <GitBranch aria-hidden="true" size={24} />
            <h2>CI/CD 인계 저장소 연결</h2>
            <p className={styles.inlineHint}>
              GitHub App 권한이 있는 저장소를 선택해 PR과 자동 배포 흐름에 연결합니다.
            </p>
            {loadState === "loading" ? (
              <p className={styles.inlineHint} role="status">연결된 저장소를 확인하는 중입니다.</p>
            ) : null}
            {loadState === "error" ? (
              <ProductState
                action={<button onClick={() => void loadRepositories()} type="button">다시 시도</button>}
                compact
                description={repositoryConnectionError}
                kind="error"
                title="연결된 저장소 상태를 확인할 수 없습니다"
              />
            ) : null}
            <div className={styles.actions}>
              <button disabled={actionState === "loading" || loadState !== "idle"} onClick={() => void loadCandidates()} type="button">
                연결 가능한 저장소 보기
              </button>
              <Link className={styles.secondaryAction} href={githubSettingsHref}>
                <Settings2 aria-hidden="true" size={16} /> 환경설정에서 권한 관리
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
                <CiCdHandoffOption checked={usesCiCd} onChange={setUsesCiCd} />
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
                projectId={projectId}
                projectName={projectName}
                recommendation={activeRecommendation}
                repository={activeRepository}
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

        {errorMessage && loadState !== "error" ? (
          <ProductState compact description={errorMessage} kind="error" title="작업 실패" />
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
  readonly questions: readonly RepositoryQuestionView[];
}) {
  if (questions.length === 0) return null;

  return (
    <section className={styles.questionSection} aria-label="추가 질문">
      <div className={styles.questionSectionHeader}>
        <strong>추가 질문</strong>
        <span>추천 결과를 아키텍처에 맞게 조정합니다.</span>
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

function hasRepositoryQuestionAnswer(value: string | boolean | undefined): value is string | boolean {
  return typeof value === "boolean" || (typeof value === "string" && value.trim().length > 0);
}

function CiCdHandoffOption({
  checked,
  onChange
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <section className={styles.ciCdSection} aria-label="CI/CD 인계 설정">
      <label className={styles.ciCdLabel}>
        <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
        <span className={styles.ciCdCopy}>
          <strong>CI/CD 인계 사용</strong>
          <small>GitHub PR과 자동 배포 흐름에 연결합니다.</small>
        </span>
      </label>
    </section>
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
    <section className={styles.recommendationPanel} aria-label="템플릿 후보">
      {recommendation.candidates.map((candidate) => (
        <article key={candidate.templateId}>
          <div>
            <span>{Math.round(candidate.confidence * 100)}% 일치</span>
            <strong>{candidate.displayTitle}</strong>
            <p>{candidate.reasons.join(" ")}</p>
            <small>{candidate.tradeoffs.join(" ")}</small>
          </div>
          <Link
            className={styles.boardAction}
            href={createRepositoryBoardHref(projectId, projectName, repository, candidate.templateId)}
          >
            보드 열기
          </Link>
        </article>
      ))}
    </section>
  );
}

function PublicRepositoryRecommendationStep({
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
  onUsesCiCdChange,
  selectedTemplateId,
  stage,
  usesCiCd
}: {
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
  readonly onUsesCiCdChange: (usesCiCd: boolean) => void;
  readonly selectedTemplateId: PublicRepositoryTemplateId | null;
  readonly stage: PublicRecommendationStage;
  readonly usesCiCd: boolean;
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
          <div>
            <span>선택한 템플릿</span>
            <strong>{selectedCandidate?.displayTitle ?? "추천 템플릿"}</strong>
          </div>
          <button className={styles.publicBackAction} onClick={onEditConfiguration} type="button">
            <ArrowLeft aria-hidden="true" size={16} /> 이전
          </button>
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
      <CiCdHandoffOption checked={usesCiCd} onChange={onUsesCiCdChange} />
      <button
        className={styles.publicBoardAction}
        disabled={!selectedCandidate}
        onClick={onConfirmConfiguration}
        type="button"
      >
        확인 <ArrowRight aria-hidden="true" size={16} />
      </button>
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
            {candidate.archived ? "보관됨" : "연결"}
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
