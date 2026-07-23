"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
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
  createReverseEngineeringCandidateResult,
  type ReverseEngineeringBoardCandidate
} from "./reverse-engineering-board-candidates";
import {
  getNextReverseEngineeringResourceSelections,
  REVERSE_ENGINEERING_ALL_RESOURCE_SELECTION,
  REVERSE_ENGINEERING_RESOURCE_SELECTIONS
} from "./reverse-engineering-resource-types";
import {
  createReverseEngineeringImportDecisionOptions,
  createReverseEngineeringImportDecisionRequest,
  isReverseEngineeringImportDecisionComplete
} from "./reverse-engineering-import-decision";
import { createReverseEngineeringLayoutSummary } from "./reverse-engineering-layout-summary";
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
type ReverseEngineeringOrganizedPreview = {
  readonly diagram: DiagramJson;
  readonly layoutSummary: readonly string[];
};
type ReverseEngineeringOrganizedDiagrams = {
  readonly append: ReverseEngineeringOrganizedPreview | null;
  readonly replace: ReverseEngineeringOrganizedPreview;
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
  const [selectedReadyResourceIds, setSelectedReadyResourceIds] = useState<string[]>([]);
  const [acknowledgedReviewOnlyResourceIds, setAcknowledgedReviewOnlyResourceIds] = useState<
    string[]
  >([]);
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
  const activeOrganizedPreview =
    applicationMode === "append"
      ? (organizedDiagrams?.append ?? null)
      : (organizedDiagrams?.replace ?? null);
  const activeOrganizedDiagram = activeOrganizedPreview?.diagram ?? null;
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
    applicationMode,
    originalApplication,
    placement,
    previewSourceDiagram,
    selectedCandidateResult,
    activeOrganizedDiagram
  ]);
  const comparison = selectedCandidateApplication?.comparison ?? null;
  const importDecisionOptions = useMemo(
    () =>
      selectedCandidateResult && selectedCandidateApplication
        ? createReverseEngineeringImportDecisionOptions(
            selectedCandidateResult,
            selectedCandidateApplication.sourceOwnership.nodeIds
          )
        : { ready: [], reviewOnly: [], invalidResourceIds: [] },
    [selectedCandidateApplication, selectedCandidateResult]
  );
  const isImportDecisionComplete = isReverseEngineeringImportDecisionComplete(
    importDecisionOptions,
    acknowledgedReviewOnlyResourceIds
  );
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
      setApplicationMode("replace");
      setOrganizedDiagrams(null);
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

  // gg: 새 scan이나 다른 후보를 열면 이전 리소스 선택을 재사용하지 않습니다.
  useEffect(() => {
    setSelectedReadyResourceIds([]);
    setAcknowledgedReviewOnlyResourceIds([]);
  }, [scanResponse?.scan.id, selectedCandidate?.id]);

  // gg: replace와 append 사이에서 실제 적용 범위 밖으로 빠진 선택은 요청에서 제거합니다.
  useEffect(() => {
    const readyIds = new Set(importDecisionOptions.ready.map((option) => option.id));
    const reviewOnlyIds = new Set(importDecisionOptions.reviewOnly.map((option) => option.id));

    setSelectedReadyResourceIds((currentIds) => filterSelectionToScope(currentIds, readyIds));
    setAcknowledgedReviewOnlyResourceIds((currentIds) =>
      filterSelectionToScope(currentIds, reviewOnlyIds)
    );
  }, [importDecisionOptions]);

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
    setApplicationMode("replace");
    setOrganizedDiagrams(null);
    setSelectedCandidateId(null);
    setScanResponse(null);
    setPreviewId(null);
    setLogs([]);
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
    } catch {
      setScanState("error");
      setErrorMessage("AWS에서 항목을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  // 사용자가 실행 중인 scan을 멈추고 싶을 때 서버에 안전한 취소 요청만 보냅니다.
  async function cancelActiveScan(scanId = activeScanId): Promise<void> {
    if (!scanId || !targetProjectId) {
      return;
    }

    try {
      const scan = await cancelReverseEngineeringScan({
        projectId: targetProjectId,
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
        projectId: targetProjectId,
        scanId
      });

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

  // 저장된 스캔 기록을 다시 열고, 보드에는 실제 적용이 아닌 미리보기만 띄웁니다.
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
      const response = await getReverseEngineeringScan({
        projectId: targetProjectId,
        scanId
      });
      const nextLogs = await listReverseEngineeringScanLogs({
        projectId: targetProjectId,
        scanId
      });

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

    if (mode !== applicationMode) {
      setApplyState("error");
      setApplyMessage("먼저 적용할 방식을 선택해 실제 배치를 미리봐 주세요.");
      return;
    }

    const application = selectedCandidateApplication;

    if (!application) {
      return;
    }
    if (!isImportDecisionComplete) {
      setApplyState("error");
      setApplyMessage("보드에서 바로 수정할 수 없는 리소스를 모두 확인해 주세요.");
      return;
    }
    const importDecision = createReverseEngineeringImportDecisionRequest({
      options: importDecisionOptions,
      selectedReadyResourceIds,
      acknowledgedReviewOnlyResourceIds
    });
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
        setApplyMessage("적용할 AWS 미리보기를 찾지 못했습니다. 다시 가져와 주세요.");
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
      setApplyMessage("프로젝트를 만들고 선택한 후보를 보드에 저장했습니다.");
      void invalidateProjectQueries(queryClient, user?.id).catch(() => undefined);
      router.push(createWorkspaceProjectUrl(targetProject, "reverse"));
      return;
    }

    if (!context.persistAndApplyReverseEngineeringDraft) {
      setApplyState("error");
      setApplyMessage(
        "Reverse Engineering 서버 검증이 준비되지 않았습니다. 잠시 후 다시 시도해 주세요."
      );
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
        setApplyMessage(
          "보드는 저장했습니다. imported Architecture Snapshot은 저장하지 못했습니다. 저장된 보드는 그대로 유지됩니다."
        );
        return;
      }

      setApplyState("saved");
      setApplyMessage("보드에 반영했고, imported Architecture Snapshot도 저장했습니다.");
    } catch (error) {
      setApplyState("error");
      setApplyMessage(toErrorMessage(error));
    }
  }

  // replace와 append를 바꾸면 실제로 저장될 mode의 원본 또는 정리본을 Board에 다시 보여줍니다.
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
      organizedDiagram: organizedPreview.diagram,
      placement: "compiled",
      result: selectedCandidateResult
    });

    context.setPreviewDiagram(application.previewDiagram);
  }

  // gg: Compiler 내부 후보 중 rank-1만 UI 경계 밖으로 꺼내 하나의 정리본으로 미리봅니다.
  function previewAutomaticOrganization(): void {
    if (!originalCandidateApplication || !selectedCandidateResponse?.result) {
      return;
    }

    const replaceCandidateSet = createBoardAutoOrganizeCandidates(
      originalCandidateApplication.diagram,
      convertReverseEngineeringBoardToArchitectureJson(
        originalCandidateApplication.diagram,
        selectedCandidateResponse.result,
        originalCandidateApplication.sourceOwnership
      )
    );
    const appendCandidateSet = originalCandidateAppendApplication
      ? createBoardAutoOrganizeCandidates(
          originalCandidateAppendApplication.diagram,
          convertReverseEngineeringBoardToArchitectureJson(
            originalCandidateAppendApplication.diagram,
            selectedCandidateResponse.result,
            originalCandidateAppendApplication.sourceOwnership
          )
        )
      : null;
    const replaceCandidate = replaceCandidateSet.candidates[0] ?? null;
    const appendCandidate = appendCandidateSet?.candidates[0] ?? null;

    if (!replaceCandidate) {
      setApplyState("error");
      setApplyMessage("정리본을 만들지 못했어요.");
      return;
    }

    const nextOrganizedDiagrams: ReverseEngineeringOrganizedDiagrams = {
      append:
        appendCandidate && originalCandidateAppendApplication
          ? {
              diagram: structuredClone(appendCandidate.diagram),
              layoutSummary: createReverseEngineeringLayoutSummary(
                originalCandidateAppendApplication.diagram,
                appendCandidate
              )
            }
          : null,
      replace: {
        diagram: structuredClone(replaceCandidate.diagram),
        layoutSummary: createReverseEngineeringLayoutSummary(
          originalCandidateApplication.diagram,
          replaceCandidate
        )
      }
    };
    const organizedPreview =
      applicationMode === "append" ? nextOrganizedDiagrams.append : nextOrganizedDiagrams.replace;

    if (!organizedPreview) {
      setApplyState("error");
      setApplyMessage("현재 적용 방식의 정리본을 만들지 못했어요.");
      return;
    }

    setApplyState("idle");
    setApplyMessage(null);
    setOrganizedDiagrams(nextOrganizedDiagrams);
    setPlacement("compiled");
    context.setPreviewDiagram(organizedPreview.diagram);
  }

  // gg: 원본 보기는 만들어 둔 정리본을 버리거나 저장하지 않고 source-exact 미리보기로 돌아갑니다.
  function previewOriginalPlacement(): void {
    if (!originalApplication) {
      return;
    }

    setPlacement("original");
    context.setPreviewDiagram(originalApplication.previewDiagram);
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
          projects={projects}
          resourceTypes={REVERSE_ENGINEERING_RESOURCE_SELECTIONS}
          selectedAwsConnectionId={resolvedSelectedAwsConnectionId}
          selectedProjectId={targetProjectId}
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
            applicationMode={applicationMode}
            applyState={applyState}
            boardCandidates={boardCandidates}
            comparison={comparison}
            createProjectOnApply={createProjectOnApply}
            hasCurrentBoardResources={previewSourceDiagram.nodes.length > 0}
            logs={logs}
            layoutSummary={
              placement === "compiled" ? (activeOrganizedPreview?.layoutSummary ?? []) : []
            }
            acknowledgedReviewOnlyResourceIds={acknowledgedReviewOnlyResourceIds}
            importDecisionComplete={isImportDecisionComplete}
            importDecisionOptions={importDecisionOptions}
            onAppendToCurrentBoard={() => void applyScanResult("append")}
            onApplicationModeChange={previewApplicationMode}
            onCompilePlacement={previewAutomaticOrganization}
            onKeepOriginalPlacement={previewOriginalPlacement}
            onReadyResourceToggle={(resourceId) =>
              setSelectedReadyResourceIds((currentIds) => toggleSelection(currentIds, resourceId))
            }
            onReplaceCurrentBoard={() => void applyScanResult("replace")}
            onReviewOnlyResourceToggle={(resourceId) =>
              setAcknowledgedReviewOnlyResourceIds((currentIds) =>
                toggleSelection(currentIds, resourceId)
              )
            }
            onRetryScan={() => void runScan()}
            permissionRecoveryHref={createReverseEngineeringAwsSettingsHref(
              selectedCandidateResponse.scan.awsConnectionId
            )}
            response={selectedCandidateResponse}
            selectedReadyResourceIds={selectedReadyResourceIds}
            selectedCandidateId={selectedCandidate.id}
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
  readonly previewId: string | null;
  readonly response: ReverseEngineeringScanResponse;
};

// gg: 실제 적용 범위 안에 남은 리소스 선택만 유지합니다.
function filterSelectionToScope(
  currentIds: readonly string[],
  allowedIds: ReadonlySet<string>
): string[] {
  const nextIds = currentIds.filter((resourceId) => allowedIds.has(resourceId));

  return nextIds;
}

// gg: 같은 리소스를 다시 누르면 선택을 해제하고 순서는 화면 순서대로 유지합니다.
function toggleSelection(currentIds: readonly string[], resourceId: string): string[] {
  return currentIds.includes(resourceId)
    ? currentIds.filter((currentId) => currentId !== resourceId)
    : [...currentIds, resourceId];
}

// 새 프로젝트 시작에서는 프로젝트를 만들기 전에 AWS만 읽어서 미리보기 결과를 받습니다.
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

  return {
    logs: [],
    previewId,
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
    previewId: null,
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

// 보드에는 출처 scan id가 남아 있는데 scan 기록 목록에는 없으면 삭제된 원본으로 봅니다.
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
