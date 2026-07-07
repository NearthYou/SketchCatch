"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createProject, listAwsConnections } from "../../../features/workspace/api";
import {
  createWorkspaceStartOptions,
  resolveWorkspaceStartAction,
  type WorkspaceStartKind
} from "./workspace-start-options";

const AI_START_DRAFT_STORAGE_KEY = "sketchcatch.newProjectDraft";
const DEFAULT_REVERSE_CLOUD_PLATFORM = "aws";

const COPY = {
  chooseStartMode: "\uC2DC\uC791 \uBC29\uC2DD\uC744 \uC120\uD0DD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  createProjectFailed: "\uD504\uB85C\uC81D\uD2B8\uB97C \uC0DD\uC131\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  enterProjectName: "\uD504\uB85C\uC81D\uD2B8 \uC774\uB984\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.",
  projectNameFirst:
    "\uD504\uB85C\uC81D\uD2B8 \uC774\uB984\uC744 \uBA3C\uC800 \uC785\uB825\uD558\uBA74 \uC2DC\uC791 \uBC29\uC2DD\uC744 \uC120\uD0DD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  projectNameLabel: "\uD504\uB85C\uC81D\uD2B8 \uC774\uB984",
  projectNamePlaceholder: "\uC608: \uC608\uC57D \uC11C\uBE44\uC2A4 API \uC11C\uBC84",
  startModeLabel: "\uC2DC\uC791 \uBC29\uC2DD",
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

export function WorkspaceStartClient() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmittingMode, setIsSubmittingMode] = useState<WorkspaceStartKind | null>(null);
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
    <div className="workspaceStartForm">
      <label className="workspaceStartField" htmlFor="workspace-title-input">
        <span className="fieldLabel">{COPY.projectNameLabel}</span>
        <input
          className="textInput"
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

      <div className="workspaceStartField">
        <span className="fieldLabel">{COPY.startModeLabel}</span>
        <p className="workspaceStartHint">{helperText}</p>
        <div className="choiceGrid workspaceStartModeGrid" aria-label={COPY.startModeLabel}>
          {startModeOptions.map((option) => {
            const isDisabled = !canChooseStartMode || isSubmittingMode !== null;
            const isSubmitting = isSubmittingMode === option.kind;

            return (
              <button
                className="workspaceStartModeButton"
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
      </div>

      {errorMessage ? (
        <p className="workspaceStartError" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

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

function writeAiStartDraft(draft: WorkspaceStartDraft): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(AI_START_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

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
