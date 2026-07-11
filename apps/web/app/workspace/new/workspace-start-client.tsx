"use client";

import Link from "next/link";
import Image from "next/image";
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
import { useEffect, useMemo, useState } from "react";
import { TemplateGallery } from "../../../components/templates/TemplateGallery";
import {
  createGitHubSourceRepositoryInstallUrl,
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
  github: GitBranch,
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
  const [selectedKind, setSelectedKind] = useState<WorkspaceStartKind>(initialStartKind ?? "ai");
  const [isStartFormHydrated, setIsStartFormHydrated] = useState(initialStartKind !== undefined);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    boardTemplates.some((template) => template.id === initialTemplateId)
      ? (initialTemplateId ?? null)
      : null
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedTemplate = useMemo(
    () => boardTemplates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId]
  );
  const canContinue =
    title.trim().length > 0 &&
    !isSubmitting &&
    (selectedKind !== "template" || selectedTemplate !== null);

  useEffect(() => {
    if (initialStartKind) {
      return;
    }

    const storedForm = readWorkspaceStartForm();

    if (storedForm) {
      setTitle(storedForm.projectName);
      setSelectedKind(storedForm.selectedKind);
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

    writeWorkspaceStartForm({ projectName: title, selectedKind });
  }, [isStartFormHydrated, selectedKind, title]);

  async function handleContinue(): Promise<void> {
    const projectName = title.trim();

    if (!projectName) {
      setErrorMessage("프로젝트 이름을 입력해주세요.");
      return;
    }

    if (selectedKind === "template" && !selectedTemplate) {
      setErrorMessage("사용할 Template을 선택해주세요.");
      return;
    }

    setErrorMessage("");
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

        if (action.openMode === "github") {
          const { installUrl } = await createGitHubSourceRepositoryInstallUrl(project.id);
          window.location.assign(installUrl);
          return;
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
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/dashboard" aria-label="SketchCatch Dashboard">
          <Image alt="" height={24} priority src="/sketchcatch-logo.png" width={16} />
          <span>SketchCatch</span>
        </Link>
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

          <label className={styles.nameField} htmlFor="workspace-title-input">
            <span>프로젝트 이름</span>
            <input
              autoFocus
              id="workspace-title-input"
              maxLength={80}
              onChange={(event) => {
                setTitle(event.target.value);
                setErrorMessage("");
              }}
              placeholder="예: 예약 서비스 API"
              type="text"
              value={title}
            />
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
                  {option.kind === "github" ? <em>연결만 지원</em> : null}
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

          {selectedKind === "github" ? (
            <p className={styles.boundaryNotice} role="status">
              Repository 연결은 동작합니다. Repository Analysis와 Template Selection은 아직 연결
              중입니다.
            </p>
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
              {isSubmitting ? "처리 중" : getContinueLabel(selectedKind)}
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

function getContinueLabel(kind: WorkspaceStartKind): string {
  const labels: Record<WorkspaceStartKind, string> = {
    ai: "AI로 계속",
    blank: "빈 보드 열기",
    github: "GitHub 연결",
    reverse: "기존 AWS 가져오기",
    template: "Template으로 시작"
  };

  return labels[kind];
}

function readWorkspaceStartForm(): WorkspaceStartForm | null {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.sessionStorage.getItem(START_FORM_STORAGE_KEY);
    const value: unknown = rawValue ? JSON.parse(rawValue) : null;

    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<WorkspaceStartForm>;
    return typeof candidate.projectName === "string" && isWorkspaceStartKind(candidate.selectedKind)
      ? { projectName: candidate.projectName, selectedKind: candidate.selectedKind }
      : null;
  } catch {
    return null;
  }
}

function writeWorkspaceStartForm(form: WorkspaceStartForm): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(START_FORM_STORAGE_KEY, JSON.stringify(form));
  } catch {
    return;
  }
}

function clearWorkspaceStartForm(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(START_FORM_STORAGE_KEY);
}

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

function writeAiStartDraft(draft: WorkspaceStartDraft): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(AI_START_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    return;
  }
}

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

function isWorkspaceStartKind(value: unknown): value is WorkspaceStartKind {
  return (
    value === "ai" ||
    value === "reverse" ||
    value === "template" ||
    value === "github" ||
    value === "blank"
  );
}
