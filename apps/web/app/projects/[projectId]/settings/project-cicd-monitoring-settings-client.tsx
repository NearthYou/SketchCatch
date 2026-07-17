"use client";

import { useRouter } from "next/navigation";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type {
  GitCicdMonitoringConfig,
  SourceRepository,
  UpdateGitCicdMonitoringConfigRequest
} from "@sketchcatch/types";
import { useAuth } from "../../../../components/auth/auth-provider";
import { getApiErrorMessage } from "../../../../lib/api-client";
import {
  getGitCicdMonitoringConfig,
  listSourceRepositories,
  updateGitCicdMonitoringConfig
} from "../../../../features/workspace/api";
import {
  CicdMonitoringSettings,
  type CicdMonitoringSettingsHandle
} from "../../../../features/workspace/CicdMonitoringSettings";

type RequestState = "loading" | "idle" | "saving" | "error";

export type ProjectCicdMonitoringSettingsHandle = {
  readonly save: () => Promise<boolean>;
};

export const ProjectCicdMonitoringSettingsClient = forwardRef<
  ProjectCicdMonitoringSettingsHandle,
  {
    readonly projectId: string;
    readonly initialDraft?: {
      readonly enabled: boolean;
      readonly monitorBranch: string;
      readonly appPath: UpdateGitCicdMonitoringConfigRequest["appPath"];
      readonly infraPath: UpdateGitCicdMonitoringConfigRequest["infraPath"];
    } | undefined;
    readonly onDirty?: (() => void) | undefined;
    readonly onSaved?: (() => void) | undefined;
    readonly safeReturnTo?: string | null | undefined;
    readonly showSaveButton?: boolean | undefined;
  }
>(function ProjectCicdMonitoringSettingsClient({
  projectId,
  initialDraft,
  onDirty,
  onSaved,
  safeReturnTo = null,
  showSaveButton = true
}, ref) {
  const router = useRouter();
  const { status: authStatus } = useAuth();
  const monitoringSettingsRef = useRef<CicdMonitoringSettingsHandle>(null);
  const [repository, setRepository] = useState<SourceRepository | null>(null);
  const [config, setConfig] = useState<GitCicdMonitoringConfig | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    async function load(): Promise<void> {
      setRequestState("loading");
      setMessage("");
      try {
        const repositories = await listSourceRepositories(projectId);
        const activeRepository = repositories.find(
          (item) => item.provider === "github" && item.status === "active" && !item.archived
        ) ?? null;
        const nextConfig = activeRepository
          ? await getGitCicdMonitoringConfig(projectId, activeRepository.id)
          : null;
        if (cancelled) return;
        setRepository(activeRepository);
        setConfig(nextConfig);
        setRequestState("idle");
      } catch (error) {
        if (cancelled) return;
        setRequestState("error");
        setMessage(getApiErrorMessage(error, "CI/CD 설정을 불러오지 못했습니다."));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authStatus, projectId]);

  async function save(request: UpdateGitCicdMonitoringConfigRequest): Promise<boolean> {
    if (!repository) {
      setMessage("연결된 Repository를 확인할 수 없습니다.");
      return false;
    }
    setRequestState("saving");
    setMessage("");
    try {
      const saved = await updateGitCicdMonitoringConfig(projectId, repository.id, request);
      setConfig(saved);
      setRequestState("idle");
      onSaved?.();
      setMessage("CI/CD branch와 경로를 저장했습니다.");
      if (safeReturnTo) {
        router.replace(safeReturnTo);
      }
      return true;
    } catch (error) {
      setRequestState("error");
      setMessage(getApiErrorMessage(error, "CI/CD 설정을 저장하지 못했습니다."));
      return false;
    }
  }

  useImperativeHandle(ref, () => ({
    async save() {
      if (!monitoringSettingsRef.current) {
        setMessage("GitOps 감시 설정을 불러온 뒤 다시 확인해주세요.");
        return false;
      }
      return monitoringSettingsRef.current.save();
    }
  }));

  return (
    <section className="dashboardPanel integrationPanel" aria-labelledby="project-cicd-settings-title">
      <div className="integrationHeader">
        <div>
          <p className="dashboardPanelKicker">CI/CD</p>
          <h2 id="project-cicd-settings-title">GitOps 감시 설정</h2>
        </div>
      </div>
      <p>감시할 branch와 애플리케이션·인프라 경로를 프로젝트 단위로 관리합니다.</p>
      {requestState === "loading" ? <p role="status">설정을 불러오는 중입니다.</p> : null}
      {!repository && requestState !== "loading" ? (
        <p role="status">먼저 이 프로젝트에 GitHub 저장소를 연결하세요.</p>
      ) : null}
      {config ? (
        <CicdMonitoringSettings
          config={config}
          initialDraft={initialDraft}
          isSaving={requestState === "saving"}
          onDirty={onDirty}
          onSave={save}
          ref={monitoringSettingsRef}
          showSaveButton={showSaveButton}
        />
      ) : null}
      {message ? <p role={requestState === "error" ? "alert" : "status"}>{message}</p> : null}
    </section>
  );
});
