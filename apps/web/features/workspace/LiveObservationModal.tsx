"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Deployment,
  LiveObservationV2Session,
  LiveObservationV2Snapshot,
  TerraformSyncFileInput
} from "@sketchcatch/types";
import { Check, Copy, ExternalLink, Radio, X } from "lucide-react";
import QRCode from "qrcode";
import { createPortal } from "react-dom";
import { copyTextToClipboard } from "../../lib/clipboard";
import { ApiClientError } from "../../lib/api-client";
import {
  createLiveObservation,
  runAiDesignSimulation,
  stopLiveObservation,
  streamLiveObservationSnapshots
} from "./api";
import {
  getEligibleLiveObservationDeployments,
  getSelectedLiveObservationOutputUrl,
  type LiveObservationSelection
} from "./live-observation";
import {
  getLiveObservationErrorMessage,
  getLiveObservationStreamErrorMessage
} from "./live-observation-errors";
import { createLiveObservationDesignSimulationRequest } from "./live-observation-ai-recommendation";
import { useLiveObservationQueries } from "./live-observation-queries";
import {
  incrementLiveObservationEcsMaxCapacity,
  type LiveObservationTerraformUpdateResult
} from "./live-observation-terraform-update";
import { LiveObservationSignalDashboard } from "./LiveObservationSignalDashboard";
import { LiveObservationFocusedFlow } from "./LiveObservationFocusedFlow";
import styles from "./workspace.module.css";

export type LiveObservationModalProps = {
  readonly appliedTerraformUpdate: LiveObservationTerraformUpdateResult | null;
  readonly onClose: () => void;
  readonly onApplyTerraformUpdate: () => Promise<LiveObservationTerraformUpdateResult>;
  readonly onAppliedTerraformUpdateChange: (
    update: LiveObservationTerraformUpdateResult | null
  ) => void;
  readonly onTrafficIncidentSnapshotChange: (snapshot: LiveObservationV2Snapshot | null) => void;
  readonly onOpenTerraformEditor: () => void;
  readonly onSessionChange: (session: LiveObservationV2Session | null) => void;
  readonly onSelectedDeploymentIdChange: (deploymentId: string) => void;
  readonly onSnapshotChange: (snapshot: LiveObservationV2Snapshot | null) => void;
  readonly projectId: string;
  readonly selectedDeploymentId: string;
  readonly session: LiveObservationV2Session | null;
  readonly selection?: LiveObservationSelection | null | undefined;
  readonly snapshot: LiveObservationV2Snapshot | null;
  readonly terraformFiles: readonly TerraformSyncFileInput[];
  readonly trafficIncidentSnapshot: LiveObservationV2Snapshot | null;
};

