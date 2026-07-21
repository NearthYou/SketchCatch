"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DesignSimulationResult,
  Deployment,
  LiveObservationV2Session,
  LiveObservationV2Snapshot,
  TerraformSyncFileInput
} from "@sketchcatch/types";
import { Check, Copy, ExternalLink, Radio, X } from "lucide-react";
import QRCode from "qrcode";
import { createPortal } from "react-dom";
import { copyTextToClipboard } from "../../lib/clipboard";
import { ApiClientError, getApiErrorMessage } from "../../lib/api-client";
import {
  createLiveObservation,
  runAiDesignSimulation,
  stopLiveObservation,
  streamLiveObservationSnapshots
} from "./api";
import {
  getEligibleLiveObservationDeployments,
  getLiveObservationOperationalAnalysis,
  getSelectedLiveObservationOutputUrl,
  getLiveObservationProviderEvidence,
  type LiveObservationSelection
} from "./live-observation";
import { getLiveObservationCapacityMode } from "./live-observation-architecture";
import { createLiveObservationDesignSimulationRequest } from "./live-observation-ai-recommendation";
import { useLiveObservationQueries } from "./live-observation-queries";
import {
  incrementLiveObservationEcsMaxCapacity,
  type LiveObservationTerraformUpdateResult
} from "./live-observation-terraform-update";
import { LiveObservationFocusedFlow } from "./LiveObservationFocusedFlow";
import { WorkspaceAiExplanation } from "./WorkspaceAiPanelPieces";
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
  const [aiRecommendation, setAiRecommendation] = useState<DesignSimulationResult | null>(null);
  const [aiRecommendationState, setAiRecommendationState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [aiRecommendationError, setAiRecommendationError] = useState("");
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
    ? getApiErrorMessage(queries.reference.error, "배포 기록을 불러오지 못했습니다.")
    : "";
  const outputErrorMessage = queries.outputs.isError
    ? getApiErrorMessage(queries.outputs.error, "배포 Output을 불러오지 못했습니다.")
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
  const providerSnapshot = selectedSnapshot?.latestObservation?.payload ?? null;
  const providerLogs = providerSnapshot?.logs ?? [];
  const capacityModeLabel = selectedArchitecture
    ? getLiveObservationCapacityMode(selectedArchitecture, providerSnapshot?.capacity)
    : null;
  const providerEvidence =
    providerSnapshot && capacityModeLabel
      ? getLiveObservationProviderEvidence(providerSnapshot, capacityModeLabel)
      : null;
  const operationalAnalysis = getLiveObservationOperationalAnalysis(
    providerSnapshot,
    selectedSnapshot?.live.pressureLevel ?? "normal"
  );
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
  const aiRecommendationText =
    aiRecommendation?.recommendations.find((recommendation) =>
      recommendation.includes("aws_appautoscaling_target.max_capacity")
    ) ??
    (isTrafficPressureElevated
      ? terraformUpdatePreview
        ? `aws_appautoscaling_target.max_capacity = ${terraformUpdatePreview.nextMaxCapacity}`
        : "aws_appautoscaling_target.max_capacity 수동 검토 필요"
      : operationalAnalysis.terraformAction);

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
    setAiRecommendation(null);
    setAiRecommendationState("idle");
    setAiRecommendationError("");
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
    if (!selectedArchitecture || !trafficIncidentSnapshot || !selectedSessionId) return;
    if (aiAnalysisSessionRef.current === selectedSessionId) return;

    const input = createLiveObservationDesignSimulationRequest(
      selectedArchitecture,
      trafficIncidentSnapshot
    );
    if (!input) return;

    let cancelled = false;
    aiAnalysisSessionRef.current = selectedSessionId;
    setAiRecommendation(null);
    setAiRecommendationState("loading");
    setAiRecommendationError("");
    void runAiDesignSimulation(input).then(
      (result) => {
        if (cancelled) return;
        setAiRecommendation(result);
        setAiRecommendationState("ready");
      },
      (error) => {
        if (cancelled) return;
        setAiRecommendationState("error");
        setAiRecommendationError(
          getApiErrorMessage(
            error,
            "AI 분석을 불러오지 못했습니다. 기본 Terraform 수정안을 표시합니다."
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
        setSelectionErrorMessage("선택한 CI/CD 실행과 연결된 인프라 배포를 관측할 수 없습니다.");
      } else if (
        !getSelectedLiveObservationOutputUrl(
          selection,
          exactDeployment.id,
          queries.reference.data.releases
        )
      ) {
        setSelectionErrorMessage("선택한 CI/CD 실행의 안전한 HTTPS 주소를 확인할 수 없습니다.");
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
      onError: () => {
        if (!abortController.signal.aborted) {
          setStreamErrorMessage("관측 상태 연결이 지연되고 있습니다. 자동으로 다시 연결합니다.");
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
        setErrorMessage(getApiErrorMessage(error, "관측 세션을 시작하지 못했습니다."));
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
        setErrorMessage(getApiErrorMessage(error, "관측 세션을 종료하지 못했습니다."));
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
      setErrorMessage("Output URL을 복사하지 못했습니다. 링크를 직접 열어주세요.");
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
    } catch (error) {
      if (!activeRef.current) return;
      setTerraformApplyError(
        error instanceof Error ? error.message : "Terraform Project Draft 수정에 실패했습니다."
      );
    } finally {
      if (activeRef.current) setTerraformApplyState("idle");
    }
  }

  if (!mounted) return null;

  const audienceUtility =
    audienceUrl && audienceUtilityOpen ? (
      <section
        aria-label="배포 Output URL 접속"
        className={styles.liveObservationAudienceUtility}
        id="live-observation-audience-utility"
      >
        <div>
          <span className={styles.liveObservationSectionLabel}>배포 Output URL</span>
          <strong>실제 배포 서비스 접속</strong>
          <p>QR 또는 링크로 선택한 배포의 Output URL에 접속합니다.</p>
          {selectedDeployment?.status === "PARTIALLY_FAILED" ||
          selectedDeployment?.status === "PARTIALLY_CANCELED" ? (
            <p className={styles.liveObservationFrontendWarning} role="status">
              API는 배포된 상태지만 현재 웹 화면은 이전 버전일 수 있습니다. CloudFront 주소와
              ALB/ECS 운영 지표는 계속 사용할 수 있습니다.
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
              Output URL 복사
            </button>
            <a href={audienceUrl} rel="noreferrer" target="_blank">
              새 창에서 열기 <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
        <div className={styles.liveObservationQr}>
          {qrState === "ready" && qrDataUrl ? (
            <img alt="배포 Output URL QR 코드" height={184} src={qrDataUrl} width={184} />
          ) : qrState === "error" ? (
            <span role="alert">QR 생성 실패</span>
          ) : (
            <span>QR 생성 중</span>
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
            <span className={styles.liveObservationEyebrow}>Live Observation</span>
            <h2 id="live-observation-title">배포 상태 관측</h2>
          </div>
          <div className={styles.liveObservationTargetBar}>
            <label>
              <span>Deployment</span>
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
                      ? "배포 기록 불러오는 중..."
                      : "관측 가능한 성공 배포가 없습니다."}
                  </option>
                ) : null}
                {eligibleDeployments.map((deployment) => (
                  <option key={deployment.id} value={deployment.id}>
                    {formatDeploymentOption(deployment)}
                  </option>
                ))}
              </select>
            </label>
            {selection ? (
              <span className={styles.liveObservationMuted}>
                CI/CD 실행 {selection.runId.slice(0, 8)} 기준
              </span>
            ) : null}
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
                    QR
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
              성공한 배포 기록을 확인하고 있습니다.
            </div>
          ) : null}
          {listState === "ready" && eligibleDeployments.length === 0 ? (
            <div className={styles.liveObservationMessage}>
              <strong>관측 가능한 성공 배포가 없습니다.</strong>
              <p>CloudFront Output URL과 AWS topology 검증이 완료된 Deployment가 필요합니다.</p>
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
              선택한 배포에 안전한 HTTPS Output URL이 없습니다.
            </div>
          ) : null}
          {selectedSession && !outputUrl ? (
            <div className={styles.liveObservationError} role="alert">
              이 관측 세션의 배포 Output URL을 안전하게 확인하지 못했습니다.
            </div>
          ) : null}

          {selectedArchitectureState === "loading" ? (
            <div className={styles.liveObservationMessage} role="status">
              배포 Architecture를 불러오고 있습니다.
            </div>
          ) : null}
          {isTrafficPressureElevated ? (
            <div className={styles.liveObservationError} role="alert">
              <strong>실시간 요청 급증 감지</strong>
              <p>
                수락 요청 {trafficIncidentSnapshot.live.acceptedEventCount}건 · 분당 환산{" "}
                {trafficIncidentSnapshot.live.projectedRequestsPerMinute}건 · 압력{" "}
                {trafficIncidentSnapshot.live.pressurePercent}%
              </p>
              <small>
                {providerSnapshot?.state === "available"
                  ? "CloudWatch 지표 확인됨"
                  : "CloudWatch 확인 대기 중"}
              </small>
            </div>
          ) : null}
          {appliedTerraformUpdate ? (
            <div className={styles.liveObservationMessage} role="status">
              <strong>Terraform 수정 완료 · 경고 해제</strong>
              <p>
                <code>{appliedTerraformUpdate.address}.max_capacity</code>{" "}
                {appliedTerraformUpdate.previousMaxCapacity} →{" "}
                {appliedTerraformUpdate.nextMaxCapacity}
              </p>
              <p>
                Project Draft 저장 완료. 재배포 후 정상 상태를 예상하며 실제 인프라는 아직 변경되지
                않았습니다.
              </p>
              <button
                className={styles.liveObservationSecondaryButton}
                onClick={onOpenTerraformEditor}
                type="button"
              >
                Terraform 편집기에서 확인
              </button>
            </div>
          ) : null}
          {selectedArchitectureState === "error" && selectedArchitectureErrorMessage ? (
            <div className={styles.liveObservationError} role="alert">
              {selectedArchitectureErrorMessage}
            </div>
          ) : null}
          {selectedArchitectureState === "ready" && selectedArchitecture ? (
            <LiveObservationFocusedFlow
              architecture={selectedArchitecture}
              key={`focused-${selectedDeploymentId}`}
              snapshot={selectedSnapshot}
            />
          ) : null}

          {selectedDeployment ? (
            <details
              aria-label="실시간 운영 분석"
              open={isTrafficPressureElevated}
              className={styles.liveObservationMetricsSection}
            >
              <summary className={styles.liveObservationMetricsHeader}>
                <div>
                  <span className={styles.liveObservationSectionLabel}>운영 분석</span>
                  <h3>운영 분석</h3>
                </div>
                <span data-status={selectedSnapshot?.status ?? "idle"}>
                  {selectedSnapshot?.status === "active" ? "LIVE" : "관측 대기"}
                </span>
              </summary>
              <div className={styles.liveObservationAnalysisGrid}>
                <article
                  className={styles.liveObservationAnalysisStatus}
                  data-analysis-state={operationalAnalysis.state}
                >
                  <span>현재 인프라 상태</span>
                  <strong>{operationalAnalysis.stateLabel}</strong>
                  <small>
                    요청 {selectedSnapshot?.live.acceptedEventCount ?? "—"} ·{" "}
                    {selectedSnapshot
                      ? `${selectedSnapshot.live.rollingRequestsPerSecond.toFixed(1)} 요청/초`
                      : "—"}{" "}
                    · {providerEvidence?.stateLabel ?? "수집 대기"}
                  </small>
                </article>
                <article>
                  <span>용량 및 스케일링</span>
                  <strong>{operationalAnalysis.capacity}</strong>
                  <small>
                    실행 / 희망 / 최대 · {capacityModeLabel ?? "확인 중"} · 확장 이력{" "}
                    {operationalAnalysis.scaleEventCount}건
                  </small>
                </article>
                <article>
                  <span>병목과 장애</span>
                  <strong>{operationalAnalysis.bottleneckDetail}</strong>
                  <small>오류율 · p95 · 비정상 Task</small>
                </article>
                <article>
                  <span>비용 영향</span>
                  <strong>{operationalAnalysis.costImpact}</strong>
                  <small>{operationalAnalysis.costDetail}</small>
                </article>
                <article className={styles.liveObservationAnalysisRecommendation}>
                  <div>
                    <span>AI 개선 권장사항</span>
                    <strong>{aiRecommendationText}</strong>
                    {aiRecommendationState === "loading" ? (
                      <small>실시간 지표와 배포 Architecture를 AI가 분석하고 있습니다.</small>
                    ) : null}
                    {aiRecommendationState === "error" ? (
                      <small role="alert">{aiRecommendationError}</small>
                    ) : null}
                    <WorkspaceAiExplanation explanation={aiRecommendation?.llmExplanation} />
                  </div>
                  <button
                    className={styles.liveObservationSecondaryButton}
                    disabled={
                      !trafficIncidentSnapshot ||
                      terraformApplyState === "loading" ||
                      appliedTerraformUpdate !== null
                    }
                    onClick={() => void applyTerraformUpdate()}
                    type="button"
                  >
                    {appliedTerraformUpdate
                      ? "Terraform 수정 완료"
                      : terraformApplyState === "loading"
                        ? "Project Draft 저장 중..."
                        : "Terraform 수정 적용"}
                  </button>
                  <small>
                    Project Draft만 수정 · 자동 배포하지 않음 ·{" "}
                    {operationalAnalysis.terraformAction}
                  </small>
                </article>
              </div>
            </details>
          ) : null}
          {providerLogs.length > 0 ? (
            <details className={styles.liveObservationLogs}>
              <summary>최근 런타임 로그 {providerLogs.length}건</summary>
              <ol>
                {providerLogs.map((entry, index) => (
                  <li key={`${entry.timestamp}-${index}`}>
                    <time dateTime={entry.timestamp}>{formatTimestamp(entry.timestamp)}</time>
                    <code>{entry.message}</code>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </main>

        {selectedSession ? (
          <footer className={styles.liveObservationControlRail}>
            <div className={styles.liveObservationControlActivity}>
              <span className={styles.liveObservationSectionLabel}>세션</span>
              <strong>
                {selectedSnapshot?.status === "active" ? "요청 수집 중" : "수집 종료"}
              </strong>
              <span className={styles.liveObservationMuted}>
                {selectedSnapshot?.terminalAt
                  ? formatTimestamp(selectedSnapshot.terminalAt)
                  : "종료 시각 없음"}
              </span>
            </div>
            <div className={styles.liveObservationControlActions}>
              <button
                className={styles.liveObservationDangerButton}
                disabled={!isSessionActive || requestState === "loading"}
                onClick={() => void endSession()}
                type="button"
              >
                세션 종료
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
    return "이 배포의 Architecture를 찾을 수 없습니다.";
  }

  return getApiErrorMessage(error, "배포 Architecture를 불러오지 못했습니다.");
}

function formatDeploymentOption(deployment: Deployment): string {
  const completedAt = deployment.completedAt
    ? new Date(deployment.completedAt).toLocaleString("ko-KR", {
        dateStyle: "short",
        timeStyle: "short"
      })
    : "완료 시각 없음";
  const state = deployment.status === "SUCCESS" ? "성공" : "웹 부분 상태";
  return `${completedAt} · ${deployment.id.slice(0, 8)} · ${state}`;
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
