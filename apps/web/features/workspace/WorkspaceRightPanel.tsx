"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";
import type {
  AwsConnection,
  Deployment,
  DeploymentLog,
  ProjectDetailsResponse,
  TerraformDiagnostic,
  TerraformArtifact
} from "@sketchcatch/types";
import { Code2, GitBranch, Play, RefreshCw, ShieldCheck } from "lucide-react";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { getApiErrorMessage } from "../../lib/api-client";
import { ParameterInputPanel } from "../parameter-input";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
  createDeployment,
  generateTerraformCode,
  getProjectDetails,
  listAwsConnections,
  listDeploymentLogs,
  listDeployments,
  runDeploymentInit,
  syncTerraformToDiagram,
  validateTerraformCode
} from "./api";
import styles from "./workspace.module.css";

type WorkspaceRightPanelTab = "resource" | "terraform" | "deployment";
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
          aria-selected={activeTab === "terraform"}
          className={activeTab === "terraform" ? styles.rightPanelTabActive : styles.rightPanelTab}
          onClick={() => setActiveTab("terraform")}
          role="tab"
          type="button"
        >
          Terraform
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
      ) : activeTab === "terraform" ? (
        <TerraformCodePanel context={context} />
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

function TerraformCodePanel({ context }: { readonly context: DiagramEditorPanelContext }) {
  const [terraformCode, setTerraformCode] = useState("");
  const [diagnostics, setDiagnostics] = useState<TerraformDiagnostic[]>([]);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("main.tf");
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const hasLoadedInitialCodeRef = useRef(false);
  const lineNumberRef = useRef<HTMLOListElement | null>(null);

  const hasTerraformCode = terraformCode.trim().length > 0;
  const hasErrorDiagnostics = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const lineNumbers = useMemo(
    () => Array.from({ length: Math.max(1, terraformCode.split(/\r\n|\r|\n/).length) }, (_, index) => index + 1),
    [terraformCode]
  );

  const runRequest = useCallback(async (request: () => Promise<void>, fallbackMessage: string) => {
    setRequestState("loading");
    setErrorMessage("");

    try {
      await request();
      setRequestState("idle");
    } catch (error) {
      setRequestState("error");
      setErrorMessage(getApiErrorMessage(error, fallbackMessage));
    }
  }, []);

  const refreshTerraformCode = useCallback(async () => {
    await runRequest(async () => {
      const generatedCode = await generateTerraformCode(context.diagram);
      setTerraformCode(generatedCode);
      setDiagnostics([]);
      setHasLocalEdits(false);
      setStatusMessage("그래프 기준으로 생성됨");
    }, "Terraform 코드를 생성하지 못했습니다.");
  }, [context.diagram, runRequest]);

  useEffect(() => {
    if (hasLoadedInitialCodeRef.current || context.nodes.length === 0) {
      return;
    }

    hasLoadedInitialCodeRef.current = true;
    void refreshTerraformCode();
  }, [context.nodes.length, refreshTerraformCode]);

  function handleCodeScroll(event: UIEvent<HTMLTextAreaElement>): void {
    if (lineNumberRef.current) {
      lineNumberRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  function handleCodeChange(nextCode: string): void {
    setTerraformCode(nextCode);
    setHasLocalEdits(true);
    setStatusMessage("수정됨");
  }

  async function validateCode(): Promise<void> {
    if (!hasTerraformCode) {
      return;
    }

    await runRequest(async () => {
      const result = await validateTerraformCode(terraformCode);
      setDiagnostics(result.diagnostics);
      setStatusMessage(result.diagnostics.length === 0 ? "문법 문제 없음" : "진단 확인 필요");
    }, "Terraform 문법을 점검하지 못했습니다.");
  }

  async function applyCodeToDiagram(): Promise<void> {
    if (!hasTerraformCode) {
      return;
    }

    await runRequest(async () => {
      const result = await syncTerraformToDiagram({
        diagramJson: context.diagram,
        terraformCode
      });

      setDiagnostics(result.diagnostics);

      if (result.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
        setStatusMessage("적용 차단됨");
        return;
      }

      context.applyDiagramJson(result.diagramJson);
      setHasLocalEdits(false);
      setStatusMessage("다이어그램에 적용됨");
    }, "Terraform 코드를 다이어그램에 적용하지 못했습니다.");
  }

  return (
    <div className={styles.terraformPanel}>
      <header className={styles.terraformTopBar}>
        <div className={styles.terraformFileChip}>
          <Code2 size={16} aria-hidden="true" />
          <span>main.tf</span>
        </div>
        <div className={styles.terraformActions}>
          <button
            aria-label="그래프에서 Terraform 코드 생성"
            disabled={requestState === "loading"}
            onClick={refreshTerraformCode}
            title="그래프에서 Terraform 코드 생성"
            type="button"
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
          <button
            aria-label="Terraform 문법 점검"
            disabled={requestState === "loading" || !hasTerraformCode}
            onClick={validateCode}
            title="Terraform 문법 점검"
            type="button"
          >
            <ShieldCheck size={16} aria-hidden="true" />
          </button>
          <button
            aria-label="Terraform 코드를 다이어그램에 적용"
            disabled={requestState === "loading" || !hasTerraformCode}
            onClick={applyCodeToDiagram}
            title="Terraform 코드를 다이어그램에 적용"
            type="button"
          >
            <Play size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className={styles.terraformStatusBar}>
        <span className={hasLocalEdits ? styles.terraformStatusEdited : styles.terraformStatusSynced}>
          {statusMessage}
        </span>
        <span>{context.nodes.length} nodes</span>
      </div>

      <div className={styles.terraformEditorFrame}>
        <ol ref={lineNumberRef} className={styles.terraformLineNumbers} aria-hidden="true">
          {lineNumbers.map((lineNumber) => (
            <li key={lineNumber}>{lineNumber}</li>
          ))}
        </ol>
        <textarea
          aria-label="Terraform 코드"
          className={styles.terraformTextarea}
          onChange={(event) => handleCodeChange(event.target.value)}
          onScroll={handleCodeScroll}
          placeholder={`resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}`}
          spellCheck={false}
          value={terraformCode}
        />
      </div>

      <section className={styles.terraformDiagnostics} aria-live="polite">
        <div className={styles.terraformDiagnosticsHeader}>
          <GitBranch size={15} aria-hidden="true" />
          <h3>Issues</h3>
          <span className={hasErrorDiagnostics ? styles.terraformIssueCountError : styles.terraformIssueCount}>
            {diagnostics.length}
          </span>
        </div>

        {requestState === "loading" ? <p className={styles.terraformNotice}>요청을 처리하는 중입니다.</p> : null}
        {requestState === "error" ? (
          <p className={styles.terraformError} role="alert">
            {errorMessage}
          </p>
        ) : null}
        {diagnostics.length === 0 && requestState !== "loading" && requestState !== "error" ? (
          <p className={styles.terraformEmpty}>표시할 진단이 없습니다.</p>
        ) : null}
        {diagnostics.length > 0 ? (
          <ol className={styles.terraformDiagnosticList}>
            {diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code ?? diagnostic.message}-${index}`} data-severity={diagnostic.severity}>
                <strong>{formatTerraformDiagnosticTitle(diagnostic)}</strong>
                <span>{diagnostic.message}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </div>
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
  const canRunInit =
    Boolean(selectedDeployment) &&
    selectedDeployment?.status !== "RUNNING" &&
    requestState !== "loading";

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

  async function startTerraformInit(): Promise<void> {
    if (!selectedDeployment || !canRunInit) {
      return;
    }

    await runRequest(async () => {
      const deployment = await runDeploymentInit(selectedDeployment.id);
      setDeployments((currentDeployments) =>
        currentDeployments.map((currentDeployment) =>
          currentDeployment.id === deployment.id ? deployment : currentDeployment
        )
      );
      setSelectedDeploymentId(deployment.id);
      setDeploymentLogs(await listDeploymentLogs(deployment.id));
    }, "Terraform init을 시작하지 못했습니다.");
  }

  async function refreshDeploymentPanel(): Promise<void> {
    await runRequest(async () => {
      const [nextDeployments, nextLogs] = await Promise.all([
        listDeployments(projectId),
        selectedDeploymentId ? listDeploymentLogs(selectedDeploymentId) : Promise.resolve([])
      ]);

      setDeployments(nextDeployments);
      setDeploymentLogs(nextLogs);
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
        {!selectedTerraformArtifactId ? <p className={styles.deploymentHint}>Terraform artifact가 있어야 init을 실행할 수 있습니다.</p> : null}
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
            <InfoRow label="Blocked" value={selectedDeployment.isBlocked ? "yes" : "no"} />
            <InfoRow label="Error" value={selectedDeployment.errorSummary ?? "없음"} />
          </div>
        ) : null}

        <button
          className={styles.deploymentPrimaryButton}
          disabled={!canRunInit}
          onClick={startTerraformInit}
          type="button"
        >
          <DashboardIcon name="server" />
          Terraform init 실행
        </button>
      </section>

      <section className={styles.deploymentSection}>
        <h3>Logs</h3>
        {deploymentLogs.length === 0 ? (
          <p className={styles.deploymentHint}>아직 표시할 로그가 없습니다.</p>
        ) : (
          <ol className={styles.deploymentLogList}>
            {deploymentLogs.map((log) => (
              <li key={log.id}>
                <span>{log.level}</span>
                <p>{log.message}</p>
              </li>
            ))}
          </ol>
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

function formatTerraformDiagnosticTitle(diagnostic: TerraformDiagnostic): string {
  const location = diagnostic.line ? `line ${diagnostic.line}` : "Terraform";
  const resource = diagnostic.resourceAddress ? ` | ${diagnostic.resourceAddress}` : "";
  return `${diagnostic.severity.toUpperCase()} | ${location}${resource}`;
}

function InfoRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
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
