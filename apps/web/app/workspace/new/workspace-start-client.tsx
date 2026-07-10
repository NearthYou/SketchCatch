"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  createGitHubSourceRepositoryInstallUrl,
  createProject,
  listAwsConnections
} from "../../../features/workspace/api";
import {
  createWorkspaceStartOptions,
  resolveWorkspaceStartAction,
  type WorkspaceStartKind
} from "./workspace-start-options";

const AI_START_DRAFT_STORAGE_KEY = "sketchcatch.newProjectDraft";
const DEFAULT_REVERSE_CLOUD_PLATFORM = "aws";

const COPY = {
  chooseStartMode: "\uC2DC\uC791 \uBC29\uC2DD\uC744 \uC120\uD0DD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  createProjectFailed: "프로젝트 생성 또는 GitHub 연결을 시작하지 못했습니다.",
  enterProjectName: "\uD504\uB85C\uC81D\uD2B8 \uC774\uB984\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.",
  projectNameFirst:
    "\uD504\uB85C\uC81D\uD2B8 \uC774\uB984\uC744 \uBA3C\uC800 \uC785\uB825\uD558\uBA74 \uC2DC\uC791 \uBC29\uC2DD\uC744 \uC120\uD0DD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  projectNameLabel: "\uD504\uB85C\uC81D\uD2B8 \uC774\uB984",
  projectNamePlaceholder: "\uC608: \uC608\uC57D \uC11C\uBE44\uC2A4 API \uC11C\uBC84",
  startModeLabel: "\uC2DC\uC791 \uBC29\uC2DD",
  connectGitHubAfterCreate: "프로젝트 생성 후 GitHub repository 연결",
  connectGitHubHelp: "빈 보드로 시작할 때 Git/CI/CD용 source repository를 바로 연결합니다.",
  submitting: "\uCC98\uB9AC \uC911"
} as const;

type WorkspaceStartDraft = {
  readonly projectName: string;
  readonly startMode: "ai";
  readonly updatedAt: string;
};

const startModeOptions = createWorkspaceStartOptions();

const startModeLabels: Record<WorkspaceStartKind, string> = {
  ai: "AI",
  reverse: "\uB9AC\uBC84\uC2A4",
  blank: "\uBE48\uBCF4\uB4DC"
};
const primaryStartModeOptions = startModeOptions.filter((option) => option.priority === "primary");
const blankStartOption = startModeOptions.find((option) => option.kind === "blank");

