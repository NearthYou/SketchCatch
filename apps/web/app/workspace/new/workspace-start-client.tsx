"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Boxes,
  CloudDownload,
  GitBranch,
  LayoutPanelTop,
  LoaderCircle,
  type LucideIcon
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TemplateGallery } from "../../../components/templates/TemplateGallery";
import { ProductBrand } from "../../../components/ui/ProductBrand";
import {
  createProject,
  deleteProject,
  listAwsConnections,
  saveProjectDraft
} from "../../../features/workspace/api";
import {
  type BoardTemplate,
  listBoardTemplates
} from "../../../features/resource-settings/template-library";
import {
  createWorkspaceStartOptions,
  resolveWorkspaceStartAction,
  type WorkspaceStartKind
} from "./workspace-start-options";
import styles from "./workspace-start.module.css";

const AI_START_DRAFT_STORAGE_KEY = "sketchcatch.newProjectDraft";
const START_FORM_STORAGE_KEY = "sketchcatch.workspaceStartForm";
const DEFAULT_REVERSE_CLOUD_PLATFORM = "aws";

const START_MODE_ICONS: Record<WorkspaceStartKind, LucideIcon> = {
  ai: Bot,
  blank: LayoutPanelTop,
  repository: GitBranch,
  reverse: CloudDownload,
  template: Boxes
};

type WorkspaceStartDraft = {
  readonly projectName: string;
  readonly startMode: "ai";
  readonly updatedAt: string;
};

type WorkspaceStartForm = {
  readonly projectName: string;
  readonly selectedKind: WorkspaceStartKind;
  readonly selectedTemplateId: string | null;
};

const startModeOptions = createWorkspaceStartOptions();
const mainStartOptions = startModeOptions.filter((option) => option.kind !== "blank");
const blankStartOption = startModeOptions.find((option) => option.kind === "blank");
const boardTemplates = listBoardTemplates();

