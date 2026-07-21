"use client";

import { useRouter } from "next/navigation";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type {
  AwsConnection,
  EcsWebBuildConfig,
  PackageManagerKind,
  ProjectDeliveryProfile,
  ProjectDeploymentTarget,
  RuntimeTargetKind,
  SourceRepository
} from "@sketchcatch/types";
import { useAuth } from "../../../components/auth/auth-provider";
import { getApiErrorMessage } from "../../../lib/api-client";
import { getProjectDraft, listAwsConnections, putProjectDeploymentTarget } from "../api";
import {
  getEcsWebBuildConfigIssueKeys,
  getEcsWebPackageManagerDefaultsForLockfile,
  updateEcsWebPackageManager,
  type EcsWebBuildConfigIssueKey
} from "./ecs-web-build-config-state";
import {
  changeDeploymentTargetRuntime,
  createManualEcsWebDraft,
  createDeploymentTargetDraft,
  createDeploymentTargetRequest,
  formatDeploymentTargetUpdatedAt,
  getDeploymentTargetOutputUrlSummary,
  getLockedSystemFields,
  getLockedSystemFieldsAfterRuntimeChange,
  getMissingDeploymentTargetFieldKeys,
  replaceDeploymentTargetEcsWeb,
  updateDeploymentTargetDraftField,
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
  ecs_web_build_config: "ECS 웹 빌드 설정",
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
    readonly showAutomaticSummary?: boolean | undefined;
    readonly showHeading?: boolean | undefined;
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
    showAutomaticSummary = true,
    showHeading = true,
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
  const profileOwnerRef = useRef(`${projectId}:${initialSourceRepository?.id ?? "none"}`);
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
    const keys = missingAdvancedFieldKeys.length > 0 ? missingAdvancedFieldKeys : missingFieldKeys;
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
        const [nextConnections, projectDraftResponse] = await Promise.all([
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
    setDraft((current) => updateDeploymentTargetDraftField(current, key, value));
    setMessage("");
  }

  function updateEcsWeb(ecsWeb: EcsWebBuildConfig) {
    isDirtyRef.current = true;
    setIsDirty(true);
    onDirty?.();
    setDraft((current) => replaceDeploymentTargetEcsWeb(current, ecsWeb));
    setMessage("");
  }

  function createManualEcsWeb(packageManager: PackageManagerKind) {
    isDirtyRef.current = true;
    setIsDirty(true);
    onDirty?.();
    setDraft((current) => createManualEcsWebDraft(current, packageManager));
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
    <section
      aria-label={showHeading ? undefined : "프로젝트 배포 타깃"}
      aria-labelledby={showHeading ? "deployment-target-title" : undefined}
      className="dashboardPanel integrationPanel"
    >
      {showHeading ? (
        <>
          <div className="integrationHeader">
            <div>
              <p className="dashboardPanelKicker">Deployment</p>
              <Heading id="deployment-target-title">프로젝트 배포 타깃</Heading>
            </div>
          </div>
          <p>어디에 배포할지만 확인하세요. 저장소와 AWS에서 확인한 값은 자동으로 채웁니다.</p>
        </>
      ) : null}

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

      {showAutomaticSummary ? (
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
      ) : null}

      {targetPresentation.readinessHint ? (
        <p className="dashboardMessage" role="status">
          {targetPresentation.readinessHint}
        </p>
      ) : null}

      {draft.runtimeTargetKind === "ecs_fargate" ? (
        <EcsWebAdvancedSettings
          createManualEcsWeb={createManualEcsWeb}
          draft={draft}
          headingLevel={headingLevel === 4 ? 6 : 4}
          lockedSystemFields={lockedSystemFields}
          revealMissingFields={requestState === "idle" && missingAdvancedFieldKeys.length > 0}
          updateDraft={updateDraft}
          updateEcsWeb={updateEcsWeb}
        />
      ) : (
        <ProjectDeploymentTargetAdvancedSettings
          draft={draft}
          headingLevel={headingLevel === 4 ? 6 : 4}
          lockedSystemFields={lockedSystemFields}
          revealMissingFields={requestState === "idle" && missingAdvancedFieldKeys.length > 0}
          updateDraft={updateDraft}
        />
      )}

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

type DraftUpdater = <K extends keyof ProjectDeploymentTargetDraft>(
  key: K,
  value: ProjectDeploymentTargetDraft[K]
) => void;

const ecsSystemFields = [
  { key: "codeBuildProjectName", label: "CodeBuild project" },
  { key: "ecrRepositoryName", label: "ECR repository" },
  { key: "clusterName", label: "ECS cluster" },
  { key: "serviceName", label: "ECS service" },
  { key: "containerName", label: "Container" }
] as const;

function EcsWebAdvancedSettings({
  createManualEcsWeb,
  draft,
  headingLevel,
  lockedSystemFields,
  revealMissingFields,
  updateDraft,
  updateEcsWeb
}: {
  readonly createManualEcsWeb: (packageManager: PackageManagerKind) => void;
  readonly draft: ProjectDeploymentTargetDraft;
  readonly headingLevel: 4 | 6;
  readonly lockedSystemFields: ReadonlySet<SystemManagedField>;
  readonly revealMissingFields: boolean;
  readonly updateDraft: DraftUpdater;
  readonly updateEcsWeb: (ecsWeb: EcsWebBuildConfig) => void;
}) {
  const Heading = headingLevel === 6 ? "h6" : "h4";
  const issueKeys = new Set<EcsWebBuildConfigIssueKey>(
    getEcsWebBuildConfigIssueKeys(draft.ecsWeb)
  );
  const ecsWeb = draft.ecsWeb;

  if (!ecsWeb) {
    const packageManagerInvalid = issueKeys.has("frontend_package_manager");
    return (
      <details
        className={styles.advancedSettings}
        open={revealMissingFields || undefined}
      >
        <summary>
          <span>
            <strong>Advanced Settings</strong>
            <small>ECS API와 Frontend 빌드 정보를 저장소 구조에 맞게 확인하세요.</small>
          </span>
        </summary>
        <div className={styles.advancedBody}>
          <div className={styles.advancedGroupHeading}>
            <Heading>ECS 웹 빌드 설정</Heading>
            <p>패키지 매니저를 선택하면 수동 입력을 시작합니다.</p>
          </div>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Package manager</span>
              <select
                aria-invalid={packageManagerInvalid || undefined}
                onChange={(event) => {
                  if (event.target.value) {
                    createManualEcsWeb(event.target.value as PackageManagerKind);
                  }
                }}
                value=""
              >
                <option value="">패키지 매니저 선택</option>
                <option value="npm">npm</option>
                <option value="pnpm">pnpm</option>
                <option value="yarn">Yarn</option>
              </select>
              <FieldHint
                error="Frontend lockfile과 일치하는 패키지 매니저를 선택하세요."
                help="Frontend 경로는 선택 후 직접 확인해야 하며 자동으로 추측하지 않습니다."
                invalid={packageManagerInvalid}
              />
            </label>
          </div>
        </div>
      </details>
    );
  }
  const configuredEcsWeb: EcsWebBuildConfig = ecsWeb;

  function updateApi(patch: Partial<EcsWebBuildConfig["api"]>): void {
    updateEcsWeb({
      ...configuredEcsWeb,
      api: { ...configuredEcsWeb.api, ...patch }
    });
  }

  function updateFrontend(patch: Partial<EcsWebBuildConfig["frontend"]>): void {
    updateEcsWeb({
      ...configuredEcsWeb,
      frontend: { ...configuredEcsWeb.frontend, ...patch }
    });
  }

  function updateLockfilePath(lockfilePath: string): void {
    let next: EcsWebBuildConfig = {
      ...configuredEcsWeb,
      frontend: { ...configuredEcsWeb.frontend, lockfilePath }
    };
    const packageManager = getEcsWebPackageManagerDefaultsForLockfile(lockfilePath);
    if (packageManager) {
      next = updateEcsWebPackageManager(next, packageManager.kind);
    }
    updateEcsWeb(next);
  }

  const apiSourceRootInvalid = issueKeys.has("api_source_root");
  const dockerfilePathInvalid = issueKeys.has("api_dockerfile_path");
  const containerPortInvalid = issueKeys.has("api_container_port");
  const healthCheckPathInvalid = issueKeys.has("api_health_check_path");
  const frontendSourceRootInvalid = issueKeys.has("frontend_source_root");
  const packageManifestPathInvalid = issueKeys.has("frontend_package_manifest_path");
  const lockfilePathInvalid = issueKeys.has("frontend_lockfile_path");
  const packageManagerInvalid =
    issueKeys.has("frontend_package_manager") || issueKeys.has("frontend_package_presets");
  const packageManagerVersionInvalid = issueKeys.has("frontend_package_manager_version");
  const frontendOutputPathInvalid = issueKeys.has("frontend_output_path");

  return (
    <details className={styles.advancedSettings} open={revealMissingFields || undefined}>
      <summary>
        <span>
          <strong>Advanced Settings</strong>
          <small>ECS API와 Frontend 빌드 정보를 저장소 구조에 맞게 확인하세요.</small>
        </span>
      </summary>
      <div className={styles.advancedBody}>
        <div className={styles.advancedGroupHeading}>
          <Heading>ECS API 빌드</Heading>
          <p>API 이미지와 Health Check에 실제로 사용하는 값을 입력합니다.</p>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>API source root</span>
            <input
              aria-invalid={apiSourceRootInvalid || undefined}
              onChange={(event) => updateDraft("sourceRoot", event.target.value)}
              value={draft.sourceRoot}
            />
            <FieldHint
              error="절대 경로와 '..' 없이 저장소 기준 상대 경로를 입력하세요."
              help="Docker build를 시작할 API 폴더입니다."
              invalid={apiSourceRootInvalid}
            />
          </label>
          <label className={styles.field}>
            <span>Dockerfile path</span>
            <input
              aria-invalid={dockerfilePathInvalid || undefined}
              onChange={(event) => updateDraft("evidencePath", event.target.value)}
              value={draft.evidencePath}
            />
            <FieldHint
              error="저장소 안의 안전한 Dockerfile 상대 경로를 입력하세요."
              help="API 이미지를 만드는 Dockerfile입니다."
              invalid={dockerfilePathInvalid}
            />
          </label>
          <label className={styles.field}>
            <span>Container port</span>
            <input
              aria-invalid={containerPortInvalid || undefined}
              max={65_535}
              min={1}
              onChange={(event) =>
                updateApi({
                  containerPort: event.target.value ? Number(event.target.value) : 0
                })
              }
              type="number"
              value={ecsWeb.api.containerPort}
            />
            <FieldHint
              error="1부터 65535 사이의 정수 포트를 입력하세요."
              help="ECS Task가 API에 연결할 컨테이너 포트입니다."
              invalid={containerPortInvalid}
            />
          </label>
          <label className={styles.field}>
            <span>Health check path</span>
            <input
              aria-invalid={healthCheckPathInvalid || undefined}
              onChange={(event) => updateDraft("healthCheckPath", event.target.value)}
              value={draft.healthCheckPath}
            />
            <FieldHint
              error="'/'로 시작하고 query나 fragment가 없는 HTTP 경로를 입력하세요."
              help="배포 성공 여부를 확인할 API 경로입니다."
              invalid={healthCheckPathInvalid}
            />
          </label>
          <label className={styles.field}>
            <span>
              Release version <i>선택</i>
            </span>
            <input
              onChange={(event) => updateDraft("version", event.target.value)}
              placeholder="예: v1.2.3"
              value={draft.version}
            />
            <small>비워두면 commit SHA를 버전으로 사용합니다.</small>
          </label>
        </div>

        <div className={styles.advancedGroupHeading}>
          <Heading>Frontend 빌드</Heading>
          <p>실제 저장소와 빌드 결과 경로를 확인해 입력합니다.</p>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Frontend source root</span>
            <input
              aria-invalid={frontendSourceRootInvalid || undefined}
              onChange={(event) => updateFrontend({ sourceRoot: event.target.value })}
              value={ecsWeb.frontend.sourceRoot}
            />
            <FieldHint
              error="Frontend 앱의 저장소 기준 상대 경로를 입력하세요."
              help="Frontend build 명령을 실행할 폴더입니다."
              invalid={frontendSourceRootInvalid}
            />
          </label>
          <label className={styles.field}>
            <span>Package manifest path</span>
            <input
              aria-invalid={packageManifestPathInvalid || undefined}
              onChange={(event) => updateFrontend({ packageManifestPath: event.target.value })}
              value={ecsWeb.frontend.packageManifestPath}
            />
            <FieldHint
              error="Frontend package.json의 저장소 기준 상대 경로를 입력하세요."
              help="Frontend 의존성과 build script를 확인하는 파일입니다."
              invalid={packageManifestPathInvalid}
            />
          </label>
          <label className={styles.field}>
            <span>Lockfile path</span>
            <input
              aria-invalid={lockfilePathInvalid || undefined}
              onChange={(event) => updateLockfilePath(event.target.value)}
              value={ecsWeb.frontend.lockfilePath}
            />
            <FieldHint
              error="package-lock.json, pnpm-lock.yaml 또는 yarn.lock의 상대 경로를 입력하세요."
              help="인식된 lockfile은 패키지 매니저와 preset을 함께 맞춥니다."
              invalid={lockfilePathInvalid}
            />
          </label>
          <label className={styles.field}>
            <span>Package manager</span>
            <select
              aria-invalid={packageManagerInvalid || undefined}
              onChange={(event) =>
                updateEcsWeb(
                  updateEcsWebPackageManager(
                    ecsWeb,
                    event.target.value as PackageManagerKind
                  )
                )
              }
              value={ecsWeb.frontend.packageManager}
            >
              <option value="npm">npm</option>
              <option value="pnpm">pnpm</option>
              <option value="yarn">Yarn</option>
            </select>
            <FieldHint
              error="선택한 매니저와 install/build preset이 일치해야 합니다."
              help="변경하면 해당 매니저의 기본 버전과 preset을 적용합니다."
              invalid={packageManagerInvalid}
            />
          </label>
          <label className={styles.field}>
            <span>Package manager version</span>
            <input
              aria-invalid={packageManagerVersionInvalid || undefined}
              onChange={(event) =>
                updateFrontend({ packageManagerVersion: event.target.value })
              }
              placeholder="예: 11.8.0"
              value={ecsWeb.frontend.packageManagerVersion}
            />
            <FieldHint
              error="major.minor.patch 형식의 SemVer를 입력하세요."
              help="CI에서 설치할 패키지 매니저 버전입니다."
              invalid={packageManagerVersionInvalid}
            />
          </label>
          <label className={styles.field}>
            <span>Frontend output path</span>
            <input
              aria-invalid={frontendOutputPathInvalid || undefined}
              onChange={(event) => updateFrontend({ outputPath: event.target.value })}
              value={ecsWeb.frontend.outputPath}
            />
            <FieldHint
              error="Frontend build가 실제로 생성하는 상대 경로를 입력하세요."
              help="CloudFront가 제공할 정적 산출물 폴더입니다."
              invalid={frontendOutputPathInvalid}
            />
          </label>
        </div>

        <div className={styles.advancedGroupHeading}>
          <Heading>AWS 배포 시스템 값</Heading>
          <p>자동 계산에 실패해 비어 있는 값만 저장 전에 수정하세요.</p>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Confirmed commit SHA</span>
            <input
              autoComplete="off"
              onChange={(event) => updateDraft("commitSha", event.target.value)}
              placeholder="40 or 64 character SHA"
              readOnly={lockedSystemFields.has("commitSha")}
              spellCheck={false}
              value={draft.commitSha}
            />
            <small>Repository 분석에서 확인한 배포 소스입니다.</small>
          </label>
          {ecsSystemFields.map((field) => (
            <label className={styles.field} key={field.key}>
              <span>{field.label}</span>
              <input
                onChange={(event) => updateDraft(field.key, event.target.value)}
                readOnly={lockedSystemFields.has(field.key)}
                value={draft[field.key]}
              />
            </label>
          ))}
          <label className={styles.field}>
            <span>
              Output URL <i>배포 후</i>
            </span>
            <input
              placeholder="첫 배포 후 자동 입력"
              readOnly
              value={draft.outputUrl}
            />
            <small>첫 배포에서 확인한 HTTPS 주소가 자동으로 반영됩니다.</small>
          </label>
        </div>
      </div>
    </details>
  );
}

function FieldHint({
  error,
  help,
  invalid
}: {
  readonly error: string;
  readonly help: string;
  readonly invalid: boolean;
}) {
  return <small className={invalid ? styles.fieldError : undefined}>{invalid ? error : help}</small>;
}
