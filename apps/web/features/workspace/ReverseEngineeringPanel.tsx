"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BoardAutoOrganizeCandidateSet,
  DiagramJson,
  ReverseEngineeringResourceSelection,
  ReverseEngineeringScan,
  ReverseEngineeringScanLogLine,
  ReverseEngineeringScanResult,
  ReverseEngineeringScanResponse,
  Project
} from "../../../../packages/types/src";
import { createBoardAutoOrganizeCandidates } from "../architecture-board-compiler";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import { useAuth } from "../../components/auth/auth-provider";
import { invalidateProjectQueries } from "../../components/query/dashboard-query-invalidation";
import {
  cancelReverseEngineeringScan,
  createArchitectureSnapshot,
  createProject,
  createReverseEngineeringPreviewScan,
  createReverseEngineeringScan,
  deleteReverseEngineeringScan,
  getReverseEngineeringScan,
  listReverseEngineeringScanLogs,
  saveProjectDraft
} from "./api";
import {
  convertReverseEngineeringBoardToArchitectureJson,
  createReverseEngineeringBoardApplication,
  type ReverseEngineeringBoardApplicationMode,
  type ReverseEngineeringPlacement
} from "./reverse-engineering-board-application";
import {
  createReverseEngineeringBoardCandidates,
  createReverseEngineeringCandidateResult,
  type ReverseEngineeringBoardCandidate
} from "./reverse-engineering-board-candidates";
import {
  getNextReverseEngineeringResourceSelections,
  REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION,
  REVERSE_ENGINEERING_RESOURCE_SELECTIONS
} from "./reverse-engineering-resource-types";
import {
  canStartReverseEngineeringScan,
  createReverseEngineeringAwsSettingsHref,
  getReverseEngineeringAwsConnectionRecovery
} from "./reverse-engineering-aws-connection-readiness";
import {
  ReverseEngineeringResultPanel,
  type ReverseEngineeringApplyState
} from "./ReverseEngineeringResultPanel";
import { ReverseEngineeringScanCriteriaForm } from "./ReverseEngineeringScanCriteriaForm";
import { ReverseEngineeringScanHistoryPanel } from "./ReverseEngineeringScanHistoryPanel";
import { useReverseEngineeringOptions } from "./useReverseEngineeringOptions";
import { useReverseEngineeringScanHistory } from "./useReverseEngineeringScanHistory";
import styles from "./reverse-engineering.module.css";

export type ReverseEngineeringPanelProps = {
  readonly context: DiagramEditorPanelContext;
  readonly createProjectOnApply?: boolean | undefined;
  readonly onCandidatePanelChange?:
    | ((state: ReverseEngineeringCandidatePanelState) => void)
    | undefined;
  readonly projectId: string;
  readonly projectName: string;
};

export type ReverseEngineeringCandidatePanelState = {
  readonly candidates: readonly ReverseEngineeringBoardCandidate[];
  readonly hasScanResult: boolean;
  readonly onCandidateSelect: (candidateId: string) => void;
  readonly selectedCandidateId: string | null;
};

type RequestState = "idle" | "loading" | "error";
type ReverseEngineeringOrganizationCandidates = {
  readonly append: BoardAutoOrganizeCandidateSet | null;
  readonly replace: BoardAutoOrganizeCandidateSet;
};
const SCAN_POLL_INTERVAL_MS = 1000;
const SCAN_POLL_ATTEMPT_COUNT = 30;