// 프로젝트 이름과 시작 방식을 받아 알맞은 생성 흐름으로 연결합니다.
export function WorkspaceStartClient({
  initialStartKind,
  initialTemplateId
}: {
  readonly initialStartKind?: WorkspaceStartKind | undefined;
  readonly initialTemplateId?: string | undefined;
} = {}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const projectNameInputRef = useRef<HTMLInputElement>(null);
  const [selectedKind, setSelectedKind] = useState<WorkspaceStartKind>(initialStartKind ?? "ai");
  const [isStartFormHydrated, setIsStartFormHydrated] = useState(initialStartKind !== undefined);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    boardTemplates.some((template) => template.id === initialTemplateId)
      ? (initialTemplateId ?? null)
      : null
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [projectNameError, setProjectNameError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [repositoryUrlFormVisible, setRepositoryUrlFormVisible] = useState(initialStartKind === "repository");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [repositoryDefaultBranch, setRepositoryDefaultBranch] = useState("main");
  const selectedTemplate = useMemo(
    () => boardTemplates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId]
  );
  const canContinue =
    !isSubmitting &&
    (selectedKind !== "template" || selectedTemplate !== null) &&
    (selectedKind !== "repository" ||
      !repositoryUrlFormVisible ||
      repositoryUrl.trim().length > 0);

  useEffect(() => {
    if (initialStartKind) {
      return;
    }

    const storedForm = readWorkspaceStartForm();

    if (storedForm) {
      setTitle(storedForm.projectName);
      setSelectedKind(storedForm.selectedKind);
      setSelectedTemplateId(storedForm.selectedTemplateId);
      setRepositoryUrlFormVisible(storedForm.selectedKind === "repository");
    } else {
      const aiDraft = readAiStartDraft();
      if (aiDraft?.projectName) {
        setTitle(aiDraft.projectName);
      }
    }

    setIsStartFormHydrated(true);
  }, [initialStartKind]);

  useEffect(() => {
    if (!isStartFormHydrated) {
      return;
    }

    writeWorkspaceStartForm({ projectName: title, selectedKind, selectedTemplateId });
  }, [isStartFormHydrated, selectedKind, selectedTemplateId, title]);

  // 시작 요청 전에 프로젝트 이름을 필드 단위로 검증합니다.
  async function handleContinue(): Promise<void> {
    const projectName = title.trim();

    if (!projectName) {
      setProjectNameError("프로젝트 이름을 입력해주세요.");
      setErrorMessage("");
      // 오류를 확인한 뒤 바로 이름을 입력할 수 있도록 입력창으로 이동합니다.
      projectNameInputRef.current?.focus();
      projectNameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setProjectNameError("");

    if (selectedKind === "template" && !selectedTemplate) {
      setErrorMessage("사용할 Template을 선택해주세요.");
      return;
    }

    setErrorMessage("");

    if (selectedKind === "repository" && repositoryUrlFormVisible) {
      await startFromRepositoryUrl(projectName);
      return;
    }

    setIsSubmitting(true);

    try {
      const action = await resolveStartAction({ projectName, selectedKind });

      if (action.kind === "openAiDraft") {
        writeAiStartDraft({
          projectName,
          startMode: "ai",
          updatedAt: new Date().toISOString()
        });
        router.push(action.href);
        return;
      }

      if (action.kind === "redirect" || action.kind === "openReversePreview") {
        router.push(action.href);
        return;
      }

      if (action.kind === "showRepositoryUrlForm") {
        setRepositoryUrlFormVisible(true);
        setIsSubmitting(false);
        return;
      }

      let createdProjectId: string | null = null;

      try {
        const project = await createProject({ name: projectName });
        createdProjectId = project.id;

        if (action.openMode === "template" && selectedTemplate) {
          await saveProjectDraft({
            diagramJson: selectedTemplate.diagramJson,
            projectId: project.id
          });
        }

        clearWorkspaceStartForm();
        const params = new URLSearchParams({
          projectId: project.id,
          projectName: project.name
        });
        router.push(`/workspace?${params.toString()}`);
      } catch (error) {
        // 시작용으로 방금 만든 빈 프로젝트만 정리해 실패한 시작 흔적을 남기지 않습니다.
        if (createdProjectId) {
          await deleteProject(createdProjectId).catch(() => undefined);
        }
        throw error;
      }
    } catch {
      setIsSubmitting(false);
      setErrorMessage("선택한 방식으로 프로젝트를 시작하지 못했습니다.");
    }
  }

  function selectStartKind(kind: WorkspaceStartKind): void {
    setSelectedKind(kind);
    setErrorMessage("");

    if (kind === "repository") {
      setRepositoryUrlFormVisible(true);
      return;
    }

    setRepositoryUrlFormVisible(false);
  }

  async function startFromRepositoryUrl(projectName: string): Promise<void> {
    const trimmedRepositoryUrl = repositoryUrl.trim();
    const trimmedDefaultBranch = repositoryDefaultBranch.trim();

    if (!trimmedRepositoryUrl) {
      setErrorMessage("Repository URL을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    let createdProjectId: string | null = null;

    try {
      const project = await createProject({ name: projectName });
      createdProjectId = project.id;
      clearWorkspaceStartForm();
      const params = new URLSearchParams({
        defaultBranch: trimmedDefaultBranch || "main",
        projectId: project.id,
        projectName: project.name,
        repositoryUrl: trimmedRepositoryUrl
      });

      router.push(`/workspace/repository?${params.toString()}`);
    } catch {
      if (createdProjectId) {
        await deleteProject(createdProjectId).catch(() => undefined);
      }

      setIsSubmitting(false);
      setErrorMessage("Repository 분석 페이지를 준비하지 못했습니다.");
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <ProductBrand />
        <strong>새 프로젝트</strong>
        <Link className={styles.backLink} href="/dashboard">
          <ArrowLeft aria-hidden="true" size={17} />
          Dashboard
        </Link>
      </header>

      <div className={styles.layout}>
        <section className={styles.startPanel} aria-labelledby="workspace-start-title">
          <header className={styles.heading}>
            <h1 id="workspace-start-title">어떻게 시작할까요?</h1>
          </header>

          <label
            className={
              projectNameError
                ? `${styles.nameField} ${styles.nameFieldError}`
                : styles.nameField
            }
            htmlFor="workspace-title-input"
          >
            <span>프로젝트 이름</span>
            <input
              aria-describedby={projectNameError ? "workspace-title-error" : undefined}
              aria-invalid={Boolean(projectNameError)}
              autoFocus
              id="workspace-title-input"
              maxLength={80}
              onChange={(event) => {
                setTitle(event.target.value);
                setProjectNameError("");
                setErrorMessage("");
              }}
              placeholder="예: 예약 서비스 API"
              ref={projectNameInputRef}
              type="text"
              value={title}
            />
            {projectNameError ? (
              <span className={styles.fieldError} id="workspace-title-error" role="alert">
                {projectNameError}
              </span>
            ) : null}
          </label>

          <div className={styles.optionList} role="radiogroup" aria-label="프로젝트 시작 방식">
            {mainStartOptions.map((option) => {
              const Icon = START_MODE_ICONS[option.kind];
              const selected = selectedKind === option.kind;

              return (
                <button
                  aria-checked={selected}
                  className={selected ? `${styles.option} ${styles.optionSelected}` : styles.option}
                  key={option.kind}
                  onClick={() => selectStartKind(option.kind)}
                  role="radio"
                  type="button"
                >
                  <span className={styles.optionIcon}>
                    <Icon aria-hidden="true" size={20} />
                  </span>
                  <span className={styles.optionCopy}>
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </span>
                  {option.kind === "reverse" ? <em>AWS Role 필요</em> : null}
                </button>
              );
            })}
          </div>

          {selectedKind === "template" ? (
            <TemplatePicker
              onSelect={setSelectedTemplateId}
              selectedTemplateId={selectedTemplateId}
              templates={boardTemplates}
            />
          ) : null}

          {selectedKind === "repository" && repositoryUrlFormVisible ? (
            <RepositoryUrlStartPanel
              branch={repositoryDefaultBranch}
              isSubmitting={isSubmitting}
              onBranchChange={(value) => {
                setRepositoryDefaultBranch(value);
                setErrorMessage("");
              }}
              onRepositoryUrlChange={(value) => {
                setRepositoryUrl(value);
                setErrorMessage("");
              }}
              repositoryUrl={repositoryUrl}
            />
          ) : null}

          <div className={styles.actions}>
            <button
              className={styles.primaryAction}
              disabled={!canContinue}
              onClick={() => void handleContinue()}
              type="button"
            >
              {isSubmitting ? (
                <LoaderCircle aria-hidden="true" className={styles.spinner} size={17} />
              ) : null}
              {isSubmitting ? "처리 중" : getContinueLabel(selectedKind, repositoryUrlFormVisible)}
            </button>
            {blankStartOption ? (
              <button
                className={
                  selectedKind === "blank"
                    ? `${styles.blankAction} ${styles.blankActionSelected}`
                    : styles.blankAction
                }
                onClick={() => selectStartKind("blank")}
                type="button"
              >
                {blankStartOption.title}
              </button>
            ) : null}
          </div>

          {errorMessage ? (
            <p className={styles.errorMessage} role="alert">
              {errorMessage}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

// Reverse만 AWS 연결을 확인하고 나머지는 선택값만으로 다음 단계를 정합니다.
async function resolveStartAction({
  projectName,
  selectedKind
}: {
  readonly projectName: string;
  readonly selectedKind: WorkspaceStartKind;
}) {
  if (selectedKind !== "reverse") {
    return resolveWorkspaceStartAction({
      cloudPlatform: DEFAULT_REVERSE_CLOUD_PLATFORM,
      hasVerifiedAwsConnection: false,
      projectName,
      startKind: selectedKind
    });
  }

  const awsConnections = await listAwsConnections();
  return resolveWorkspaceStartAction({
    cloudPlatform: DEFAULT_REVERSE_CLOUD_PLATFORM,
    hasVerifiedAwsConnection: awsConnections.some((connection) => connection.status === "verified"),
    projectName,
    startKind: selectedKind
  });
}

// 공통 Template Gallery를 새 프로젝트의 선택 단계로 보여줍니다.
function TemplatePicker({
  onSelect,
  selectedTemplateId,
  templates
}: {
  readonly onSelect: (templateId: string) => void;
  readonly selectedTemplateId: string | null;
  readonly templates: readonly BoardTemplate[];
}) {
  return (
    <section className={styles.templatePicker} aria-labelledby="template-picker-title">
      <div className={styles.templatePickerHeader}>
        <h2 id="template-picker-title">Template 선택</h2>
        <span>{templates.length}개</span>
      </div>
      <TemplateGallery
        actionLabel="이 Template 선택"
        onSelect={onSelect}
        selectedTemplateId={selectedTemplateId}
        templates={templates}
      />
    </section>
  );
}

function RepositoryUrlStartPanel({
  branch,
  isSubmitting,
  onBranchChange,
  onRepositoryUrlChange,
  repositoryUrl
}: {
  readonly branch: string;
  readonly isSubmitting: boolean;
  readonly onBranchChange: (value: string) => void;
  readonly onRepositoryUrlChange: (value: string) => void;
  readonly repositoryUrl: string;
}) {
  return (
    <section className={styles.repositoryUrlPanel} aria-labelledby="repository-url-title">
      <div className={styles.repositoryUrlHeader}>
        <h2 id="repository-url-title">Repository URL 분석</h2>
        <p>
          public GitHub repository는 계정 연결 없이 분석합니다. private repository나 권한이 부족한 경우에는
          환경설정에서 GitHub 권한을 연결해주세요.
        </p>
      </div>

      <div className={styles.repositoryUrlForm}>
        <label htmlFor="repository-url-input">
          <span>GitHub URL</span>
          <input
            disabled={isSubmitting}
            id="repository-url-input"
            onChange={(event) => onRepositoryUrlChange(event.target.value)}
            placeholder="https://github.com/owner/repository"
            type="url"
            value={repositoryUrl}
          />
        </label>
        <label htmlFor="repository-branch-input">
          <span>Branch</span>
          <input
            disabled={isSubmitting}
            id="repository-branch-input"
            onChange={(event) => onBranchChange(event.target.value)}
            placeholder="main"
            type="text"
            value={branch}
          />
        </label>
      </div>

    </section>
  );
}

// 선택한 시작 방식에 맞는 한 개의 주 행동 문구를 반환합니다.
function getContinueLabel(kind: WorkspaceStartKind, repositoryUrlFormVisible = false): string {
  const labels: Record<WorkspaceStartKind, string> = {
    ai: "AI로 계속",
    blank: "빈 보드 열기",
    repository: repositoryUrlFormVisible ? "Repository 분석하기" : "Repository URL 입력하기",
    reverse: "기존 AWS 가져오기",
    template: "Template으로 시작"
  };

  return labels[kind];
}

// 뒤로 돌아왔을 때 사용자가 고른 이름, 방식, Template을 복원합니다.
function readWorkspaceStartForm(): WorkspaceStartForm | null {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.sessionStorage.getItem(START_FORM_STORAGE_KEY);
    const value: unknown = rawValue ? JSON.parse(rawValue) : null;

    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<WorkspaceStartForm>;
    return typeof candidate.projectName === "string" &&
      isWorkspaceStartKind(candidate.selectedKind) &&
      (candidate.selectedTemplateId === null || typeof candidate.selectedTemplateId === "string")
      ? {
          projectName: candidate.projectName,
          selectedKind: candidate.selectedKind,
          selectedTemplateId: candidate.selectedTemplateId
        }
      : null;
  } catch {
    return null;
  }
}

// 새 프로젝트 입력 중인 값을 현재 browser 탭에만 임시 저장합니다.
function writeWorkspaceStartForm(form: WorkspaceStartForm): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(START_FORM_STORAGE_KEY, JSON.stringify(form));
  } catch {
    return;
  }
}

// 프로젝트 생성이 끝난 뒤 임시 입력값을 지웁니다.
function clearWorkspaceStartForm(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(START_FORM_STORAGE_KEY);
}

// AI 시작 화면에서 이어 쓸 프로젝트 이름을 복원합니다.
function readAiStartDraft(): WorkspaceStartDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.sessionStorage.getItem(AI_START_DRAFT_STORAGE_KEY);
    const value: unknown = rawValue ? JSON.parse(rawValue) : null;
    return isWorkspaceStartDraft(value) ? value : null;
  } catch {
    return null;
  }
}

// AI 시작 화면으로 이동하기 전에 프로젝트 이름을 임시 저장합니다.
function writeAiStartDraft(draft: WorkspaceStartDraft): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(AI_START_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    return;
  }
}

// browser 저장값이 AI 시작 입력으로 안전한 모양인지 확인합니다.
function isWorkspaceStartDraft(value: unknown): value is WorkspaceStartDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorkspaceStartDraft>;

  return (
    candidate.startMode === "ai" &&
    typeof candidate.projectName === "string" &&
    candidate.projectName.trim().length > 0 &&
    typeof candidate.updatedAt === "string"
  );
}

// browser 저장값을 지원하는 다섯 시작 방식으로 제한합니다.
function isWorkspaceStartKind(value: unknown): value is WorkspaceStartKind {
  return (
    value === "ai" ||
    value === "reverse" ||
    value === "template" ||
    value === "repository" ||
    value === "blank"
  );
}