export function WorkspaceStartClient() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmittingMode, setIsSubmittingMode] = useState<WorkspaceStartKind | null>(null);
  const [connectGitHubAfterCreate, setConnectGitHubAfterCreate] = useState(false);
  const canChooseStartMode = title.trim().length > 0 && isSubmittingMode === null;

  const helperText = useMemo(() => {
    if (title.trim().length > 0) {
      return COPY.chooseStartMode;
    }

    return COPY.projectNameFirst;
  }, [title]);

  useEffect(() => {
    const storedDraft = readAiStartDraft();

    if (storedDraft?.projectName) {
      setTitle(storedDraft.projectName);
    }
  }, []);

  // 시작 방식마다 프로젝트를 바로 만들지, 전용 화면으로 보낼지 결정합니다.
  async function handleStartMode(mode: WorkspaceStartKind): Promise<void> {
    const projectName = title.trim();

    if (!projectName) {
      setErrorMessage(COPY.enterProjectName);
      return;
    }

    setErrorMessage("");
    setIsSubmittingMode(mode);

    if (mode === "ai") {
      writeAiStartDraft({
        projectName,
        startMode: "ai",
        updatedAt: new Date().toISOString()
      });
      router.push("/workspace/ai");
      return;
    }

    try {
      if (mode === "reverse") {
        const awsConnections = await listAwsConnections();
        const hasVerifiedAwsConnection = awsConnections.some(
          (connection) => connection.status === "verified"
        );
        const action = resolveWorkspaceStartAction({
          cloudPlatform: DEFAULT_REVERSE_CLOUD_PLATFORM,
          hasVerifiedAwsConnection,
          projectName,
          startKind: "reverse"
        });

        if (action.kind === "createProject") {
          setIsSubmittingMode(null);
          return;
        }

        router.push(action.href);
        return;
      }

      const project = await createProject({
        name: projectName
      });

      if (connectGitHubAfterCreate) {
        const { installUrl } = await createGitHubSourceRepositoryInstallUrl(project.id);

        window.location.assign(installUrl);
        return;
      }

      const params = new URLSearchParams({
        projectId: project.id,
        projectName: project.name
      });

      router.push(`/workspace?${params.toString()}`);
    } catch {
      setIsSubmittingMode(null);
      setErrorMessage(COPY.createProjectFailed);
    }
  }

  return (
    <form className="workspaceNewForm" onSubmit={(event) => event.preventDefault()}>
      <label className="workspaceNewField" htmlFor="workspace-title-input">
        <span>{COPY.projectNameLabel}</span>
        <input
          className="workspaceNewInput"
          id="workspace-title-input"
          maxLength={80}
          onChange={(event) => {
            setTitle(event.target.value);
            setErrorMessage("");
          }}
          placeholder={COPY.projectNamePlaceholder}
          type="text"
          value={title}
        />
      </label>

      <fieldset className="workspaceNewFieldset">
        <legend className="workspaceNewLegend">{COPY.startModeLabel}</legend>
        <p className="workspaceNewHelp">{helperText}</p>
        <div className="workspaceNewChoiceGrid">
          {primaryStartModeOptions.map((option) => {
            const isDisabled = !canChooseStartMode || isSubmittingMode !== null;
            const isSubmitting = isSubmittingMode === option.kind;

            return (
              <button
                className="workspaceNewChoiceButton"
                disabled={isDisabled}
                key={option.kind}
                onClick={() => void handleStartMode(option.kind)}
                type="button"
              >
                <span>{isSubmitting ? COPY.submitting : startModeLabels[option.kind]}</span>
                <strong>{option.actionLabel}</strong>
                <small>{option.description}</small>
              </button>
            );
          })}
        </div>
        {blankStartOption ? (
          <button
            className="workspaceNewBlankButton"
            disabled={!canChooseStartMode || isSubmittingMode !== null}
            onClick={() => void handleStartMode(blankStartOption.kind)}
            type="button"
          >
            {isSubmittingMode === "blank" ? COPY.submitting : blankStartOption.actionLabel}
          </button>
        ) : null}
        <label className="workspaceNewCheckbox">
          <input
            checked={connectGitHubAfterCreate}
            disabled={!canChooseStartMode || isSubmittingMode !== null}
            onChange={(event) => setConnectGitHubAfterCreate(event.target.checked)}
            type="checkbox"
          />
          <span>{COPY.connectGitHubAfterCreate}</span>
          <small>{COPY.connectGitHubHelp}</small>
        </label>
      </fieldset>

      {errorMessage ? (
        <p className="workspaceNewError" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}

// AI 전용 시작 화면으로 돌아왔을 때 이전 프로젝트 이름을 복원합니다.
function readAiStartDraft(): WorkspaceStartDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(AI_START_DRAFT_STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : null;

    return isWorkspaceStartDraft(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
}

// AI 전용 화면에서 프로젝트 이름을 이어서 쓸 수 있게 임시 저장합니다.
function writeAiStartDraft(draft: WorkspaceStartDraft): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(AI_START_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch (error) {
    console.error("Failed to write AI start draft to sessionStorage:", error);
  }
}

// sessionStorage에서 꺼낸 값이 AI 시작 화면이 이해할 수 있는 모양인지 확인합니다.
function isWorkspaceStartDraft(value: unknown): value is WorkspaceStartDraft {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<WorkspaceStartDraft>;

  return (
    candidate.startMode === "ai" &&
    typeof candidate.projectName === "string" &&
    candidate.projectName.trim().length > 0 &&
    typeof candidate.updatedAt === "string"
  );
}
