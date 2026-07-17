"use client";

import { useRouter } from "next/navigation";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import type {
  AwsConnection,
  ProjectDeliveryProfile,
  ProjectDeploymentTarget,
  RuntimeTargetKind,
  SourceRepository
} from "@sketchcatch/types";
import { useAuth } from "../../../components/auth/auth-provider";
import { getApiErrorMessage } from "../../../lib/api-client";
import {
  getProjectDeploymentTarget,
  getProjectDraft,
  listAwsConnections,
  listSourceRepositories,
  putProjectDeploymentTarget
} from "../api";
import {
  changeDeploymentTargetRuntime,
  createDeploymentTargetDraft,
  createDeploymentTargetRequest,
  formatDeploymentTargetUpdatedAt,
  getLockedSystemFields,
  getLockedSystemFieldsAfterRuntimeChange,
  getMissingDeploymentTargetFieldKeys,
  type EcsFargateDeploymentDefaultsInput,
  type MissingDeploymentTargetFieldKey,
  type ProjectDeploymentTargetDraft,
  type SystemManagedField
} from "./project-deployment-target-state";
import { ProjectDeploymentTargetAdvancedSettings } from "./ProjectDeploymentTargetAdvancedSettings";
import styles from "./project-deployment-target-editor.module.css";

type RequestState = "idle" | "loading" | "saving" | "error";

const runtimeLabels: Record<RuntimeTargetKind, string> = {
  ecs_fargate: "ECS Fargate",
  lambda: "Lambda",
  ec2_asg: "EC2 Auto Scaling",
  static_site: "Static site"
};

const missingFieldLabels: Record<MissingDeploymentTargetFieldKey, string> = {
  aws_connection: "AWS 연결",
  source_root: "Source root",
  build_evidence_path: "Build evidence path",
  confirmed_commit_sha: "Confirmed commit SHA",
  health_check_path: "Health check path",
  install_preset: "Package install",
  codebuild_project: "CodeBuild project",
  ecr_repository: "ECR repository",
  ecs_cluster: "ECS cluster",
  ecs_service: "ECS service",
  container: "Container",
  lambda_function_logical_id: "SAM function logical ID",
  lambda_function: "Lambda function",
  lambda_alias: "Lambda alias",
  codedeploy_application: "CodeDeploy application",
  codedeploy_deployment_group: "CodeDeploy deployment group",
  auto_scaling_group: "Auto Scaling group",
  hosting_bucket: "Versioned hosting bucket",
  cloudfront_distribution: "CloudFront distribution ID",
  cloudfront_origin: "CloudFront origin ID",
  output_url: "Output URL"
};

function getRuntimeTargetSummary(draft: ProjectDeploymentTargetDraft): string {
  switch (draft.runtimeTargetKind) {
    case "ecs_fargate":
      return (
        [draft.clusterName, draft.serviceName].filter(Boolean).join(" / ") || "저장 시 입력 필요"
      );
    case "lambda":
      return (
        [draft.functionName, draft.aliasName].filter(Boolean).join(" / ") || "저장 시 입력 필요"
      );
    case "ec2_asg":
      return draft.autoScalingGroupName || "저장 시 입력 필요";
    case "static_site":
      return (
        [draft.hostingBucketName, draft.cloudFrontDistributionId].filter(Boolean).join(" / ") ||
        "저장 시 입력 필요"
      );
  }
}

function getShortCommitSha(commitSha: string): string {
  return commitSha ? `${commitSha.slice(0, 10)}…` : "저장 시 입력 필요";
}

export type ProjectDeploymentTargetEditorHandle = {
  readonly save: () => Promise<boolean>;
};

type ProjectDeploymentTargetEditorInitialProfile = Pick<
  ProjectDeliveryProfile,
  "deploymentTarget" | "repositoryAnalysisTarget" | "sourceRepository"
>;

export const ProjectDeploymentTargetEditor = forwardRef<
  ProjectDeploymentTargetEditorHandle,
  {
    readonly projectId: string;
    readonly ecsDefaults?: EcsFargateDeploymentDefaultsInput | null;
    readonly initialProfile?: ProjectDeploymentTargetEditorInitialProfile | null;
    readonly onDirty?: (() => void) | undefined;
    readonly onSaved?: (() => void) | undefined;
    readonly preferEcsDefaults?: boolean | undefined;
    readonly safeReturnTo?: string | null | undefined;
    readonly showSaveButton?: boolean | undefined;
  }
