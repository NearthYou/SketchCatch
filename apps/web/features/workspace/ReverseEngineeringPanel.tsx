"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  ResourceType,
  ReverseEngineeringScanLogLine,
  ReverseEngineeringScanResponse
} from "../../../../packages/types/src";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
  cancelReverseEngineeringScan,
  createArchitectureSnapshot,
  createReverseEngineeringScan,
  deleteReverseEngineeringScan,
  getReverseEngineeringScan,
  listReverseEngineeringScanLogs
} from "./api";
import {
  createReverseEngineeringBoardApplication,
  createReverseEngineeringBoardComparison,
  type ReverseEngineeringBoardApplicationMode
} from "./reverse-engineering-board-application";
import { REVERSE_ENGINEERING_RESOURCE_TYPES } from "./reverse-engineering-resource-types";
import {
  ReverseEngineeringResultPanel,
  type ReverseEngineeringApplyState
} from "./ReverseEngineeringResultPanel";
import { ReverseEngineeringScanCriteriaForm } from "./ReverseEngineeringScanCriteriaForm";
import { ReverseEngineeringScanHistoryPanel } from "./ReverseEngineeringScanHistoryPanel";
import { useReverseEngineeringOptions } from "./useReverseEngineeringOptions";
import { useReverseEngineeringScanHistory } from "./useReverseEngineeringScanHistory";
import { convertDiagramJsonToArchitectureJson } from "./workspace-ai-diagram-adapter";
import styles from "./workspace.module.css";

export type ReverseEngineeringPanelProps = { readonly context: DiagramEditorPanelContext; readonly projectId: string };

type RequestState = "idle" | "loading" | "error";

// 기존 AWS 읽어오기 화면의 상태와 버튼 흐름을 관리합니다.
export function ReverseEngineeringPanel({ context, projectId }: ReverseEngineeringPanelProps) {
  const [selectedResourceTypes, setSelectedResourceTypes] = useState<ResourceType[]>(
    REVERSE_ENGINEERING_RESOURCE_TYPES
  );
  const [scanState, setScanState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanResponse, setScanResponse] = useState<ReverseEngineeringScanResponse | null>(null);
  const [logs, setLogs] = useState<ReverseEngineeringScanLogLine[]>([]);
  const [applyState, setApplyState] = useState<ReverseEngineeringApplyState>("idle");
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const handleRequestError = useCallback((error: unknown) => {
    setErrorMessage(toErrorMessage(error));
  }, []);
  const {
    loadOptions,
    loadState,
    projects,
    selectedAwsConnectionId,
    selectedProjectId,
    setSelectedAwsConnectionId,
    setSelectedProjectId,
    verifiedAwsConnections
  } = useReverseEngineeringOptions({
    initialProjectId: projectId,
    onError: handleRequestError
  });
  const {
    activeScanId,
    forgetScan,
    isStaleScanResult,
    rememberCompletedScan,
    scanHistory,
    scanHistoryState,
    setActiveScanId
  } = useReverseEngineeringScanHistory({
    onError: handleRequestError,
    scanResponse,
    selectedProjectId
  });

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
      rememberCompletedScan(response.scan);
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

  // 사용자가 실행 중인 scan을 멈추고 싶을 때 서버에 안전한 취소 요청만 보냅니다.
  async function cancelActiveScan(): Promise<void> {
    if (!activeScanId || !selectedProjectId) {
      return;
    }

    try {
      const scan = await cancelReverseEngineeringScan({
        projectId: selectedProjectId,
        scanId: activeScanId
      });

      rememberCompletedScan(scan);
      setApplyMessage("취소 요청을 보냈습니다. 현재 단계가 끝나면 scan이 중단됩니다.");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  // scan 원본 기록만 삭제하고, 이미 적용된 보드 상태는 그대로 둡니다.
  async function deleteSavedScan(scanId: string): Promise<void> {
    try {
      await deleteReverseEngineeringScan({
        projectId: selectedProjectId,
        scanId
      });

      forgetScan(scanId);
      if (scanResponse?.scan.id === scanId) {
        setScanResponse(null);
        setLogs([]);
        context.setPreviewDiagram(null);
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  // 저장된 스캔 기록을 다시 열고, 보드에는 실제 적용이 아닌 미리보기만 띄웁니다.
  async function openHistoricalScan(scanId: string): Promise<void> {
    setScanState("loading");
    setErrorMessage(null);
    setApplyMessage(null);
    setApplyState("idle");

    try {
      const response = await getReverseEngineeringScan({
        projectId: selectedProjectId,
        scanId
      });
      const nextLogs = await listReverseEngineeringScanLogs({
        projectId: selectedProjectId,
        scanId
      });

      setScanResponse(response);
      setActiveScanId(response.scan.id);
      setLogs(nextLogs);
      if (response.result) {
        const application = createReverseEngineeringBoardApplication({
          currentDiagram: context.diagram,
          mode: "replace",
          result: response.result
        });

        context.setPreviewDiagram(application.previewDiagram);
      } else {
        context.setPreviewDiagram(null);
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
          onScanCancel={() => void cancelActiveScan()}
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

        <ReverseEngineeringScanHistoryPanel
          activeScanId={activeScanId}
          canRescan={canStartScan}
          isLoading={scanHistoryState === "loading" || scanState === "loading"}
          isStaleResult={isStaleScanResult}
          onDeleteScan={(scanId) => void deleteSavedScan(scanId)}
          onOpenScan={(scanId) => void openHistoricalScan(scanId)}
          onRescan={() => void runScan()}
          scans={scanHistory}
        />

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
