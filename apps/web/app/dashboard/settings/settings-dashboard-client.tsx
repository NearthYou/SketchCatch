"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Cloud,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
  Trash2,
  X
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  AwsConnection,
  AwsCodeConnectionResponse,
  AwsCodeConnectionStatus,
  AwsConnectionCloudFormationTemplateResponse,
  AwsConnectionDeletionPreviewResponse,
  GitHubInstallationConnection
} from "@sketchcatch/types";
import { ProductState } from "../../../components/ui/ProductState";
import { DashboardIcon } from "../../../components/dashboard/dashboard-icons";
import { setupModalAccessibility } from "../../../components/ui/modal-accessibility";
import {
  SelectMenu,
  type SelectMenuOption
} from "../../../components/ui/SelectMenu";
import {
  createAwsConnectionSetup,
  checkAwsImportAccessReads,
  createAwsCodeConnection,
  deleteAwsConnection,
  disconnectAwsCodeConnection,
  getAwsConnectionDeletionPreview,
  getAwsConnectionCloudFormationTemplate,
  refreshAwsCodeConnection,
  testAwsConnection,
  verifyAwsConnection,
  verifyAwsConnectionCreatedRole
} from "../../../features/workspace/api";
import { restoreAwsConnectionSetup } from "../../../features/dashboard/aws-connection-setup";
import {
  useAwsCodeConnectionsQueries,
  useAwsConnectionsQuery,
  useAwsConnectionSettingsQuery,
  useGitHubInstallationsQuery
} from "../../../features/dashboard/connection-queries";
import { useAuth } from "../../../components/auth/auth-provider";
import { invalidateAwsConnectionQueries } from "../../../components/query/dashboard-query-invalidation";
import { queryKeys } from "../../../lib/query-keys";
import {
  deriveAwsConnectionSettingsState,
  type AwsConnectionCleanupRetryDisplay
} from "../../../features/dashboard/aws-connection-settings-state";
import {
  deriveAwsCodeConnectionConnectedState,
  deriveGitHubCodeBuildAuthorizationTarget,
  getAwsCodeConnectionDisplayName,
  type GitHubCodeBuildAuthorizationTarget
} from "../../../features/dashboard/github-codebuild-authorization-state";
import { AwsImportAccessWizard } from "../../../features/dashboard/AwsImportAccessWizard";
import styles from "../dashboard-tools.module.css";
import settingsStyles from "./settings-dashboard.module.css";
import { getSettingsAwsConnectionAction } from "./settings-aws-connection-action";
import { GitHubAccountSettings } from "./github-account-settings";
import { getSettingsAwsRecoveryNavigation } from "./settings-aws-recovery-navigation";
import {
  deriveSettingsConnectionFlowState,
  type SettingsConnectionFlowStepId,
  type SettingsConnectionFlowStepState
} from "../../../features/dashboard/settings-connection-flow-state";

const AWS_REGION_OPTIONS: readonly SelectMenuOption[] = [
  { label: "서울", value: "ap-northeast-2" },
  { label: "버지니아 북부", value: "us-east-1" },
  { label: "도쿄", value: "ap-northeast-1" }
];

/** gg: 설정 화면은 API·AWS 진단을 노출하지 않고 사용자가 바로 이해할 수 있는 다음 행동만 안내합니다. */
function getSettingsErrorMessage(_error: unknown, fallbackMessage: string): string {
  return fallbackMessage;
}

