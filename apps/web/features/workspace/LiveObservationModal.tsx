"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ApplicationRelease,
  Deployment,
  LiveObservationV2Session,
  LiveObservationV2Snapshot
} from "@sketchcatch/types";
import { Check, Copy, ExternalLink, Radio, X } from "lucide-react";
import QRCode from "qrcode";
import { createPortal } from "react-dom";
import { getApiErrorMessage } from "../../lib/api-client";
import {
  createLiveObservation,
  listApplicationReleases,
  listDeployments,
  stopLiveObservation,
  streamLiveObservationSnapshots
} from "./api";
import {
  getEligibleLiveObservationDeployments,
  getLiveObservationOutputUrl,
  getLiveObservationProviderEvidence,
  getLiveObservationPressureLabel
} from "./live-observation";
import styles from "./workspace.module.css";

export type LiveObservationModalProps = {
  readonly onClose: () => void;
  readonly projectId: string;
};

export function LiveObservationModal({ onClose, projectId }: LiveObservationModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const activeRef = useRef(false);
  const operationControllerRef = useRef<AbortController | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [releases, setReleases] = useState<ApplicationRelease[]>([]);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState("");
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [requestState, setRequestState] = useState<"idle" | "loading">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [streamErrorMessage, setStreamErrorMessage] = useState("");
  const [session, setSession] = useState<LiveObservationV2Session | null>(null);
  const [snapshot, setSnapshot] = useState<LiveObservationV2Snapshot | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrState, setQrState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [copied, setCopied] = useState(false);
  const [audienceUtilityOpen, setAudienceUtilityOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const eligibleDeployments = useMemo(
    () => getEligibleLiveObservationDeployments(deployments),
    [deployments]
  );
  const selectedDeployment = eligibleDeployments.find(
    (deployment) => deployment.id === selectedDeploymentId
  );
  const selectedOutputUrl = getLiveObservationOutputUrl(selectedDeploymentId, releases);
  const outputUrl = session
    ? getLiveObservationOutputUrl(session.deploymentId, releases)
    : null;
  const remainingSeconds = session
    ? Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - nowMs) / 1_000))
    : 0;
  const isSessionActive =
    session !== null && snapshot?.status === "active" && remainingSeconds > 0;
  const visibleErrorMessage = errorMessage || streamErrorMessage;
  const providerSnapshot = snapshot?.latestObservation?.payload ?? null;
  const providerEvidence = providerSnapshot
    ? getLiveObservationProviderEvidence(providerSnapshot)
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
    const abortController = new AbortController();
    setListState("loading");
    setErrorMessage("");

    void Promise.all([
      listDeployments(projectId, { signal: abortController.signal }),
      listApplicationReleases(projectId)
    ])
      .then(([items, releaseItems]) => {
        if (abortController.signal.aborted) return;
        const eligible = getEligibleLiveObservationDeployments(items);
        setDeployments(items);
        setReleases(releaseItems);
        setSelectedDeploymentId((current) =>
          eligible.some((deployment) => deployment.id === current)
            ? current
            : eligible[0]?.id ?? ""
        );
        setListState("ready");
      })
      .catch((error) => {
        if (abortController.signal.aborted) return;
        setListState("error");
        setErrorMessage(getApiErrorMessage(error, "배포 기록을 불러오지 못했습니다."));
      });

    return () => abortController.abort();
  }, [projectId]);

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
    if (!session) {
      setStreamErrorMessage("");
      return;
    }

    const abortController = new AbortController();
    setStreamErrorMessage("");
    void streamLiveObservationSnapshots({
      deploymentId: session.deploymentId,
      observationId: session.id,
      onError: () => {
        if (!abortController.signal.aborted) {
          setStreamErrorMessage("관측 상태 연결이 지연되고 있습니다. 자동으로 다시 연결합니다.");
        }
      },
      onSnapshot: (nextSnapshot) => {
        if (!abortController.signal.aborted) {
          setSnapshot(nextSnapshot);
          setStreamErrorMessage("");
        }
      },
      signal: abortController.signal
    });
    return () => abortController.abort();
  }, [session]);

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
      setSession(response.session);
      setSnapshot(response.snapshot);
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
      if (!abortController.signal.aborted) setSnapshot(stoppedSnapshot);
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
      await navigator.clipboard.writeText(outputUrl);
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
        data-pressure-level={snapshot?.live.pressureLevel ?? "normal"}
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
                disabled={isSessionActive || listState !== "ready"}
                onChange={(event) => setSelectedDeploymentId(event.target.value)}
                value={selectedDeploymentId}
              >
                {eligibleDeployments.map((deployment) => (
                  <option key={deployment.id} value={deployment.id}>
                    {formatDeploymentOption(deployment)}
                  </option>
                ))}
              </select>
            </label>
            <div
              className={styles.liveObservationSessionStatus}
              data-status={snapshot?.status ?? "ready"}
            >
              <Radio size={15} aria-hidden="true" />
              <span>{getSessionStatusLabel(snapshot, remainingSeconds)}</span>
              {session ? <strong>{formatRemainingTime(remainingSeconds)}</strong> : null}
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
              {session && outputUrl ? (
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

        {session && outputUrl && audienceUtilityOpen ? (
          <section
            aria-label="배포 Output URL 접속"
            className={styles.liveObservationAudienceUtility}
            id="live-observation-audience-utility"
          >
            <div>
              <span className={styles.liveObservationSectionLabel}>배포 Output URL</span>
              <strong>실제 배포 서비스 접속</strong>
              <p>QR 또는 링크로 선택한 배포의 Output URL에 접속합니다.</p>
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
              <p>Output URL과 연결 검증이 완료된 Deployment가 필요합니다.</p>
            </div>
          ) : null}
          {visibleErrorMessage ? (
            <div className={styles.liveObservationError} role="alert">{visibleErrorMessage}</div>
          ) : null}
          {!session && selectedDeployment && !selectedOutputUrl ? (
            <div className={styles.liveObservationError} role="alert">
              선택한 배포에 안전한 HTTPS Output URL이 없습니다.
            </div>
          ) : null}
          {session && !outputUrl ? (
            <div className={styles.liveObservationError} role="alert">
              이 관측 세션의 배포 Output URL을 안전하게 확인하지 못했습니다.
            </div>
          ) : null}

          {snapshot ? (
            <section className={styles.liveObservationEvidenceRail} aria-label="관측 근거">
              <div data-source="browser">
                <span>수락 요청</span>
                <strong>{snapshot.live.acceptedEventCount}</strong>
                <p>공개 요청 API가 수락한 요청</p>
              </div>
              <div data-source="runtime">
                <span>현재 요청률</span>
                <strong>{snapshot.live.rollingRequestsPerSecond.toFixed(1)} req/s</strong>
                <p>{getLiveObservationPressureLabel(snapshot.live.pressureLevel)}</p>
              </div>
              <div data-source="aws">
                <span>요청</span>
                <strong>{providerEvidence?.requests ?? "—"}</strong>
                <p>CloudWatch ALB RequestCount</p>
                <small>{providerEvidence?.stateLabel ?? "수집 대기"}</small>
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
                <span>용량</span>
                <strong>{providerEvidence?.capacity ?? "—"}</strong>
                <p>정상 / 실행 / 최대</p>
              </div>
            </section>
          ) : (
            <div className={styles.liveObservationIntro}>
              <div>
                <strong>관측은 명시적으로 시작됩니다.</strong>
                <p>세션 생성 전에 Deployment의 Output URL과 연결 상태를 검증합니다.</p>
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

        {session ? (
          <footer className={styles.liveObservationControlRail}>
            <div className={styles.liveObservationControlActivity}>
              <span className={styles.liveObservationSectionLabel}>세션</span>
              <strong>{snapshot?.status === "active" ? "요청 수집 중" : "수집 종료"}</strong>
              <span className={styles.liveObservationMuted}>
                {snapshot?.terminalAt ? formatTimestamp(snapshot.terminalAt) : "종료 시각 없음"}
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

function formatDeploymentOption(deployment: Deployment): string {
  const completedAt = deployment.completedAt
    ? new Date(deployment.completedAt).toLocaleString("ko-KR", {
        dateStyle: "short",
        timeStyle: "short"
      })
    : "완료 시각 없음";
  return `${completedAt} · ${deployment.id.slice(0, 8)}`;
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
