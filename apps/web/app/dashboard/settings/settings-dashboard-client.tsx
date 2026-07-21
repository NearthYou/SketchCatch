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
  createAwsCodeConnection,
  deleteAwsConnection,
  disconnectAwsCodeConnection,
  getAwsCodeConnection,
  getAwsConnectionDeletionPreview,
  getAwsConnectionCloudFormationTemplate,
  refreshAwsCodeConnection,
  testAwsConnection,
  verifyAwsConnection,
  verifyAwsConnectionCreatedRole
} from "../../../features/workspace/api";
import { restoreAwsConnectionSetup } from "../../../features/dashboard/aws-connection-setup";
import {
  useAwsConnectionsQuery,
  useAwsConnectionSettingsQuery,
  useGitHubInstallationsQuery
} from "../../../features/dashboard/connection-queries";
import { useAuth } from "../../../components/auth/auth-provider";
import { invalidateAwsConnectionQueries } from "../../../components/query/dashboard-query-invalidation";
import { getApiErrorMessage } from "../../../lib/api-client";
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
import styles from "../dashboard-tools.module.css";
import { getSettingsAwsConnectionAction } from "./settings-aws-connection-action";
import { GitHubAccountSettings } from "./github-account-settings";
import { getSettingsAwsRecoveryNavigation } from "./settings-aws-recovery-navigation";

const AWS_REGION_OPTIONS: readonly SelectMenuOption[] = [
  { label: "서울", value: "ap-northeast-2" },
  { label: "버지니아 북부", value: "us-east-1" },
  { label: "도쿄", value: "ap-northeast-1" }
];

type ConnectionFlowStepId = "github" | "aws" | "codebuild";
type ConnectionFlowStepState = "complete" | "current" | "error" | "locked";