export function LiveObservationModal({
  onClose,
  onApplyTerraformUpdate,
  appliedTerraformUpdate,
  onOpenTerraformEditor,
  onSessionChange,
  onAppliedTerraformUpdateChange,
  onTrafficIncidentSnapshotChange,
  onSelectedDeploymentIdChange,
  onSnapshotChange,
  projectId,
  selectedDeploymentId,
  session,
  selection,
  snapshot,
  terraformFiles,
  trafficIncidentSnapshot
}: LiveObservationModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const activeRef = useRef(false);
  const operationControllerRef = useRef<AbortController | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [requestState, setRequestState] = useState<"idle" | "loading">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectionErrorMessage, setSelectionErrorMessage] = useState("");
  const [streamErrorMessage, setStreamErrorMessage] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrState, setQrState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [copied, setCopied] = useState(false);
  const [audienceUtilityOpen, setAudienceUtilityOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const aiAnalysisSessionRef = useRef<string | null>(null);
  const [aiRecommendationState, setAiRecommendationState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [aiRecommendationError, setAiRecommendationError] = useState("");
  const [aiRecommendationExplanation, setAiRecommendationExplanation] = useState("");
  const [terraformApplyState, setTerraformApplyState] = useState<"idle" | "loading">("idle");
  const [terraformApplyError, setTerraformApplyError] = useState("");
  const queries = useLiveObservationQueries({
    deploymentId: selectedDeploymentId,
    loadOutputs: !selection,
    projectId
  });
  const deployments = queries.reference.data?.deployments ?? [];
  const releases = queries.reference.data?.releases ?? [];
  const terraformOutputs = queries.outputs.data ?? [];
  const selectedArchitecture = queries.architecture.data?.architecture ?? null;
  const listState = queries.reference.data
    ? "ready"
    : queries.reference.isError
      ? "error"
      : "loading";
  const outputListState = !selectedDeploymentId
    ? "idle"
    : selection
      ? "ready"
      : queries.outputs.data
        ? "ready"
        : queries.outputs.isError
          ? "error"
          : "loading";
  const selectedArchitectureState = !selectedDeploymentId
    ? "idle"
    : queries.architecture.data
      ? "ready"
      : queries.architecture.isError
        ? "error"
        : "loading";
  const referenceErrorMessage = queries.reference.isError
    ? getLiveObservationErrorMessage(queries.reference.error, "배포 목록을 불러오지 못했어요.")
    : "";
  const outputErrorMessage = queries.outputs.isError
    ? getLiveObservationErrorMessage(queries.outputs.error, "배포 주소를 불러오지 못했어요.")
    : "";
  const selectedArchitectureErrorMessage = queries.architecture.isError
    ? getArchitectureErrorMessage(queries.architecture.error)
    : "";

  const eligibleDeployments = useMemo(
    () => getEligibleLiveObservationDeployments(deployments),
    [deployments]
  );
  const selectedDeployment = eligibleDeployments.find(
    (deployment) => deployment.id === selectedDeploymentId
  );
  const selectedOutputUrl = getSelectedLiveObservationOutputUrl(
    selection,
    selectedDeploymentId,
    releases,
    terraformOutputs
  );
  const selectedSession = session?.deploymentId === selectedDeploymentId ? session : null;
  const selectedSnapshot = selectedSession ? snapshot : null;
  const outputUrl = selectedSession
    ? getSelectedLiveObservationOutputUrl(
        selection,
        selectedSession.deploymentId,
        releases,
        terraformOutputs
      )
    : selectedOutputUrl;
  const remainingSeconds = selectedSession
    ? Math.max(0, Math.ceil((new Date(selectedSession.expiresAt).getTime() - nowMs) / 1_000))
    : 0;
  const audienceUrl = selectedSession?.audienceUrl ?? outputUrl;
  const isSessionActive =
    selectedSession !== null && selectedSnapshot?.status === "active" && remainingSeconds > 0;
  const visibleErrorMessage =
    errorMessage ||
    selectionErrorMessage ||
    referenceErrorMessage ||
    outputErrorMessage ||
    streamErrorMessage ||
    terraformApplyError;
  const isTrafficPressureElevated =
    trafficIncidentSnapshot !== null && appliedTerraformUpdate === null;
  const terraformUpdatePreview = useMemo(() => {
    if (!trafficIncidentSnapshot || terraformFiles.length === 0) return null;
    try {
      return incrementLiveObservationEcsMaxCapacity(terraformFiles);
    } catch {
      return null;
    }
  }, [terraformFiles, trafficIncidentSnapshot]);
  const recommendedAction = isTrafficPressureElevated
    ? {
        actionLabel: "수정안 저장",
        boundary: "저장해도 실제 서버는 바뀌지 않아요.",
        description: terraformUpdatePreview
          ? `최대 실행 서버를 ${terraformUpdatePreview.previousMaxCapacity}개에서 ${terraformUpdatePreview.nextMaxCapacity}개로 늘릴 수 있어요.`
          : "자동으로 바꿀 설정을 찾지 못했어요. 코드에서 직접 확인해 주세요.",
        ...(aiRecommendationState === "error" && aiRecommendationError
          ? { errorMessage: aiRecommendationError }
          : {}),
        ...(aiRecommendationExplanation ? { explanation: aiRecommendationExplanation } : {}),
        isApplying: terraformApplyState === "loading",
        isLoading: aiRecommendationState === "loading",
        ...(terraformUpdatePreview ? { onAction: () => void applyTerraformUpdate() } : {}),
        title: "서버 용량을 늘릴 수 있어요"
      }
    : null;

  useEffect(() => {
    activeRef.current = true;
    setMounted(true);
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      activeRef.current = false;
      document.body.style.overflow = previousOverflow;
      operationControllerRef.current?.abort();
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    aiAnalysisSessionRef.current = null;
    setAiRecommendationState("idle");
    setAiRecommendationError("");
    setAiRecommendationExplanation("");
    setTerraformApplyState("idle");
    setTerraformApplyError("");
  }, [selectedSession?.id]);

  useEffect(() => {
    if (
      selectedSnapshot &&
      selectedSnapshot.live.pressureLevel !== "normal" &&
      appliedTerraformUpdate === null &&
      trafficIncidentSnapshot === null
    ) {
      onTrafficIncidentSnapshotChange(selectedSnapshot);
    }
  }, [
    appliedTerraformUpdate,
    onTrafficIncidentSnapshotChange,
    selectedSnapshot,
    trafficIncidentSnapshot
  ]);

  useEffect(() => {
    const selectedSessionId = selectedSession?.id ?? null;
    if (!selectedArchitecture || !trafficIncidentSnapshot || !selectedSessionId) {
      aiAnalysisSessionRef.current = null;
      setAiRecommendationState("idle");
      setAiRecommendationError("");
      setAiRecommendationExplanation("");
      return;
    }
    if (aiAnalysisSessionRef.current === selectedSessionId) return;

    const input = createLiveObservationDesignSimulationRequest(
      selectedArchitecture,
      trafficIncidentSnapshot
    );
    if (!input) return;

    let cancelled = false;
    aiAnalysisSessionRef.current = selectedSessionId;
    setAiRecommendationState("loading");
    setAiRecommendationError("");
    void runAiDesignSimulation(input).then(
      (result) => {
        if (cancelled) return;
        setAiRecommendationExplanation(
          result.llmExplanation?.summary ?? result.recommendations[0] ?? result.summary
        );
        setAiRecommendationState("ready");
      },
      (error) => {
        if (cancelled) return;
        setAiRecommendationState("error");
        setAiRecommendationError(
          getLiveObservationErrorMessage(
            error,
            "분석을 불러오지 못했어요. 수정안을 직접 확인해 주세요."
          )
        );
      }
    );

    return () => {
      cancelled = true;
    };
  }, [selectedArchitecture, selectedSession?.id, trafficIncidentSnapshot]);
  useEffect(() => {
    if (!queries.reference.data) return;

    const eligible = getEligibleLiveObservationDeployments(queries.reference.data.deployments);
    if (selection) {
      const exactDeployment = eligible.find(
        (deployment) => deployment.id === selection.deploymentId
      );
      const targetDeploymentId = exactDeployment?.id ?? "";
      if (targetDeploymentId !== selectedDeploymentId) {
        onSelectedDeploymentIdChange(targetDeploymentId);
      }
      if (!exactDeployment) {
        setSelectionErrorMessage("선택한 배포를 관측할 수 없어요.");
      } else if (
        !getSelectedLiveObservationOutputUrl(
          selection,
          exactDeployment.id,
          queries.reference.data.releases
        )
      ) {
        setSelectionErrorMessage("선택한 배포의 웹 주소를 확인할 수 없어요.");
      } else {
        setSelectionErrorMessage("");
      }
      return;
    }

    setSelectionErrorMessage("");
    const fallbackDeploymentId = eligible.some(
      (deployment) => deployment.id === selectedDeploymentId
    )
      ? selectedDeploymentId
      : (eligible[0]?.id ?? "");
    if (fallbackDeploymentId !== selectedDeploymentId) {
      onSelectedDeploymentIdChange(fallbackDeploymentId);
    }
  }, [onSelectedDeploymentIdChange, queries.reference.data, selectedDeploymentId, selection]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!audienceUrl) {
      setQrDataUrl("");
      setQrState("idle");
      return;
    }

    let cancelled = false;
    setQrDataUrl("");
    setQrState("loading");
    void QRCode.toDataURL(audienceUrl, {
      color: { dark: "#171717", light: "#ffffff" },
      errorCorrectionLevel: "M",
      margin: 1,
      width: 184
    }).then(
      (dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
          setQrState("ready");
        }
      },
      () => {
        if (!cancelled) {
          setQrDataUrl("");
          setQrState("error");
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [audienceUrl]);

  useEffect(() => {
    if (!selectedSession || !isSessionActive) {
      setStreamErrorMessage("");
      return;
    }

    const abortController = new AbortController();
    setStreamErrorMessage("");
    void streamLiveObservationSnapshots({
      deploymentId: selectedSession.deploymentId,
      observationId: selectedSession.id,
      onError: (failure) => {
        if (!abortController.signal.aborted) {
          setStreamErrorMessage(getLiveObservationStreamErrorMessage(failure));
        }
      },
      onSnapshot: (nextSnapshot) => {
        if (!abortController.signal.aborted) {
          onSnapshotChange(nextSnapshot);
          setStreamErrorMessage("");
        }
      },
      signal: abortController.signal
    });
    return () => abortController.abort();
  }, [isSessionActive, onSnapshotChange, selectedSession]);

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = getFocusableElements(dialogRef.current);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function closeModal(): void {
    operationControllerRef.current?.abort();
    onClose();
  }

  function selectDeployment(nextDeploymentId: string): void {
    if (nextDeploymentId === selectedDeploymentId) return;

    if (session && session.deploymentId !== nextDeploymentId) {
      onSessionChange(null);
      onSnapshotChange(null);
      setErrorMessage("");
      setStreamErrorMessage("");
    }

    onSelectedDeploymentIdChange(nextDeploymentId);
  }

  async function startObservation(): Promise<void> {
    if (!selectedDeploymentId || !selectedOutputUrl || requestState === "loading") return;
    operationControllerRef.current?.abort();
    const abortController = new AbortController();
    operationControllerRef.current = abortController;
    setRequestState("loading");
    setErrorMessage("");
    try {
      const response = await createLiveObservation(selectedDeploymentId, abortController.signal);
      if (abortController.signal.aborted) return;
      onSessionChange(response.session);
      onSnapshotChange(response.snapshot);
      setNowMs(Date.now());
    } catch (error) {
      if (!abortController.signal.aborted) {
        setErrorMessage(getLiveObservationErrorMessage(error, "관측을 시작하지 못했어요."));
      }
    } finally {
      if (!abortController.signal.aborted) setRequestState("idle");
    }
  }

  async function endSession(): Promise<void> {
    if (!session || requestState === "loading") return;
    operationControllerRef.current?.abort();
    const abortController = new AbortController();
    operationControllerRef.current = abortController;
    setRequestState("loading");
    setErrorMessage("");
    try {
      const stoppedSnapshot = await stopLiveObservation(
        session.deploymentId,
        session.id,
        abortController.signal
      );
      if (!abortController.signal.aborted) onSnapshotChange(stoppedSnapshot);
    } catch (error) {
      if (!abortController.signal.aborted) {
        setErrorMessage(getLiveObservationErrorMessage(error, "관측을 종료하지 못했어요."));
      }
    } finally {
      if (!abortController.signal.aborted) setRequestState("idle");
    }
  }

  async function copyOutputUrl(): Promise<void> {
    if (!audienceUrl) return;
    try {
      await copyTextToClipboard(audienceUrl);
      if (!activeRef.current) return;
      setCopied(true);
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      if (!activeRef.current) return;
      setErrorMessage("링크를 복사하지 못했어요. 직접 열어 주세요.");
    }
  }
  async function applyTerraformUpdate(): Promise<void> {
    if (terraformApplyState === "loading" || appliedTerraformUpdate) return;

    setTerraformApplyState("loading");
    setTerraformApplyError("");
    try {
      const result = await onApplyTerraformUpdate();
      if (!activeRef.current) return;
      onAppliedTerraformUpdateChange(result);
      onTrafficIncidentSnapshotChange(null);
    } catch {
      if (!activeRef.current) return;
      setTerraformApplyError("수정안을 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      if (activeRef.current) setTerraformApplyState("idle");
    }
  }

  if (!mounted) return null;

  const audienceUtility =
    audienceUrl && audienceUtilityOpen ? (
      <section
        aria-label="배포된 서비스 열기"
        className={styles.liveObservationAudienceUtility}
        id="live-observation-audience-utility"
      >
        <div>
          <strong>배포된 서비스 열기</strong>
          {selectedDeployment?.status === "PARTIALLY_FAILED" ||
          selectedDeployment?.status === "PARTIALLY_CANCELED" ? (
            <p className={styles.liveObservationFrontendWarning} role="status">
              웹 화면은 이전 버전일 수 있어요.
            </p>
          ) : null}
          <div className={styles.liveObservationAudienceUtilityActions}>
            <button
              className={styles.liveObservationSecondaryButton}
              onClick={() => void copyOutputUrl()}
              type="button"
            >
              {copied ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Copy size={16} aria-hidden="true" />
              )}
              링크 복사
            </button>
            <a href={audienceUrl} rel="noreferrer" target="_blank">
              새 창에서 열기 <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
        <div className={styles.liveObservationQr}>
          {qrState === "ready" && qrDataUrl ? (
            <img alt="배포 서비스 QR 코드" height={184} src={qrDataUrl} width={184} />
          ) : qrState === "error" ? (
            <span role="alert">QR을 만들지 못했어요.</span>
          ) : (
            <span>QR 만드는 중...</span>
          )}
        </div>
      </section>
    ) : null;

  return createPortal(
    <div
      className={styles.liveObservationOverlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <div
        aria-labelledby="live-observation-title"
        aria-modal="true"
        className={styles.liveObservationDialog}
        data-pressure-level={selectedSnapshot?.live.pressureLevel ?? "normal"}
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <header className={styles.liveObservationHeader}>
          <div className={styles.liveObservationHeaderIdentity}>
            <h2 id="live-observation-title">실시간 관측</h2>
          </div>
          <div className={styles.liveObservationTargetBar}>
            <label>
              <span>배포 시각</span>
              <select
                disabled={
                  eligibleDeployments.length === 0 ||
                  Boolean(selection) ||
                  requestState === "loading" ||
                  isSessionActive ||
                  listState !== "ready"
                }
                onChange={(event) => selectDeployment(event.target.value)}
                value={selectedDeploymentId}
              >
                {eligibleDeployments.length === 0 ? (
                  <option disabled value="">
                    {listState === "loading"
                      ? "배포 목록 확인 중..."
                      : "관측할 배포가 없어요."}
                  </option>
                ) : null}
                {eligibleDeployments.map((deployment) => (
                  <option key={deployment.id} value={deployment.id}>
                    {formatDeploymentOption(deployment)}
                  </option>
                ))}
              </select>
            </label>
            <div
              className={styles.liveObservationSessionStatus}
              data-status={selectedSnapshot?.status ?? "ready"}
            >
              <Radio size={15} aria-hidden="true" />
              <span>{getSessionStatusLabel(selectedSnapshot, remainingSeconds)}</span>
              {isSessionActive ? <strong>{formatRemainingTime(remainingSeconds)}</strong> : null}
            </div>
            <div className={styles.liveObservationTargetActions}>
              <button
                className={styles.liveObservationPrimaryButton}
                disabled={
                  !selectedDeployment ||
                  !selectedOutputUrl ||
                  requestState === "loading" ||
                  isSessionActive
                }
                onClick={() => void startObservation()}
                type="button"
              >
                관측 시작
              </button>
              {audienceUrl ? (
                <div className={styles.liveObservationQrMenu}>
                  <button
                    aria-controls="live-observation-audience-utility"
                    aria-expanded={audienceUtilityOpen}
                    className={styles.liveObservationSecondaryButton}
                    onClick={() => setAudienceUtilityOpen((open) => !open)}
                    type="button"
                  >
                    접속 QR
                  </button>
                  {audienceUtility}
                </div>
              ) : null}
            </div>
          </div>
          <button
            aria-label="실시간 관측 닫기"
            className={styles.liveObservationCloseButton}
            onClick={closeModal}
            ref={closeButtonRef}
            type="button"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <main className={styles.liveObservationBody}>
          {listState === "loading" ? (
            <div className={styles.liveObservationMessage}>
              배포 목록을 확인하고 있어요.
            </div>
          ) : null}
          {listState === "ready" && eligibleDeployments.length === 0 ? (
            <div className={styles.liveObservationMessage}>
              <strong>관측할 배포가 없어요.</strong>
              <p>웹 주소가 준비된 배포가 필요해요.</p>
            </div>
          ) : null}
          {visibleErrorMessage ? (
            <div className={styles.liveObservationError} role="alert">
              {visibleErrorMessage}
            </div>
          ) : null}
          {!selectedSession &&
          selectedDeployment &&
          outputListState === "ready" &&
          !selectedOutputUrl ? (
            <div className={styles.liveObservationError} role="alert">
              선택한 배포의 웹 주소를 확인할 수 없어요.
            </div>
          ) : null}
          {selectedSession && !outputUrl ? (
            <div className={styles.liveObservationError} role="alert">
              이 관측의 웹 주소를 확인할 수 없어요.
            </div>
          ) : null}

          {selectedArchitectureState === "loading" ? (
            <div className={styles.liveObservationMessage} role="status">
              배포 구성을 불러오고 있어요.
            </div>
          ) : null}
          {isTrafficPressureElevated ? (
            <div className={styles.liveObservationError} role="alert">
              <strong>요청이 빠르게 늘고 있어요</strong>
              <p>
                요청 {trafficIncidentSnapshot.live.acceptedEventCount}건 · 분당 약{" "}
                {trafficIncidentSnapshot.live.projectedRequestsPerMinute}건
              </p>
            </div>
          ) : null}
          {appliedTerraformUpdate ? (
            <div className={styles.liveObservationMessage} role="status">
              <strong>용량 수정안을 저장했어요</strong>
              <p>
                최대 실행 서버 {appliedTerraformUpdate.previousMaxCapacity}개 →{" "}
                {appliedTerraformUpdate.nextMaxCapacity}개
              </p>
              <p>실제 서버는 아직 바뀌지 않았어요.</p>
              <button
                className={styles.liveObservationSecondaryButton}
                onClick={onOpenTerraformEditor}
                type="button"
              >
                수정 위치 보기
              </button>
            </div>
          ) : null}
          {selectedArchitectureState === "error" && selectedArchitectureErrorMessage ? (
            <div className={styles.liveObservationError} role="alert">
              {selectedArchitectureErrorMessage}
            </div>
          ) : null}
          {selectedDeployment && selectedArchitecture ? (
            <LiveObservationFocusedFlow
              architecture={selectedArchitecture}
              snapshot={selectedSnapshot}
            />
          ) : null}
          {selectedDeployment ? (
            <LiveObservationSignalDashboard
              aiError={aiRecommendationError || undefined}
              aiState={aiRecommendationState}
              architecture={selectedArchitecture}
              deployment={selectedDeployment}
              recommendedAction={recommendedAction}
              snapshot={selectedSnapshot}
            />
          ) : null}
        </main>

        {selectedSession ? (
          <footer className={styles.liveObservationControlRail}>
            <div className={styles.liveObservationControlActivity}>
              <span className={styles.liveObservationSectionLabel}>세션</span>
              <strong>
                {selectedSnapshot?.status === "active" ? "요청 수집 중" : "수집 종료"}
              </strong>
              {selectedSnapshot?.terminalAt ? (
                <span className={styles.liveObservationMuted}>
                  {formatTimestamp(selectedSnapshot.terminalAt)}
                </span>
              ) : null}
            </div>
            <div className={styles.liveObservationControlActions}>
              <button
                className={styles.liveObservationDangerButton}
                disabled={!isSessionActive || requestState === "loading"}
                onClick={() => void endSession()}
                type="button"
              >
                관측 종료
              </button>
            </div>
          </footer>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], select:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )
  );
}

function getArchitectureErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.status === 404) {
    return "이 배포의 구성을 찾을 수 없어요.";
  }

  return getLiveObservationErrorMessage(error, "배포 구성을 불러오지 못했어요.");
}

function formatDeploymentOption(deployment: Deployment): string {
  const completedAt = deployment.completedAt
    ? new Date(deployment.completedAt).toLocaleString("ko-KR", {
        dateStyle: "short",
        timeStyle: "short"
      })
    : "완료 시각을 확인할 수 없음";
  const state = deployment.status === "SUCCESS" ? "완료" : "일부 완료";
  return `${completedAt} · ${state}`;
}

function getSessionStatusLabel(
  snapshot: LiveObservationV2Snapshot | null,
  remainingSeconds: number
): string {
  if (!snapshot) return "시작 전";
  if (snapshot.status === "stopped") return "종료됨";
  if (snapshot.status === "expired" || remainingSeconds === 0) return "만료됨";
  return "관측 중";
}

function formatRemainingTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "medium"
  });
}
