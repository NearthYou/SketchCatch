"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Deployment,
  DesignSimulationResult,
  DiagramJson,
  LiveObservationSession,
  LiveObservationSnapshot
} from "@sketchcatch/types";
import {
  Check,
  Copy,
  ExternalLink,
  Radio,
  Square,
  Timer,
  ToggleLeft,
  ToggleRight,
  X
} from "lucide-react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { getApiErrorMessage } from "../../lib/api-client";
import type { LiveObservationSignalMapBurst } from "./LiveObservationSignalMap";
import { LiveObservationDiagramMap } from "./LiveObservationDiagramMap";
import { WorkspaceAiDesignSimulationResult } from "./WorkspaceAiPanelPieces";
import {
  createLiveObservation,
  listDeployments,
  pollLiveObservationSnapshots,
  runAiDesignSimulation,
  stopLiveObservation,
  streamLiveObservationSnapshots
} from "./api";
import {
  clearMockRequestFlowBurst,
  createInitialMockRequestFlowState,
  replayMockRequestFlow
} from "./live-observation-mock-preview";
import {
  getLiveObservationDiagramBurstLifetimeMs
} from "./live-observation-diagram-particles";
import { getLiveObservationDiagramSegmentCount } from "./live-observation-diagram";
import {
  createPresenterTrafficBoost,
  getEligibleLiveObservationDeployments,
  getLiveObservationInstanceMarkers,
  getLiveObservationPressureLabel,
  getLiveObservationRequestBurst,
  type PresenterTrafficBoostController,
  type PresenterTrafficBoostProgress
} from "./live-observation";
import { createWorkspaceAiBoardSnapshot } from "./workspace-ai-panel-state";
import styles from "./workspace.module.css";

export type LiveObservationModalProps = {
  readonly diagramJson: DiagramJson;
  readonly onClose: () => void;
  readonly projectId: string;
};

const EMPTY_BOOST_PROGRESS: PresenterTrafficBoostProgress = {
  acceptedReceipts: 0,
  attemptedRequests: 0,
  inFlightRequests: 0,
  receiptFailures: 0,
  running: false,
  successfulTrafficRequests: 0,
  trafficFailures: 0
};

const SHOW_MOCK_ANIMATION_PREVIEW = process.env.NODE_ENV === "development";
const LIVE_OBSERVATION_TRANSPORT =
  process.env.NEXT_PUBLIC_LIVE_OBSERVATION_TRANSPORT === "polling"
    ? "polling"
    : "stream";
const LIVE_OBSERVATION_POLL_INTERVAL_MS = 2_000;
const DESIGN_SIMULATION_DEFAULTS = {
  budgetLevel: "normal",
  expectedUserCount: 1000,
  period: "month",
  region: "ap-northeast-2",
  trafficLevel: "normal"
} as const;

