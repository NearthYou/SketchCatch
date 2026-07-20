"use client";

import { useRouter } from "next/navigation";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
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
  getProjectDraft,
  listAwsConnections,
  putProjectDeploymentTarget
} from "../api";
import {
  changeDeploymentTargetRuntime,
  createDeploymentTargetDraft,
  createDeploymentTargetRequest,
  formatDeploymentTargetUpdatedAt,
  getDeploymentTargetOutputUrlSummary,
  getLockedSystemFields,
  getLockedSystemFieldsAfterRuntimeChange,
  getMissingDeploymentTargetFieldKeys,
  type EcsFargateDeploymentDefaultsInput,
  type MissingDeploymentTargetFieldKey,
  type ProjectDeploymentTargetDraft,
  type SystemManagedField
} from "./project-deployment-target-state";
import { getDeploymentTargetPresentation } from "../cicd-delivery-presentation";
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
  source_root: "소스 시작 폴더",
  build_evidence_path: "빌드 기준 파일",
  confirmed_commit_sha: "확정 commit",
  health_check_path: "Health Check 경로",
  install_preset: "패키지 설치 방식",
  codebuild_project: "CodeBuild 프로젝트",
  ecr_repository: "ECR 저장소",
  ecs_cluster: "ECS 클러스터",
  ecs_service: "ECS 서비스",
  container: "ECS 컨테이너",
  lambda_function_logical_id: "SAM 함수 logical ID",
  lambda_function: "Lambda 함수",
  lambda_alias: "Lambda alias",
  codedeploy_application: "CodeDeploy 애플리케이션",
  codedeploy_deployment_group: "CodeDeploy 배포 그룹",
  auto_scaling_group: "Auto Scaling 그룹",
  hosting_bucket: "버전 관리 Hosting bucket",
  cloudfront_distribution: "CloudFront distribution ID",
  cloudfront_origin: "CloudFront origin ID",
  output_url: "공개 URL"
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
    readonly headingLevel?: 2 | 4 | undefined;
    readonly ecsDefaults?: EcsFargateDeploymentDefaultsInput | null;
    readonly profile: ProjectDeploymentTargetEditorInitialProfile;
    readonly onDirty?: (() => void) | undefined;
    readonly onSaved?: (() => void) | undefined;
    readonly preferEcsDefaults?: boolean | undefined;
    readonly safeReturnTo?: string | null | undefined;
    readonly showSaveButton?: boolean | undefined;
  }
