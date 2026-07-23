"use client";

import Image from "next/image";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Boxes,
  Check,
  CloudDownload,
  GitBranch,
  LayoutPanelTop,
  LoaderCircle,
  type LucideIcon
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { BoardThumbnailImage } from "../../../components/architecture-board/BoardThumbnailImage";
import { TemplateGallery } from "../../../components/templates/TemplateGallery";
import { ProductBrand } from "../../../components/ui/ProductBrand";
import { useAuth } from "../../../components/auth/auth-provider";
import { invalidateProjectQueries } from "../../../components/query/dashboard-query-invalidation";
import {
  createProject,
  deleteProject,
  listAwsConnections,
  saveProjectDraft
} from "../../../features/workspace/api";
import {
  createWorkspaceStartSingleFlight,
  type WorkspaceStartSingleFlight
} from "../../../features/workspace/workspace-start-single-flight";
import {
  getBoardTemplateRelationshipCount,
  getBoardTemplateResourceCount,
  listBoardTemplates,
  type AvailableBoardTemplate,
  type BoardTemplate
} from "../../../features/resource-settings/template-library";
import {
  createWorkspaceStartOptions,
  resolveWorkspaceStartAction,
  type WorkspaceStartKind
} from "./workspace-start-options";
import {
  createTemplateProjectDraft,
  createWorkspaceStartTemplateSelection,
  resolveWorkspaceStartTemplate,
  resolveWorkspaceStartTemplateView
} from "./workspace-start-template-flow";
import {
  createWorkspaceTargetEnvironmentOptions,
  DEFAULT_WORKSPACE_TARGET_ENVIRONMENT,
  type WorkspaceTargetEnvironment
} from "../../../features/workspace/workspace-target-environment";
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
  readonly selectedTemplateVersion: string | null;
};

const startModeOptions = createWorkspaceStartOptions();
const mainStartOptions = startModeOptions.filter((option) => option.kind !== "blank");
const blankStartOption = startModeOptions.find((option) => option.kind === "blank");
const boardTemplates = listBoardTemplates();
const targetEnvironmentOptions = createWorkspaceTargetEnvironmentOptions();
const TARGET_ENVIRONMENT_ICON_PATHS: Record<WorkspaceTargetEnvironment, string> = {
  aws: "/provider-icons/aws.svg",
  gcp: "/provider-icons/google-cloud.svg",
  azure: "/provider-icons/azure.svg"
};

