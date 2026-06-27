"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AwsConnection,
  Deployment,
  DeploymentLog,
  ProjectDetailsResponse,
  TerraformArtifact
} from "@sketchcatch/types";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { getApiErrorMessage } from "../../lib/api-client";
import { ParameterInputPanel } from "../parameter-input";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
  approveDeploymentPlan,
  createDeployment,
  getProjectDetails,
  listAwsConnections,
  listDeploymentLogs,
  listDeployments,
  runDeploymentPlan
} from "./api";
import styles from "./workspace.module.css";

type WorkspaceRightPanelTab = "resource" | "deployment";
type RequestState = "idle" | "loading" | "error";

export type WorkspaceRightPanelProps = {
  readonly context: DiagramEditorPanelContext;
  readonly projectId: string;
  readonly projectName: string;
};

export function WorkspaceRightPanel({ context, projectId, projectName }: WorkspaceRightPanelProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceRightPanelTab>("resource");

  return (
    <aside className={styles.rightPanelShell}>
      <div className={styles.rightPanelTabs} role="tablist" aria-label="보드 오른쪽 패널">
        <button
          aria-selected={activeTab === "resource"}
          className={activeTab === "resource" ? styles.rightPanelTabActive : styles.rightPanelTab}
          onClick={() => setActiveTab("resource")}
          role="tab"
          type="button"
        >
          리소스
        </button>
        <button
          aria-selected={activeTab === "deployment"}
          className={activeTab === "deployment" ? styles.rightPanelTabActive : styles.rightPanelTab}
          onClick={() => setActiveTab("deployment")}
          role="tab"
          type="button"
        >
          배포
        </button>
      </div>

      {activeTab === "resource" ? (
        <ParameterInputPanel {...context} />
      ) : (
        <DeploymentPanel
          currentNodeCount={context.nodes.length}
          projectId={projectId}
          projectName={projectName}
        />
      )}
    </aside>
  );
}