>(function ProjectDeploymentTargetEditor(
  {
    projectId,
    ecsDefaults = null,
    initialProfile = null,
    onDirty,
    onSaved,
    preferEcsDefaults = false,
    safeReturnTo = null,
    showSaveButton = true
  },
  ref
) {
  const router = useRouter();
  const { status: authStatus } = useAuth();
  const initialTarget = initialProfile?.deploymentTarget ?? null;
  const initialRepositoryAnalysisTarget = initialProfile?.repositoryAnalysisTarget ?? null;
  const initialSourceRepository = initialProfile?.sourceRepository ?? null;
  const [connections, setConnections] = useState<AwsConnection[]>([]);
  const [target, setTarget] = useState<ProjectDeploymentTarget | null>(initialTarget);
  const [sourceRepository, setSourceRepository] = useState<SourceRepository | null>(
    initialSourceRepository
  );
  const [draft, setDraft] = useState<ProjectDeploymentTargetDraft>(() =>
    createDeploymentTargetDraft(
      initialTarget,
      [],
      initialSourceRepository,
      null,
      "preserve_target",
      null,
      initialRepositoryAnalysisTarget
    )
  );
  const [lockedSystemFields, setLockedSystemFields] = useState<ReadonlySet<SystemManagedField>>(
    () => new Set()
  );
  const [requestState, setRequestState] = useState<RequestState>("loading");
  const [message, setMessage] = useState("");
  const ecsDefaultsProjectName = ecsDefaults?.projectName;
  const ecsDefaultsRepositoryRevision = ecsDefaults?.repositoryRevision;
  const ecsDefaultsSourceRoot = ecsDefaults?.sourceRoot;
  const ecsDefaultsDockerfilePath = ecsDefaults?.dockerfilePath;
  const ecsDefaultsEcsWeb = ecsDefaults?.ecsWeb;
  const verifiedConnections = useMemo(
    () => connections.filter((connection) => connection.status === "verified"),
    [connections]
  );
  const selectedConnection = useMemo(
    () => verifiedConnections.find((connection) => connection.id === draft.connectionId) ?? null,
    [draft.connectionId, verifiedConnections]
  );
  const missingFieldKeys = useMemo(
    () => getMissingDeploymentTargetFieldKeys(draft, connections),
    [connections, draft]
  );
  const canSave =
    requestState !== "loading" && requestState !== "saving" && missingFieldKeys.length === 0;

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;

    async function load(): Promise<void> {
      setRequestState("loading");
      setMessage("");
      try {
        const [nextConnections, nextTarget, sourceRepositories, projectDraftResponse] =
          await Promise.all([
            listAwsConnections(),
            initialProfile ? Promise.resolve(initialTarget) : getProjectDeploymentTarget(projectId),
            initialProfile
              ? Promise.resolve(initialSourceRepository ? [initialSourceRepository] : [])
              : listSourceRepositories(projectId),
            getProjectDraft(projectId)
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
        const nextEcsDefaults =
          ecsDefaultsProjectName &&
          ecsDefaultsRepositoryRevision &&
          ecsDefaultsSourceRoot &&
          ecsDefaultsDockerfilePath
            ? {
                projectName: ecsDefaultsProjectName,
                repositoryRevision: ecsDefaultsRepositoryRevision,
                sourceRoot: ecsDefaultsSourceRoot,
                dockerfilePath: ecsDefaultsDockerfilePath,
                ecsWeb: ecsDefaultsEcsWeb ?? null
              }
            : null;
        const nextDraft = createDeploymentTargetDraft(
          nextTarget,
          nextConnections,
          nextSourceRepository,
          nextEcsDefaults,
          preferEcsDefaults ? "prefer_ecs_defaults" : "preserve_target",
          projectDraftResponse.draft?.diagramJson,
          initialRepositoryAnalysisTarget
        );
        setDraft(nextDraft);
        setLockedSystemFields(getLockedSystemFields(nextDraft, nextTarget));
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
  }, [
    authStatus,
    ecsDefaultsDockerfilePath,
    ecsDefaultsEcsWeb,
    ecsDefaultsProjectName,
    ecsDefaultsRepositoryRevision,
    ecsDefaultsSourceRoot,
    initialProfile,
    initialRepositoryAnalysisTarget,
    initialSourceRepository,
    initialTarget,
    preferEcsDefaults,
    projectId
  ]);

  function updateDraft<K extends keyof ProjectDeploymentTargetDraft>(
    key: K,
    value: ProjectDeploymentTargetDraft[K]
  ) {
    onDirty?.();
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function changeRuntime(runtimeTargetKind: RuntimeTargetKind) {
    onDirty?.();
    setLockedSystemFields(getLockedSystemFieldsAfterRuntimeChange);
    setDraft((current) =>
      changeDeploymentTargetRuntime(
        current,
        runtimeTargetKind,
        sourceRepository,
        initialRepositoryAnalysisTarget
      )
    );
    setMessage("");
  }

  async function saveTarget(): Promise<boolean> {
    if (!canSave) {
      setMessage(
        `저장 전 확인이 필요합니다: ${missingFieldKeys.map((key) => missingFieldLabels[key]).join(", ")}`
      );
      return false;
    }
    setRequestState("saving");
    setMessage("");
    try {
      const saved = await putProjectDeploymentTarget(
        projectId,
        createDeploymentTargetRequest(draft, connections)
      );
      setTarget(saved);
      const savedDraft = createDeploymentTargetDraft(saved, connections);
      setDraft(savedDraft);
      setLockedSystemFields(getLockedSystemFields(savedDraft, saved));
      setRequestState("idle");
      onSaved?.();
      setMessage("배포 타깃을 저장했습니다.");
      if (safeReturnTo) {
        router.replace(safeReturnTo);
      }
      return true;
    } catch (error) {
      setRequestState("error");
      setMessage(getApiErrorMessage(error, "배포 타깃을 저장하지 못했습니다."));
      return false;
    }
  }

  useImperativeHandle(ref, () => ({ save: saveTarget }));

  return (
    <section className="dashboardPanel integrationPanel" aria-labelledby="deployment-target-title">
      <div className="integrationHeader">
        <div>
          <p className="dashboardPanelKicker">Deployment</p>
          <h2 id="deployment-target-title">프로젝트 배포 타깃</h2>
        </div>
      </div>
      <p>어디에 배포할지만 확인하세요. 저장소와 AWS에서 확인한 값은 자동으로 채웁니다.</p>

      <div className={styles.sectionHeading}>
        <div>
          <h3>필수 확인</h3>
          <p>계정과 실행 방식이 맞으면 나머지 값은 그대로 저장할 수 있습니다.</p>
        </div>
        <span className={styles.requiredBadge}>2개 항목</span>
      </div>

      <div className={styles.decisionGrid}>
        <label className={styles.field}>
          <span>
            AWS 연결 <em>필수</em>
          </span>
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
          <small>배포할 AWS 계정과 Region을 결정합니다.</small>
        </label>
        <label className={styles.field}>
          <span>
            실행 방식 <em>필수</em>
          </span>
          <select
            disabled={requestState === "saving"}
            onChange={(event) => changeRuntime(event.target.value as RuntimeTargetKind)}
            value={draft.runtimeTargetKind}
          >
            {Object.entries(runtimeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <small>선택한 방식에 필요한 설정만 적용합니다.</small>
        </label>
      </div>

      <section className={styles.automaticSummary} aria-labelledby="automatic-settings-title">
        <div className={styles.summaryHeading}>
          <div>
            <h3 id="automatic-settings-title">자동 설정 결과</h3>
            <p>연결된 저장소와 AWS 정보로 계산했습니다.</p>
          </div>
          <span className={styles.readyBadge}>자동 입력</span>
        </div>
        <dl className={styles.summaryList}>
          <div>
            <dt>AWS 위치</dt>
            <dd>
              {selectedConnection
                ? `${selectedConnection.accountId ?? "AWS account"} · ${selectedConnection.region}`
                : "연결 선택 필요"}
            </dd>
          </div>
          <div>
            <dt>빌드 기준</dt>
            <dd>
              {draft.sourceRoot} · {draft.evidencePath}
            </dd>
          </div>
          <div>
            <dt>확정 소스</dt>
            <dd>{getShortCommitSha(draft.commitSha)}</dd>
          </div>
          <div>
            <dt>배포 위치</dt>
            <dd>{getRuntimeTargetSummary(draft)}</dd>
          </div>
          <div>
            <dt>공개 주소</dt>
            <dd>{draft.outputUrl || "첫 배포 후 자동 입력"}</dd>
          </div>
          {target ? (
            <div>
              <dt>마지막 저장</dt>
              <dd>{formatDeploymentTargetUpdatedAt(target.updatedAt)}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <ProjectDeploymentTargetAdvancedSettings
        draft={draft}
        lockedSystemFields={lockedSystemFields}
        updateDraft={updateDraft}
      />

      {verifiedConnections.length === 0 && requestState !== "loading" ? (
        <p className="dashboardMessage" role="status">
          검증된 AWS connection이 필요합니다.
        </p>
      ) : null}
      {missingFieldKeys.length > 0 && requestState === "idle" ? (
        <p className="dashboardMessage" role="status">
          저장 전 확인: {missingFieldKeys.map((key) => missingFieldLabels[key]).join(", ")}
        </p>
      ) : null}
      {message ? (
        <p className="dashboardMessage" role={requestState === "error" ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
      {showSaveButton ? (
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
      ) : null}
    </section>
  );
});
