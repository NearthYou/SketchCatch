"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AwsConnection,
  Project,
  ResourceType,
  ReverseEngineeringScanLogLine,
  ReverseEngineeringScanResponse
} from "../../../../packages/types/src";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
  createArchitectureSnapshot,
  createReverseEngineeringScan,
  listAwsConnections,
  listProjects,
  listReverseEngineeringScanLogs
} from "./api";
import {
  createReverseEngineeringBoardApplication,
  createReverseEngineeringBoardComparison,
  type ReverseEngineeringBoardApplicationMode
} from "./reverse-engineering-board-application";
import {
  ReverseEngineeringResultPanel,
  type ReverseEngineeringApplyState
} from "./ReverseEngineeringResultPanel";
import { ReverseEngineeringScanCriteriaForm } from "./ReverseEngineeringScanCriteriaForm";
import { convertDiagramJsonToArchitectureJson } from "./workspace-ai-diagram-adapter";
import styles from "./workspace.module.css";

export type ReverseEngineeringPanelProps = {
  readonly context: DiagramEditorPanelContext;
  readonly projectId: string;
};

type RequestState = "idle" | "loading" | "error";

const REVERSE_ENGINEERING_RESOURCE_TYPES: ResourceType[] = [
  "VPC",
  "SUBNET",
  "INTERNET_GATEWAY",
  "ROUTE_TABLE",
  "SECURITY_GROUP",
  "EC2",
  "RDS",
  "S3"
];

// 기존 AWS 읽어오기 화면의 상태와 버튼 흐름을 관리합니다.
export function ReverseEngineeringPanel({ context, projectId }: ReverseEngineeringPanelProps) {
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
  const [applyState, setApplyState] = useState<ReverseEngineeringApplyState>("idle");
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

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
  const comparison = useMemo(() => {
    if (!scanResponse?.result) {
      return null;
    }

    return createReverseEngineeringBoardComparison({
      currentDiagram: context.diagram,
      result: scanResponse.result
    });
  }, [context.diagram, scanResponse]);

  // 프로젝트와 검증된 AWS 연결 목록을 불러와 스캔 선택지를 채웁니다.
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

  // 사용자가 가져올 AWS 리소스 종류를 켜고 끕니다.
  function toggleResourceType(resourceType: ResourceType): void {
    setSelectedResourceTypes((currentResourceTypes) =>
      currentResourceTypes.includes(resourceType)
        ? currentResourceTypes.filter((currentResourceType) => currentResourceType !== resourceType)
        : [...currentResourceTypes, resourceType]
    );
  }

  // 사용자가 스캔을 다시 시작하면 이전 미리보기와 적용 메시지를 지웁니다.
  async function runScan(): Promise<void> {
    if (!canStartScan || !selectedAwsConnection) {
      return;
    }

    setScanState("loading");
    setErrorMessage(null);
    setApplyMessage(null);
    setApplyState("idle");
    setScanResponse(null);
    setLogs([]);
    context.setPreviewDiagram(null);

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
      if (response.result) {
        const application = createReverseEngineeringBoardApplication({
          currentDiagram: context.diagram,
          mode: "replace",
          result: response.result
        });

        context.setPreviewDiagram(application.previewDiagram);
      }
      setScanState("idle");
    } catch (error) {
      setScanState("error");
      setErrorMessage(toErrorMessage(error));
    }
  }

  // 사용자가 명시적으로 고른 방식으로만 스캔 후보를 실제 보드에 반영합니다.
  async function applyScanResult(mode: ReverseEngineeringBoardApplicationMode): Promise<void> {
    const result = scanResponse?.result;

    if (!result || applyState === "saving") {
      return;
    }

    const application = createReverseEngineeringBoardApplication({
      currentDiagram: context.diagram,
      mode,
      result
    });

    setApplyState("saving");
    setApplyMessage(null);
    context.applyDiagramJson(application.diagram);

    try {
      await createArchitectureSnapshot({
        projectId,
        source: "imported",
        architectureJson: convertDiagramJsonToArchitectureJson(application.diagram)
      });
      setApplyState("saved");
      setApplyMessage("보드에 반영했고, imported Architecture Snapshot도 저장했습니다.");
    } catch (error) {
      setApplyState("error");
      setApplyMessage(toErrorMessage(error));
    }
  }

  return (
    <section className={styles.deploymentPanel} aria-label="Reverse Engineering">
      <div className={styles.deploymentPanelContent}>
        <ReverseEngineeringScanCriteriaForm
          awsConnections={verifiedAwsConnections}
          canStartScan={canStartScan}
          isLoadingOptions={loadState === "loading"}
          isScanning={scanState === "loading"}
          onRefresh={() => void loadOptions()}
          onResourceTypeToggle={toggleResourceType}
          onScanStart={() => void runScan()}
          onSelectedAwsConnectionChange={setSelectedAwsConnectionId}
          onSelectedProjectChange={setSelectedProjectId}
          projects={projects}
          resourceTypes={REVERSE_ENGINEERING_RESOURCE_TYPES}
          selectedAwsConnectionId={selectedAwsConnectionId}
          selectedProjectId={selectedProjectId}
          selectedResourceTypes={selectedResourceTypes}
        />
        {errorMessage ? <p className={styles.deploymentError}>{errorMessage}</p> : null}

        {scanResponse?.result && comparison ? (
          <ReverseEngineeringResultPanel
            applyMessage={applyMessage}
            applyState={applyState}
            comparison={comparison}
            hasCurrentBoardResources={context.nodes.length > 0}
            logs={logs}
            onAppendToCurrentBoard={() => void applyScanResult("append")}
            onOpenAsNewBoard={() => void applyScanResult("replace")}
            response={scanResponse}
          />
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

// 알 수 없는 오류도 화면에 보여줄 수 있는 문장으로 바꿉니다.
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}