// gg: AWS 연결과 GitHub 배포 연결을 사용자가 한 화면에서 이어서 관리합니다.
export function SettingsDashboardClient() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const recoveryAwsConnectionId = getSingleSearchParam(
    searchParams.getAll("awsConnectionId")
  );
  const recoveryNavigation = getSettingsAwsRecoveryNavigation({
    awsConnectionId: recoveryAwsConnectionId,
    next: getSingleSearchParam(searchParams.getAll("next")),
    tab: getSingleSearchParam(searchParams.getAll("tab"))
  });
  const recoveryConnectionsQuery = useAwsConnectionsQuery({
    includeUnverified: recoveryNavigation.includeUnverifiedAwsConnections
  });
  const connectionsQuery = useAwsConnectionSettingsQuery();
  const githubInstallationsQuery = useGitHubInstallationsQuery();
  const githubAuthorizationTarget = useMemo(
    () => deriveGitHubCodeBuildAuthorizationTarget(
      githubInstallationsQuery.data?.installations ?? [],
      githubInstallationsQuery.data?.availability
    ),
    [githubInstallationsQuery.data]
  );
  const connectionSettings = useMemo(
    () =>
      connectionsQuery.data
        ? deriveAwsConnectionSettingsState(connectionsQuery.data)
        : {
            activeConnections: [] as readonly AwsConnection[],
            verifiedConnections: [] as readonly AwsConnection[],
            cleanupRetries: [] as readonly AwsConnectionCleanupRetryDisplay[]
          },
    [connectionsQuery.data]
  );
  const recoveryMode = recoveryNavigation.includeUnverifiedAwsConnections;
  const displayedConnectionsQuery = recoveryMode ? recoveryConnectionsQuery : connectionsQuery;
  const connections = connectionSettings.activeConnections;
  const verifiedConnections = connectionSettings.verifiedConnections;
  const cleanupRetries = connectionSettings.cleanupRetries;
  const displayedConnections = useMemo(
    () => (recoveryMode ? recoveryConnectionsQuery.data ?? [] : connections),
    [connections, recoveryConnectionsQuery.data, recoveryMode]
  );
  const displayedVerifiedConnections = useMemo(
    () =>
      recoveryMode
        ? displayedConnections.filter((connection) => connection.status === "verified")
        : verifiedConnections,
    [displayedConnections, recoveryMode, verifiedConnections]
  );
  const displayedCleanupRetries = recoveryMode ? [] : cleanupRetries;
  const displayedVerifiedConnectionIds = useMemo(
    () => displayedVerifiedConnections.map((connection) => connection.id),
    [displayedVerifiedConnections]
  );
  const codeConnectionQueries = useAwsCodeConnectionsQueries(displayedVerifiedConnectionIds);
  const codeConnections = useMemo(
    () =>
      Object.fromEntries(
        codeConnectionQueries.flatMap((query, index) =>
          query.data
            ? [[displayedVerifiedConnectionIds[index], query.data] as const]
            : []
        )
      ),
    [codeConnectionQueries, displayedVerifiedConnectionIds]
  );
  const codeConnectionLoadError = codeConnectionQueries.find((query) => query.isError)?.error;
  const isConnectionsPending = recoveryMode
    ? recoveryConnectionsQuery.isPending && !recoveryConnectionsQuery.data
    : connectionsQuery.isPending && !connectionsQuery.data;
  const hasSettingsLoadError =
    connectionsQuery.isError && connections.length === 0 && cleanupRetries.length === 0;
  const hasConnectionsLoadError = recoveryMode
    ? recoveryConnectionsQuery.isError && displayedConnections.length === 0
    : hasSettingsLoadError;
  const [actionPending, setActionPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [region, setRegion] = useState("ap-northeast-2");
  const [setupConnection, setSetupConnection] = useState<AwsConnection | null>(null);
  const [cloudFormation, setCloudFormation] = useState<AwsConnectionCloudFormationTemplateResponse | null>(null);
  const [accountId, setAccountId] = useState("");
  const [deletionPreview, setDeletionPreview] =
    useState<AwsConnectionDeletionPreviewResponse | null>(null);
  const [deletionErrorMessage, setDeletionErrorMessage] = useState("");
  const [showCodeConnectionDisconnectModal, setShowCodeConnectionDisconnectModal] =
    useState(false);
  const [selectedBuildAwsConnectionId, setSelectedBuildAwsConnectionId] = useState("");
  const selectedCodeConnectionStatus =
    codeConnections[selectedBuildAwsConnectionId]?.codeConnection?.status;
  const githubStepComplete = githubAuthorizationTarget.status === "ready";
  const awsStepComplete = displayedVerifiedConnections.length > 0;
  const connectionFlow = deriveSettingsConnectionFlowState({
    codeBuildStatus: selectedCodeConnectionStatus,
    githubReady: githubStepComplete,
    hasVerifiedAwsConnection: awsStepComplete
  });
  const recommendedConnectionStep = connectionFlow.recommendedConnectionStep;
  const [expandedConnectionStep, setExpandedConnectionStep] =
    useState<SettingsConnectionFlowStepId | null>(recommendedConnectionStep);
  const [showAwsRequiredModal, setShowAwsRequiredModal] = useState(false);
  const modalOverlayRef = useRef<HTMLDivElement>(null);
  const modalDialogRef = useRef<HTMLElement>(null);
  const modalCloseButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setExpandedConnectionStep(recommendedConnectionStep);
  }, [recommendedConnectionStep]);

  // 저장된 AWS 연결 목록을 다시 읽고 현재 상태를 최신으로 맞춥니다.
  async function loadConnections(): Promise<void> {
    setErrorMessage("");
    const [result] = await Promise.all([
      displayedConnectionsQuery.refetch(),
      githubInstallationsQuery.refetch(),
      ...codeConnectionQueries.map((query) => query.refetch())
    ]);
    if (result.error) {
      setErrorMessage(getSettingsErrorMessage(result.error, "AWS 연결을 불러오지 못했습니다."));
    }
  }

  function cacheCodeConnection(
    awsConnectionId: string,
    response: AwsCodeConnectionResponse
  ): void {
    if (!user?.id) return;
    queryClient.setQueryData(
      queryKeys.awsCodeConnection(user.id, awsConnectionId),
      response
    );
  }

  async function invalidateConnections(): Promise<void> {
    await invalidateAwsConnectionQueries(queryClient, user?.id);
  }

  // gg: 구조 분석 준비를 마친 같은 AWS 연결만 원래 화면으로 돌려보냅니다.
  function returnToReverseEngineeringAfterRecovery(): void {
    if (recoveryNavigation.returnHref) {
      router.replace(recoveryNavigation.returnHref);
    }
  }

  // gg: 새 AWS 연결에 필요한 AWS Console 승인 정보를 준비합니다.
  async function createConnection(): Promise<void> {
    setActionPending(true);
    setErrorMessage("");
    try {
      const created = await createAwsConnectionSetup({ region });
      const template = await getAwsConnectionCloudFormationTemplate({
        connectionId: created.awsConnection.id
      });
      setSetupConnection(created.awsConnection);
      setCloudFormation(template);
      await invalidateConnections();
    } catch (error) {
      setErrorMessage(getSettingsErrorMessage(error, "AWS 연결 준비에 실패했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  // gg: 새로고침 뒤에도 미완료 AWS 연결을 이어서 승인할 수 있게 합니다.
  async function resumeConnectionSetup(connection: AwsConnection): Promise<void> {
    setActionPending(true);
    setErrorMessage("");
    setSetupConnection(null);
    setCloudFormation(null);
    try {
      const restored = await restoreAwsConnectionSetup(
        connection,
        getAwsConnectionCloudFormationTemplate
      );
      setSetupConnection(restored.connection);
      setCloudFormation(restored.cloudFormation);
      setAccountId(restored.accountId);
      setRegion(restored.region);
    } catch (error) {
      setErrorMessage(getSettingsErrorMessage(error, "AWS 연결 설정을 불러오지 못했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  // gg: AWS Console 승인 뒤 사용자가 입력한 계정으로 연결만 확인합니다.
  async function verifyCreatedRole(): Promise<void> {
    if (!setupConnection || !/^\d{12}$/.test(accountId)) return;
    setActionPending(true);
    setErrorMessage("");
    try {
      await verifyAwsConnectionCreatedRole({
        connectionId: setupConnection.id,
        accountId
      });
      try {
        // gg: 새 연결은 한 번의 안전한 읽기 확인으로 구조 분석 준비 상태까지 함께 갱신합니다.
        await checkAwsImportAccessReads(setupConnection.id);
      } catch {
        // gg: 구조 분석 확인 실패가 이미 완료된 AWS 연결 자체를 실패로 바꾸지 않습니다.
      }
      setSetupConnection(null);
      setCloudFormation(null);
      setAccountId("");
      await invalidateConnections();
    } catch (error) {
      setErrorMessage(getSettingsErrorMessage(error, "AWS 연결을 확인하지 못했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  // gg: 이미 연결한 AWS 계정이 지금도 사용할 수 있는지만 다시 확인합니다.
  async function retestConnection(connection: AwsConnection): Promise<void> {
    if (!connection.roleArn) return;
    setActionPending(true);
    setErrorMessage("");
    try {
      await testAwsConnection({ connectionId: connection.id, roleArn: connection.roleArn });
      try {
        // gg: 사용자가 연결을 다시 확인할 때 구조 분석 준비 상태도 함께 최신으로 맞춥니다.
        await checkAwsImportAccessReads(connection.id);
      } catch {
        // gg: 연결 확인 성공을 구조 분석 상태 확인 실패로 되돌리지 않습니다.
      }
      await invalidateConnections();
    } catch (error) {
      setErrorMessage(getSettingsErrorMessage(error, "AWS 연결을 확인하지 못했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  // gg: 이전에 실패한 연결은 새 연결을 만들지 않고 기존 연결을 다시 확인합니다.
  async function reverifyConnection(connection: AwsConnection): Promise<void> {
    if (!connection.roleArn) {
      await resumeConnectionSetup(connection);
      return;
    }

    setActionPending(true);
    setErrorMessage("");
    try {
      await verifyAwsConnection({ connectionId: connection.id, roleArn: connection.roleArn });
      try {
        // gg: 복구한 AWS 연결도 같은 안전한 읽기 확인을 거쳐 구조 분석 준비 상태를 갱신합니다.
        await checkAwsImportAccessReads(connection.id);
      } catch {
        // gg: AWS 연결 복구와 구조 분석 준비 상태는 독립적으로 보존합니다.
      }
      await invalidateConnections();
    } catch (error) {
      setErrorMessage(getSettingsErrorMessage(error, "AWS 연결을 다시 확인하지 못했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  // gg: 연결 해제 전에 실제로 정리될 항목만 먼저 확인합니다.
  async function removeConnection(connectionId: string): Promise<void> {
    setActionPending(true);
    setErrorMessage("");
    setDeletionErrorMessage("");
    try {
      setDeletionPreview(await getAwsConnectionDeletionPreview(connectionId));
    } catch (error) {
      setErrorMessage(getSettingsErrorMessage(error, "AWS 연결 해제 대상을 불러오지 못했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  // gg: 사용자가 확인한 연결 해제는 목록에 표시한 SketchCatch 연결 보조 항목만 정리합니다.
  async function confirmRemoveConnection(): Promise<void> {
    if (!deletionPreview?.canDelete) return;
    setActionPending(true);
    setErrorMessage("");
    setDeletionErrorMessage("");
    try {
      await deleteAwsConnection(deletionPreview.connectionId, {
        confirmedManagedCleanup: true,
        confirmationToken: deletionPreview.confirmationToken
      });
      setDeletionPreview(null);
      await invalidateConnections();
    } catch (error) {
      setDeletionErrorMessage(getSettingsErrorMessage(error, "AWS 연결을 해제하지 못했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  function closeDeletionPreview(): void {
    setDeletionPreview(null);
    setDeletionErrorMessage("");
  }

  async function connectGitHubBuild(): Promise<void> {
    if (githubInstallationsQuery.isPending) {
      setErrorMessage("GitHub App 연결 상태를 확인하고 있습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (githubInstallationsQuery.isError) {
      setErrorMessage("GitHub App 연결 정보를 확인한 뒤 다시 시도해 주세요.");
      return;
    }
    if (githubAuthorizationTarget.status === "github_app_not_configured") {
      document.getElementById("github-account-connection")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      return;
    }
    if (githubAuthorizationTarget.status === "github_installation_required") {
      document.getElementById("github-account-connection")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      return;
    }
    if (githubAuthorizationTarget.status === "multiple_github_installations_unsupported") {
      setErrorMessage("GitHub 연결 정리 필요: AWS 승인 전에 활성 GitHub App 연결을 하나만 남겨 주세요.");
      return;
    }
    if (displayedVerifiedConnections.length === 0) {
      setShowAwsRequiredModal(true);
      return;
    }
    if (!displayedVerifiedConnections.some((connection) => connection.id === selectedBuildAwsConnectionId)) {
      setErrorMessage("GitHub 배포 연결에 사용할 AWS 계정을 선택해 주세요.");
      return;
    }
    setActionPending(true);
    setErrorMessage("");
    try {
      const response = await createAwsCodeConnection(selectedBuildAwsConnectionId);
      cacheCodeConnection(selectedBuildAwsConnectionId, response);
    } catch (error) {
      setErrorMessage(getSettingsErrorMessage(error, "GitHub 배포 연결을 만들지 못했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  async function refreshGitHubBuildConnection(): Promise<void> {
    if (!selectedBuildAwsConnectionId) return;
    setActionPending(true);
    setErrorMessage("");
    try {
      const response = await refreshAwsCodeConnection(selectedBuildAwsConnectionId);
      cacheCodeConnection(selectedBuildAwsConnectionId, response);
    } catch (error) {
      setErrorMessage(getSettingsErrorMessage(error, "GitHub 승인 상태를 확인하지 못했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  function openGitHubBuildDisconnect(): void {
    if (selectedBuildAwsConnectionId) setShowCodeConnectionDisconnectModal(true);
  }

  async function confirmGitHubBuildDisconnect(): Promise<void> {
    if (!selectedBuildAwsConnectionId) return;
    const connectionId = selectedBuildAwsConnectionId;
    setActionPending(true);
    setErrorMessage("");
    try {
      await disconnectAwsCodeConnection(connectionId, { confirmedManagedCleanup: true });
      cacheCodeConnection(connectionId, { codeConnection: null });
      setShowCodeConnectionDisconnectModal(false);
    } catch (error) {
      setShowCodeConnectionDisconnectModal(false);
      setErrorMessage(getSettingsErrorMessage(error, "GitHub 빌드 연결을 해제하지 못했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  useEffect(() => {
    setSelectedBuildAwsConnectionId((current) =>
      displayedVerifiedConnections.some((connection) => connection.id === current)
        ? current
        : displayedVerifiedConnections.length === 1
          ? (displayedVerifiedConnections[0]?.id ?? "")
          : ""
    );
  }, [displayedVerifiedConnections]);

  useEffect(() => {
    if (!showAwsRequiredModal && !deletionPreview && !showCodeConnectionDisconnectModal) return;
    const overlay = modalOverlayRef.current;
    const dialog = modalDialogRef.current;
    const closeButton = modalCloseButtonRef.current;
    if (!overlay || !dialog || !closeButton) return;

    return setupModalAccessibility({
      closeButton,
      dialog,
      documentRoot: document,
      onClose: () => {
        setShowAwsRequiredModal(false);
        setDeletionPreview(null);
        setShowCodeConnectionDisconnectModal(false);
      },
      overlay
    });
  }, [deletionPreview, showAwsRequiredModal, showCodeConnectionDisconnectModal]);

  const selectedCodeConnection = codeConnections[selectedBuildAwsConnectionId]?.codeConnection;
  const {
    awsStepState,
    codeBuildStepState,
    githubStepState
  } = connectionFlow;
  const primaryVerifiedConnection = displayedVerifiedConnections[0];
  const githubStepSummary = githubStepComplete
    ? `${githubAuthorizationTarget.installation.accountLogin} · ${githubAuthorizationTarget.installation.accountType ?? "GitHub account"}`
    : githubAuthorizationTarget.status === "multiple_github_installations_unsupported"
      ? "활성 GitHub App 연결을 하나만 남겨 주세요."
      : "GitHub 조직과 저장소를 연결해 주세요.";
  const awsStepSummary = primaryVerifiedConnection
    ? `${primaryVerifiedConnection.accountId ?? "계정 확인 전"} · ${getAwsRegionLabel(primaryVerifiedConnection.region)}`
    : "";
  const codeBuildStepSummary = getCodeBuildStepSummary(
    selectedCodeConnection?.status,
    githubAuthorizationTarget.status === "ready"
      ? githubAuthorizationTarget.installation.accountLogin
      : undefined
  );

  return (
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader dashboardPageHeaderCompact">
        <div><h1>설정</h1></div>
        <button className={styles.iconAction} aria-label="연결 새로고침" disabled={displayedConnectionsQuery.isFetching} onClick={() => void loadConnections()} title="새로고침" type="button"><RefreshCw size={17} /></button>
      </header>

      {isConnectionsPending ? (
        <>
          <GitHubAccountSettings />
          <ProductState description="AWS 연결 상태를 확인하고 있습니다." kind="loading" title="AWS 설정 불러오는 중" />
        </>
      ) : hasConnectionsLoadError ? (
        <>
          <GitHubAccountSettings />
          <ProductState action={<button onClick={() => void loadConnections()} type="button">다시 시도</button>} description={getSettingsErrorMessage(displayedConnectionsQuery.error, "AWS 연결을 불러오지 못했습니다.")} kind="error" title="AWS 환경설정을 불러오지 못했습니다" />
        </>
      ) : (
        <>
          {displayedConnectionsQuery.isError ? <p className={styles.errorBand}>{getSettingsErrorMessage(displayedConnectionsQuery.error, "AWS 연결을 갱신하지 못했습니다.")}</p> : null}
          {codeConnectionLoadError ? <p className={styles.errorBand}>{getSettingsErrorMessage(codeConnectionLoadError, "GitHub 배포 연결 상태를 불러오지 못했습니다.")}</p> : null}
          {errorMessage ? <p className={styles.errorBand}>{errorMessage}</p> : null}

          <section aria-label="외부 서비스 연결 순서" className={styles.connectionFlow}>
            <ConnectionFlowStep
              expanded={expandedConnectionStep === "github"}
              icon={<DashboardIcon name="github" />}
              number={1}
              onToggle={() => setExpandedConnectionStep("github")}
              state={githubStepState}
              summary={githubStepSummary}
              title="GitHub App 연결"
              titleId="github-account-settings-title"
            >
              <GitHubAccountSettings embedded />
            </ConnectionFlowStep>

            <ConnectionFlowStep
              expanded={expandedConnectionStep === "aws"}
              icon={<Cloud />}
              number={2}
              onToggle={() => setExpandedConnectionStep("aws")}
              state={awsStepState}
              summary={awsStepSummary}
              title="AWS 연결"
              titleId="aws-account-connection-title"
            >
              <div className={styles.connectionStepControls} id="aws-account-connection">
                <p>AWS 계정을 한 번 연결하면 배포와 기존 AWS 구조 분석에 사용할 수 있습니다.</p>
                <div className={styles.controlRow}>
                  <div className={styles.controlField}>
                    <span>기본 region</span>
                    <SelectMenu
                      ariaLabel="기본 region 선택"
                      emptyLabel="region 선택"
                      onChange={setRegion}
                      options={AWS_REGION_OPTIONS}
                      size="large"
                      tone="surface"
                      value={region}
                    />
                  </div>
                  <button className={styles.primaryAction} disabled={actionPending} onClick={() => void createConnection()} type="button">AWS 연결</button>
                </div>

                {setupConnection && cloudFormation ? (
                  <section aria-label="AWS 연결 승인" className={`${styles.setupSection} ${styles.inlineSetupSection}`}>
                    <div><span>1</span><div><strong>AWS에서 연결 승인</strong><p>AWS Console에서 SketchCatch 연결을 승인해 주세요.</p></div></div>
                    {cloudFormation.launchStackUrl ? (
                      <a href={cloudFormation.launchStackUrl} rel="noreferrer" target="_blank">
                        AWS에서 승인하기 <ExternalLink size={15} />
                      </a>
                    ) : (
                      <div className={styles.setupConsoleFallback} role="alert">
                        <p>AWS 승인 화면을 열지 못했습니다. 잠시 후 연결을 다시 준비해 주세요.</p>
                        <button
                          disabled={actionPending}
                          onClick={() => void resumeConnectionSetup(setupConnection)}
                          type="button"
                        >
                          연결 다시 준비
                        </button>
                      </div>
                    )}
                    <div><span>2</span><label><strong>AWS 계정 ID 확인</strong><input inputMode="numeric" maxLength={12} onChange={(event) => setAccountId(event.target.value.replace(/\D/g, ""))} placeholder="12자리 계정 ID" value={accountId} /></label></div>
                    <button className={styles.primaryAction} disabled={actionPending || !/^\d{12}$/.test(accountId)} onClick={() => void verifyCreatedRole()} type="button">AWS 연결 확인</button>
                  </section>
                ) : null}
              </div>
            </ConnectionFlowStep>

            <ConnectionFlowStep
              expanded={expandedConnectionStep === "codebuild"}
              icon={<DashboardIcon name="github" />}
              locked={codeBuildStepState === "locked"}
              number={3}
              onToggle={() => setExpandedConnectionStep("codebuild")}
              state={codeBuildStepState}
              summary={codeBuildStepSummary}
              title="GitHub 배포 연결"
              titleId="aws-codebuild-github-authorization-title"
            >
              <div className={styles.connectionStepControls} id="aws-codebuild-github-authorization">
                <GitHubAuthorizationTargetNotice
                  isError={githubInstallationsQuery.isError}
                  isPending={githubInstallationsQuery.isPending}
                  target={githubAuthorizationTarget}
                />
                <div className={styles.controlRow}>
                  {displayedVerifiedConnections.length > 1 ? (
                    <div className={styles.controlField}>
                      <span>사용할 AWS 계정</span>
                      <SelectMenu
                        ariaLabel="GitHub 빌드 AWS 계정 선택"
                        emptyLabel="AWS 계정 선택"
                        onChange={setSelectedBuildAwsConnectionId}
                        options={displayedVerifiedConnections.map((connection) => ({
                          label: connection.accountId ?? connection.region,
                          detail: connection.region,
                          value: connection.id
                        }))}
                        size="large"
                        tone="surface"
                        value={selectedBuildAwsConnectionId}
                      />
                    </div>
                  ) : null}
                  <GitHubBuildConnectionAction
                    actionPending={actionPending}
                    connection={codeConnections[selectedBuildAwsConnectionId]}
                    disabled={githubAuthorizationTarget.status === "github_app_not_configured"}
                    onConnect={() => void connectGitHubBuild()}
                    onDisconnect={openGitHubBuildDisconnect}
                    onRefresh={() => void refreshGitHubBuildConnection()}
                  />
                </div>
              </div>
            </ConnectionFlowStep>
          </section>

          {displayedCleanupRetries.length > 0 ? (
            <section className={`${styles.connectionList} ${styles.cleanupRetryList}`}>
              <div className={styles.sectionHeading}>
                <h2>정리 재시도 필요</h2>
                <span>{displayedCleanupRetries.length}개</span>
              </div>
              <p className={styles.cleanupRetryGuidance}>
                이전 AWS 연결 정리를 완료해야 같은 계정을 다시 연결할 수 있습니다.
              </p>
              {displayedCleanupRetries.map((retry) => (
                <article key={retry.id}>
                  <div className={styles.connectionStatus} data-status="cleanup-retry">
                    <AlertTriangle size={16} />
                    <span>정리 필요</span>
                  </div>
                  <div>
                    <strong>{retry.accountId ?? "계정 확인 전"}</strong>
                    <p>{retry.region}</p>
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      disabled={actionPending}
                      onClick={() => void removeConnection(retry.id)}
                      type="button"
                    >
                      정리 재시도
                    </button>
                  </div>
                </article>
              ))}
            </section>
          ) : null}

          <section className={styles.connectionList}>
            <div className={styles.sectionHeading}><h2>AWS 연결</h2><span>{displayedConnections.length}개</span></div>
            {displayedConnections.length === 0 ? <p>아직 AWS 연결이 없습니다.</p> : displayedConnections.map((connection) => {
              const connectionAction = getSettingsAwsConnectionAction(connection);

              return (
                <article key={connection.id}>
                  <div className={styles.connectionStatus} data-status={connection.status}>
                    {connection.status === "verified" ? <CheckCircle2 size={16} /> : <Cloud size={16} />}
                    <span>
                      {connection.status === "verified"
                        ? "연결됨"
                        : connection.status === "failed"
                          ? "재확인 필요"
                          : "확인 필요"}
                    </span>
                  </div>
                  <div>
                    <strong>{connection.accountId ?? "계정 확인 전"}</strong>
                    <p>{getAwsRegionLabel(connection.region)}</p>
                  </div>
                  <div className={styles.rowActions}>
                    {connectionAction.kind === "test" ? (
                      <button disabled={actionPending} onClick={() => void retestConnection(connection)} type="button">
                        {connectionAction.label}
                      </button>
                    ) : connectionAction.kind === "reverify" ? (
                      <button disabled={actionPending} onClick={() => void reverifyConnection(connection)} type="button">
                        {connectionAction.label}
                      </button>
                    ) : (
                      <button disabled={actionPending} onClick={() => void resumeConnectionSetup(connection)} type="button">
                        {connectionAction.label}
                      </button>
                    )}
                    <button
                      data-danger="true"
                      disabled={actionPending}
                      onClick={() => void removeConnection(connection.id)}
                      type="button"
                    >
                      <Trash2 size={15} />AWS 연결 해제
                    </button>
                  </div>
                  <div
                    className={settingsStyles.connectionImportAccess}
                    id={`aws-structure-analysis-${connection.id}`}
                    tabIndex={-1}
                  >
                    <AwsImportAccessWizard
                      connectionId={connection.id}
                      connectionStatus={connection.status}
                      onOpenSettings={scrollToAwsAccountConnection}
                      {...(
                        recoveryNavigation.returnHref &&
                        recoveryAwsConnectionId === connection.id
                          ? { onContinue: returnToReverseEngineeringAfterRecovery }
                          : {}
                      )}
                    />
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}

      {showCodeConnectionDisconnectModal ? (
        <div className={styles.modalBackdrop} ref={modalOverlayRef} role="presentation">
          <section
            aria-describedby="github-build-disconnect-description"
            aria-labelledby="github-build-disconnect-title"
            aria-modal="true"
            className={styles.modalCard}
            ref={modalDialogRef}
            role="dialog"
          >
            <button
              aria-label="GitHub 빌드 연결 해제 닫기"
              className={styles.modalClose}
              disabled={actionPending}
              onClick={() => setShowCodeConnectionDisconnectModal(false)}
              ref={modalCloseButtonRef}
              type="button"
            >
              <X size={18} />
            </button>
            <Trash2 size={24} />
            <h2 id="github-build-disconnect-title">GitHub 빌드 연결 해제</h2>
            <p id="github-build-disconnect-description">
              SketchCatch가 만든 GitHub 배포 연결을 정리합니다. AWS 연결과 배포한 애플리케이션 및 인프라는 유지됩니다.
            </p>
            <div className={styles.cleanupPreview}>
              <strong>정리되는 항목</strong>
              <ul>
                <li>GitHub 배포 연결</li>
                <li>SketchCatch가 만든 배포 보조 항목</li>
              </ul>
            </div>
            <div className={styles.modalActions}>
              <button disabled={actionPending} onClick={() => setShowCodeConnectionDisconnectModal(false)} type="button">취소</button>
              <button
                className={styles.dangerAction}
                disabled={actionPending}
                onClick={() => void confirmGitHubBuildDisconnect()}
                type="button"
              >
                연결 해제
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {deletionPreview ? (
        <div className={styles.modalBackdrop} ref={modalOverlayRef} role="presentation">
          <section
            aria-describedby="aws-deletion-description"
            aria-labelledby="aws-deletion-title"
            aria-modal="true"
            className={styles.modalCard}
            ref={modalDialogRef}
            role="dialog"
          >
            <button
              aria-label={
                deletionPreview.cleanupRetry
                  ? "AWS 연결 정리 재시도 닫기"
                  : "AWS 연결 해제 닫기"
              }
              className={styles.modalClose}
              disabled={actionPending}
              onClick={closeDeletionPreview}
              ref={modalCloseButtonRef}
              type="button"
            >
              <X size={18} />
            </button>
            {deletionPreview.cleanupRetry ? <AlertTriangle size={24} /> : <Trash2 size={24} />}
            <h2 id="aws-deletion-title">
              {deletionPreview.cleanupRetry ? "AWS 연결 정리 재시도" : "AWS 연결 해제 확인"}
            </h2>
            <p id="aws-deletion-description">
              {deletionPreview.cleanupRetry
                ? "이전에 완료되지 않은 SketchCatch 연결 항목 정리를 다시 시도합니다."
                : "연결을 해제하면 SketchCatch에서 이 AWS 계정을 더 이상 사용하지 않습니다. 배포한 인프라와 구조 분석 설정은 유지됩니다."}
            </p>
            <div className={styles.cleanupPreview}>
              <strong>정리되는 연결 항목</strong>
              <ul>
                <li>GitHub 배포 연결 {deletionPreview.managedResources.codeBuildProjects.length}개</li>
                <li>SketchCatch가 만든 연결 보조 항목</li>
              </ul>
              <strong>유지되는 항목</strong>
              <p>배포한 인프라와 구조 분석 설정은 유지됩니다.</p>
            </div>
            {deletionPreview.blockerMessage ? (
              <p className={styles.cleanupBlocker} role="alert">
                {deletionPreview.blockerMessage}
              </p>
            ) : null}
            {deletionErrorMessage ? (
              <div className={styles.cleanupError} role="alert">
                <strong>연결 해제가 완료되지 않았습니다. AWS 연결은 유지되었습니다.</strong>
                <p>오류를 확인한 뒤 다시 시도해 주세요.</p>
              </div>
            ) : null}
            <div className={styles.modalActions}>
              <button disabled={actionPending} onClick={closeDeletionPreview} type="button">취소</button>
              {deletionPreview.canDelete ? (
                <button
                  className={styles.dangerAction}
                  disabled={actionPending}
                  onClick={() => void confirmRemoveConnection()}
                  type="button"
                >
                  {actionPending
                    ? "연결 해제 중…"
                    : deletionPreview.cleanupRetry
                      ? "연결 정리 재시도"
                      : "AWS 연결 해제"}
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {showAwsRequiredModal ? (
        <div className={styles.modalBackdrop} ref={modalOverlayRef} role="presentation">
          <section
            aria-describedby="aws-required-description"
            aria-labelledby="aws-required-title"
            aria-modal="true"
            className={styles.modalCard}
            ref={modalDialogRef}
            role="dialog"
          >
            <button
              aria-label="AWS 연결 안내 닫기"
              className={styles.modalClose}
              onClick={() => setShowAwsRequiredModal(false)}
              ref={modalCloseButtonRef}
              type="button"
            >
              <X size={18} />
            </button>
            <Cloud size={24} />
            <h2 id="aws-required-title">AWS 연결이 먼저 필요합니다</h2>
            <p id="aws-required-description">
              GitHub 코드를 배포할 AWS 계정을 먼저 연결하고 연결 확인을 완료해 주세요.
            </p>
            <div className={styles.modalActions}>
              <button onClick={() => setShowAwsRequiredModal(false)} type="button">취소</button>
              <button
                className={styles.primaryAction}
                onClick={() => {
                  setShowAwsRequiredModal(false);
                  document.getElementById("aws-account-connection")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                  });
                }}
                type="button"
              >
                AWS 연결하러 가기
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ConnectionFlowStep({
  children,
  expanded,
  icon,
  locked = false,
  number,
  onToggle,
  state,
  summary,
  title,
  titleId
}: {
  readonly children: ReactNode;
  readonly expanded: boolean;
  readonly icon: ReactNode;
  readonly locked?: boolean;
  readonly number: number;
  readonly onToggle: () => void;
  readonly state: SettingsConnectionFlowStepState;
  readonly summary: string;
  readonly title: string;
  readonly titleId: string;
}) {
  const contentId = `${titleId}-content`;

  return (
    <article
      className={styles.connectionFlowStep}
      data-expanded={expanded}
      data-state={state}
    >
      <button
        aria-controls={contentId}
        aria-expanded={expanded}
        className={styles.connectionStepHeader}
        disabled={locked}
        onClick={onToggle}
        type="button"
      >
        <span className={styles.connectionStepMarker}>
          {state === "complete" ? (
            <CheckCircle2 aria-hidden="true" size={17} />
          ) : state === "locked" ? (
            <LockKeyhole aria-hidden="true" size={15} />
          ) : (
            number
          )}
        </span>
        <span className={styles.connectionStepHeading}>
          <span className={styles.connectionStepTitle}>
            {icon}
            <h2 id={titleId}>{title}</h2>
          </span>
          {summary ? <span className={styles.connectionStepSummary}>{summary}</span> : null}
        </span>
        <span className={styles.connectionStepStatus} data-state={state}>
          {getConnectionFlowStatusLabel(state, number)}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={styles.connectionStepChevron}
          data-expanded={expanded}
          size={18}
        />
      </button>
      {expanded ? (
        <div className={styles.connectionStepBody} id={contentId}>
          {children}
        </div>
      ) : null}
    </article>
  );
}

function getConnectionFlowStatusLabel(
  state: SettingsConnectionFlowStepState,
  _number: number
): string {
  if (state === "complete") return "연결됨";
  if (state === "error") return "오류";
  if (state === "locked") return "대기";
  return "진행 중";
}

function getAwsRegionLabel(region: string): string {
  return AWS_REGION_OPTIONS.find((option) => option.value === region)?.label ?? region;
}

function getCodeBuildStepSummary(
  status: AwsCodeConnectionStatus | undefined,
  githubAccountLogin?: string
): string {
  if (status === "AVAILABLE") {
    return githubAccountLogin
      ? `${githubAccountLogin} · GitHub 배포 연결됨`
      : "GitHub 배포 연결됨";
  }
  if (status === "ERROR") return "연결 오류를 확인해 주세요.";
  if (status === "CREATING") return "GitHub 배포 연결을 만들고 있습니다.";
  if (status === "PENDING") return "AWS에서 GitHub 연결 승인이 필요합니다.";
  if (status === "DELETING") return "GitHub 배포 연결을 해제하고 있습니다.";
  return "GitHub 배포 연결을 설정해 주세요.";
}

function GitHubAuthorizationTargetNotice({
  isError,
  isPending,
  target
}: {
  readonly isError: boolean;
  readonly isPending: boolean;
  readonly target: GitHubCodeBuildAuthorizationTarget;
}) {
  if (isPending) {
    return (
      <p className={styles.githubSettingsMessage} role="status">
        GitHub 연결 정보를 확인하고 있습니다.
      </p>
    );
  }
  if (isError) {
    return (
      <p className={styles.githubSettingsError} role="alert">
        GitHub App 연결 정보를 불러오지 못해 GitHub 배포 연결을 시작할 수 없습니다.
      </p>
    );
  }
  if (target.status === "github_app_not_configured") {
    return (
      <p className={styles.githubSettingsMessage} role="status">
        GitHub App 서버 설정을 완료한 후 GitHub 배포 연결을 시작할 수 있습니다.
      </p>
    );
  }
  if (target.status === "github_installation_required") {
    return (
      <div className={styles.githubSettingsError} role="alert">
        <p>GitHub 배포 연결을 위해 GitHub App을 먼저 연결해 주세요.</p>
        <button onClick={scrollToGitHubAccountConnection} type="button">
          GitHub App 연결하기
        </button>
      </div>
    );
  }
  if (target.status === "multiple_github_installations_unsupported") {
    return (
      <div className={styles.githubSettingsError} role="alert">
        <p>GitHub 배포에 사용할 GitHub App 연결을 하나만 유지해 주세요.</p>
        <button onClick={scrollToGitHubAccountConnection} type="button">
          GitHub 연결 확인하기
        </button>
      </div>
    );
  }
  return (
    <div className={styles.githubInstallationList} aria-label="GitHub 연결 정보">
      <article className={styles.githubInstallationCard}>
        <div className={styles.githubInstallationDetails}>
          <strong>GitHub 연결 정보 · {target.installation.accountLogin}</strong>
          <p>
            {target.installation.accountType ?? "GitHub account"} ·{" "}
            {formatGitHubRepositorySelection(target.installation)}
          </p>
        </div>
      </article>
    </div>
  );
}

function scrollToGitHubAccountConnection(): void {
  document.getElementById("github-account-connection")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

// gg: AWS 연결이 끊긴 경우 사용자가 연결 화면으로 바로 돌아가게 합니다.
function scrollToAwsAccountConnection(): void {
  document.getElementById("aws-account-connection")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function formatGitHubRepositorySelection(
  installation: GitHubInstallationConnection
): string {
  if (installation.repositorySelection === "all") return "모든 Repository 접근";
  if (installation.repositorySelection === "selected") {
    return `Repository ${installation.repositoryCount}개 선택됨`;
  }
  return "Repository 접근 범위 확인 필요";
}

function GitHubBuildConnectionAction({
  actionPending,
  connection,
  disabled,
  onConnect,
  onDisconnect,
  onRefresh
}: {
  readonly actionPending: boolean;
  readonly connection: AwsCodeConnectionResponse | undefined;
  readonly disabled: boolean;
  readonly onConnect: () => void;
  readonly onDisconnect: () => void;
  readonly onRefresh: () => void;
}) {
  if (!connection?.codeConnection) {
    return (
      <button className={styles.primaryAction} disabled={actionPending || disabled} onClick={onConnect} type="button">
        GitHub 배포 연결 시작
      </button>
    );
  }
  if (connection.codeConnection.status === "CREATING") {
    return (
      <div className={styles.buildConnectionPending} role="status">
        <span>GitHub 배포 연결 준비 중</span>
        <button disabled={actionPending} onClick={onConnect} type="button">상태 확인</button>
      </div>
    );
  }
  if (connection.codeConnection.status === "DELETING") {
    return (
      <div className={styles.buildConnectionPending} role="status">
        <span>GitHub 빌드 연결 해제 중</span>
        <button data-danger="true" disabled={actionPending} onClick={onDisconnect} type="button">
          연결 해제 재시도
        </button>
      </div>
    );
  }
  if (connection.codeConnection.status === "ERROR") {
    const hasAwsConnection = Boolean(connection.codeConnection.connectionArn);
    const cleanupRetryRequired = connection.codeConnection.cleanupRetryRequired === true;
    return (
      <div className={styles.buildConnectionError} role="alert">
        <div className={styles.buildConnectionErrorSummary}>
          <AlertTriangle aria-hidden="true" size={18} />
          <div>
            <strong>GitHub 배포 연결을 확인할 수 없습니다.</strong>
            <p>오류 상세를 확인한 뒤 다시 시도해 주세요.</p>
          </div>
        </div>
        {connection.codeConnection.statusReason ? (
          <details className={styles.buildConnectionErrorDetails}>
            <summary>오류 상세</summary>
            <p>{connection.codeConnection.statusReason}</p>
          </details>
        ) : null}
        <div className={styles.buildConnectionErrorActions}>
          {hasAwsConnection && !cleanupRetryRequired ? (
            <button className={styles.primaryAction} disabled={actionPending} onClick={onRefresh} type="button">상태 확인</button>
          ) : !hasAwsConnection ? (
            <button className={styles.primaryAction} disabled={actionPending} onClick={onConnect} type="button">다시 생성</button>
          ) : null}
          <button
            data-danger={hasAwsConnection ? "true" : undefined}
            disabled={actionPending}
            onClick={onDisconnect}
            type="button"
          >
            {hasAwsConnection ? "연결 해제 재시도" : "연결 정보 지우기"}
          </button>
        </div>
      </div>
    );
  }
  const connectedState = deriveAwsCodeConnectionConnectedState(
    connection.codeConnection.status
  );
  if (connectedState) {
    return (
      <div className={styles.buildConnectionReady} role="status">
        <CheckCircle2 size={16} />
        <span>{connectedState.title} · {connectedState.description}</span>
        <a
          href={connectedState.actionHref}
          rel="noreferrer"
          target="_blank"
        >
          {connectedState.actionLabel} <ExternalLink size={14} />
        </a>
        <button disabled={actionPending} onClick={onRefresh} type="button">상태 확인</button>
        <button data-danger="true" disabled={actionPending} onClick={onDisconnect} type="button">연결 해제</button>
      </div>
    );
  }
  return (
    <div className={styles.buildConnectionPending} role="status">
      <span>
        AWS에서 <strong>{getAwsCodeConnectionDisplayName(connection.codeConnection.awsConnectionId)}</strong>{" "}
        Pending 연결을 선택한 뒤 <strong>Update pending connection</strong>을 눌러 주세요.
      </span>
      {connection.setupUrl ? (
        <a href={connection.setupUrl} rel="noreferrer" target="_blank">
          AWS에서 GitHub 권한 승인하기 <ExternalLink size={14} />
        </a>
      ) : null}
      <button disabled={actionPending} onClick={onRefresh} type="button">승인 상태 확인</button>
      <button data-danger="true" disabled={actionPending} onClick={onDisconnect} type="button">연결 해제</button>
    </div>
  );
}

function getSingleSearchParam(values: readonly string[]): string | readonly string[] | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return values.length === 1 ? values[0] : values;
}
