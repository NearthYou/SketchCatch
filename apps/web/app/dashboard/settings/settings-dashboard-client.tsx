"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  ExternalLink,
  RefreshCw,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AwsConnection,
  AwsCodeConnectionResponse,
  AwsConnectionCloudFormationTemplateResponse,
  AwsConnectionDeletionPreviewResponse
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
  verifyAwsConnectionCreatedRole
} from "../../../features/workspace/api";
import { restoreAwsConnectionSetup } from "../../../features/dashboard/aws-connection-setup";
import { useAwsConnectionSettingsQuery } from "../../../features/dashboard/connection-queries";
import { useAuth } from "../../../components/auth/auth-provider";
import { invalidateAwsConnectionQueries } from "../../../components/query/dashboard-query-invalidation";
import { getApiErrorMessage } from "../../../lib/api-client";
import {
  deriveAwsConnectionSettingsState,
  type AwsConnectionCleanupRetryDisplay
} from "../../../features/dashboard/aws-connection-settings-state";
import styles from "../dashboard-tools.module.css";
import { GitHubAccountSettings } from "./github-account-settings";

const AWS_REGION_OPTIONS: readonly SelectMenuOption[] = [
  { label: "서울", value: "ap-northeast-2" },
  { label: "버지니아 북부", value: "us-east-1" },
  { label: "도쿄", value: "ap-northeast-1" }
];