export function LiveObservationModal({
  diagramJson,
  onClose,
  projectId
}: LiveObservationModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const boostControllerRef = useRef<PresenterTrafficBoostController | null>(null);
  const acceptedEventCountRef = useRef<{
    readonly count: number;
    readonly observationId: string;
  } | null>(null);
  const requestBurstSequenceRef = useRef(0);
  const [mounted, setMounted] = useState(false);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [designSimulation, setDesignSimulation] = useState<DesignSimulationResult | null>(null);
  const [designSimulationState, setDesignSimulationState] =
    useState<"loading" | "ready" | "error">("loading");
  const [designSimulationError, setDesignSimulationError] = useState("");
  const [isAiSimulationVisible, setAiSimulationVisible] = useState(true);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState("");
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [requestState, setRequestState] = useState<"idle" | "loading">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [streamErrorMessage, setStreamErrorMessage] = useState("");
  const [session, setSession] = useState<LiveObservationSession | null>(null);
  const [snapshot, setSnapshot] = useState<LiveObservationSnapshot | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrState, setQrState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [copied, setCopied] = useState(false);
  const [audienceUtilityOpen, setAudienceUtilityOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [boostProgress, setBoostProgress] = useState(EMPTY_BOOST_PROGRESS);
  const [requestFlowBurst, setRequestFlowBurst] = useState<LiveObservationSignalMapBurst | null>(null);
  const [mockRequestFlowState, setMockRequestFlowState] = useState(
    createInitialMockRequestFlowState
  );
  const mockRequestFlowBurst = mockRequestFlowState.burst;
  const boardSnapshot = useMemo(
    () => createWorkspaceAiBoardSnapshot(diagramJson),
    [diagramJson]
  );
  const observationDiagramSegmentCount = useMemo(
    () => getLiveObservationDiagramSegmentCount(diagramJson),
    [diagramJson]
  );

  const eligibleDeployments = useMemo(
    () => getEligibleLiveObservationDeployments(deployments),
    [deployments]
  );
  const selectedDeployment = eligibleDeployments.find(
    (deployment) => deployment.id === selectedDeploymentId
  );
  const remainingSeconds = session
    ? Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - nowMs) / 1_000))
    : 0;
  const isSessionActive =
    session !== null && snapshot?.status === "active" && remainingSeconds > 0;
  const visibleErrorMessage = errorMessage || streamErrorMessage;
  const instanceMarkers = useMemo(
    () => getLiveObservationInstanceMarkers(snapshot),
    [snapshot]
  );
  const inServiceInstanceKeys = instanceMarkers
    .filter((instance) => instance.state === "in-service")
    .map((instance) => instance.key)
    .slice(0, 2);
  const showDevelopmentMockMap =
    SHOW_MOCK_ANIMATION_PREVIEW && mockRequestFlowState.visible && !session;
  const displayedSnapshot = showDevelopmentMockMap
    ? mockRequestFlowState.snapshot
    : snapshot;
  const mapBurst = showDevelopmentMockMap
    ? mockRequestFlowBurst
    : requestFlowBurst;

  useEffect(() => {
    if (!snapshot) {
      acceptedEventCountRef.current = null;
      setRequestFlowBurst(null);
      return;
    }

    const previousCount = acceptedEventCountRef.current;
    acceptedEventCountRef.current = {
      count: snapshot.live.acceptedEventCount,
      observationId: snapshot.observationId
    };

    if (!previousCount || previousCount.observationId !== snapshot.observationId) {
      setRequestFlowBurst(null);
      return;
    }

    const hasActualInServiceInstance = inServiceInstanceKeys.length > 0;
    const burst = getLiveObservationRequestBurst(
      previousCount.count,
      snapshot.live.acceptedEventCount,
      hasActualInServiceInstance
    );

    if (!burst) {
      return;
    }

    requestBurstSequenceRef.current += 1;
    setRequestFlowBurst({
      ...burst,
      sequence: requestBurstSequenceRef.current
    });
  }, [snapshot]);

  useEffect(() => {
    if (!requestFlowBurst) {
      return;
    }

    const sequence = requestFlowBurst.sequence;
    const burstLifetimeMs = getLiveObservationDiagramBurstLifetimeMs(
      observationDiagramSegmentCount,
      requestFlowBurst.visibleParticleCount
    );
    const timer = window.setTimeout(() => {
      setRequestFlowBurst((current) =>
        current?.sequence === sequence ? null : current
      );
    }, burstLifetimeMs);

    return () => window.clearTimeout(timer);
  }, [observationDiagramSegmentCount, requestFlowBurst]);

  useEffect(() => {
    if (!mockRequestFlowBurst) {
      return;
    }

    const sequence = mockRequestFlowBurst.sequence;
    const burstLifetimeMs = getLiveObservationDiagramBurstLifetimeMs(
      observationDiagramSegmentCount,
      mockRequestFlowBurst.visibleParticleCount
    );
    const timer = window.setTimeout(() => {
      setMockRequestFlowState((current) =>
        clearMockRequestFlowBurst(current, sequence)
      );
    }, burstLifetimeMs);

    return () => window.clearTimeout(timer);
  }, [mockRequestFlowBurst, observationDiagramSegmentCount]);

  useEffect(() => {
    if (!SHOW_MOCK_ANIMATION_PREVIEW || session || !mockRequestFlowState.snapshot) {
      return;
    }

    setSnapshot(mockRequestFlowState.snapshot);
  }, [mockRequestFlowState.snapshot, session]);

  useEffect(() => {
    setMounted(true);
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      boostControllerRef.current?.stop();
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setListState("loading");
    setErrorMessage("");

    void listDeployments(projectId)
      .then((items) => {
        if (cancelled) {
          return;
        }
        const eligible = getEligibleLiveObservationDeployments(items);
        setDeployments(items);
        setSelectedDeploymentId((current) =>
          eligible.some((deployment) => deployment.id === current)
            ? current
            : eligible[0]?.id ?? ""
        );
        setListState("ready");
      })
      .catch((error) => {
        if (!cancelled) {
          setListState("error");
          setErrorMessage(getApiErrorMessage(error, "배포 기록을 불러오지 못했습니다."));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setDesignSimulation(null);
    setDesignSimulationError("");

    if (!boardSnapshot.hasResources) {
      setDesignSimulationState("error");
      setDesignSimulationError("현재 보드에 시뮬레이션할 리소스가 없습니다.");
      return undefined;
    }

    setDesignSimulationState("loading");
    void runAiDesignSimulation({
      architectureJson: boardSnapshot.architectureJson,
      ...DESIGN_SIMULATION_DEFAULTS
    })
      .then((result) => {
        if (!cancelled) {
          setDesignSimulation(result);
          setDesignSimulationState("ready");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDesignSimulationState("error");
          setDesignSimulationError(
            getApiErrorMessage(error, "설계 시뮬레이션 결과를 불러오지 못했습니다.")
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [boardSnapshot]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session) {
      setQrDataUrl("");
      setQrState("idle");
      return;
    }

    let cancelled = false;
    setQrDataUrl("");
    setQrState("loading");
    void QRCode.toDataURL(session.audienceUrl, {
      color: { dark: "#171717", light: "#ffffff" },
      errorCorrectionLevel: "M",
      margin: 1,
      width: 184
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
          setQrState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl("");
          setQrState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      setStreamErrorMessage("");
      return;
    }

    setStreamErrorMessage("");
    const abortController = new AbortController();
    if (LIVE_OBSERVATION_TRANSPORT === "polling") {
      void pollLiveObservationSnapshots({
        deploymentId: session.deploymentId,
        intervalMs: LIVE_OBSERVATION_POLL_INTERVAL_MS,
        observationId: session.id,
        onError: () => {
          setStreamErrorMessage(
            "?ㅼ떆媛??곌껐??吏?곕릺怨??덉뒿?덈떎. 理쒖떊 ?곹깭瑜??ㅼ떆 ?곌껐?⑸땲??"
          );
        },
        onSnapshot: (nextSnapshot) => {
          setSnapshot(nextSnapshot);
          setStreamErrorMessage("");
        },
        signal: abortController.signal
      });
    } else {
      void streamLiveObservationSnapshots({
        deploymentId: session.deploymentId,
        observationId: session.id,
        onError: () => {
          setStreamErrorMessage(
          "실시간 연결이 지연되고 있습니다. 최신 상태를 다시 연결합니다."
          );
        },
        onSnapshot: (nextSnapshot) => {
          setSnapshot(nextSnapshot);
          setStreamErrorMessage("");
        },
        signal: abortController.signal
      });
    }

    return () => abortController.abort();
  }, [session]);

  useEffect(() => {
    if (!isSessionActive) {
      boostControllerRef.current?.stop();
    }
  }, [isSessionActive]);

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

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
    boostControllerRef.current?.stop();
    onClose();
  }

  async function startObservation(): Promise<void> {
    if (!selectedDeploymentId || requestState === "loading") {
      return;
    }

    setRequestState("loading");
    setErrorMessage("");
    try {
      const response = await createLiveObservation(selectedDeploymentId);
      setSession(response.session);
      setSnapshot(response.snapshot);
      setNowMs(Date.now());
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "관측 세션을 시작하지 못했습니다."));
    } finally {
      setRequestState("idle");
    }
  }

  function startBoost(): void {
    if (!session || !isSessionActive || boostProgress.running) {
      return;
    }

    const controller = createPresenterTrafficBoost(session, {
      onProgress: setBoostProgress
    });
    boostControllerRef.current = controller;
    controller.start();
  }

  function startTrafficLoad(): void {
    if (showDevelopmentMockMap && !session) {
      setMockRequestFlowState(replayMockRequestFlow);
      return;
    }

    startBoost();
  }

  function stopBoost(): void {
    boostControllerRef.current?.stop();
  }

  async function endSession(): Promise<void> {
    if (!session || requestState === "loading") {
      return;
    }

    stopBoost();
    setRequestState("loading");
    setErrorMessage("");
    try {
      const stoppedSnapshot = await stopLiveObservation(session.deploymentId, session.id);
      setSnapshot(stoppedSnapshot);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "관측 세션을 종료하지 못했습니다."));
    } finally {
      setRequestState("idle");
    }
  }

  async function copyAudienceUrl(): Promise<void> {
    if (!session) {
      return;
    }

    try {
      await navigator.clipboard.writeText(session.audienceUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setErrorMessage("관객 URL을 복사하지 못했습니다. 링크를 직접 열어주세요.");
    }
  }

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      className={styles.liveObservationOverlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeModal();
        }
      }}
    >
      <div
        aria-labelledby="live-observation-title"
        aria-modal="true"
        className={styles.liveObservationDialog}
        data-pressure-level={displayedSnapshot?.live.pressureLevel ?? "normal"}
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <header className={styles.liveObservationHeader}>
          <div className={styles.liveObservationHeaderIdentity}>
            <span className={styles.liveObservationEyebrow}>Live Observation</span>
            <h2 id="live-observation-title">실시간 트래픽 관측</h2>
          </div>

          <div className={styles.liveObservationTargetBar}>
            <label>
              <span>관측 대상 Deployment</span>
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
                disabled={!selectedDeployment || requestState === "loading" || isSessionActive}
                onClick={() => void startObservation()}
                type="button"
              >관측 시작</button>
              {session ? (
                <button
                  aria-controls="live-observation-audience-utility"
                  aria-expanded={audienceUtilityOpen}
                  className={styles.liveObservationSecondaryButton}
                  onClick={() => setAudienceUtilityOpen((open) => !open)}
                  type="button"
                >QR access</button>
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

        {session && audienceUtilityOpen ? (
          <section
            aria-label="관객 접속"
            className={styles.liveObservationAudienceUtility}
            id="live-observation-audience-utility"
          >
            <div>
              <span className={styles.liveObservationSectionLabel}>관객 접속</span>
              <strong>관객이 실제 서비스에 트래픽 보내기</strong>
              <p>QR 또는 링크로 접속하면 ALB Traffic API의 성공 요청만 Live event에 반영됩니다.</p>
              <div className={styles.liveObservationAudienceUtilityActions}>
                <button
                  className={styles.liveObservationSecondaryButton}
                  onClick={() => void copyAudienceUrl()}
                  type="button"
                >
                  {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                  관객 URL 복사
                </button>
                <a href={session.audienceUrl} rel="noreferrer" target="_blank">
                  새 창에서 열기 <ExternalLink size={14} aria-hidden="true" />
                </a>
              </div>
            </div>
            <div className={styles.liveObservationQr}>
              {qrState === "ready" && qrDataUrl ? (
                <img alt="관객 URL QR 코드" height={184} src={qrDataUrl} width={184} />
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
              <strong>성공한 Demo Web Service 배포가 없습니다.</strong>
              <p>먼저 `demo_web_service` 프로필로 배포를 성공시킨 뒤 다시 열어주세요.</p>
            </div>
          ) : null}
          {visibleErrorMessage ? (
            <div className={styles.liveObservationError} role="alert">{visibleErrorMessage}</div>
          ) : null}

          {session || showDevelopmentMockMap ? (
            <section className={styles.liveObservationEvidenceRail} aria-label="관측 근거">
              <div data-source="browser">
                <span>빠른 신호 · 브라우저 보고</span>
                <strong>{displayedSnapshot?.live.acceptedEventCount ?? 0}</strong>
                <p>collector가 수락한 성공 receipt</p>
                <div className={styles.liveObservationPressureTrack} aria-label="scale-out pressure">
                  <i style={{ width: `${Math.min(displayedSnapshot?.live.pressurePercent ?? 0, 100)}%` }} />
                </div>
                <small>
                  {(displayedSnapshot?.live.projectedRequestsPerMinute ?? 0).toFixed(1)} req/min · 압력 {(displayedSnapshot?.live.pressurePercent ?? 0).toFixed(0)}% · {getLiveObservationPressureLabel(displayedSnapshot?.live.pressureLevel ?? "normal")}
                </small>
              </div>
              <div data-source="aws">
                <span>AWS 실측</span>
                <strong>{formatCloudWatchValue(displayedSnapshot)}</strong>
                <p>완료된 60초 RequestCountPerTarget</p>
                <small>
                  {formatCloudWatchDelay(displayedSnapshot)} · {formatCapacityValue(displayedSnapshot)} active / desired / max
                </small>
              </div>
            </section>
          ) : null}

          {session || showDevelopmentMockMap ? (
            <section
              aria-label={showDevelopmentMockMap ? "목업 데이터 · 개발 확인용" : "실시간 서비스 맵"}
              className={styles.liveObservationMapStage}
            >
              {showDevelopmentMockMap ? (
                <span className={styles.liveObservationSectionLabel}>
                  목업 데이터 · 개발 확인용
                </span>
              ) : null}
              <LiveObservationDiagramMap
                burst={mapBurst}
                diagram={diagramJson}
                snapshot={displayedSnapshot}
              />
            </section>
          ) : listState === "ready" && eligibleDeployments.length > 0 ? (
            <div className={styles.liveObservationIntro}>
              <Timer size={22} aria-hidden="true" />
              <div>
                <strong>관측은 명시적으로 시작됩니다.</strong>
                <p>모달을 여는 것만으로 트래픽이나 AWS 변경이 발생하지 않습니다.</p>
              </div>
            </div>
          ) : null}

          <section
            aria-label="AI 시뮬레이션 결과"
            className={styles.liveObservationDesignSimulation}
          >
            <header>
              <strong>AI 시뮬레이션</strong>
              <button
                aria-label={isAiSimulationVisible ? "AI 시뮬레이션 접기" : "AI 시뮬레이션 펼치기"}
                aria-pressed={isAiSimulationVisible}
                className={styles.liveObservationSimulationToggle}
                onClick={() => setAiSimulationVisible((visible) => !visible)}
                title={isAiSimulationVisible ? "AI 시뮬레이션 접기" : "AI 시뮬레이션 펼치기"}
                type="button"
              >
                {isAiSimulationVisible ? (
                  <ToggleRight aria-hidden="true" size={20} />
                ) : (
                  <ToggleLeft aria-hidden="true" size={20} />
                )}
              </button>
            </header>
            {isAiSimulationVisible ? (
              <>
                {designSimulationState === "loading" ? (
                  <div className={styles.liveObservationMessage}>
                    AI 시뮬레이션을 계산하고 있습니다.
                  </div>
                ) : null}
                {designSimulationState === "error" ? (
                  <div className={styles.liveObservationError} role="alert">
                    {designSimulationError}
                  </div>
                ) : null}
                {designSimulationState === "ready" && designSimulation ? (
                  <WorkspaceAiDesignSimulationResult simulation={designSimulation} />
                ) : null}
              </>
            ) : null}
          </section>
        </main>

        <footer className={styles.liveObservationControlRail}>
            <div className={styles.liveObservationControlActivity}>
              <span className={styles.liveObservationSectionLabel}>스케일링 활동</span>
              <strong>최근 Scaling 활동</strong>
              {displayedSnapshot?.capacity.latestActivity ? (
                <div>
                  <i aria-hidden="true" />
                  <strong>{displayedSnapshot.capacity.latestActivity.statusCode}</strong>
                  <p>{displayedSnapshot.capacity.latestActivity.description}</p>
                  <time>{formatTimestamp(displayedSnapshot.capacity.latestActivity.startedAt)}</time>
                </div>
              ) : (
                <span className={styles.liveObservationMuted}>아직 확인된 스케일링 활동이 없습니다.</span>
              )}
            </div>
            <div className={styles.liveObservationBoostSummary}>
              <strong>발표자 트래픽 증가</strong>
              <span>
                {showDevelopmentMockMap
                  ? `${displayedSnapshot?.live.acceptedEventCount ?? 0} mock events`
                  : `${boostProgress.successfulTrafficRequests} traffic 성공 · ${boostProgress.acceptedReceipts} 집계`}
              </span>
            </div>
            <div className={styles.liveObservationControlActions}>
              <button
                className={styles.liveObservationPrimaryButton}
                disabled={(!isSessionActive && !showDevelopmentMockMap) || boostProgress.running}
                onClick={startTrafficLoad}
                type="button"
              >{showDevelopmentMockMap ? "부하 단계 올리기" : "+90초 부하"}</button>
              <button
                className={styles.liveObservationSecondaryButton}
                disabled={!boostProgress.running}
                onClick={stopBoost}
                type="button"
              ><Square size={14} aria-hidden="true" />중지</button>
              {session ? (
                <button
                  className={styles.liveObservationDangerButton}
                  disabled={!isSessionActive || requestState === "loading"}
                  onClick={() => void endSession()}
                  type="button"
                >세션 종료</button>
              ) : null}
            </div>
          </footer>
      </div>
    </div>,
    document.body
  );
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) {
    return [];
  }

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
  snapshot: LiveObservationSnapshot | null,
  remainingSeconds: number
): string {
  if (!snapshot) {
    return "시작 전";
  }
  if (snapshot.status === "stopped") {
    return "종료됨";
  }
  if (snapshot.status === "expired" || remainingSeconds === 0) {
    return "만료됨";
  }
  return "관측 중";
}

function formatRemainingTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatCloudWatchValue(snapshot: LiveObservationSnapshot | null): string {
  if (snapshot?.cloudWatch.state === "unavailable") {
    return "관측 불가";
  }
  if (snapshot?.cloudWatch.requestCountPerTarget === null || !snapshot) {
    return "–";
  }
  return String(snapshot.cloudWatch.requestCountPerTarget);
}

function formatCloudWatchDelay(snapshot: LiveObservationSnapshot | null): string {
  if (!snapshot || snapshot.cloudWatch.state === "unavailable") {
    return "AWS 지표 관측 불가";
  }
  if (snapshot.cloudWatch.state === "delayed") {
    return `${snapshot.cloudWatch.delayedBySeconds ?? 0}초 지연된 datapoint`;
  }
  return "최신 완료 datapoint";
}

function formatCapacityValue(snapshot: LiveObservationSnapshot | null): string {
  if (snapshot?.capacity.state !== "available") {
    return "관측 불가";
  }
  return `${snapshot.capacity.inServiceInstanceCount ?? 0} / ${snapshot.capacity.desiredCapacity ?? 0} / ${snapshot.capacity.maxCapacity ?? 0}`;
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "medium"
  });
}