// 기존 AWS 읽어오기 화면의 상태와 버튼 흐름을 관리합니다.
export function ReverseEngineeringPanel({
  context,
  createProjectOnApply = false,
  onCandidatePanelChange,
  projectId,
  projectName
}: ReverseEngineeringPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [selectedResourceTypes, setSelectedResourceTypes] = useState<
    ReverseEngineeringResourceSelection[]
  >([REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION]);
  const [scanState, setScanState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanResponse, setScanResponse] = useState<ReverseEngineeringScanResponse | null>(null);
  const [logs, setLogs] = useState<ReverseEngineeringScanLogLine[]>([]);
  const [applyState, setApplyState] = useState<ReverseEngineeringApplyState>("idle");
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [previewBaseDiagram, setPreviewBaseDiagram] = useState<DiagramJson | null>(null);
  const [placement, setPlacement] = useState<ReverseEngineeringPlacement>("original");
  const [organizationCandidates, setOrganizationCandidates] =
    useState<ReverseEngineeringOrganizationCandidates | null>(null);
  const [selectedOrganizationCandidateId, setSelectedOrganizationCandidateId] =
    useState<string | null>(null);
  const handleRequestError = useCallback((error: unknown) => {
    setErrorMessage(toErrorMessage(error));
  }, []);
  const {
    loadOptions,
    loadState,
    awsConnections,
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
    enabled: !createProjectOnApply,
    onError: handleRequestError,
    scanResponse,
    selectedProjectId
  });

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const awsConnectionRecovery = useMemo(
    () =>
      getReverseEngineeringAwsConnectionRecovery({
        connections: awsConnections,
        selectedConnectionId: selectedAwsConnectionId
      }),
    [awsConnections, selectedAwsConnectionId]
  );
  const resolvedSelectedAwsConnectionId = awsConnectionRecovery.selectedConnectionId ?? "";
  const selectedAwsConnection = verifiedAwsConnections.find(
    (connection) => connection.id === resolvedSelectedAwsConnectionId
  );
  const canStartScan = canStartReverseEngineeringScan({
    createProjectOnApply,
    hasSelectedVerifiedConnection: Boolean(selectedAwsConnection),
    hasSelectedProject: Boolean(selectedProject),
    loadState,
    recovery: awsConnectionRecovery,
    scanState,
    selectedResourceTypeCount: selectedResourceTypes.length
  });
  const boardCandidates = useMemo(() => {
    if (!scanResponse?.result) {
      return [];
    }

    return createReverseEngineeringBoardCandidates(scanResponse.result);
  }, [scanResponse]);
  const selectedCandidate =
    boardCandidates.find((candidate) => candidate.id === selectedCandidateId) ??
    boardCandidates[0] ??
    null;
  const selectedCandidateResult = useMemo(() => {
    if (!scanResponse?.result || !selectedCandidate) {
      return null;
    }

    return createReverseEngineeringCandidateResult(scanResponse.result, selectedCandidate);
  }, [scanResponse, selectedCandidate]);
  const selectedCandidateResponse =
    scanResponse && selectedCandidateResult
      ? {
          ...scanResponse,
          result: selectedCandidateResult
        }
      : null;
  // 후보 미리보기를 띄워도 원래 보드 기준이 흔들리지 않게 별도로 보관합니다.
  const previewSourceDiagram = previewBaseDiagram ?? context.diagram;
  const originalCandidateApplication = useMemo(() => {
    if (!selectedCandidateResult) {
      return null;
    }

    return createReverseEngineeringBoardApplication({
      currentDiagram: previewSourceDiagram,
      mode: "replace",
      placement: "original",
      result: selectedCandidateResult
    });
  }, [previewSourceDiagram, selectedCandidateResult]);
  const originalCandidateAppendApplication = useMemo(() => {
    if (!selectedCandidateResult || previewSourceDiagram.nodes.length === 0) {
      return null;
    }

    return createReverseEngineeringBoardApplication({
      currentDiagram: previewSourceDiagram,
      mode: "append",
      placement: "original",
      result: selectedCandidateResult
    });
  }, [previewSourceDiagram, selectedCandidateResult]);
  const selectedOrganizationCandidateIndex =
    organizationCandidates?.replace.candidates.findIndex(
      (candidate) => candidate.id === selectedOrganizationCandidateId
    ) ?? -1;
  const selectedOrganizationCandidate =
    selectedOrganizationCandidateIndex >= 0
      ? (organizationCandidates?.replace.candidates[selectedOrganizationCandidateIndex] ?? null)
      : null;
  const selectedAppendOrganizationCandidate =
    selectedOrganizationCandidateIndex >= 0
      ? (organizationCandidates?.append?.candidates[selectedOrganizationCandidateIndex] ?? null)
      : null;
  const selectedCandidateApplication = useMemo(() => {
    if (!selectedCandidateResult || !originalCandidateApplication) {
      return null;
    }

    if (placement === "original") {
      return originalCandidateApplication;
    }

    if (!selectedOrganizationCandidate) {
      return null;
    }

    return createReverseEngineeringBoardApplication({
      currentDiagram: previewSourceDiagram,
      mode: "replace",
      organizedDiagram: selectedOrganizationCandidate.diagram,
      placement: "compiled",
      result: selectedCandidateResult
    });
  }, [
    originalCandidateApplication,
    placement,
    previewSourceDiagram,
    selectedCandidateResult,
    selectedOrganizationCandidate
  ]);
  const selectedCandidateAppendApplication = useMemo(() => {
    if (!selectedCandidateResult || !originalCandidateAppendApplication) {
      return null;
    }

    if (placement === "original") {
      return originalCandidateAppendApplication;
    }

    if (!selectedAppendOrganizationCandidate) {
      return null;
    }

    return createReverseEngineeringBoardApplication({
      currentDiagram: previewSourceDiagram,
      mode: "append",
      organizedDiagram: selectedAppendOrganizationCandidate.diagram,
      placement: "compiled",
      result: selectedCandidateResult
    });
  }, [
    originalCandidateAppendApplication,
    placement,
    previewSourceDiagram,
    selectedAppendOrganizationCandidate,
    selectedCandidateResult
  ]);
  const comparison = selectedCandidateApplication?.comparison ?? null;
  const hasDeletedSourceScan = useMemo(
    () => hasDeletedReverseEngineeringSourceScan(context.diagram, scanHistory, scanHistoryState),
    [context.diagram, scanHistory, scanHistoryState]
  );
  const selectBoardCandidate = useCallback(
    (candidateId: string): void => {
      const result = scanResponse?.result;
      const candidate = boardCandidates.find((item) => item.id === candidateId);

      if (!result || !candidate) {
        return;
      }

      const candidateResult = createReverseEngineeringCandidateResult(result, candidate);
      const application = createReverseEngineeringBoardApplication({
        currentDiagram: previewSourceDiagram,
        mode: "replace",
        placement: "original",
        result: candidateResult
      });

      setPlacement("original");
      setOrganizationCandidates(null);
      setSelectedOrganizationCandidateId(null);
      setSelectedCandidateId(candidateId);
      context.setPreviewDiagram(application.previewDiagram);
    },
    [boardCandidates, context, previewSourceDiagram, scanResponse?.result]
  );

  useEffect(() => {
    onCandidatePanelChange?.({
      candidates: boardCandidates,
      hasScanResult: Boolean(scanResponse?.result),
      onCandidateSelect: selectBoardCandidate,
      selectedCandidateId: selectedCandidate?.id ?? null
    });
  }, [
    boardCandidates,
    onCandidatePanelChange,
    scanResponse?.result,
    selectBoardCandidate,
    selectedCandidate?.id
  ]);

  // 사용자가 가져올 AWS 리소스 종류를 켜고 끕니다.
  function toggleResourceType(resourceType: ReverseEngineeringResourceSelection): void {
    setSelectedResourceTypes((currentResourceTypes) =>
      getNextReverseEngineeringResourceSelections(currentResourceTypes, resourceType)
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
    setPlacement("original");
    setOrganizationCandidates(null);
    setSelectedOrganizationCandidateId(null);
    setSelectedCandidateId(null);
    setScanResponse(null);
    setLogs([]);
    const baseDiagram = previewBaseDiagram ?? context.diagram;
    setPreviewBaseDiagram(baseDiagram);
    context.setPreviewDiagram(null);

    try {
      const response = createProjectOnApply
        ? await runPreviewScan({
            awsConnectionId: selectedAwsConnection.id,
            region: selectedAwsConnection.region,
            resourceTypes: selectedResourceTypes
          })
        : await runSavedScan({
            awsConnectionId: selectedAwsConnection.id,
            projectId: selectedProjectId,
            region: selectedAwsConnection.region,
            resourceTypes: selectedResourceTypes
          });

      setScanResponse(response.response);
      setLogs(response.logs);
      if (!createProjectOnApply) {
        rememberCompletedScan(response.response.scan);
      }
      if (response.response.result) {
        showFirstCandidatePreview(response.response.result, baseDiagram);
      }
      setScanState("idle");
    } catch {
      setScanState("error");
      setErrorMessage("AWS에서 항목을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  // 사용자가 실행 중인 scan을 멈추고 싶을 때 서버에 안전한 취소 요청만 보냅니다.
  async function cancelActiveScan(scanId = activeScanId): Promise<void> {
    if (!scanId || !selectedProjectId) {
      return;
    }

    try {
      const scan = await cancelReverseEngineeringScan({
        projectId: selectedProjectId,
        scanId
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
        setSelectedCandidateId(null);
        setPlacement("original");
        setOrganizationCandidates(null);
        setSelectedOrganizationCandidateId(null);
        setPreviewBaseDiagram(null);
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
    setPlacement("original");
    setOrganizationCandidates(null);
    setSelectedOrganizationCandidateId(null);
    const baseDiagram = previewBaseDiagram ?? context.diagram;
    setPreviewBaseDiagram(baseDiagram);

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
        showFirstCandidatePreview(response.result, baseDiagram);
      } else {
        setSelectedCandidateId(null);
        setPreviewBaseDiagram(null);
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
    const result = selectedCandidateResult;

    if (!result || applyState === "saving") {
      return;
    }

    if (result.architectureJson.nodes.length === 0) {
      setApplyState("error");
      setApplyMessage("보드에 표시할 항목이 없어요. 다시 스캔해 주세요.");
      return;
    }

    const application =
      mode === "replace" ? selectedCandidateApplication : selectedCandidateAppendApplication;

    if (!application) {
      return;
    }
    const diagramToApply = createProjectOnApply
      ? application.diagram
      : attachReverseEngineeringSourceToDiagram(
          application.diagram,
          result.scan.id,
          result.reverseEngineeringDraft.id
        );

    setApplyState("saving");
    setApplyMessage(null);

    try {
      const targetProject = createProjectOnApply
        ? await createProject({ name: projectName })
        : null;
      const targetProjectId = targetProject?.id ?? projectId;

      if (createProjectOnApply && targetProject) {
        await invalidateProjectQueries(queryClient, user?.id);
        const response = await saveProjectDraft({
          projectId: targetProject.id,
          diagramJson: diagramToApply,
          expectedRevision: null
        });

        if (!response.draft) {
          throw new Error("프로젝트 Board 저장 결과가 비어 있습니다.");
        }

        context.applyDiagramJson(diagramToApply);
      } else {
        if (!context.persistAndApplyDiagramJson) {
          throw new Error("Board 서버 저장이 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
        }

        await context.persistAndApplyDiagramJson(diagramToApply);
      }
      setPreviewBaseDiagram(diagramToApply);

      await createArchitectureSnapshot({
        projectId: targetProjectId,
        source: "imported",
        ...(createProjectOnApply
          ? {}
          : {
              reverseEngineering: {
                sourceScanId: result.scan.id,
                draftId: result.reverseEngineeringDraft.id
              }
            }),
        architectureJson: convertReverseEngineeringBoardToArchitectureJson(diagramToApply, result)
      });
      setApplyState("saved");
      if (createProjectOnApply && targetProject) {
        router.push(createWorkspaceProjectUrl(targetProject, "reverse"));
        setApplyMessage("프로젝트를 만들고 선택한 후보를 보드에 저장했습니다.");
        return;
      }

      setApplyMessage("보드에 반영했고, imported Architecture Snapshot도 저장했습니다.");
    } catch (error) {
      setApplyState("error");
      setApplyMessage(toErrorMessage(error));
    }
  }

  // gg: 사용자가 눌렀을 때만 shared visual-only 후보를 만들고 첫 정리안을 미리봅니다.
  function previewAutomaticOrganization(): void {
    if (!originalCandidateApplication) {
      return;
    }

    const replace = createBoardAutoOrganizeCandidates(originalCandidateApplication.diagram);
    const firstCandidate = replace.candidates[0];

    if (!firstCandidate) {
      setApplyState("error");
      setApplyMessage("현재 원본에서 적용할 수 있는 정리안을 만들지 못했어요.");
      return;
    }

    const append = originalCandidateAppendApplication
      ? createBoardAutoOrganizeCandidates(originalCandidateAppendApplication.diagram)
      : null;

    setApplyState("idle");
    setApplyMessage(null);
    setOrganizationCandidates({ append, replace });
    setSelectedOrganizationCandidateId(firstCandidate.id);
    setPlacement("compiled");
    context.setPreviewDiagram(firstCandidate.diagram);
  }

  // gg: 정리안 선택은 저장 없이 현재 미리보기만 같은 visual-only 후보로 바꿉니다.
  function selectOrganizationCandidate(candidateId: string): void {
    const candidate = organizationCandidates?.replace.candidates.find(
      (item) => item.id === candidateId
    );

    if (!candidate) {
      return;
    }

    setSelectedOrganizationCandidateId(candidate.id);
    setPlacement("compiled");
    context.setPreviewDiagram(candidate.diagram);
  }

  // gg: 원본 보기는 만들어 둔 정리안을 버리거나 저장하지 않고 source-exact 미리보기로 돌아갑니다.
  function previewOriginalPlacement(): void {
    if (!originalCandidateApplication) {
      return;
    }

    setPlacement("original");
    context.setPreviewDiagram(originalCandidateApplication.previewDiagram);
  }

  // 스캔 직후에는 가장 앞의 후보를 기본 미리보기로 보여줍니다.
  function showFirstCandidatePreview(
    result: ReverseEngineeringScanResult,
    baseDiagram: DiagramJson
  ): void {
    const nextCandidates = createReverseEngineeringBoardCandidates(result);
    const nextCandidate = nextCandidates[0];

    if (!nextCandidate) {
      setSelectedCandidateId(null);
      setPreviewBaseDiagram(null);
      context.setPreviewDiagram(null);
      return;
    }

    const candidateResult = createReverseEngineeringCandidateResult(result, nextCandidate);
    const application = createReverseEngineeringBoardApplication({
      currentDiagram: baseDiagram,
      mode: "replace",
      placement: "original",
      result: candidateResult
    });

    setPlacement("original");
    setOrganizationCandidates(null);
    setSelectedOrganizationCandidateId(null);
    setSelectedCandidateId(nextCandidate.id);
    context.setPreviewDiagram(application.previewDiagram);
  }

  return (
    <section className={styles.panel} aria-label="Reverse Engineering">
      <div className={styles.panelContent}>
        <ReverseEngineeringScanCriteriaForm
          awsConnectionRecovery={awsConnectionRecovery}
          awsConnections={awsConnections}
          canStartScan={canStartScan}
          createProjectOnApply={createProjectOnApply}
          isLoadingOptions={loadState === "loading"}
          isScanning={scanState === "loading"}
          onRefresh={() => void loadOptions()}
          onResourceTypeToggle={toggleResourceType}
          onScanCancel={() => void cancelActiveScan()}
          onScanStart={() => void runScan()}
          onSelectedAwsConnectionChange={setSelectedAwsConnectionId}
          onSelectedProjectChange={setSelectedProjectId}
          projects={projects}
          resourceTypes={REVERSE_ENGINEERING_RESOURCE_SELECTIONS}
          selectedAwsConnectionId={resolvedSelectedAwsConnectionId}
          selectedProjectId={selectedProjectId}
          selectedResourceTypes={selectedResourceTypes}
        />
        {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
        {hasDeletedSourceScan ? (
          <p className={styles.warning}>
            이 보드는 Reverse Engineering scan에서 시작됐습니다. 하지만 원본 scan 기록은
            삭제됐습니다.
          </p>
        ) : null}

        {createProjectOnApply ? null : (
          <ReverseEngineeringScanHistoryPanel
            activeScanId={activeScanId}
            canRescan={canStartScan}
            isLoading={scanHistoryState === "loading" || scanState === "loading"}
            isStaleResult={isStaleScanResult}
            onCancelScan={(scanId) => void cancelActiveScan(scanId)}
            onDeleteScan={(scanId) => void deleteSavedScan(scanId)}
            onOpenScan={(scanId) => void openHistoricalScan(scanId)}
            onRescan={() => void runScan()}
            scans={scanHistory}
          />
        )}

        {selectedCandidateResponse?.result &&
        comparison &&
        selectedCandidate &&
        selectedCandidateApplication ? (
          <ReverseEngineeringResultPanel
            applyMessage={applyMessage}
            applyState={applyState}
            boardCandidates={boardCandidates}
            comparison={comparison}
            createProjectOnApply={createProjectOnApply}
            hasCurrentBoardResources={previewSourceDiagram.nodes.length > 0}
            logs={logs}
            onAppendToCurrentBoard={() => void applyScanResult("append")}
            onCompilePlacement={previewAutomaticOrganization}
            onKeepOriginalPlacement={previewOriginalPlacement}
            onOpenAsNewBoard={() => void applyScanResult("replace")}
            onRetryScan={() => void runScan()}
            onSelectOrganizationCandidate={selectOrganizationCandidate}
            organizationCandidates={organizationCandidates?.replace.candidates ?? []}
            permissionRecoveryHref={createReverseEngineeringAwsSettingsHref(
              selectedCandidateResponse.scan.awsConnectionId
            )}
            response={selectedCandidateResponse}
            selectedCandidateId={selectedCandidate.id}
            selectedOrganizationCandidateId={selectedOrganizationCandidateId}
            placement={placement}
          />
        ) : (
          <section className={styles.section}>
            <h3>결과</h3>
            <p className={styles.sectionDescription}>
              스캔이 끝나면 Resource 개수와 적용 구조를 확인할 수 있습니다.
            </p>
          </section>
        )}
      </div>
    </section>
  );
}

type ReverseEngineeringRunInput = {
  readonly awsConnectionId: string;
  readonly projectId?: string | undefined;
  readonly region: string;
  readonly resourceTypes: ReverseEngineeringResourceSelection[];
};

type ReverseEngineeringRunOutput = {
  readonly logs: ReverseEngineeringScanLogLine[];
  readonly response: ReverseEngineeringScanResponse;
};

// 새 프로젝트 시작에서는 프로젝트를 만들기 전에 AWS만 읽어서 미리보기 결과를 받습니다.
async function runPreviewScan({
  awsConnectionId,
  region,
  resourceTypes
}: ReverseEngineeringRunInput): Promise<ReverseEngineeringRunOutput> {
  const response = await createReverseEngineeringPreviewScan({
    awsConnectionId,
    region,
    resourceTypes
  });

  return {
    logs: [],
    response
  };
}

// 이미 있는 프로젝트에서는 scan 기록과 log를 서버에 남기는 기존 흐름을 사용합니다.
async function runSavedScan({
  awsConnectionId,
  projectId,
  region,
  resourceTypes
}: ReverseEngineeringRunInput): Promise<ReverseEngineeringRunOutput> {
  if (!projectId) {
    throw new Error("프로젝트를 찾지 못했습니다.");
  }

  const startedResponse = await createReverseEngineeringScan({
    projectId,
    awsConnectionId,
    region,
    resourceTypes
  });
  const response =
    startedResponse.result ||
    startedResponse.scan.status === "failed" ||
    startedResponse.scan.status === "cancelled"
      ? startedResponse
      : await pollReverseEngineeringScan(projectId, startedResponse.scan.id);
  const logs = await listReverseEngineeringScanLogs({
    projectId,
    scanId: response.scan.id
  });

  return {
    logs,
    response
  };
}

// 알 수 없는 오류도 화면에 보여줄 수 있는 문장으로 바꿉니다.
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

// scan 시작 API는 scanId만 먼저 주기 때문에, 완료 결과가 생길 때까지 상태 조회를 반복합니다.
async function pollReverseEngineeringScan(
  projectId: string,
  scanId: string
): Promise<ReverseEngineeringScanResponse> {
  for (let attempt = 0; attempt < SCAN_POLL_ATTEMPT_COUNT; attempt += 1) {
    const response = await getReverseEngineeringScan({ projectId, scanId });

    if (
      response.result ||
      response.scan.status === "failed" ||
      response.scan.status === "cancelled"
    ) {
      return response;
    }

    await delay(SCAN_POLL_INTERVAL_MS);
  }

  throw new Error("스캔 결과를 아직 받지 못했습니다. 잠시 후 스캔 기록에서 다시 열어주세요.");
}

// scan polling 사이에 잠깐 기다려서 서버에 과하게 요청하지 않게 합니다.
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

// 프로젝트 생성 뒤에는 실제 프로젝트 id가 들어간 workspace 주소로 이동합니다.
function createWorkspaceProjectUrl(project: Project, startMode: "reverse"): string {
  const params = new URLSearchParams({
    projectId: project.id,
    projectName: project.name,
    startMode
  });

  return `/workspace?${params.toString()}`;
}

// 사용자가 적용한 보드에도 Reverse Engineering 출처를 남겨 삭제 안내와 추적이 가능하게 합니다.
function attachReverseEngineeringSourceToDiagram(
  diagram: DiagramJson,
  sourceScanId: string,
  draftId: string
): DiagramJson {
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => {
      if (!node.parameters) {
        return node;
      }

      return {
        ...node,
        parameters: {
          ...node.parameters,
          values: {
            ...node.parameters.values,
            reverseEngineeringSourceScanId: sourceScanId,
            reverseEngineeringDraftId: draftId
          }
        }
      };
    })
  };
}

// 보드에는 출처 scan id가 남아 있는데 scan 기록 목록에는 없으면 삭제된 원본으로 봅니다.
function hasDeletedReverseEngineeringSourceScan(
  diagram: DiagramJson,
  scanHistory: ReverseEngineeringScan[],
  scanHistoryState: RequestState
): boolean {
  if (scanHistoryState !== "idle") {
    return false;
  }

  const sourceScanIds = getReverseEngineeringSourceScanIds(diagram);

  if (sourceScanIds.length === 0) {
    return false;
  }

  const existingScanIds = new Set(scanHistory.map((scan) => scan.id));

  return sourceScanIds.some((sourceScanId) => !existingScanIds.has(sourceScanId));
}

// Architecture Snapshot에 남겨둔 Reverse Engineering 출처 scan id만 모읍니다.
function getReverseEngineeringSourceScanIds(diagram: DiagramJson): string[] {
  return [
    ...new Set(
      diagram.nodes.flatMap((node) => {
        const value = node.parameters?.values["reverseEngineeringSourceScanId"];

        return typeof value === "string" && value.length > 0 ? [value] : [];
      })
    )
  ];
}