// AWS Role 생성 안내, CloudFormation 이동, 연결 검증과 삭제를 관리합니다.
export function SettingsDashboardClient() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const connectionsQuery = useAwsConnectionSettingsQuery();
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
  const connections = connectionSettings.activeConnections;
  const verifiedConnections = connectionSettings.verifiedConnections;
  const cleanupRetries = connectionSettings.cleanupRetries;
  const [actionPending, setActionPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [region, setRegion] = useState("ap-northeast-2");
  const [setupConnection, setSetupConnection] = useState<AwsConnection | null>(null);
  const [cloudFormation, setCloudFormation] = useState<AwsConnectionCloudFormationTemplateResponse | null>(null);
  const [accountId, setAccountId] = useState("");
  const [deletionPreview, setDeletionPreview] =
    useState<AwsConnectionDeletionPreviewResponse | null>(null);
  const [showCodeConnectionDisconnectModal, setShowCodeConnectionDisconnectModal] =
    useState(false);
  const [codeConnections, setCodeConnections] = useState<
    Record<string, AwsCodeConnectionResponse>
  >({});
  const [selectedBuildAwsConnectionId, setSelectedBuildAwsConnectionId] = useState("");
  const [showAwsRequiredModal, setShowAwsRequiredModal] = useState(false);
  const modalOverlayRef = useRef<HTMLDivElement>(null);
  const modalDialogRef = useRef<HTMLElement>(null);
  const modalCloseButtonRef = useRef<HTMLButtonElement>(null);

  // 저장된 AWS 연결 목록을 다시 읽고 현재 상태를 최신으로 맞춥니다.
  async function loadConnections(): Promise<void> {
    setErrorMessage("");
    const result = await connectionsQuery.refetch();
    if (result.error) {
      setErrorMessage(getApiErrorMessage(result.error, "AWS 연결을 불러오지 못했습니다."));
    }
  }

  async function invalidateConnections(): Promise<void> {
    await invalidateAwsConnectionQueries(queryClient, user?.id);
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
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "AWS 연결 테스트에 실패했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  // AWS를 변경하지 않는 미리보기를 먼저 열어 사용자가 정리 대상을 확인하게 합니다.
  async function removeConnection(connectionId: string): Promise<void> {
    setActionPending(true);
    setErrorMessage("");
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
    try {
      await deleteAwsConnection(deletionPreview.connectionId, {
        confirmedManagedCleanup: true,
        confirmationToken: deletionPreview.confirmationToken
      });
      setDeletionPreview(null);
      await invalidateConnections();
    } catch (error) {
      setDeletionPreview(null);
      setErrorMessage(getApiErrorMessage(error, "AWS 연결을 삭제하지 못했습니다."));
    } finally {
      setActionPending(false);
    }
  }

  async function connectGitHubBuild(): Promise<void> {
    if (verifiedConnections.length === 0) {
      setShowAwsRequiredModal(true);
      return;
    }
    if (!verifiedConnections.some((connection) => connection.id === selectedBuildAwsConnectionId)) {
      setErrorMessage("GitHub 빌드에 사용할 AWS 계정을 선택해 주세요.");
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
      setErrorMessage(getApiErrorMessage(error, "GitHub 빌드 연결을 만들지 못했습니다."));
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
      verifiedConnections.some((connection) => connection.id === current)
        ? current
        : verifiedConnections.length === 1
          ? (verifiedConnections[0]?.id ?? "")
          : ""
    );
  }, [verifiedConnections]);

  useEffect(() => {
    let active = true;

    void Promise.all(
      verifiedConnections.map(async (connection) => [
        connection.id,
        await getAwsCodeConnection(connection.id)
      ] as const)
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
  }, [verifiedConnections]);

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

  return (
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader dashboardPageHeaderCompact">
        <div><h1>설정</h1></div>
        <button className={styles.iconAction} aria-label="연결 새로고침" disabled={connectionsQuery.isFetching} onClick={() => void loadConnections()} title="새로고침" type="button"><RefreshCw size={17} /></button>
      </header>

      {connectionsQuery.isPending && !connectionsQuery.data ? (
        <ProductState description="AWS Role 연결 상태를 확인하고 있습니다." kind="loading" title="AWS 환경설정 불러오는 중" />
      ) : connectionsQuery.isError && connections.length === 0 && cleanupRetries.length === 0 ? (
        <ProductState action={<button onClick={() => void loadConnections()} type="button">다시 시도</button>} description={getApiErrorMessage(connectionsQuery.error, "AWS 연결을 불러오지 못했습니다.")} kind="error" title="AWS 환경설정을 불러오지 못했습니다" />
      ) : (
        <>
          {connectionsQuery.isError ? <p className={styles.errorBand}>{getApiErrorMessage(connectionsQuery.error, "AWS 연결을 갱신하지 못했습니다.")}</p> : null}
          {errorMessage ? <p className={styles.errorBand}>{errorMessage}</p> : null}

          <section className={styles.settingsSection} id="aws-account-connection">
            <header><Cloud size={20} /><div><h2>AWS 계정 연결</h2><p>Access Key 대신 한 번 만든 Role을 사용합니다.</p></div></header>
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
          </section>

          <section className={styles.settingsSection}>
            <header>
              <DashboardIcon name="github" />
              <div>
                <h2>GitHub 빌드 연결</h2>
                <p>선택한 AWS 계정에 SketchCatch 관리 CodeConnections를 한 번 만듭니다.</p>
              </div>
            </header>
            <div className={styles.controlRow}>
              {verifiedConnections.length > 1 ? (
                <div className={styles.controlField}>
                  <span>사용할 AWS 계정</span>
                  <SelectMenu
                    ariaLabel="GitHub 빌드 AWS 계정 선택"
                    emptyLabel="AWS 계정 선택"
                    onChange={setSelectedBuildAwsConnectionId}
                    options={verifiedConnections.map((connection) => ({
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
                onConnect={() => void connectGitHubBuild()}
                onDisconnect={openGitHubBuildDisconnect}
                onRefresh={() => void refreshGitHubBuildConnection()}
              />
            </div>
          </section>

          {setupConnection && cloudFormation ? (
            <section className={styles.setupSection}>
              <div><span>1</span><div><strong>CloudFormation으로 Role 만들기</strong><p>{cloudFormation.roleName}</p></div></div>
              {cloudFormation.launchStackUrl ? <a href={cloudFormation.launchStackUrl} rel="noreferrer" target="_blank">AWS Console 열기 <ExternalLink size={15} /></a> : <pre>{cloudFormation.templateBody}</pre>}
              <div><span>2</span><label><strong>AWS 계정 ID 확인</strong><input inputMode="numeric" maxLength={12} onChange={(event) => setAccountId(event.target.value.replace(/\D/g, ""))} placeholder="12자리 계정 ID" value={accountId} /></label></div>
              <button className={styles.primaryAction} disabled={actionPending || !/^\d{12}$/.test(accountId)} onClick={() => void verifyCreatedRole()} type="button">Role 연결 확인</button>
            </section>
          ) : null}

          {cleanupRetries.length > 0 ? (
            <section className={`${styles.connectionList} ${styles.cleanupRetryList}`}>
              <div className={styles.sectionHeading}>
                <h2>정리 재시도 필요</h2>
                <span>{cleanupRetries.length}개</span>
              </div>
              <p className={styles.cleanupRetryGuidance}>
                이전 AWS 연결 정리를 완료해야 같은 계정을 다시 연결할 수 있습니다.
              </p>
              {cleanupRetries.map((retry) => (
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
            <div className={styles.sectionHeading}><h2>연결된 AWS 계정</h2><span>{connections.length}개</span></div>
            {connections.length === 0 ? <p>아직 연결된 AWS 계정이 없습니다.</p> : connections.map((connection) => <article key={connection.id}><div className={styles.connectionStatus} data-status={connection.status}>{connection.status === "verified" ? <CheckCircle2 size={16} /> : <Cloud size={16} />}<span>{connection.status === "verified" ? "검증됨" : "확인 필요"}</span></div><div><strong>{connection.accountId ?? "계정 확인 전"}</strong><p>{connection.region} · {connection.roleArn ?? "Role ARN 없음"}</p></div><div className={styles.rowActions}>{connection.status === "verified" ? <button disabled={actionPending} onClick={() => void retestConnection(connection)} type="button">연결 테스트</button> : <button disabled={actionPending} onClick={() => void resumeConnectionSetup(connection)} type="button">설정 계속</button>}<button data-danger="true" disabled={actionPending} onClick={() => void removeConnection(connection.id)} type="button"><Trash2 size={15} />삭제</button></div></article>)}
          </section>
        </>
      )}

      <GitHubAccountSettings />

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
              onClick={() => setDeletionPreview(null)}
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
                <li>GitHub CodeConnection {deletionPreview.managedResources.codeConnection ? "1개" : "없음"}</li>
              </ul>
              <strong>삭제하지 않는 리소스</strong>
              <p>{deletionPreview.preservedResources.join(", ")}</p>
            </div>
            {deletionPreview.blockerMessage ? (
              <p className={styles.cleanupBlocker}>{deletionPreview.blockerMessage}</p>
            ) : null}
            <div className={styles.modalActions}>
              <button disabled={actionPending} onClick={() => setDeletionPreview(null)} type="button">취소</button>
              {deletionPreview.canDelete ? (
                <button
                  className={styles.dangerAction}
                  disabled={actionPending}
                  onClick={() => void confirmRemoveConnection()}
                  type="button"
                >
                  {deletionPreview.cleanupRetry
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

function GitHubBuildConnectionAction({
  actionPending,
  connection,
  onConnect,
  onDisconnect,
  onRefresh
}: {
  readonly actionPending: boolean;
  readonly connection: AwsCodeConnectionResponse | undefined;
  readonly onConnect: () => void;
  readonly onDisconnect: () => void;
  readonly onRefresh: () => void;
}) {
  if (!connection?.codeConnection) {
    return (
      <button className={styles.primaryAction} disabled={actionPending} onClick={onConnect} type="button">
        GitHub 빌드 연결
      </button>
    );
  }
  if (connection.codeConnection.status === "CREATING") {
    return (
      <div className={styles.buildConnectionPending} role="status">
        <span>GitHub 빌드 연결 생성 중</span>
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
      <div className={styles.buildConnectionPending} role="alert">
        <span>{connection.codeConnection.statusReason ?? "GitHub 빌드 연결 생성에 실패했습니다."}</span>
        {hasAwsConnection && !cleanupRetryRequired ? (
          <button disabled={actionPending} onClick={onRefresh} type="button">상태 확인</button>
        ) : !hasAwsConnection ? (
          <button disabled={actionPending} onClick={onConnect} type="button">다시 생성</button>
        ) : null}
        <button data-danger="true" disabled={actionPending} onClick={onDisconnect} type="button">
          {hasAwsConnection ? "연결 해제 재시도" : "연결 정보 지우기"}
        </button>
      </div>
    );
  }
  if (connection.codeConnection.status === "AVAILABLE") {
    return (
      <div className={styles.buildConnectionReady} role="status">
        <CheckCircle2 size={16} />
        <span>GitHub 빌드 연결 완료</span>
        <button disabled={actionPending} onClick={onRefresh} type="button">상태 확인</button>
        <button data-danger="true" disabled={actionPending} onClick={onDisconnect} type="button">연결 해제</button>
      </div>
    );
  }
  return (
    <div className={styles.buildConnectionPending} role="status">
      <span>GitHub 승인 필요</span>
      {connection.setupUrl ? (
        <a href={connection.setupUrl} rel="noreferrer" target="_blank">
          AWS에서 승인하기 <ExternalLink size={14} />
        </a>
      ) : null}
      <button disabled={actionPending} onClick={onRefresh} type="button">승인 상태 확인</button>
      <button data-danger="true" disabled={actionPending} onClick={onDisconnect} type="button">연결 해제</button>
    </div>
  );
}