// 프로젝트 이름과 시작 방식을 받아 알맞은 생성 흐름으로 연결합니다.
export function WorkspaceStartClient({
  initialFreshStart = false,
  initialStartKind,
  initialTemplateId,
  initialTemplateVersion
}: {
  readonly initialFreshStart?: boolean | undefined;
  readonly initialStartKind?: WorkspaceStartKind | undefined;
  readonly initialTemplateId?: string | undefined;
  readonly initialTemplateVersion?: string | undefined;
} = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const initialTemplate = resolveWorkspaceStartTemplate(boardTemplates, {
    templateId: initialTemplateId ?? null,
    templateVersion: initialTemplateVersion ?? null
  });
  const initialTemplateSelection = createWorkspaceStartTemplateSelection(initialTemplate);
  const projectNameInputRef = useRef<HTMLInputElement>(null);
  const [startSingleFlight] = useState<WorkspaceStartSingleFlight>(() =>
    createWorkspaceStartSingleFlight()
  );

  const [selectedKind, setSelectedKind] = useState<WorkspaceStartKind>(initialStartKind ?? "ai");
  const [selectedTargetEnvironment, setSelectedTargetEnvironment] =
    useState<WorkspaceTargetEnvironment>(DEFAULT_WORKSPACE_TARGET_ENVIRONMENT);
  const [isStartFormHydrated, setIsStartFormHydrated] = useState(initialStartKind !== undefined);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialTemplateSelection.templateId
  );
  const [selectedTemplateVersion, setSelectedTemplateVersion] = useState<string | null>(
    initialTemplateSelection.templateVersion
  );
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(
    initialTemplateSelection.templateId
  );
  const [templateStartView, setTemplateStartView] = useState(() =>
    resolveWorkspaceStartTemplateView(initialStartKind, initialTemplate)
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [projectNameError, setProjectNameError] = useState("");
  const [submittingKind, setSubmittingKind] = useState<WorkspaceStartKind | null>(null);
  const selectedTemplate = useMemo(
    () =>
      resolveWorkspaceStartTemplate(boardTemplates, {
        templateId: selectedTemplateId,
        templateVersion: selectedTemplateVersion
      }),
    [selectedTemplateId, selectedTemplateVersion]
  );
  const previewTemplate = useMemo(() => {
    return resolveWorkspaceStartTemplate(boardTemplates, {
      templateId: previewTemplateId,
      templateVersion: previewTemplateId === selectedTemplateId ? selectedTemplateVersion : null
    });
  }, [previewTemplateId, selectedTemplateId, selectedTemplateVersion]);
  const isSubmitting = submittingKind !== null;

  useEffect(() => {
    if (initialStartKind) {
      return;
    }

    if (initialFreshStart) {
      clearWorkspaceStartForm();
      clearAiStartDraft();
      setIsStartFormHydrated(true);
      return;
    }

    const storedForm = readWorkspaceStartForm();

    if (storedForm) {
      setTitle(storedForm.projectName);
      setSelectedKind(storedForm.selectedKind);
      const restoredTemplate = resolveWorkspaceStartTemplate(boardTemplates, {
        templateId: storedForm.selectedTemplateId,
        templateVersion: storedForm.selectedTemplateVersion
      });
      const restoredSelection = createWorkspaceStartTemplateSelection(restoredTemplate);
      setSelectedTemplateId(restoredSelection.templateId);
      setSelectedTemplateVersion(restoredSelection.templateVersion);
      setPreviewTemplateId(restoredSelection.templateId);
    } else {
      const aiDraft = readAiStartDraft();
      if (aiDraft?.projectName) {
        setTitle(aiDraft.projectName);
      }
    }

    setIsStartFormHydrated(true);
  }, [initialFreshStart, initialStartKind]);

  useEffect(() => {
    if (!isStartFormHydrated) {
      return;
    }

    writeWorkspaceStartForm({
      projectName: title,
      selectedKind,
      selectedTemplateId,
      selectedTemplateVersion
    });
  }, [isStartFormHydrated, selectedKind, selectedTemplateId, selectedTemplateVersion, title]);

  // 명시된 시작 방식을 즉시 실행하고 같은 순간의 다른 시작 요청은 한 번만 처리합니다.
  async function handleContinue(
    startKind: WorkspaceStartKind = selectedKind,
    template: AvailableBoardTemplate | null = selectedTemplate
  ): Promise<void> {
    await startSingleFlight.run(async () => {
      if (!validateProjectName()) {
        return;
      }

      const projectName = title.trim();

      if (startKind === "template" && !template) {
        setErrorMessage("사용할 Template을 선택해주세요.");
        return;
      }

      setErrorMessage("");

      setSubmittingKind(startKind);

      try {
        const action = await resolveStartAction({ projectName, selectedKind: startKind });

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

        let createdProjectId: string | null = null;

        try {
          const project = await createProject({ name: projectName });
          createdProjectId = project.id;
          await invalidateProjectQueries(queryClient, user?.id);

          if (action.kind === "createRepositoryProject") {
            clearWorkspaceStartForm();
            const params = new URLSearchParams({
              projectId: project.id,
              projectName: project.name
            });
            router.push(`/workspace/repository?${params.toString()}`);
            return;
          }

          if (action.kind === "createProject" && action.openMode === "template" && template) {
            await saveProjectDraft({
              ...createTemplateProjectDraft({ projectId: project.id, template }),
              expectedRevision: null
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
        setSubmittingKind(null);
        setErrorMessage("선택한 방식으로 프로젝트를 시작하지 못했습니다.");
      }
    });
  }

  // 시작 방식 카드를 누르면 이름을 검증하고 해당 흐름으로 즉시 이동합니다.
  function startWithKind(kind: WorkspaceStartKind): void {
    if (!validateProjectName()) {
      return;
    }

    setSelectedKind(kind);
    setErrorMessage("");

    if (kind === "template") {
      setTemplateStartView("catalog");
      return;
    }

    setTemplateStartView(null);
    void handleContinue(kind);
  }

  function validateProjectName(): boolean {
    if (title.trim()) {
      setProjectNameError("");
      return true;
    }

    setProjectNameError("프로젝트 이름을 입력해주세요.");
    setErrorMessage("");
    projectNameInputRef.current?.focus();
    projectNameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }

  function handleTitleChange(value: string): void {
    setTitle(value);
    setProjectNameError("");
    setErrorMessage("");
  }

  function selectTemplate(templateId: string): void {
    if (!validateProjectName()) {
      return;
    }

    const template = resolveWorkspaceStartTemplate(boardTemplates, {
      templateId,
      templateVersion: null
    });

    if (!template) {
      return;
    }

    const selection = createWorkspaceStartTemplateSelection(template);
    setSelectedTemplateId(selection.templateId);
    setSelectedTemplateVersion(selection.templateVersion);
    setPreviewTemplateId(selection.templateId);
    setTemplateStartView("detail");
    setErrorMessage("");
  }

  if (templateStartView === "catalog") {
    return (
      <WorkspaceStartFrame title="템플릿 선택">
        <TemplateCatalog
          onBack={() => setTemplateStartView(null)}
          onSelect={selectTemplate}
          onTitleChange={handleTitleChange}
          projectNameError={projectNameError}
          projectNameInputRef={projectNameInputRef}
          selectedTemplateId={previewTemplateId}
          templates={boardTemplates}
          title={title}
        />
      </WorkspaceStartFrame>
    );
  }

  if (templateStartView === "detail" && previewTemplate) {
    return (
      <WorkspaceStartFrame title="템플릿 살펴보기">
        <TemplateDetail
          onBack={() => setTemplateStartView("catalog")}
          onStart={() => void handleContinue("template", previewTemplate)}
          errorMessage={errorMessage}
          isSubmitting={isSubmitting}
          onTitleChange={handleTitleChange}
          projectNameError={projectNameError}
          projectNameInputRef={projectNameInputRef}
          template={previewTemplate}
          title={title}
        />
      </WorkspaceStartFrame>
    );
  }

  return (
    <WorkspaceStartFrame title="새 프로젝트">
      <div className={styles.layout}>
        <section className={styles.startPanel} aria-labelledby="workspace-start-title">
          <header className={styles.heading}>
            <h1 id="workspace-start-title">어떻게 시작할까요?</h1>
          </header>

          <ProjectNameField
            error={projectNameError}
            inputRef={projectNameInputRef}
            onChange={handleTitleChange}
            title={title}
          />

          <TargetEnvironmentField
            disabled={isSubmitting}
            onChange={setSelectedTargetEnvironment}
            value={selectedTargetEnvironment}
          />

          <section className={styles.startMethods} aria-labelledby="workspace-start-method-title">
            <h2 id="workspace-start-method-title">시작 방식</h2>
            <div className={styles.optionList} role="group" aria-label="프로젝트 시작 방식">
              {mainStartOptions.map((option) => {
                const Icon = START_MODE_ICONS[option.kind];
                const isOptionSubmitting = submittingKind === option.kind;

                return (
                  <button
                    aria-busy={isOptionSubmitting}
                    className={styles.option}
                    disabled={isSubmitting}
                    key={option.kind}
                    onClick={() => startWithKind(option.kind)}
                    type="button"
                  >
                    <span className={styles.optionIcon}>
                      {isOptionSubmitting ? (
                        <LoaderCircle aria-hidden="true" className={styles.spinner} size={26} />
                      ) : (
                        <Icon aria-hidden="true" size={26} />
                      )}
                    </span>
                    <span className={styles.optionCopy}>
                      <span className={styles.optionTitleRow}>
                        <strong>{option.title}</strong>
                        {option.kind === "reverse" ? <em>AWS Role 필요</em> : null}
                      </span>
                      <small>{option.description}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className={styles.actions}>
            {blankStartOption ? (
              <button
                aria-busy={submittingKind === "blank"}
                className={
                  selectedKind === "blank" || submittingKind === "blank"
                    ? `${styles.blankAction} ${styles.blankActionSelected}`
                    : styles.blankAction
                }
                disabled={isSubmitting}
                onClick={() => void handleContinue("blank")}
                type="button"
              >
                {submittingKind === "blank" ? (
                  <LoaderCircle aria-hidden="true" className={styles.spinner} size={17} />
                ) : null}
                {submittingKind === "blank" ? "처리 중" : blankStartOption.title}
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
    </WorkspaceStartFrame>
  );
}

function TargetEnvironmentField({
  disabled,
  onChange,
  value
}: {
  readonly disabled: boolean;
  readonly onChange: (value: WorkspaceTargetEnvironment) => void;
  readonly value: WorkspaceTargetEnvironment;
}) {
  return (
    <fieldset className={styles.targetEnvironmentField} disabled={disabled}>
      <legend>배포 대상 환경</legend>
      <div className={styles.targetEnvironmentOptions}>
        {targetEnvironmentOptions.map((option) => {
          const isSelected = option.id === value;

          return (
            <label
              className={
                isSelected
                  ? `${styles.targetEnvironmentOption} ${styles.targetEnvironmentOptionSelected}`
                  : styles.targetEnvironmentOption
              }
              key={option.id}
            >
              <input
                checked={isSelected}
                name="workspace-target-environment"
                onChange={() => onChange(option.id)}
                type="radio"
                value={option.id}
              />
              <span aria-hidden="true" className={styles.targetEnvironmentBrandIcon}>
                <Image
                  alt=""
                  height={32}
                  src={TARGET_ENVIRONMENT_ICON_PATHS[option.id]}
                  width={32}
                />
              </span>
              <span>{option.label}</span>
              {isSelected ? <Check aria-hidden="true" size={18} strokeWidth={3} /> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function WorkspaceStartFrame({
  children,
  title
}: {
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <ProductBrand />
        <strong>{title}</strong>
        <Link className={styles.backLink} href="/dashboard">
          <ArrowLeft aria-hidden="true" size={17} />
          Dashboard
        </Link>
      </header>
      {children}
    </main>
  );
}

function ProjectNameField({
  error,
  inputRef,
  onChange,
  title
}: {
  readonly error: string;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onChange: (value: string) => void;
  readonly title: string;
}) {
  return (
    <label
      className={error ? `${styles.nameField} ${styles.nameFieldError}` : styles.nameField}
      htmlFor="workspace-title-input"
    >
      <span>프로젝트 이름</span>
      <input
        aria-describedby={error ? "workspace-title-error" : undefined}
        aria-invalid={Boolean(error)}
        autoFocus
        id="workspace-title-input"
        maxLength={80}
        onChange={(event) => onChange(event.target.value)}
        placeholder="예: 예약 서비스 API"
        ref={inputRef}
        type="text"
        value={title}
      />
      {error ? (
        <span className={styles.fieldError} id="workspace-title-error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
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

function TemplateCatalog({
  onBack,
  onSelect,
  onTitleChange,
  projectNameError,
  projectNameInputRef,
  selectedTemplateId,
  templates,
  title
}: {
  readonly onBack: () => void;
  readonly onSelect: (templateId: string) => void;
  readonly onTitleChange: (value: string) => void;
  readonly projectNameError: string;
  readonly projectNameInputRef: RefObject<HTMLInputElement | null>;
  readonly selectedTemplateId: string | null;
  readonly templates: readonly BoardTemplate[];
  readonly title: string;
}) {
  return (
    <div className={styles.templateFlow}>
      <header className={styles.templateFlowHeader}>
        <button className={styles.flowBack} onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" size={17} />
          시작 방식
        </button>
        <div>
          <span className={styles.eyebrow}>Architecture templates</span>
          <h1>어떤 구조로 시작할까요?</h1>
          <p>필요한 구성과 가장 가까운 템플릿을 골라보세요.</p>
        </div>
        <span className={styles.templateCount}>{templates.length} templates</span>
      </header>

      <ProjectNameField
        error={projectNameError}
        inputRef={projectNameInputRef}
        onChange={onTitleChange}
        title={title}
      />

      <TemplateGallery
        actionLabel="템플릿 보기"
        onSelect={onSelect}
        selectedTemplateId={selectedTemplateId}
        templates={templates}
      />
    </div>
  );
}

function TemplateDetail({
  errorMessage,
  onBack,
  onStart,
  isSubmitting,
  onTitleChange,
  projectNameError,
  projectNameInputRef,
  template,
  title
}: {
  readonly errorMessage: string;
  readonly onBack: () => void;
  readonly onStart: () => void;
  readonly isSubmitting: boolean;
  readonly onTitleChange: (value: string) => void;
  readonly projectNameError: string;
  readonly projectNameInputRef: RefObject<HTMLInputElement | null>;
  readonly template: AvailableBoardTemplate;
  readonly title: string;
}) {
  return (
    <div className={styles.templateFlow}>
      <button className={styles.flowBack} onClick={onBack} type="button">
        <ArrowLeft aria-hidden="true" size={17} />
        템플릿 목록
      </button>

      <section className={styles.templateDetail} aria-labelledby="template-detail-title">
        <div className={styles.detailContent}>
          <div className={styles.detailHeading}>
            <span className={styles.eyebrow}>Selected template</span>
            <h1 id="template-detail-title">{template.title}</h1>
            <p>{template.description}</p>
          </div>

          <div className={styles.detailActionArea}>
            <ProjectNameField
              error={projectNameError}
              inputRef={projectNameInputRef}
              onChange={onTitleChange}
              title={title}
            />
            {errorMessage ? (
              <p className={styles.errorMessage} role="alert">
                {errorMessage}
              </p>
            ) : null}
            <button
              aria-busy={isSubmitting}
              className={styles.detailStartAction}
              disabled={isSubmitting}
              onClick={onStart}
              type="button"
            >
              {isSubmitting ? "처리 중" : "이 템플릿으로 시작"}
              {isSubmitting ? null : <ArrowRight aria-hidden="true" size={17} />}
            </button>
          </div>

          <dl className={styles.detailStats}>
            <div>
              <dt>Resources</dt>
              <dd>{getBoardTemplateResourceCount(template)}</dd>
            </div>
            <div>
              <dt>Relationships</dt>
              <dd>{getBoardTemplateRelationshipCount(template)}</dd>
            </div>
          </dl>

          <div className={styles.detailTags} aria-label="Template tags">
            {template.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>

        <div className={styles.detailPreviewFrame}>
          <BoardThumbnailImage
            alt={`${template.title} Architecture 미리보기`}
            className={styles.detailPreview}
            src={template.thumbnailSrc ?? null}
          />
        </div>
      </section>
    </div>
  );
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
      (candidate.selectedTemplateId === null || typeof candidate.selectedTemplateId === "string") &&
      (candidate.selectedTemplateVersion === undefined ||
        candidate.selectedTemplateVersion === null ||
        typeof candidate.selectedTemplateVersion === "string")
      ? {
          projectName: candidate.projectName,
          selectedKind: candidate.selectedKind,
          selectedTemplateId: candidate.selectedTemplateId,
          selectedTemplateVersion: candidate.selectedTemplateVersion ?? null
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

function clearAiStartDraft(): void {
  if (typeof window === "undefined") return;

  window.sessionStorage.removeItem(AI_START_DRAFT_STORAGE_KEY);
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
