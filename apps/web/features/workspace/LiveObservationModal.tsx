"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Deployment,
  LiveObservationV2Session,
  LiveObservationV2Snapshot
} from "@sketchcatch/types";
import { Check, Copy, ExternalLink, Radio, X } from "lucide-react";
import QRCode from "qrcode";
import { createPortal } from "react-dom";
import { copyTextToClipboard } from "../../lib/clipboard";
import { ApiClientError, getApiErrorMessage } from "../../lib/api-client";
import {
  createLiveObservation,
  stopLiveObservation,
  streamLiveObservationSnapshots
} from "./api";
import {
  getEligibleLiveObservationDeployments,
  getSelectedLiveObservationOutputUrl,
  getLiveObservationProviderEvidence,
  getLiveObservationPressureLabel,
  type LiveObservationSelection
} from "./live-observation";
import { getLiveObservationCapacityMode } from "./live-observation-architecture";
import { useLiveObservationQueries } from "./live-observation-queries";
import type { LiveObservationViewport } from "./live-observation-view-state";
import { LiveObservationDiagramMap } from "./LiveObservationDiagramMap";
import styles from "./workspace.module.css";

export type LiveObservationModalProps = {
  readonly initialViewport: LiveObservationViewport | null;
  readonly onClose: () => void;
  readonly onSessionChange: (session: LiveObservationV2Session | null) => void;
  readonly onSelectedDeploymentIdChange: (deploymentId: string) => void;
  readonly onSnapshotChange: (snapshot: LiveObservationV2Snapshot | null) => void;
  readonly onViewportChange: (viewport: LiveObservationViewport) => void;
  readonly projectId: string;
  readonly selectedDeploymentId: string;
  readonly session: LiveObservationV2Session | null;
  readonly selection?: LiveObservationSelection | null | undefined;
  readonly snapshot: LiveObservationV2Snapshot | null;
};

