"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type {
  DiagramJson,
  Project,
  ReverseEngineeringImportDecisionRequest,
  ReverseEngineeringResourceSelection,
  ReverseEngineeringScan,
  ReverseEngineeringScanLogLine,
  ReverseEngineeringScanResult,
  ReverseEngineeringScanResponse
} from "../../../../packages/types/src";
import { useAuth } from "../../components/auth/auth-provider";
import { invalidateProjectQueries } from "../../components/query/dashboard-query-invalidation";
import { createBoardAutoOrganizeCandidates } from "../architecture-board-compiler";
import type { DiagramEditorPanelContext } from "../diagram-editor";
import {
  cancelReverseEngineeringScan,
  createArchitectureSnapshot,
  createReverseEngineeringProject,
  createReverseEngineeringPreviewScan,
  createReverseEngineeringScan,
  deleteReverseEngineeringScan,
  getReverseEngineeringScan,
  listReverseEngineeringScanLogs
} from "./api";
import {
  applyExistingReverseEngineeringPreview,
  attachReverseEngineeringSourceToDiagram,
  createReverseEngineeringApplyPreview,
  getSavedReverseEngineeringSourceScanIds,
  type ReverseEngineeringApplyPreview
} from "./reverse-engineering-apply-flow";
import {
  convertReverseEngineeringBoardToArchitectureJson,
  createReverseEngineeringBoardApplication,
  type ReverseEngineeringBoardApplicationMode,
  type ReverseEngineeringPlacement
} from "./reverse-engineering-board-application";
import {
  createReverseEngineeringBoardCandidates,
  createReverseEngineeringCandidateResult
} from "./reverse-engineering-board-candidates";
import {
  canStartReverseEngineeringScan,
  createReverseEngineeringAwsSettingsHref,
  getReverseEngineeringAwsConnectionRecovery
} from "./reverse-engineering-aws-connection-readiness";
import {
  getNextReverseEngineeringResourceSelections,
  REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION
} from "./reverse-engineering-resource-types";
import {
  getReverseEngineeringStartFailure,
  type ReverseEngineeringStartFailure
} from "./reverse-engineering-scan-start-failure";
import { useReverseEngineeringOptions } from "./useReverseEngineeringOptions";
import { useReverseEngineeringScanHistory } from "./useReverseEngineeringScanHistory";

type RequestState = "idle" | "loading" | "error";
type ReverseEngineeringOrganizedDiagrams = {
  readonly append: DiagramJson | null;
  readonly replace: DiagramJson;
};

type ReverseEngineeringApplyState = "idle" | "saving" | "saved" | "partial" | "error";

type UseReverseEngineeringWorkflowInput = {
  readonly context: DiagramEditorPanelContext;
  readonly createProjectOnApply?: boolean | undefined;
  readonly projectId: string;
  readonly projectName: string;
};

type ReverseEngineeringRunInput = {
  readonly awsConnectionId: string;
  readonly onScanStarted?: ((scan: ReverseEngineeringScan) => void) | undefined;
  readonly projectId?: string | undefined;
  readonly region: string;
  readonly resourceTypes: ReverseEngineeringResourceSelection[];
};

type ReverseEngineeringRunOutput = {
  readonly logs: ReverseEngineeringScanLogLine[];
  readonly previewId: string | null;
  readonly response: ReverseEngineeringScanResponse;
};

const SCAN_POLL_INTERVAL_MS = 1000;
const SCAN_POLL_ATTEMPT_COUNT = 30;

// 화면 선택과 별개로 보드 적용은 관찰 전용 import 결정만 보냅니다.
function createObserveOnlyReverseEngineeringImportDecision(): ReverseEngineeringImportDecisionRequest {
  return {
    version: 1,
    selectedReadyResourceIds: [],
    acknowledgedReviewOnlyResourceIds: []
  };
}