>(function ProjectDeploymentTargetEditor(
  {
    projectId,
    headingLevel = 2,
    ecsDefaults = null,
    profile,
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
  const initialTarget = profile.deploymentTarget;
  const initialRepositoryAnalysisTarget = profile.repositoryAnalysisTarget;
  const initialSourceRepository = profile.sourceRepository;
  const isDirtyRef = useRef(false);
  const profileOwnerRef = useRef(
    `${projectId}:${initialSourceRepository?.id ?? "none"}`
  );
  const [connections, setConnections] = useState<AwsConnection[]>([]);
  const [isDirty, setIsDirty] = useState(false);
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
  const missingAdvancedFieldKeys = useMemo(
    () => missingFieldKeys.filter((key) => key !== "aws_connection"),
    [missingFieldKeys]
  );
  const missingFieldMessage = useMemo(() => {
    const keys =
      missingAdvancedFieldKeys.length > 0 ? missingAdvancedFieldKeys : missingFieldKeys;
    const prefix =
      missingAdvancedFieldKeys.length > 0
        ? "자동 입력되지 않은 설정을 확인하세요"
        : "필수 항목을 확인하세요";
    return `${prefix}: ${keys.map((key) => missingFieldLabels[key]).join(", ")}`;
  }, [missingAdvancedFieldKeys, missingFieldKeys]);
  const targetPresentation = getDeploymentTargetPresentation({
    draftAwsConnectionId: draft.connectionId || null,
    savedAwsConnectionId: target?.connectionId ?? null,
    isDirty
  });
  const canSave =
    requestState !== "loading" &&
    requestState !== "saving" &&
    missingFieldKeys.length === 0 &&
    targetPresentation.status !== "saved";
  const Heading = headingLevel === 4 ? "h4" : "h2";
  const SectionHeading = headingLevel === 4 ? "h5" : "h3";

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;

    async function load(): Promise<void> {
      setRequestState("loading");
      setMessage("");
      try {
        const [nextConnections, projectDraftResponse] =
          await Promise.all([
            listAwsConnections(),
            getProjectDraft(projectId)
          ]);
        if (cancelled) return;
        const nextTarget = initialTarget;
        const nextSourceRepository = initialSourceRepository;
        setConnections(nextConnections);
        const nextOwner = `${projectId}:${nextSourceRepository?.id ?? "none"}`;
        if (isDirtyRef.current && profileOwnerRef.current === nextOwner) {
          setRequestState("idle");
          return;
        }
        profileOwnerRef.current = nextOwner;
        isDirtyRef.current = false;
        setIsDirty(false);
        setTarget(nextTarget);
        setSourceRepository(nextSourceRepository);
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
    isDirtyRef.current = true;
    setIsDirty(true);
    onDirty?.();
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function changeRuntime(runtimeTargetKind: RuntimeTargetKind) {
    isDirtyRef.current = true;
    setIsDirty(true);
    onDirty?.();
    const nextDraft = changeDeploymentTargetRuntime(
      draft,
      runtimeTargetKind,
      sourceRepository,
      initialRepositoryAnalysisTarget
    );
    setLockedSystemFields((current) =>
      getLockedSystemFieldsAfterRuntimeChange(current, nextDraft.commitSha)
    );
    setDraft(nextDraft);
    setMessage("");
  }

  async function saveTarget(): Promise<boolean> {
    if (!canSave) {
      setMessage(missingFieldMessage);
      return false;
    }
    setRequestState("saving");
    setMessage("");
    try {
      const saved = await putProjectDeploymentTarget(
        projectId,
        createDeploymentTargetRequest(draft, connections)
      );
      isDirtyRef.current = false;
      setIsDirty(false);
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
          <Heading id="deployment-target-title">프로젝트 배포 타깃</Heading>
        </div>
      </div>
      <p>어디에 배포할지만 확인하세요. 저장소와 AWS에서 확인한 값은 자동으로 채웁니다.</p>

      <div className={styles.sectionHeading}>
        <div>
          <SectionHeading>필수 확인</SectionHeading>
          <p>계정과 실행 방식이 맞으면 나머지 값은 그대로 저장할 수 있습니다.</p>
        </div>
        <span className={styles.requiredBadge}>
          {missingAdvancedFieldKeys.length > 0 ? "자동 입력 확인 필요" : "2개 항목"}
        </span>
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
            disabled={requestState === "loading" || requestState === "saving"}
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
            <SectionHeading id="automatic-settings-title">자동 설정 결과</SectionHeading>
            <p>연결된 저장소와 AWS 정보로 계산했습니다.</p>
          </div>
          <span className={styles.readyBadge} data-status={targetPresentation.status}>
            {targetPresentation.statusLabel}
          </span>
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
            <dd>{getDeploymentTargetOutputUrlSummary(draft)}</dd>
          </div>
          {target ? (
            <div>
              <dt>마지막 저장</dt>
              <dd>{formatDeploymentTargetUpdatedAt(target.updatedAt)}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {targetPresentation.readinessHint ? (
        <p className="dashboardMessage" role="status">
          {targetPresentation.readinessHint}
        </p>
      ) : null}

      <ProjectDeploymentTargetAdvancedSettings
        draft={draft}
        headingLevel={headingLevel === 4 ? 6 : 4}
        lockedSystemFields={lockedSystemFields}
        revealMissingFields={requestState === "idle" && missingAdvancedFieldKeys.length > 0}
        updateDraft={updateDraft}
      />

      {requestState === "loading" ? (
        <p className="dashboardMessage" role="status">
          배포 타깃 정보를 불러오는 중입니다.
        </p>
      ) : null}
      {verifiedConnections.length === 0 && requestState !== "loading" ? (
        <p className="dashboardMessage" role="status">
          검증된 AWS connection이 필요합니다.
        </p>
      ) : null}
      {missingFieldKeys.length > 0 && requestState === "idle" ? (
        <p className="dashboardMessage" role="status">
          {missingFieldMessage}
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
            {requestState === "saving" ? "저장 중" : targetPresentation.saveLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
});