export function LiveObservationModal({
  initialViewport,
  onClose,
  onSessionChange,
  onSelectedDeploymentIdChange,
  onSnapshotChange,
  onViewportChange,
  projectId,
  selectedDeploymentId,
  session,
  selection,
  snapshot
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
  const [audienceUtilityOpen, setAudienceUtilityOpen] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
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
  const selectedSession =
    session?.deploymentId === selectedDeploymentId ? session : null;
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
    ? Math.max(
        0,
        Math.ceil((new Date(selectedSession.expiresAt).getTime() - nowMs) / 1_000)
      )
    : 0;
  const isSessionActive =
    selectedSession !== null && selectedSnapshot?.status === "active" && remainingSeconds > 0;
  const visibleErrorMessage =
    errorMessage ||
    selectionErrorMessage ||
    referenceErrorMessage ||
    outputErrorMessage ||
    streamErrorMessage;
  const providerSnapshot = selectedSnapshot?.latestObservation?.payload ?? null;
  const capacityModeLabel = selectedArchitecture
    ? getLiveObservationCapacityMode(selectedArchitecture, providerSnapshot?.capacity)
    : null;
  const providerEvidence = providerSnapshot && capacityModeLabel
    ? getLiveObservationProviderEvidence(providerSnapshot, capacityModeLabel)
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
    if (!queries.reference.data) return;

    const eligible = getEligibleLiveObservationDeployments(
      queries.reference.data.deployments
    );
    if (selection) {
      const exactDeployment = eligible.find(
        (deployment) => deployment.id === selection.deploymentId
      );
      const targetDeploymentId = exactDeployment?.id ?? "";
      if (targetDeploymentId !== selectedDeploymentId) {
        onSelectedDeploymentIdChange(targetDeploymentId);
      }
      if (!exactDeployment) {
        setSelectionErrorMessage(
          "선택한 CI/CD 실행과 연결된 인프라 배포를 관측할 수 없습니다."
        );
      } else if (
        !getSelectedLiveObservationOutputUrl(
          selection,
          exactDeployment.id,
          queries.reference.data.releases
        )
      ) {
        setSelectionErrorMessage(
          "선택한 CI/CD 실행의 안전한 HTTPS 주소를 확인할 수 없습니다."
        );
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
      : eligible[0]?.id ?? "";
    if (fallbackDeploymentId !== selectedDeploymentId) {
      onSelectedDeploymentIdChange(fallbackDeploymentId);
    }
  }, [
    onSelectedDeploymentIdChange,
    queries.reference.data,
    selectedDeploymentId,
    selection
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!outputUrl) {
      setQrDataUrl("");
      setQrState("idle");
      return;
    }

    let cancelled = false;
    setQrDataUrl("");
    setQrState("loading");
    void QRCode.toDataURL(outputUrl, {
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
  }, [outputUrl]);

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
      const response = await createLiveObservation(
        selectedDeploymentId,
        abortController.signal
      );
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
    if (!outputUrl) return;
    try {
      await copyTextToClipboard(outputUrl);
      if (!activeRef.current) return;
      setCopied(true);
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      if (!activeRef.current) return;
      setErrorMessage("Output URL을 복사하지 못했습니다. 링크를 직접 열어주세요.");
    }
  }

  if (!mounted) return null;

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
                  Boolean(selection) ||
                  requestState === "loading" ||
                  isSessionActive ||
                  listState !== "ready"
                }
                onChange={(event) => selectDeployment(event.target.value)}
                value={selectedDeploymentId}
              >
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
              {selectedSession ? <strong>{formatRemainingTime(remainingSeconds)}</strong> : null}
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
              >관측 시작</button>
              {outputUrl ? (
                <button
                  aria-controls="live-observation-audience-utility"
                  aria-expanded={audienceUtilityOpen}
                  className={styles.liveObservationSecondaryButton}
                  onClick={() => setAudienceUtilityOpen((open) => !open)}
                  type="button"
                >QR</button>
              ) : null}
            </div>
          </div>
          <button
            aria-label="실시간 관측 닫기"
            className={styles.liveObservationCloseButton}
            onClick={closeModal}
            ref={closeButtonRef}
            type="button"
          ><X size={20} aria-hidden="true" /></button>
        </header>

        {outputUrl && audienceUtilityOpen ? (
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
                  API는 배포된 상태지만 현재 웹 화면은 이전 버전일 수 있습니다. CloudFront
                  주소와 ALB/ECS 운영 지표는 계속 사용할 수 있습니다.
                </p>
              ) : null}
              <div className={styles.liveObservationAudienceUtilityActions}>
                <button
                  className={styles.liveObservationSecondaryButton}
                  onClick={() => void copyOutputUrl()}
                  type="button"
                >
                  {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                  Output URL 복사
                </button>
                <a href={outputUrl} rel="noreferrer" target="_blank">
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
        ) : null}

        <main className={styles.liveObservationBody}>
          {listState === "loading" ? (
            <div className={styles.liveObservationMessage}>성공한 배포 기록을 확인하고 있습니다.</div>
          ) : null}
          {listState === "ready" && eligibleDeployments.length === 0 ? (
            <div className={styles.liveObservationMessage}>
              <strong>관측 가능한 성공 배포가 없습니다.</strong>
              <p>CloudFront Output URL과 AWS topology 검증이 완료된 Deployment가 필요합니다.</p>
            </div>
          ) : null}
          {visibleErrorMessage ? (
            <div className={styles.liveObservationError} role="alert">{visibleErrorMessage}</div>
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
          {selectedArchitectureState === "error" && selectedArchitectureErrorMessage ? (
            <div className={styles.liveObservationError} role="alert">
              {selectedArchitectureErrorMessage}
            </div>
          ) : null}
          {selectedArchitectureState === "ready" && selectedArchitecture ? (
            <LiveObservationDiagramMap
              architecture={selectedArchitecture}
              initialViewport={initialViewport}
              key={selectedDeploymentId}
              onViewportChange={onViewportChange}
              snapshot={selectedSnapshot}
            />
          ) : null}

          {selectedSnapshot ? (
            <section className={styles.liveObservationEvidenceRail} aria-label="관측 근거">
              <div data-source="browser">
                <span>수락 요청</span>
                <strong>{selectedSnapshot.live.acceptedEventCount}</strong>
                <p>공개 요청 API가 수락한 요청</p>
              </div>
              <div data-source="runtime">
                <span>현재 요청률</span>
                <strong>{selectedSnapshot.live.rollingRequestsPerSecond.toFixed(1)} req/s</strong>
                <p>{getLiveObservationPressureLabel(selectedSnapshot.live.pressureLevel)}</p>
              </div>
              <div data-source="aws">
                <span>요청</span>
                <strong>{providerEvidence?.requests ?? "—"}</strong>
                <p>CloudWatch ALB RequestCount</p>
                <small>공개 경로 CloudFront · {providerEvidence?.stateLabel ?? "수집 대기"}</small>
              </div>
              <div data-source="aws">
                <span>오류율</span>
                <strong>{providerEvidence?.errorRate ?? "—"}</strong>
                <p>Target 5xx 기준</p>
              </div>
              <div data-source="aws">
                <span>p95 지연</span>
                <strong>{providerEvidence?.p95Latency ?? "—"}</strong>
                <p>TargetResponseTime p95</p>
              </div>
              <div data-source="aws">
                <span>가용성</span>
                <strong>{providerEvidence?.availability ?? "—"}</strong>
                <p>RequestCount와 Target 5xx 기반</p>
              </div>
              <div data-source="aws">
                <span>{providerEvidence?.capacityModeLabel ?? "용량"}</span>
                <strong>{providerEvidence?.capacity ?? "—"}</strong>
                <p>{providerEvidence?.capacityDetailLabel ?? "수집 대기"}</p>
              </div>
            </section>
          ) : (
            <div className={styles.liveObservationIntro}>
              <div>
                <strong>관측은 명시적으로 시작됩니다.</strong>
                <p>
                  세션 생성 전에 CloudFront → S3/ALB → ECS 연결 상태를 AWS에서 다시
                  검증합니다.
                </p>
              </div>
            </div>
          )}
          {providerSnapshot && providerSnapshot.logs.length > 0 ? (
            <details className={styles.liveObservationLogs}>
              <summary>최근 런타임 로그 {providerSnapshot.logs.length}건</summary>
              <ol>
                {providerSnapshot.logs.map((entry, index) => (
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
              <strong>{selectedSnapshot?.status === "active" ? "요청 수집 중" : "수집 종료"}</strong>
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
              >세션 종료</button>
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