function DeploymentPanel({
  currentNodeCount,
  projectId,
  projectName
}: {
  readonly currentNodeCount: number;
  readonly projectId: string;
  readonly projectName: string;
}) {
  const [projectDetails, setProjectDetails] = useState<ProjectDetailsResponse | null>(null);
  const [awsConnections, setAwsConnections] = useState<AwsConnection[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [deploymentLogs, setDeploymentLogs] = useState<DeploymentLog[]>([]);
  const [selectedArchitectureId, setSelectedArchitectureId] = useState("");
  const [selectedTerraformArtifactId, setSelectedTerraformArtifactId] = useState("");
  const [selectedAwsConnectionId, setSelectedAwsConnectionId] = useState("");
  const [selectedDeploymentId, setSelectedDeploymentId] = useState("");
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const verifiedAwsConnections = useMemo(
    () => awsConnections.filter((connection) => connection.status === "verified"),
    [awsConnections]
  );
  const terraformArtifacts = useMemo(
    () =>
      (projectDetails?.assets ?? []).filter(
        (asset): asset is TerraformArtifact =>
          asset.assetType === "terraform_file" && typeof asset.architectureId === "string"
      ),
    [projectDetails]
  );
  const architectureTerraformArtifacts = useMemo(
    () =>
      selectedArchitectureId
        ? terraformArtifacts.filter((artifact) => artifact.architectureId === selectedArchitectureId)
        : terraformArtifacts,
    [selectedArchitectureId, terraformArtifacts]
  );
  const selectedDeployment = useMemo(
    () => deployments.find((deployment) => deployment.id === selectedDeploymentId) ?? null,
    [deployments, selectedDeploymentId]
  );
  const canCreateDeployment =
    selectedArchitectureId.length > 0 &&
    selectedTerraformArtifactId.length > 0 &&
    selectedAwsConnectionId.length > 0 &&
    requestState !== "loading";
  const hasCurrentPlan = Boolean(selectedDeployment?.currentPlanArtifactId);
  const isPlanApproved = Boolean(
    selectedDeployment?.approvedAt && selectedDeployment.approvedPlanArtifactId
  );
  const canRunPlan =
    Boolean(selectedDeployment) &&
    selectedDeployment?.status !== "RUNNING" &&
    !isPlanApproved &&
    requestState !== "loading";
  const canApprovePlan =
    hasCurrentPlan &&
    !isPlanApproved &&
    selectedDeployment?.status !== "RUNNING" &&
    selectedDeployment?.isBlocked === true &&
    selectedDeployment?.blockedBy === "missing_approval" &&
    requestState !== "loading";
  const shouldShowPlanButton = Boolean(selectedDeployment) && !isPlanApproved;
  const shouldShowApprovePlanButton =
    Boolean(selectedDeployment) && hasCurrentPlan && !isPlanApproved;
  const shouldShowApplyButton = Boolean(selectedDeployment) && isPlanApproved;
  const deploymentActionHint = selectedDeployment
    ? getDeploymentActionHint(selectedDeployment)
    : "";

  useEffect(() => {
    let cancelled = false;

    async function loadDeploymentData(): Promise<void> {
      await runRequest(async () => {
        const [nextProjectDetails, nextConnections, nextDeployments] = await Promise.all([
          getProjectDetails(projectId),
          listAwsConnections(),
          listDeployments(projectId)
        ]);

        if (cancelled) {
          return;
        }

        setProjectDetails(nextProjectDetails);
        setAwsConnections(nextConnections);
        setDeployments(nextDeployments);

        const latestArchitecture = nextProjectDetails.architectures[0];
        const latestTerraformArtifact = nextProjectDetails.assets.find(
          (asset): asset is TerraformArtifact =>
            asset.assetType === "terraform_file" &&
            asset.architectureId === latestArchitecture?.id
        );
        const latestVerifiedConnection = nextConnections.find(
          (connection) => connection.status === "verified"
        );
        const latestDeployment = nextDeployments[0];

        setSelectedArchitectureId((currentId) => currentId || latestArchitecture?.id || "");
        setSelectedTerraformArtifactId((currentId) => currentId || latestTerraformArtifact?.id || "");
        setSelectedAwsConnectionId((currentId) => currentId || latestVerifiedConnection?.id || "");
        setSelectedDeploymentId((currentId) => currentId || latestDeployment?.id || "");
      }, "배포 정보를 불러오지 못했습니다.");
    }

    void loadDeploymentData();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!selectedDeploymentId) {
      setDeploymentLogs([]);
      return;
    }

    let cancelled = false;

    async function loadLogs(): Promise<void> {
      await runRequest(async () => {
        const logs = await listDeploymentLogs(selectedDeploymentId);

        if (!cancelled) {
          setDeploymentLogs(logs);
        }
      }, "배포 로그를 불러오지 못했습니다.");
    }

    void loadLogs();

    return () => {
      cancelled = true;
    };
  }, [selectedDeploymentId]);

  useEffect(() => {
    if (
      selectedTerraformArtifactId &&
      architectureTerraformArtifacts.some((artifact) => artifact.id === selectedTerraformArtifactId)
    ) {
      return;
    }

    setSelectedTerraformArtifactId(architectureTerraformArtifacts[0]?.id ?? "");
  }, [architectureTerraformArtifacts, selectedTerraformArtifactId]);

  async function runRequest(request: () => Promise<void>, fallbackMessage: string): Promise<void> {
    setRequestState("loading");
    setErrorMessage("");

    try {
      await request();
      setRequestState("idle");
    } catch (error) {
      setRequestState("error");
      setErrorMessage(getApiErrorMessage(error, fallbackMessage));
    }
  }

  async function createProjectDeployment(): Promise<void> {
    if (!canCreateDeployment) {
      return;
    }

    await runRequest(async () => {
      const deployment = await createDeployment({
        projectId,
        architectureId: selectedArchitectureId,
        terraformArtifactId: selectedTerraformArtifactId,
        awsConnectionId: selectedAwsConnectionId
      });

      setDeployments((currentDeployments) => [deployment, ...currentDeployments]);
      setSelectedDeploymentId(deployment.id);
      setDeploymentLogs([]);
    }, "Deployment를 생성하지 못했습니다.");
  }

  async function startTerraformPlan(): Promise<void> {
    if (!selectedDeployment || !canRunPlan) {
      return;
    }

    await runRequest(async () => {
      const deployment = await runDeploymentPlan(selectedDeployment.id);
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      setDeploymentLogs(await listDeploymentLogs(deployment.id));
    }, "Terraform Plan을 시작하지 못했습니다.");
  }

  async function approveCurrentPlan(): Promise<void> {
    if (!selectedDeployment || !canApprovePlan) {
      return;
    }

    await runRequest(async () => {
      const deployment = await approveDeploymentPlan(selectedDeployment.id);
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      setDeploymentLogs(await listDeploymentLogs(deployment.id));
    }, "Terraform Plan을 승인하지 못했습니다.");
  }

  async function refreshDeploymentPanel(): Promise<void> {
    await runRequest(async () => {
      const [nextProjectDetails, nextConnections, nextDeployments, nextLogs] = await Promise.all([
        getProjectDetails(projectId),
        listAwsConnections(),
        listDeployments(projectId),
        selectedDeploymentId ? listDeploymentLogs(selectedDeploymentId) : Promise.resolve([])
      ]);
      const latestArchitecture = nextProjectDetails.architectures[0];
      const latestVerifiedConnection = nextConnections.find(
        (connection) => connection.status === "verified"
      );

      setProjectDetails(nextProjectDetails);
      setAwsConnections(nextConnections);
      setDeployments(nextDeployments);
      setDeploymentLogs(nextLogs);
      setSelectedArchitectureId((currentId) =>
        nextProjectDetails.architectures.some((architecture) => architecture.id === currentId)
          ? currentId
          : latestArchitecture?.id ?? ""
      );
      setSelectedAwsConnectionId((currentId) =>
        nextConnections.some((connection) => connection.id === currentId)
          ? currentId
          : latestVerifiedConnection?.id ?? ""
      );
    }, "배포 상태를 새로고침하지 못했습니다.");
  }

  return (
    <div className={styles.deploymentPanel}>
      <header className={styles.deploymentHeader}>
        <p className={styles.projectEyebrow}>Deployment</p>
        <h2>{projectName}</h2>
        <span>{currentNodeCount} board nodes</span>
      </header>

      <section className={styles.deploymentSection}>
        <label className={styles.deploymentField}>
          Architecture snapshot
          <select
            onChange={(event) => setSelectedArchitectureId(event.target.value)}
            value={selectedArchitectureId}
          >
            {(projectDetails?.architectures ?? []).length === 0 ? (
              <option value="">저장된 snapshot 없음</option>
            ) : (
              projectDetails?.architectures.map((architecture) => (
                <option key={architecture.id} value={architecture.id}>
                  v{architecture.version} | {architecture.source} | {formatDate(architecture.createdAt)}
                </option>
              ))
            )}
          </select>
        </label>

        <label className={styles.deploymentField}>
          Terraform artifact
          <select
            disabled={architectureTerraformArtifacts.length === 0}
            onChange={(event) => setSelectedTerraformArtifactId(event.target.value)}
            value={selectedTerraformArtifactId}
          >
            {architectureTerraformArtifacts.length === 0 ? (
              <option value="">Terraform artifact 없음</option>
            ) : (
              architectureTerraformArtifacts.map((artifact) => (
                <option key={artifact.id} value={artifact.id}>
                  {artifact.fileName} | {formatDate(artifact.createdAt)}
                </option>
              ))
            )}
          </select>
        </label>

        <label className={styles.deploymentField}>
          AWS connection
          <select
            disabled={verifiedAwsConnections.length === 0}
            onChange={(event) => setSelectedAwsConnectionId(event.target.value)}
            value={selectedAwsConnectionId}
          >
            {verifiedAwsConnections.length === 0 ? (
              <option value="">검증된 AWS 연결 없음</option>
            ) : (
              verifiedAwsConnections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.accountId} | {connection.region}
                </option>
              ))
            )}
          </select>
        </label>

        <button
          className={styles.deploymentPrimaryButton}
          disabled={!canCreateDeployment}
          onClick={createProjectDeployment}
          type="button"
        >
          <DashboardIcon name="rocket" />
          Deployment 생성
        </button>

        {!selectedArchitectureId ? <p className={styles.deploymentHint}>먼저 architecture snapshot이 필요합니다.</p> : null}
        {!selectedTerraformArtifactId ? <p className={styles.deploymentHint}>Terraform artifact가 있어야 Plan을 실행할 수 있습니다.</p> : null}
        {!selectedAwsConnectionId ? (
          <p className={styles.deploymentHint}>환경설정에서 AWS 계정을 한 번 연결하고 검증해주세요.</p>
        ) : null}
      </section>

      <section className={styles.deploymentSection}>
        <div className={styles.deploymentSectionHeader}>
          <h3>Deployment records</h3>
          <button
            className={styles.deploymentSecondaryButton}
            disabled={requestState === "loading"}
            onClick={refreshDeploymentPanel}
            type="button"
          >
            새로고침
          </button>
        </div>

        <label className={styles.deploymentField}>
          실행 기록
          <select
            disabled={deployments.length === 0}
            onChange={(event) => setSelectedDeploymentId(event.target.value)}
            value={selectedDeploymentId}
          >
            {deployments.length === 0 ? (
              <option value="">Deployment 없음</option>
            ) : (
              deployments.map((deployment) => (
                <option key={deployment.id} value={deployment.id}>
                  {deployment.status} | {formatDate(deployment.createdAt)}
                </option>
              ))
            )}
          </select>
        </label>

        {selectedDeployment ? (
          <div className={styles.deploymentSummary}>
            <InfoRow label="Status" value={selectedDeployment.status} />
            <InfoRow
              label="Current plan"
              value={selectedDeployment.currentPlanArtifactId ?? "없음"}
            />
            <InfoRow label="Blocked" value={selectedDeployment.isBlocked ? "yes" : "no"} />
            <InfoRow label="Blocked by" value={selectedDeployment.blockedBy ?? "없음"} />
            <InfoRow label="Reason" value={selectedDeployment.blockedReason ?? "없음"} />
            <InfoRow label="Approval" value={formatApprovalState(selectedDeployment)} />
            {selectedDeployment.planSummary ? (
              <PlanSummaryRows deployment={selectedDeployment} />
            ) : null}
            {selectedDeployment.approvedAt ? (
              <>
                <InfoRow label="Approved at" value={formatDate(selectedDeployment.approvedAt)} />
                <InfoRow
                  label="Approved plan"
                  value={selectedDeployment.approvedPlanArtifactId ?? "없음"}
                />
                <InfoRow
                  label="tfplan hash"
                  value={formatShortHash(selectedDeployment.approvedTfplanHash)}
                />
                <InfoRow
                  label="Artifact hash"
                  value={formatShortHash(selectedDeployment.approvedTerraformArtifactHash)}
                />
                <InfoRow
                  label="AWS account"
                  value={selectedDeployment.approvedAwsAccountId ?? "없음"}
                />
                <InfoRow
                  label="AWS region"
                  value={selectedDeployment.approvedAwsRegion ?? "없음"}
                />
              </>
            ) : null}
            <InfoRow label="Error" value={selectedDeployment.errorSummary ?? "없음"} />
          </div>
        ) : null}

        {shouldShowPlanButton ? (
          <button
            className={styles.deploymentPrimaryButton}
            disabled={!canRunPlan}
            onClick={startTerraformPlan}
            type="button"
          >
            <DashboardIcon name="server" />
            {hasCurrentPlan ? "Terraform Plan 다시 실행" : "Terraform Plan 실행"}
          </button>
        ) : null}

        {shouldShowApprovePlanButton ? (
          <button
            className={styles.deploymentSecondaryButton}
            disabled={!canApprovePlan}
            onClick={approveCurrentPlan}
            type="button"
          >
            Plan 승인
          </button>
        ) : null}

        {shouldShowApplyButton ? (
          <button className={styles.deploymentPrimaryButton} disabled type="button">
            <DashboardIcon name="rocket" />
            Apply 실행
          </button>
        ) : null}

        {deploymentActionHint ? (
          <p className={styles.deploymentHint}>{deploymentActionHint}</p>
        ) : null}
      </section>

      <section className={styles.deploymentSection}>
        <h3>Logs</h3>
        {deploymentLogs.length === 0 ? (
          <p className={styles.deploymentHint}>아직 표시할 로그가 없습니다.</p>
        ) : (
          <pre aria-label="Deployment logs" className={styles.deploymentLogConsole}>
            {deploymentLogs.map(formatDeploymentLogLine).join("\n")}
          </pre>
        )}
      </section>

      {requestState === "loading" ? <p className={styles.deploymentNotice}>요청을 처리하는 중입니다.</p> : null}
      {requestState === "error" ? (
        <p className={styles.deploymentError} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function InfoRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PlanSummaryRows({ deployment }: { readonly deployment: Deployment }) {
  const summary = deployment.planSummary;

  if (!summary) {
    return null;
  }

  return (
    <>
      <InfoRow
        label="Plan changes"
        value={`+${summary.createCount} ~${summary.updateCount} -${summary.deleteCount} +/-${summary.replaceCount}`}
      />
      {summary.warnings.length > 0 ? (
        <div className={styles.deploymentWarnings}>
          <span>Warnings</span>
          <ul>
            {summary.warnings.map((warning, index) => (
              <li key={`${warning.level}-${index}`}>
                <strong>{warning.level}</strong>
                <p>{warning.message}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function formatApprovalState(deployment: Deployment): string {
  if (deployment.approvedAt) {
    return "승인됨";
  }

  if (!deployment.currentPlanArtifactId) {
    return "Plan 필요";
  }

  if (deployment.isBlocked && deployment.blockedBy === "missing_approval") {
    return "승인 가능";
  }

  if (deployment.isBlocked) {
    return "승인 불가";
  }

  return "승인 필요 없음";
}

function getDeploymentActionHint(deployment: Deployment): string {
  if (deployment.status === "RUNNING") {
    return "Terraform 작업이 진행 중입니다. 새로고침으로 상태를 확인해주세요.";
  }

  if (deployment.approvedAt) {
    return "승인된 Plan이 준비되었습니다. 실제 Apply 실행 단계는 아직 연결 전입니다.";
  }

  if (!deployment.currentPlanArtifactId) {
    return "Terraform Plan을 먼저 실행하면 승인 버튼이 표시됩니다.";
  }

  if (deployment.isBlocked && deployment.blockedBy === "missing_approval") {
    return "Plan 내용을 확인한 뒤 승인할 수 있습니다.";
  }

  if (deployment.isBlocked) {
    return "현재 Plan은 승인 전에 차단 사유를 해결해야 합니다.";
  }

  return "";
}

function formatDeploymentLogLine(log: DeploymentLog): string {
  const sequence = String(log.sequence).padStart(3, "0");
  const stage = log.stage.toUpperCase().padEnd(8, " ");
  const level = log.level.padEnd(5, " ");

  return `${sequence}  ${stage}  ${level}  ${log.message}`;
}

function formatShortHash(value: string | null): string {
  if (!value) {
    return "없음";
  }

  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 12)}...${value.slice(-4)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}