// Reverse Engineering의 스캔·미리보기·저장 워크플로를 UI와 분리합니다.
export function useReverseEngineeringWorkflow({
  context,
  createProjectOnApply = false,
  projectId,
  projectName
}: UseReverseEngineeringWorkflowInput) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [selectedResourceTypes, setSelectedResourceTypes] = useState<
    ReverseEngineeringResourceSelection[]
  >([REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION]);
  const [scanState, setScanState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanFailure, setScanFailure] = useState<ReverseEngineeringStartFailure | null>(null);
  const [scanResponse, setScanResponse] = useState<ReverseEngineeringScanResponse | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [logs, setLogs] = useState<ReverseEngineeringScanLogLine[]>([]);
  const [applyState, setApplyState] = useState<ReverseEngineeringApplyState>("idle");
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [previewBase, setPreviewBase] = useState<ReverseEngineeringApplyPreview | null>(null);
  const [placement, setPlacement] = useState<ReverseEngineeringPlacement>("original");
  const [applicationMode, setApplicationMode] =
    useState<ReverseEngineeringBoardApplicationMode>("replace");
  const [organizedDiagrams, setOrganizedDiagrams] =
    useState<ReverseEngineeringOrganizedDiagrams | null>(null);

  // 옵션과 기록 요청의 안전한 오류 문장을 공통 상태로 모읍니다.
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
    verifiedAwsConnections
  } = useReverseEngineeringOptions({
    initialProjectId: projectId,
    onError: handleRequestError
  });
  const targetProjectId = createProjectOnApply ? selectedProjectId : projectId;
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
    selectedProjectId: targetProjectId
  });
  const selectedProject = projects.find((project) => project.id === targetProjectId);
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
  const boardCandidates = useMemo(
    () =>
      scanResponse?.result ? createReverseEngineeringBoardCandidates(scanResponse.result) : [],
    [scanResponse]
  );
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
      ? { ...scanResponse, result: selectedCandidateResult }
      : null;
  const previewSourceDiagram = previewBase?.sourceDiagram ?? context.diagram;
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
  const activeOrganizedDiagram =
    applicationMode === "append"
      ? (organizedDiagrams?.append ?? null)
      : (organizedDiagrams?.replace ?? null);
  const originalApplication =
    applicationMode === "append"
      ? originalCandidateAppendApplication
      : originalCandidateApplication;
  const selectedCandidateApplication = useMemo(() => {
    if (!selectedCandidateResult || !originalApplication) {
      return null;
    }

    if (placement === "original") {
      return originalApplication;
    }

    if (!activeOrganizedDiagram) {
      return null;
    }

    return createReverseEngineeringBoardApplication({
      currentDiagram: previewSourceDiagram,
      mode: applicationMode,
      organizedDiagram: activeOrganizedDiagram,
      placement: "compiled",
      result: selectedCandidateResult
    });
  }, [
    activeOrganizedDiagram,
    applicationMode,
    originalApplication,
    placement,
    previewSourceDiagram,
    selectedCandidateResult
  ]);
  const hasDeletedSourceScan = useMemo(
    () => hasDeletedReverseEngineeringSourceScan(context.diagram, scanHistory, scanHistoryState),
    [context.diagram, scanHistory, scanHistoryState]
  );

  // Resource 선택은 API reader family로 정규화합니다.
  function toggleResourceType(resourceType: ReverseEngineeringResourceSelection): void {
    setSelectedResourceTypes((currentResourceTypes) =>
      getNextReverseEngineeringResourceSelections(currentResourceTypes, resourceType)
    );
  }

  // 새 결과는 원본 배치의 첫 구조 후보를 미리보기로 설정합니다.
  const showFirstCandidatePreview = useCallback(
    (result: ReverseEngineeringScanResult, baseDiagram: DiagramJson): void => {
      const nextCandidate = createReverseEngineeringBoardCandidates(result)[0];

      if (!nextCandidate) {
        setSelectedCandidateId(null);
        setPreviewBase(null);
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
      setApplicationMode("replace");
      setOrganizedDiagrams(null);
      setSelectedCandidateId(nextCandidate.id);
      context.setPreviewDiagram(application.previewDiagram);
    },
    [context]
  );

  // 선택한 AWS 연결과 Resource 범위로 scan을 시작하고 결과만 미리봅니다.
  const runScan = useCallback(async (): Promise<void> => {
    if (!canStartScan || !selectedAwsConnection) {
      return;
    }

    setScanState("loading");
    setErrorMessage(null);
    setScanFailure(null);
    setApplyMessage(null);
    setApplyState("idle");
    setPlacement("original");
    setApplicationMode("replace");
    setOrganizedDiagrams(null);
    setSelectedCandidateId(null);
    setScanResponse(null);
    setPreviewId(null);
    setLogs([]);
    if (!createProjectOnApply) {
      setActiveScanId(null);
    }
    const basePreview = createReverseEngineeringApplyPreview({
      diagram: context.diagram,
      draftRevision: createProjectOnApply ? null : context.projectDraftRevision
    });
    setPreviewBase(basePreview);
    context.setPreviewDiagram(createProjectOnApply ? null : basePreview.sourceDiagram);

    try {
      const response = createProjectOnApply
        ? await runPreviewScan({
            awsConnectionId: selectedAwsConnection.id,
            region: selectedAwsConnection.region,
            resourceTypes: selectedResourceTypes
          })
        : await runSavedScan({
            awsConnectionId: selectedAwsConnection.id,
            onScanStarted: (scan) => setActiveScanId(scan.id),
            projectId: targetProjectId,
            region: selectedAwsConnection.region,
            resourceTypes: selectedResourceTypes
          });

      setScanResponse(response.response);
      setPreviewId(response.previewId);
      setLogs(response.logs);
      if (!createProjectOnApply) {
        rememberCompletedScan(response.response.scan);
      }
      if (response.response.result) {
        showFirstCandidatePreview(response.response.result, basePreview.sourceDiagram);
      }
      setScanState("idle");
    } catch (error) {
      setScanState("error");
      setScanFailure(getReverseEngineeringStartFailure(error));
    }
  }, [
    canStartScan,
    context,
    createProjectOnApply,
    rememberCompletedScan,
    selectedAwsConnection,
    selectedResourceTypes,
    showFirstCandidatePreview,
    targetProjectId
  ]);

  // 실행 중인 저장 scan에만 취소를 요청합니다.
  async function cancelActiveScan(scanId = activeScanId): Promise<void> {
    if (!scanId || !targetProjectId) {
      return;
    }

    try {
      const scan = await cancelReverseEngineeringScan({ projectId: targetProjectId, scanId });
      rememberCompletedScan(scan);
      setApplyMessage("취소 요청을 보냈습니다.");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  // 저장된 scan 원본만 지우고 이미 적용된 보드는 유지합니다.
  async function deleteSavedScan(scanId: string): Promise<void> {
    try {
      await deleteReverseEngineeringScan({ projectId: targetProjectId, scanId });
      forgetScan(scanId);
      if (scanResponse?.scan.id === scanId) {
        setScanResponse(null);
        setLogs([]);
        setSelectedCandidateId(null);
        setPlacement("original");
        setApplicationMode("replace");
        setOrganizedDiagrams(null);
        setPreviewBase(null);
        context.setPreviewDiagram(null);
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  // 저장된 scan을 열어 보드에 저장하지 않은 미리보기만 갱신합니다.
  async function openHistoricalScan(scanId: string): Promise<void> {
    setScanState("loading");
    setErrorMessage(null);
    setApplyMessage(null);
    setApplyState("idle");
    setPlacement("original");
    setApplicationMode("replace");
    setOrganizedDiagrams(null);
    const basePreview = createReverseEngineeringApplyPreview({
      diagram: context.diagram,
      draftRevision: createProjectOnApply ? null : context.projectDraftRevision
    });
    setPreviewBase(basePreview);

    try {
      const response = await getReverseEngineeringScan({ projectId: targetProjectId, scanId });
      const nextLogs = await listReverseEngineeringScanLogs({ projectId: targetProjectId, scanId });
      setScanResponse(response);
      setActiveScanId(response.scan.id);
      setLogs(nextLogs);
      if (response.result) {
        showFirstCandidatePreview(response.result, basePreview.sourceDiagram);
      } else {
        setSelectedCandidateId(null);
        setPreviewBase(null);
        context.setPreviewDiagram(null);
      }
      setScanState("idle");
    } catch (error) {
      setScanState("error");
      setErrorMessage(toErrorMessage(error));
    }
  }

  // 현재 선택된 미리보기만 명시적으로 보드에 저장합니다.
  async function applyScanResult(mode: ReverseEngineeringBoardApplicationMode): Promise<void> {
    const result = selectedCandidateResult;

    if (!result || applyState === "saving") {
      return;
    }
    if (result.architectureJson.nodes.length === 0) {
      setApplyState("error");
      setApplyMessage("보드에 표시할 항목이 없습니다.");
      return;
    }
    if (mode !== applicationMode) {
      setApplyState("error");
      setApplyMessage("적용 방식을 먼저 미리보기로 확인해 주세요.");
      return;
    }

    const application = selectedCandidateApplication;
    if (!application) {
      return;
    }
    const importDecision = createObserveOnlyReverseEngineeringImportDecision();
    const diagramToApply = attachReverseEngineeringSourceToDiagram({
      diagram: application.diagram,
      sourceScanId: result.scan.id,
      draftId: result.reverseEngineeringDraft.id,
      sourceNodeIds: application.sourceOwnership.nodeIds,
      sourceKind: createProjectOnApply ? "preview_scan" : "saved_scan"
    });

    setApplyState("saving");
    setApplyMessage(null);

    if (createProjectOnApply) {
      if (!previewId) {
        setApplyState("error");
        setApplyMessage("적용할 AWS 미리보기를 찾지 못했습니다.");
        return;
      }

      let targetProject: Project;
      try {
        const created = await createReverseEngineeringProject({
          name: projectName,
          diagramJson: diagramToApply,
          reverseEngineering: {
            previewId,
            draftId: result.reverseEngineeringDraft.id,
            sourceNodeIds: [...application.sourceOwnership.nodeIds],
            importDecision
          },
          architectureJson: convertReverseEngineeringBoardToArchitectureJson(
            diagramToApply,
            result,
            application.sourceOwnership
          )
        });
        targetProject = created.project;
      } catch (error) {
        setApplyState("error");
        setApplyMessage(toErrorMessage(error));
        return;
      }

      context.applyDiagramJson(diagramToApply);
      setPreviewId(null);
      setPreviewBase(null);
      setApplyState("saved");
      setApplyMessage("프로젝트와 보드를 저장했습니다.");
      void invalidateProjectQueries(queryClient, user?.id).catch(() => undefined);
      router.push(createWorkspaceProjectUrl(targetProject, "reverse"));
      return;
    }

    if (!context.persistAndApplyReverseEngineeringDraft) {
      setApplyState("error");
      setApplyMessage("Reverse Engineering 서버 검증 경계가 준비되지 않았습니다.");
      return;
    }
    if (!previewBase) {
      setApplyState("error");
      setApplyMessage("적용할 Reverse Engineering 미리보기를 찾지 못했습니다.");
      return;
    }

    try {
      const outcome = await applyExistingReverseEngineeringPreview({
        currentDiagram: context.diagram,
        currentDraftRevision: context.projectDraftRevision,
        diagramToApply,
        persistAndApply: (diagram, expectedRevision) =>
          context.persistAndApplyReverseEngineeringDraft?.({
            expectedRevision,
            sourceScanId: result.scan.id,
            sourceDraftId: result.reverseEngineeringDraft.id,
            sourceNodeIds: [...application.sourceOwnership.nodeIds],
            sourceEdgeIds: [...application.sourceOwnership.edgeIds],
            sourceDiagram: previewBase.sourceDiagram,
            sourceFingerprint: previewBase.sourceFingerprint,
            candidateDiagram: diagram,
            candidateArchitectureJson: convertReverseEngineeringBoardToArchitectureJson(
              diagram,
              result,
              application.sourceOwnership
            ),
            importDecision
          }) ??
          Promise.reject(new Error("Reverse Engineering 서버 검증 경계가 준비되지 않았습니다.")),
        preview: previewBase,
        saveSnapshot: async () => {
          await createArchitectureSnapshot({
            projectId,
            source: "imported",
            reverseEngineering: {
              sourceScanId: result.scan.id,
              draftId: result.reverseEngineeringDraft.id,
              sourceNodeIds: [...application.sourceOwnership.nodeIds],
              sourceKind: "saved_scan"
            },
            architectureJson: convertReverseEngineeringBoardToArchitectureJson(
              diagramToApply,
              result,
              application.sourceOwnership
            )
          });
        }
      });

      if (outcome.status === "stale") {
        setApplyState("error");
        setApplyMessage("보드가 변경되었습니다. 다시 스캔해 주세요.");
        return;
      }

      setPreviewBase(null);
      if (outcome.status === "saved_without_snapshot") {
        setApplyState("partial");
        setApplyMessage("보드는 저장했지만 Snapshot은 저장하지 못했습니다.");
        return;
      }

      setApplyState("saved");
      setApplyMessage("보드와 imported Architecture Snapshot을 저장했습니다.");
    } catch (error) {
      setApplyState("error");
      setApplyMessage(toErrorMessage(error));
    }
  }

  // replace와 append 전환은 저장 없이 같은 후보의 미리보기만 바꿉니다.
  function previewApplicationMode(mode: ReverseEngineeringBoardApplicationMode): void {
    const nextOriginalApplication =
      mode === "append" ? originalCandidateAppendApplication : originalCandidateApplication;
    if (!nextOriginalApplication || !selectedCandidateResult) {
      return;
    }

    setApplicationMode(mode);
    setApplyState("idle");
    setApplyMessage(null);
    if (placement === "original") {
      context.setPreviewDiagram(nextOriginalApplication.previewDiagram);
      return;
    }

    const organizedPreview =
      mode === "append"
        ? (organizedDiagrams?.append ?? null)
        : (organizedDiagrams?.replace ?? null);
    if (!organizedPreview) {
      setPlacement("original");
      context.setPreviewDiagram(nextOriginalApplication.previewDiagram);
      return;
    }

    const application = createReverseEngineeringBoardApplication({
      currentDiagram: previewSourceDiagram,
      mode,
      organizedDiagram: organizedPreview,
      placement: "compiled",
      result: selectedCandidateResult
    });
    context.setPreviewDiagram(application.previewDiagram);
  }

  // 자동 정리는 사용자가 누를 때만 replace와 append 후보를 계산합니다.
  function previewAutomaticOrganization(): void {
    if (!originalCandidateApplication || !selectedCandidateResponse?.result) {
      return;
    }

    const replaceCandidate = createBoardAutoOrganizeCandidates(
      originalCandidateApplication.diagram,
      convertReverseEngineeringBoardToArchitectureJson(
        originalCandidateApplication.diagram,
        selectedCandidateResponse.result,
        originalCandidateApplication.sourceOwnership
      )
    ).candidates[0];
    const appendCandidate = originalCandidateAppendApplication
      ? createBoardAutoOrganizeCandidates(
          originalCandidateAppendApplication.diagram,
          convertReverseEngineeringBoardToArchitectureJson(
            originalCandidateAppendApplication.diagram,
            selectedCandidateResponse.result,
            originalCandidateAppendApplication.sourceOwnership
          )
        ).candidates[0]
      : null;

    if (!replaceCandidate) {
      setApplyState("error");
      setApplyMessage("정리본을 만들지 못했습니다.");
      return;
    }

    const nextOrganizedDiagrams: ReverseEngineeringOrganizedDiagrams = {
      append: appendCandidate ? structuredClone(appendCandidate.diagram) : null,
      replace: structuredClone(replaceCandidate.diagram)
    };
    const organizedPreview =
      applicationMode === "append" ? nextOrganizedDiagrams.append : nextOrganizedDiagrams.replace;
    if (!organizedPreview) {
      setApplyState("error");
      setApplyMessage("현재 적용 방식의 정리본을 만들지 못했습니다.");
      return;
    }

    setApplyState("idle");
    setApplyMessage(null);
    setOrganizedDiagrams(nextOrganizedDiagrams);
    setPlacement("compiled");
    context.setPreviewDiagram(organizedPreview);
  }

  // 원본 보기는 정리본을 저장하지 않고 source-exact 미리보기로 돌아갑니다.
  function previewOriginalPlacement(): void {
    if (!originalApplication) {
      return;
    }

    setPlacement("original");
    context.setPreviewDiagram(originalApplication.previewDiagram);
  }

  // 후보 선택은 원본 배치와 교체 모드의 미리보기부터 다시 만듭니다.
  function selectBoardCandidate(candidateId: string): void {
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
    setApplicationMode("replace");
    setOrganizedDiagrams(null);
    setSelectedCandidateId(candidateId);
    context.setPreviewDiagram(application.previewDiagram);
  }

  return {
    activeScanId,
    applicationMode,
    applyMessage,
    applyScanResult,
    applyState,
    awsConnectionRecovery,
    awsConnections,
    boardCandidates,
    canApply:
      Boolean(selectedCandidateApplication) &&
      Boolean(selectedCandidateResult?.architectureJson.nodes.length) &&
      !(
        applicationMode === "append" &&
        selectedCandidateApplication?.comparison.additions.length === 0
      ) &&
      applyState !== "saving",
    canStartScan,
    cancelActiveScan,
    deleteSavedScan,
    errorMessage,
    hasCurrentBoardResources: previewSourceDiagram.nodes.length > 0,
    hasDeletedSourceScan,
    isHistoryLoading: scanHistoryState === "loading" || scanState === "loading",
    isStaleScanResult,
    loadOptions,
    loadState,
    logs,
    openHistoricalScan,
    placement,
    previewApplicationMode,
    previewAutomaticOrganization,
    previewOriginalPlacement,
    resolvedSelectedAwsConnectionId,
    runScan,
    scanFailure,
    scanHistory,
    scanResponse,
    scanState,
    selectedAwsConnection,
    selectedCandidate,
    selectedCandidateResponse,
    selectedResourceTypes,
    selectBoardCandidate,
    setSelectedAwsConnectionId,
    resultSettingsHref: createReverseEngineeringAwsSettingsHref(
      selectedCandidateResponse?.scan.awsConnectionId ?? null
    ),
    settingsHref: createReverseEngineeringAwsSettingsHref(selectedAwsConnection?.id ?? null),
    toggleResourceType
  };
}

// 새 프로젝트 시작에서는 프로젝트를 만들기 전에 AWS만 읽습니다.
async function runPreviewScan({
  awsConnectionId,
  region,
  resourceTypes
}: ReverseEngineeringRunInput): Promise<ReverseEngineeringRunOutput> {
  const { previewId, ...response } = await createReverseEngineeringPreviewScan({
    awsConnectionId,
    region,
    resourceTypes
  });
  return { logs: [], previewId, response };
}

// 기존 프로젝트에서는 scan 기록과 로그를 서버에 저장합니다.
async function runSavedScan({
  awsConnectionId,
  onScanStarted,
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
  onScanStarted?.(startedResponse.scan);
  const response =
    startedResponse.result ||
    startedResponse.scan.status === "failed" ||
    startedResponse.scan.status === "cancelled"
      ? startedResponse
      : await pollReverseEngineeringScan(projectId, startedResponse.scan.id);
  const logs = await listReverseEngineeringScanLogs({ projectId, scanId: response.scan.id });
  return { logs, previewId: null, response };
}

// 알 수 없는 오류도 안전한 화면 문장으로 바꿉니다.
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

// scan 결과가 생길 때까지 제한된 횟수만 상태를 조회합니다.
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
  throw new Error("스캔 결과를 아직 받지 못했습니다. 스캔 기록에서 다시 열어주세요.");
}

// polling 사이에 서버 요청을 과도하게 보내지 않도록 기다립니다.
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

// 프로젝트 생성 뒤 실제 프로젝트 주소로 이동합니다.
function createWorkspaceProjectUrl(project: Project, startMode: "reverse"): string {
  const params = new URLSearchParams({
    projectId: project.id,
    projectName: project.name,
    startMode
  });
  return `/workspace?${params.toString()}`;
}

// 보드 출처에는 있지만 기록에는 없는 scan을 삭제된 원본으로 봅니다.
function hasDeletedReverseEngineeringSourceScan(
  diagram: DiagramJson,
  scanHistory: ReverseEngineeringScan[],
  scanHistoryState: RequestState
): boolean {
  if (scanHistoryState !== "idle") {
    return false;
  }

  const sourceScanIds = getSavedReverseEngineeringSourceScanIds(diagram);
  if (sourceScanIds.length === 0) {
    return false;
  }
  const existingScanIds = new Set(scanHistory.map((scan) => scan.id));
  return sourceScanIds.some((sourceScanId) => !existingScanIds.has(sourceScanId));
}
