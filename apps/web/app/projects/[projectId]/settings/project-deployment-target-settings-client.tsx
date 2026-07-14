"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AwsConnection,
  ProjectDeploymentTarget,
  RuntimeTargetKind,
  SourceRepository
} from "@sketchcatch/types";
import { useAuth } from "../../../../components/auth/auth-provider";
import { getApiErrorMessage } from "../../../../lib/api-client";
import {
  getProjectDeploymentTarget,
  listAwsConnections,
  listSourceRepositories,
  putProjectDeploymentTarget
} from "../../../../features/workspace/api";
import {
  changeDeploymentTargetRuntime,
  createDeploymentTargetDraft,
  createDeploymentTargetRequest,
  formatDeploymentTargetUpdatedAt,
  isDeploymentTargetDraftReady,
  type ProjectDeploymentTargetDraft
} from "./project-deployment-target-state";
import styles from "./project-deployment-target-settings.module.css";

type RequestState = "idle" | "loading" | "saving" | "error";

const runtimeLabels: Record<RuntimeTargetKind, string> = {
  ecs_fargate: "ECS Fargate",
  lambda: "Lambda",
  ec2_asg: "EC2 Auto Scaling",
  static_site: "Static site"
};

export function ProjectDeploymentTargetSettingsClient({
  projectId
}: {
  readonly projectId: string;
}) {
  const { status: authStatus } = useAuth();
  const [connections, setConnections] = useState<AwsConnection[]>([]);
  const [target, setTarget] = useState<ProjectDeploymentTarget | null>(null);
  const [sourceRepository, setSourceRepository] = useState<SourceRepository | null>(null);
  const [draft, setDraft] = useState<ProjectDeploymentTargetDraft>(() =>
    createDeploymentTargetDraft(null, [])
  );
  const [requestState, setRequestState] = useState<RequestState>("loading");
  const [message, setMessage] = useState("");
  const verifiedConnections = useMemo(
    () => connections.filter((connection) => connection.status === "verified"),
    [connections]
  );
  const canSave =
    requestState !== "loading" &&
    requestState !== "saving" &&
    isDeploymentTargetDraftReady(draft, connections);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;

    async function load(): Promise<void> {
      setRequestState("loading");
      setMessage("");
      try {
        const [nextConnections, nextTarget, sourceRepositories] = await Promise.all([
          listAwsConnections(),
          getProjectDeploymentTarget(projectId),
          listSourceRepositories(projectId)
        ]);
        if (cancelled) return;
        const nextSourceRepository = sourceRepositories.find(
          (repository) =>
            repository.provider === "github" &&
            repository.status === "active" &&
            !repository.archived
        );
        setConnections(nextConnections);
        setTarget(nextTarget);
        setSourceRepository(nextSourceRepository ?? null);
        setDraft(createDeploymentTargetDraft(nextTarget, nextConnections, nextSourceRepository));
        setRequestState("idle");
      } catch (error) {
        if (cancelled) return;
        setRequestState("error");
        setMessage(getApiErrorMessage(error, "배포 타깃을 불러오지 못했습니다."));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authStatus, projectId]);

  function updateDraft<K extends keyof ProjectDeploymentTargetDraft>(
    key: K,
    value: ProjectDeploymentTargetDraft[K]
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function changeRuntime(runtimeTargetKind: RuntimeTargetKind) {
    setDraft((current) =>
      changeDeploymentTargetRuntime(current, runtimeTargetKind, sourceRepository)
    );
    setMessage("");
  }

  async function saveTarget(): Promise<void> {
    if (!canSave) return;
    setRequestState("saving");
    setMessage("");
    try {
      const saved = await putProjectDeploymentTarget(
        projectId,
        createDeploymentTargetRequest(draft, connections)
      );
      setTarget(saved);
      setDraft(createDeploymentTargetDraft(saved, connections));
      setRequestState("idle");
      setMessage("배포 타깃을 저장했습니다.");
    } catch (error) {
      setRequestState("error");
      setMessage(getApiErrorMessage(error, "배포 타깃을 저장하지 못했습니다."));
    }
  }

  return (
    <section className="dashboardPanel integrationPanel" aria-labelledby="deployment-target-title">
      <div className="integrationHeader">
        <div>
          <p className="dashboardPanelKicker">Deployment</p>
          <h2 id="deployment-target-title">프로젝트 배포 타깃</h2>
        </div>
      </div>
      <p>Direct와 GitOps가 함께 사용하는 실행 위치와 저장소 빌드 증거입니다.</p>

      {target ? (
        <div className="settingsInfoGrid">
          <article><span>Runtime</span><strong>{runtimeLabels[target.runtimeTargetKind]}</strong></article>
          <article><span>Region</span><strong>{target.region}</strong></article>
          <article><span>Last saved</span><strong>{formatDeploymentTargetUpdatedAt(target.updatedAt)}</strong></article>
        </div>
      ) : null}

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>Verified AWS connection</span>
          <select
            disabled={requestState === "loading" || requestState === "saving"}
            onChange={(event) => updateDraft("connectionId", event.target.value)}
            value={draft.connectionId}
          >
            <option value="">연결 선택</option>
            {verifiedConnections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.accountId ?? "AWS account"} · {connection.region}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Runtime</span>
          <select
            disabled={requestState === "saving"}
            onChange={(event) => changeRuntime(event.target.value as RuntimeTargetKind)}
            value={draft.runtimeTargetKind}
          >
            {Object.entries(runtimeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Source root</span>
          <input onChange={(event) => updateDraft("sourceRoot", event.target.value)} value={draft.sourceRoot} />
        </label>
        <label className={styles.field}>
          <span>Build evidence path</span>
          <input onChange={(event) => updateDraft("evidencePath", event.target.value)} value={draft.evidencePath} />
          {draft.evidenceSuggested ? <small>저장소 분석에서 감지됨 · 저장 시 확정</small> : null}
        </label>
        <label className={styles.field}>
          <span>Confirmed commit SHA</span>
          <input
            autoComplete="off"
            onChange={(event) => updateDraft("commitSha", event.target.value)}
            placeholder="40 or 64 character SHA"
            spellCheck={false}
            value={draft.commitSha}
          />
        </label>
        <label className={styles.field}>
          <span>Release version</span>
          <input
            onChange={(event) => updateDraft("version", event.target.value)}
            placeholder="v1.2.3 or manifest version"
            value={draft.version}
          />
        </label>
        <label className={styles.field}>
          <span>CodeBuild project</span>
          <input onChange={(event) => updateDraft("codeBuildProjectName", event.target.value)} value={draft.codeBuildProjectName} />
        </label>
        {draft.runtimeTargetKind === "ecs_fargate" ? (
          <>
            <label className={styles.field}>
              <span>ECR repository</span>
              <input onChange={(event) => updateDraft("ecrRepositoryName", event.target.value)} value={draft.ecrRepositoryName} />
            </label>
            <label className={styles.field}>
              <span>ECS cluster</span>
              <input onChange={(event) => updateDraft("clusterName", event.target.value)} value={draft.clusterName} />
            </label>
            <label className={styles.field}>
              <span>ECS service</span>
              <input onChange={(event) => updateDraft("serviceName", event.target.value)} value={draft.serviceName} />
            </label>
            <label className={styles.field}>
              <span>Container</span>
              <input onChange={(event) => updateDraft("containerName", event.target.value)} value={draft.containerName} />
            </label>
            <label className={styles.field}>
              <span>Output URL</span>
              <input onChange={(event) => updateDraft("outputUrl", event.target.value)} placeholder="https://api.example.com" value={draft.outputUrl} />
            </label>
            <label className={styles.field}>
              <span>Health check path</span>
              <input onChange={(event) => updateDraft("healthCheckPath", event.target.value)} value={draft.healthCheckPath} />
            </label>
          </>
        ) : null}
        {draft.runtimeTargetKind === "lambda" ? (
          <>
            <label className={styles.field}>
              <span>SAM function logical ID</span>
              <input onChange={(event) => updateDraft("functionLogicalId", event.target.value)} value={draft.functionLogicalId} />
            </label>
            <label className={styles.field}>
              <span>Lambda function</span>
              <input onChange={(event) => updateDraft("functionName", event.target.value)} value={draft.functionName} />
            </label>
            <label className={styles.field}>
              <span>Lambda alias</span>
              <input onChange={(event) => updateDraft("aliasName", event.target.value)} value={draft.aliasName} />
            </label>
            <label className={styles.field}>
              <span>CodeDeploy application</span>
              <input onChange={(event) => updateDraft("codeDeployApplicationName", event.target.value)} value={draft.codeDeployApplicationName} />
            </label>
            <label className={styles.field}>
              <span>CodeDeploy deployment group</span>
              <input onChange={(event) => updateDraft("codeDeployDeploymentGroupName", event.target.value)} value={draft.codeDeployDeploymentGroupName} />
            </label>
            <label className={styles.field}>
              <span>Output URL</span>
              <input onChange={(event) => updateDraft("outputUrl", event.target.value)} placeholder="https://api.example.com" value={draft.outputUrl} />
            </label>
            <label className={styles.field}>
              <span>Health check path</span>
              <input onChange={(event) => updateDraft("healthCheckPath", event.target.value)} value={draft.healthCheckPath} />
            </label>
          </>
        ) : null}
        {draft.runtimeTargetKind === "ec2_asg" ? (
          <>
            <label className={styles.field}>
              <span>CodeDeploy application</span>
              <input onChange={(event) => updateDraft("codeDeployApplicationName", event.target.value)} value={draft.codeDeployApplicationName} />
            </label>
            <label className={styles.field}>
              <span>CodeDeploy deployment group</span>
              <input onChange={(event) => updateDraft("codeDeployDeploymentGroupName", event.target.value)} value={draft.codeDeployDeploymentGroupName} />
            </label>
            <label className={styles.field}>
              <span>Auto Scaling group</span>
              <input onChange={(event) => updateDraft("autoScalingGroupName", event.target.value)} value={draft.autoScalingGroupName} />
            </label>
            <label className={styles.field}>
              <span>Output URL</span>
              <input onChange={(event) => updateDraft("outputUrl", event.target.value)} placeholder="https://api.example.com" value={draft.outputUrl} />
            </label>
            <label className={styles.field}>
              <span>Health check path</span>
              <input onChange={(event) => updateDraft("healthCheckPath", event.target.value)} value={draft.healthCheckPath} />
            </label>
          </>
        ) : null}
        {draft.runtimeTargetKind === "static_site" ? (
          <>
            <label className={styles.field}>
              <span>Package install</span>
              <select
                onChange={(event) =>
                  updateDraft(
                    "installPreset",
                    event.target.value as ProjectDeploymentTargetDraft["installPreset"]
                  )
                }
                value={draft.installPreset}
              >
                <option value="none">Select a verified lockfile</option>
                <option value="pnpm_frozen_lockfile">pnpm frozen lockfile</option>
                <option value="npm_ci">npm ci</option>
                <option value="yarn_frozen_lockfile">Yarn frozen lockfile</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Versioned hosting bucket</span>
              <input onChange={(event) => updateDraft("hostingBucketName", event.target.value)} value={draft.hostingBucketName} />
            </label>
            <label className={styles.field}>
              <span>CloudFront distribution ID</span>
              <input onChange={(event) => updateDraft("cloudFrontDistributionId", event.target.value)} value={draft.cloudFrontDistributionId} />
            </label>
            <label className={styles.field}>
              <span>CloudFront origin ID</span>
              <input onChange={(event) => updateDraft("cloudFrontOriginId", event.target.value)} value={draft.cloudFrontOriginId} />
            </label>
            <label className={styles.field}>
              <span>Output URL</span>
              <input onChange={(event) => updateDraft("outputUrl", event.target.value)} placeholder="https://static.example.com" value={draft.outputUrl} />
            </label>
          </>
        ) : null}
      </div>

      {verifiedConnections.length === 0 && requestState !== "loading" ? (
        <p className="dashboardMessage" role="status">검증된 AWS connection이 필요합니다.</p>
      ) : null}
      {message ? (
        <p className="dashboardMessage" role={requestState === "error" ? "alert" : "status"}>{message}</p>
      ) : null}
      <div className="settingsActionRow">
        <button
          className="dashboardTopbarAction"
          disabled={!canSave}
          onClick={() => void saveTarget()}
          type="button"
        >
          {requestState === "saving" ? "저장 중" : "배포 타깃 저장"}
        </button>
      </div>
    </section>
  );
}