// AWS Role 생성 안내, CloudFormation 이동, 연결 검증과 삭제를 관리합니다.
export function SettingsDashboardClient() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const recoveryNavigation = getSettingsAwsRecoveryNavigation({
    awsConnectionId: getSingleSearchParam(searchParams.getAll("awsConnectionId")),
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
  const [codeConnections, setCodeConnections] = useState<
    Record<string, AwsCodeConnectionResponse>
  >({});
  const [selectedBuildAwsConnectionId, setSelectedBuildAwsConnectionId] = useState("");
  const selectedCodeConnectionStatus =
    codeConnections[selectedBuildAwsConnectionId]?.codeConnection?.status;
  const recommendedConnectionStep: ConnectionFlowStepId | null =
    githubAuthorizationTarget.status !== "ready"
      ? "github"
      : displayedVerifiedConnections.length === 0
        ? "aws"
        : selectedCodeConnectionStatus === "AVAILABLE"
          ? null
          : "codebuild";
  const [expandedConnectionStep, setExpandedConnectionStep] =
    useState<ConnectionFlowStepId | null>(recommendedConnectionStep);
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
    const result = await displayedConnectionsQuery.refetch();
    if (result.error) {
      setErrorMessage(getApiErrorMessage(result.error, "AWS 연결을 불러오지 못했습니다."));
    }
  }

  async function invalidateConnections(): Promise<void> {
    await invalidateAwsConnectionQueries(queryClient, user?.id);
  }

  function returnToReverseEngineeringAfterRecovery(): void {
    if (recoveryNavigation.returnHref) {
      router.replace(recoveryNavigation.returnHref);
    }
  }

  // 새 연결의 External ID와 Role 이름을 만들고 CloudFormation 실행 정보를 준비합니다.
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
      setErrorMessage(getApiErrorMessage(error, "AWS 연결 준비에 실패했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  // 새로고침 뒤에도 저장된 미검증 연결의 CloudFormation 설정을 다시 이어갑니다.
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
      setErrorMessage(getApiErrorMessage(error, "AWS 연결 설정을 불러오지 못했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  // CloudFormation에서 Role을 만든 뒤 AWS 계정 ID로 AssumeRole 연결을 검증합니다.
  async function verifyCreatedRole(): Promise<void> {
    if (!setupConnection || !/^\d{12}$/.test(accountId)) return;
    setActionPending(true);
    setErrorMessage("");
    try {
      await verifyAwsConnectionCreatedRole({
        connectionId: setupConnection.id,
        accountId
      });
      setSetupConnection(null);
      setCloudFormation(null);
      setAccountId("");
      await invalidateConnections();
      returnToReverseEngineeringAfterRecovery();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "AWS Role 검증에 실패했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  // 이미 검증된 Role이 실제로 AssumeRole 가능한지 다시 확인합니다.
  async function retestConnection(connection: AwsConnection): Promise<void> {
    if (!connection.roleArn) return;
    setActionPending(true);
    setErrorMessage("");
    try {
      await testAwsConnection({ connectionId: connection.id, roleArn: connection.roleArn });
      await invalidateConnections();
      returnToReverseEngineeringAfterRecovery();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "AWS 연결 테스트에 실패했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  // 실패한 연결은 단순 연결 테스트가 아니라 저장된 Role을 다시 검증해 verified 상태로 복구합니다.
  async function reverifyConnection(connection: AwsConnection): Promise<void> {
    if (!connection.roleArn) {
      await resumeConnectionSetup(connection);
      return;
    }

    setActionPending(true);
    setErrorMessage("");
    try {
      await verifyAwsConnection({ connectionId: connection.id, roleArn: connection.roleArn });
      await invalidateConnections();
      returnToReverseEngineeringAfterRecovery();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "AWS 연결을 다시 확인하지 못했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  // AWS를 변경하지 않는 미리보기를 먼저 열어 사용자가 정리 대상을 확인하게 합니다.
  async function removeConnection(connectionId: string): Promise<void> {
    setActionPending(true);
    setErrorMessage("");
    setDeletionErrorMessage("");
    try {
      setDeletionPreview(await getAwsConnectionDeletionPreview(connectionId));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "삭제 대상을 불러오지 못했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  // 미리보기에서 확인한 exact managed Resource 집합에만 삭제 승인을 보냅니다.
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
      setDeletionErrorMessage(getApiErrorMessage(error, "AWS 연결을 삭제하지 못했습니다."));
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
      setErrorMessage("AWS CodeBuild용 GitHub 권한을 만들 AWS 계정을 선택해 주세요.");
      return;
    }
    setActionPending(true);
    setErrorMessage("");
    try {
      const response = await createAwsCodeConnection(selectedBuildAwsConnectionId);
      setCodeConnections((current) => ({
        ...current,
        [selectedBuildAwsConnectionId]: response
      }));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "AWS CodeBuild용 GitHub 권한을 만들지 못했습니다."));
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
      setCodeConnections((current) => ({
        ...current,
        [selectedBuildAwsConnectionId]: response
      }));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "GitHub 승인 상태를 확인하지 못했습니다."));
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
      setCodeConnections((current) => ({
        ...current,
        [connectionId]: { codeConnection: null }
      }));
      setShowCodeConnectionDisconnectModal(false);
    } catch (error) {
      setShowCodeConnectionDisconnectModal(false);
      setErrorMessage(getApiErrorMessage(error, "GitHub 빌드 연결을 해제하지 못했습니다."));
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
    let active = true;

    void Promise.all(
      displayedVerifiedConnections.map(async (connection) => {
        const savedConnection = await getAwsCodeConnection(connection.id);
        if (!savedConnection.codeConnection) return [connection.id, savedConnection] as const;
        try {
          return [connection.id, await refreshAwsCodeConnection(connection.id)] as const;
        } catch (error) {
          if (active) {
            setErrorMessage(
              getApiErrorMessage(
                error,
                "AWS 상태를 다시 확인하지 못해 저장된 연결 상태를 표시합니다."
              )
            );
          }
          return [connection.id, savedConnection] as const;
        }
      })
    )
      .then((entries) => {
        if (active) setCodeConnections(Object.fromEntries(entries));
      })
      .catch((error) => {
        if (active) {
          setErrorMessage(getApiErrorMessage(error, "GitHub 빌드 연결 상태를 불러오지 못했습니다."));
        }
      });

    return () => {
      active = false;
    };
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

  const githubStepComplete = githubAuthorizationTarget.status === "ready";
  const awsStepComplete = displayedVerifiedConnections.length > 0;
  const selectedCodeConnection = codeConnections[selectedBuildAwsConnectionId]?.codeConnection;
  const codeBuildStepComplete = selectedCodeConnection?.status === "AVAILABLE";
  const githubStepState: ConnectionFlowStepState = githubStepComplete ? "complete" : "current";
  const awsStepState: ConnectionFlowStepState = !githubStepComplete
    ? "locked"
    : awsStepComplete
      ? "complete"
      : "current";
  const codeBuildStepState: ConnectionFlowStepState = !githubStepComplete || !awsStepComplete
    ? "locked"
    : codeBuildStepComplete
      ? "complete"
      : selectedCodeConnection?.status === "ERROR"
        ? "error"
        : "current";
  const primaryVerifiedConnection = displayedVerifiedConnections[0];
  const githubStepSummary = githubStepComplete
    ? `${githubAuthorizationTarget.installation.accountLogin} · GitHub App 연결됨`
    : githubAuthorizationTarget.status === "multiple_github_installations_unsupported"
      ? "활성 GitHub App 연결을 하나만 남겨 주세요."
      : "GitHub App 연결이 필요합니다.";
  const awsStepSummary = primaryVerifiedConnection
    ? `${primaryVerifiedConnection.accountId ?? "계정 확인 전"} · ${getAwsRegionLabel(primaryVerifiedConnection.region)}`
    : "";
  const codeBuildStepSummary = getCodeBuildStepSummary(selectedCodeConnection?.status);

  return (
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader dashboardPageHeaderCompact">
        <div><h1>설정</h1></div>
        <button className={styles.iconAction} aria-label="연결 새로고침" disabled={displayedConnectionsQuery.isFetching} onClick={() => void loadConnections()} title="새로고침" type="button"><RefreshCw size={17} /></button>
      </header>

      {isConnectionsPending ? (
        <>
          <GitHubAccountSettings />
          <ProductState description="AWS Role 연결 상태를 확인하고 있습니다." kind="loading" title="AWS 환경설정 불러오는 중" />
        </>
      ) : hasConnectionsLoadError ? (
        <>
          <GitHubAccountSettings />
          <ProductState action={<button onClick={() => void loadConnections()} type="button">다시 시도</button>} description={getApiErrorMessage(displayedConnectionsQuery.error, "AWS 연결을 불러오지 못했습니다.")} kind="error" title="AWS 환경설정을 불러오지 못했습니다" />
        </>
      ) : (
        <>
          {displayedConnectionsQuery.isError ? <p className={styles.errorBand}>{getApiErrorMessage(displayedConnectionsQuery.error, "AWS 연결을 갱신하지 못했습니다.")}</p> : null}
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
              locked={awsStepState === "locked"}
              number={2}
              onToggle={() => setExpandedConnectionStep("aws")}
              state={awsStepState}
              summary={awsStepSummary}
              title="AWS 계정 연결"
              titleId="aws-account-connection-title"
            >
              <div className={styles.connectionStepControls} id="aws-account-connection">
                <p>Access Key 대신 한 번 만든 Role을 사용합니다.</p>
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
                  <button className={styles.primaryAction} disabled={actionPending} onClick={() => void createConnection()} type="button">새 AWS 연결</button>
                </div>

                {setupConnection && cloudFormation ? (
                  <section aria-label="AWS Role 연결 설정" className={`${styles.setupSection} ${styles.inlineSetupSection}`}>
                    <div><span>1</span><div><strong>CloudFormation으로 Role 만들기</strong><p>{cloudFormation.roleName}</p></div></div>
                    {cloudFormation.launchStackUrl ? <a href={cloudFormation.launchStackUrl} rel="noreferrer" target="_blank">AWS Console 열기 <ExternalLink size={15} /></a> : <pre>{cloudFormation.templateBody}</pre>}
                    <div><span>2</span><label><strong>AWS 계정 ID 확인</strong><input inputMode="numeric" maxLength={12} onChange={(event) => setAccountId(event.target.value.replace(/\D/g, ""))} placeholder="12자리 계정 ID" value={accountId} /></label></div>
                    <button className={styles.primaryAction} disabled={actionPending || !/^\d{12}$/.test(accountId)} onClick={() => void verifyCreatedRole()} type="button">Role 연결 확인</button>
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
              title="AWS CodeBuild용 GitHub 권한"
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
            <div className={styles.sectionHeading}><h2>연결된 AWS 계정</h2><span>{displayedConnections.length}개</span></div>
            {displayedConnections.length === 0 ? <p>아직 연결된 AWS 계정이 없습니다.</p> : displayedConnections.map((connection) => {
              const connectionAction = getSettingsAwsConnectionAction(connection);

              return (
                <article key={connection.id}>
                  <div className={styles.connectionStatus} data-status={connection.status}>
                    {connection.status === "verified" ? <CheckCircle2 size={16} /> : <Cloud size={16} />}
                    <span>
                      {connection.status === "verified"
                        ? "검증됨"
                        : connection.status === "failed"
                          ? "재확인 필요"
                          : "확인 필요"}
                    </span>
                  </div>
                  <div>
                    <strong>{connection.accountId ?? "계정 확인 전"}</strong>
                    <p>{connection.region} · {connection.roleArn ?? "Role ARN 없음"}</p>
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
                      <Trash2 size={15} />삭제
                    </button>
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
              SketchCatch가 만든 GitHub 빌드 리소스를 AWS에서 정리합니다. AWS 계정 연결과 배포된 애플리케이션 및 인프라는 유지됩니다.
            </p>
            <div className={styles.cleanupPreview}>
              <strong>정리할 리소스</strong>
              <ul>
                <li>CodeBuild 프로젝트, 전용 Role과 로그</li>
                <li>빌드 캐시 ECR Repository</li>
                <li>GitHub CodeConnection</li>
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
                  : "AWS 연결 삭제 닫기"
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
              {deletionPreview.cleanupRetry ? "AWS 연결 정리 재시도" : "AWS 연결 삭제 대상 확인"}
            </h2>
            <p id="aws-deletion-description">
              {deletionPreview.cleanupRetry
                ? "이전에 완료되지 않은 SketchCatch 관리 리소스 정리를 다시 시도합니다."
                : "삭제를 승인하면 아래 SketchCatch 관리 리소스만 AWS에서 정리한 뒤 연결 기록을 삭제합니다."}
            </p>
            <div className={styles.cleanupPreview}>
              <strong>정리할 리소스</strong>
              <ul>
                <li>CodeBuild 프로젝트 {deletionPreview.managedResources.codeBuildProjects.length}개</li>
                <li>CodeBuild Service Role {deletionPreview.managedResources.codeBuildProjects.length}개</li>
                <li>CodeBuild 로그 그룹 {deletionPreview.managedResources.codeBuildProjects.length}개</li>
              </ul>
              <strong>삭제하지 않는 리소스</strong>
              <p>{deletionPreview.preservedResources.join(", ")}</p>
              <strong>보존하는 기록</strong>
              <p>
                Reverse Engineering 결과{" "}
                {deletionPreview.preservedRecords?.reverseEngineeringScans ?? 0}개 · 연결 삭제 후
                연결 삭제됨으로 표시
              </p>
            </div>
            {deletionPreview.blockerMessage ? (
              <p className={styles.cleanupBlocker}>{deletionPreview.blockerMessage}</p>
            ) : null}
            {deletionErrorMessage ? (
              <div className={styles.cleanupError} role="alert">
                <strong>삭제가 완료되지 않았습니다. 연결은 유지되었습니다.</strong>
                <p>오류를 확인한 뒤 다시 시도해 주세요.</p>
                <details>
                  <summary>오류 상세</summary>
                  <p>{deletionErrorMessage}</p>
                </details>
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
                    ? "삭제 중…"
                    : deletionPreview.cleanupRetry
                      ? "관리 리소스 정리 재시도"
                      : "관리 리소스 정리 후 연결 삭제"}
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
              GitHub 코드를 빌드할 AWS 계정을 먼저 연결하고 Role 검증을 완료해 주세요.
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
  readonly state: ConnectionFlowStepState;
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
  state: ConnectionFlowStepState,
  number: number
): string {
  if (state === "complete") return number === 2 ? "검증됨" : "연결됨";
  if (state === "error") return "오류";
  if (state === "locked") return "대기";
  return "진행 중";
}

function getAwsRegionLabel(region: string): string {
  return AWS_REGION_OPTIONS.find((option) => option.value === region)?.label ?? region;
}

function getCodeBuildStepSummary(status: AwsCodeConnectionStatus | undefined): string {
  if (status === "AVAILABLE") return "GitHub 권한 연결됨";
  if (status === "ERROR") return "연결 오류를 확인해 주세요.";
  if (status === "CREATING") return "AWS GitHub 권한 생성 중";
  if (status === "PENDING") return "AWS에서 GitHub 권한 승인이 필요합니다.";
  if (status === "DELETING") return "GitHub 빌드 연결 해제 중";
  return "검증된 AWS 계정으로 GitHub 권한을 연결합니다.";
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
        승인 대상 GitHub 계정을 확인하고 있습니다.
      </p>
    );
  }
  if (isError) {
    return (
      <p className={styles.githubSettingsError} role="alert">
        GitHub App 연결 정보를 확인할 수 없어 AWS 승인을 시작할 수 없습니다.
      </p>
    );
  }
  if (target.status === "github_app_not_configured") {
    return (
      <p className={styles.githubSettingsMessage} role="status">
        GitHub App 서버 설정이 완료된 뒤 AWS 승인을 시작할 수 있습니다.
      </p>
    );
  }
  if (target.status === "github_installation_required") {
    return (
      <div className={styles.githubSettingsError} role="alert">
        <p>GitHub App 연결이 먼저 필요합니다.</p>
        <button onClick={scrollToGitHubAccountConnection} type="button">
          GitHub App 연결하기
        </button>
      </div>
    );
  }
  if (target.status === "multiple_github_installations_unsupported") {
    return (
      <div className={styles.githubSettingsError} role="alert">
        <p>GitHub 연결 정리 필요: 승인 대상을 확정할 수 있도록 활성 연결을 하나만 남겨 주세요.</p>
        <button onClick={scrollToGitHubAccountConnection} type="button">
          GitHub 연결 확인하기
        </button>
      </div>
    );
  }
  return (
    <div className={styles.githubInstallationList} aria-label="AWS 승인 대상 GitHub 계정">
      <article className={styles.githubInstallationCard}>
        <div className={styles.githubInstallationDetails}>
          <strong>승인 대상 GitHub 계정 · {target.installation.accountLogin}</strong>
          <p>
            {target.installation.accountType ?? "GitHub account"} ·{
              " "
            }{formatGitHubRepositorySelection(target.installation)} · repository{
              " "
            }{target.installation.repositoryCount}개
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

function formatGitHubRepositorySelection(
  installation: GitHubInstallationConnection
): string {
  if (installation.repositorySelection === "all") return "모든 repository";
  if (installation.repositorySelection === "selected") return "선택한 repository";
  return "권한 범위 확인 필요";
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
        AWS GitHub 권한 승인 시작
      </button>
    );
  }
  if (connection.codeConnection.status === "CREATING") {
    return (
      <div className={styles.buildConnectionPending} role="status">
        <span>AWS GitHub 권한 생성 중</span>
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
            <strong>AWS GitHub 권한 연결을 확인할 수 없습니다.</strong>
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
