"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createProject, listAwsConnections } from "../../../features/workspace/api";
import type { WorkspaceCloudPlatform } from "../../../features/workspace/project-draft-persistence";
import {
  createWorkspaceStartOptions,
  resolveWorkspaceStartAction,
  type WorkspaceStartKind
} from "./workspace-start-options";

const cloudPlatformOptions: ReadonlyArray<{
  readonly label: string;
  readonly value: WorkspaceCloudPlatform;
}> = [
  { label: "AWS", value: "aws" },
  { label: "GCP", value: "gcp" }
];

const workspaceStartOptions = createWorkspaceStartOptions();

export function WorkspaceStartClient() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [cloudPlatform, setCloudPlatform] = useState<WorkspaceCloudPlatform>("aws");
  const [startKind, setStartKind] = useState<WorkspaceStartKind>("ai");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedStartOption =
    workspaceStartOptions.find((option) => option.kind === startKind) ?? workspaceStartOptions[0];

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage("설계 제목을 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const awsConnections = startKind === "reverse" ? await listAwsConnections() : [];
      const hasVerifiedAwsConnection = awsConnections.some((connection) => connection.status === "verified");
      const action = resolveWorkspaceStartAction({
        cloudPlatform,
        hasVerifiedAwsConnection,
        projectName: trimmedTitle,
        startKind
      });

      if (action.kind !== "createProject") {
        router.push(action.href);
        return;
      }

      const project = await createProject({
        name: trimmedTitle
      });
      const params = new URLSearchParams({
        cloudPlatform,
        projectId: project.id,
        projectName: project.name,
        startMode: action.openMode
      });

      router.push(`/workspace?${params.toString()}`);
    } catch {
      setIsSubmitting(false);
      setErrorMessage("워크스페이스를 생성하지 못했습니다.");
    }
  }

  return (
    <form className="workspaceStartForm" onSubmit={handleSubmit}>
      <label className="workspaceStartField" htmlFor="workspace-title-input">
        <span className="fieldLabel">설계 제목</span>
        <input
          className="textInput"
          id="workspace-title-input"
          maxLength={80}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="예: 팀 프로젝트 API 서버"
          type="text"
          value={title}
        />
      </label>

      <div className="workspaceStartField">
        <span className="fieldLabel">클라우드 플랫폼</span>
        <div className="choiceGrid workspaceStartProviderGrid" role="radiogroup" aria-label="클라우드 플랫폼">
          {cloudPlatformOptions.map((option) => (
            <button
              aria-checked={cloudPlatform === option.value}
              className={cloudPlatform === option.value ? "choiceButton choiceButtonActive" : "choiceButton"}
              key={option.value}
              onClick={() => setCloudPlatform(option.value)}
              role="radio"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="workspaceStartField">
        <span className="fieldLabel">시작 방식</span>
        <div className="workspaceStartOptionGroup" role="radiogroup" aria-label="시작 방식">
          {workspaceStartOptions.map((option) => (
            <button
              aria-checked={startKind === option.kind}
              className={[
                "workspaceStartOptionButton",
                option.priority === "secondary" ? "workspaceStartOptionButtonSecondary" : "",
                startKind === option.kind ? "workspaceStartOptionButtonActive" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              key={option.kind}
              onClick={() => setStartKind(option.kind)}
              role="radio"
              type="button"
            >
              <span>{option.title}</span>
              <strong>{option.actionLabel}</strong>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
      </div>

      {errorMessage ? (
        <p className="workspaceStartError" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="workspaceStartActions">
        <button className="primaryButton" disabled={isSubmitting} type="submit">
          {selectedStartOption.actionLabel}
        </button>
      </div>
    </form>
  );
}
