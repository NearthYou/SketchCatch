"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type {
  AwsConnection,
  Project,
  ResourceType,
  ReverseEngineeringScanLogLine,
  ReverseEngineeringScanResponse
} from "../../../../packages/types/src";
import {
  createReverseEngineeringScan,
  listAwsConnections,
  listProjects,
  listReverseEngineeringScanLogs
} from "./api";
import styles from "./workspace.module.css";

export type ReverseEngineeringPanelProps = {
  readonly projectId: string;
};

type RequestState = "idle" | "loading" | "error";

const REVERSE_ENGINEERING_RESOURCE_TYPES: ResourceType[] = [
  "VPC",
  "SUBNET",
  "EC2",
  "RDS",
  "S3",
  "SECURITY_GROUP"
];

export function ReverseEngineeringPanel({ projectId }: ReverseEngineeringPanelProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [awsConnections, setAwsConnections] = useState<AwsConnection[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId);
  const [selectedAwsConnectionId, setSelectedAwsConnectionId] = useState("");
  const [selectedResourceTypes, setSelectedResourceTypes] = useState<ResourceType[]>(
    REVERSE_ENGINEERING_RESOURCE_TYPES
  );
  const [loadState, setLoadState] = useState<RequestState>("loading");
  const [scanState, setScanState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanResponse, setScanResponse] = useState<ReverseEngineeringScanResponse | null>(null);
  const [logs, setLogs] = useState<ReverseEngineeringScanLogLine[]>([]);

  const verifiedAwsConnections = useMemo(
    () => awsConnections.filter((connection) => connection.status === "verified"),
    [awsConnections]
  );

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedAwsConnection = verifiedAwsConnections.find(
    (connection) => connection.id === selectedAwsConnectionId
  );
  const canStartScan =
    Boolean(selectedProject) &&
    Boolean(selectedAwsConnection) &&
    selectedResourceTypes.length > 0 &&
    loadState !== "loading" &&
    scanState !== "loading";

  const loadOptions = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);

    try {
      const [nextProjects, nextAwsConnections] = await Promise.all([
        listProjects(),
        listAwsConnections()
      ]);
      const nextVerifiedAwsConnections = nextAwsConnections.filter(
        (connection) => connection.status === "verified"
      );

      setProjects(nextProjects);
      setAwsConnections(nextAwsConnections);
      setSelectedProjectId((currentProjectId) => {
        const projectStillExists = nextProjects.some((project) => project.id === currentProjectId);
        return projectStillExists ? currentProjectId : nextProjects[0]?.id ?? projectId;
      });
      setSelectedAwsConnectionId((currentAwsConnectionId) => {
        const connectionStillExists = nextVerifiedAwsConnections.some(
          (connection) => connection.id === currentAwsConnectionId
        );

        return connectionStillExists
          ? currentAwsConnectionId
          : nextVerifiedAwsConnections[0]?.id ?? "";
      });
      setLoadState("idle");
    } catch (error) {
      setLoadState("error");
      setErrorMessage(toErrorMessage(error));
    }
  }, [projectId]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  function toggleResourceType(resourceType: ResourceType): void {
    setSelectedResourceTypes((currentResourceTypes) =>
      currentResourceTypes.includes(resourceType)
        ? currentResourceTypes.filter((currentResourceType) => currentResourceType !== resourceType)
        : [...currentResourceTypes, resourceType]
    );
  }

  async function runScan(): Promise<void> {
    if (!canStartScan || !selectedAwsConnection) {
      return;
    }

    setScanState("loading");
    setErrorMessage(null);
    setScanResponse(null);
    setLogs([]);

    try {
      const response = await createReverseEngineeringScan({
        projectId: selectedProjectId,
        awsConnectionId: selectedAwsConnection.id,
        region: selectedAwsConnection.region,
        resourceTypes: selectedResourceTypes
      });
      const nextLogs = await listReverseEngineeringScanLogs({
        projectId: selectedProjectId,
        scanId: response.scan.id
      });

      setScanResponse(response);
      setLogs(nextLogs);
      setScanState("idle");
    } catch (error) {
      setScanState("error");
      setErrorMessage(toErrorMessage(error));
    }
  }

  return (
    <section className={styles.deploymentPanel} aria-label="Reverse Engineering">
      <div className={styles.deploymentPanelContent}>
        <header className={styles.deploymentHeader}>
          <div className={styles.deploymentHeaderTop}>
            <div>
              <span>Reverse Engineering</span>
              <h2>기존 AWS 읽어오기</h2>
            </div>
            <button
              className={styles.deploymentSecondaryButton}
              disabled={loadState === "loading"}
              onClick={() => void loadOptions()}
              type="button"
            >
              <RefreshCw size={14} aria-hidden="true" />
              <span className={styles.deploymentButtonText}>새로고침</span>
            </button>
          </div>
          <p className={styles.deploymentHint}>
            연결된 AWS에서 리소스를 읽고, 보드가 열 수 있는 설계 후보를 만듭니다.
          </p>
        </header>

        <section className={styles.deploymentSection}>
          <h3>스캔 기준</h3>
          <label className={styles.deploymentField}>
            프로젝트
            <select
              disabled={loadState === "loading"}
              onChange={(event) => setSelectedProjectId(event.currentTarget.value)}
              value={selectedProjectId}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.deploymentField}>
            AWS 연결
            <select
              disabled={loadState === "loading" || verifiedAwsConnections.length === 0}
              onChange={(event) => setSelectedAwsConnectionId(event.currentTarget.value)}
              value={selectedAwsConnectionId}
            >
              {verifiedAwsConnections.length === 0 ? (
                <option value="">검증된 AWS 연결 없음</option>
              ) : null}
              {verifiedAwsConnections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {formatAwsConnectionLabel(connection)}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.deploymentField}>
            가져올 리소스
            <div className={styles.reverseResourceGrid}>
              {REVERSE_ENGINEERING_RESOURCE_TYPES.map((resourceType) => (
                <label key={resourceType} className={styles.reverseResourceToggle}>
                  <input
                    checked={selectedResourceTypes.includes(resourceType)}
                    onChange={() => toggleResourceType(resourceType)}
                    type="checkbox"
                  />
                  <span>{resourceType}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            className={styles.deploymentPrimaryButton}
            disabled={!canStartScan}
            onClick={() => void runScan()}
            type="button"
          >
            <span className={styles.deploymentButtonText}>
              {scanState === "loading" ? "스캔 중" : "AWS 스캔 시작"}
            </span>
          </button>

          {errorMessage ? <p className={styles.deploymentError}>{errorMessage}</p> : null}
        </section>

        {scanResponse?.result ? (
          <ReverseEngineeringResult response={scanResponse} logs={logs} />
        ) : (
          <section className={styles.deploymentSection}>
            <h3>결과</h3>
            <p className={styles.deploymentHint}>
              스캔을 실행하면 발견한 리소스, 생성된 설계 후보, 가져오기 제안이 여기에 표시됩니다.
            </p>
          </section>
        )}
      </div>
    </section>
  );
}

function ReverseEngineeringResult({
  logs,
  response
}: {
  logs: ReverseEngineeringScanLogLine[];
  response: ReverseEngineeringScanResponse;
}) {
  const result = response.result;

  if (!result) {
    return null;
  }

  return (
    <>
      <section className={styles.deploymentSection}>
        <h3>스캔 결과</h3>
        <div className={styles.deploymentPreflightStats}>
          <span>
            찾은 리소스
            <strong>{result.discoveredResources.length}</strong>
          </span>
          <span>
            보드 노드
            <strong>{result.architectureJson.nodes.length}</strong>
          </span>
          <span>
            연결선
            <strong>{result.architectureJson.edges.length}</strong>
          </span>
        </div>
      </section>

      <section className={styles.deploymentSection}>
        <h3>발견한 리소스</h3>
        {result.discoveredResources.length === 0 ? (
          <p className={styles.deploymentHint}>아직 발견한 리소스가 없습니다.</p>
        ) : (
          <ul className={styles.reverseResultList}>
            {result.discoveredResources.slice(0, 8).map((resource) => (
              <li key={resource.id} className={styles.reverseResultItem}>
                <strong>{resource.displayName}</strong>
                <span>
                  {resource.resourceType} · {resource.providerResourceId}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.deploymentSection}>
        <h3>Terraform import 제안</h3>
        {result.importSuggestions.length === 0 ? (
          <p className={styles.deploymentHint}>가져오기 제안이 없습니다.</p>
        ) : (
          <ul className={styles.reverseResultList}>
            {result.importSuggestions.slice(0, 5).map((suggestion) => (
              <li key={suggestion.id} className={styles.reverseResultItem}>
                <strong>{suggestion.terraformAddress ?? suggestion.status}</strong>
                <span>{suggestion.importCommand ?? suggestion.reason ?? "수동 확인 필요"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.deploymentSection}>
        <h3>스캔 로그</h3>
        {logs.length === 0 ? (
          <p className={styles.deploymentHint}>표시할 로그가 없습니다.</p>
        ) : (
          <ul className={styles.reverseLogList}>
            {logs.map((log) => (
              <li key={log.id} data-level={log.level}>
                <strong>{log.stage}</strong>
                <span>{log.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function formatAwsConnectionLabel(connection: AwsConnection): string {
  const accountLabel = connection.accountId ?? "계정 미확인";
  return `${accountLabel} · ${connection.region}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}
