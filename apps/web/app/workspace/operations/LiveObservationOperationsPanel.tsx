"use client";

import { Activity, CircleStop, ExternalLink, LoaderCircle, Play, Zap } from "lucide-react";
import {
  getLiveObservationInstanceMarkers,
  getLiveObservationPressureLabel
} from "../../../features/workspace/live-observation";
import type { WorkspaceLiveObservationState } from "./use-workspace-live-observation";
import styles from "./workspace-operations.module.css";

// 성공한 배포의 실제 요청 압력과 instance 변화를 운영 panel에 보여줍니다.
export function LiveObservationOperationsPanel({
  liveObservation
}: {
  readonly liveObservation: WorkspaceLiveObservationState;
}) {
  const snapshot = liveObservation.snapshot;
  const isActive = liveObservation.session?.status === "active";
  const markers = getLiveObservationInstanceMarkers(snapshot);

  return (
    <div className={styles.panelBody}>
      <header className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Live Observation</p>
          <h2>배포 상태 관찰</h2>
        </div>
        <span className={styles.statusText} data-tone={isActive ? "RUNNING" : "PENDING"}>
          {isActive ? "관찰 중" : snapshot ? "관찰 종료" : "시작 전"}
        </span>
      </header>

      {liveObservation.eligibleDeployments.length === 0 ? (
        <p className={styles.emptyText}>관찰할 수 있는 성공한 Web Service 배포가 없습니다.</p>
      ) : (
        <label className={styles.liveDeploymentSelect}>
          <span>관찰할 배포</span>
          <select
            disabled={isActive}
            onChange={(event) => liveObservation.selectDeployment(event.target.value)}
            value={liveObservation.selectedDeploymentId}
          >
            {liveObservation.eligibleDeployments.map((deployment) => (
              <option key={deployment.id} value={deployment.id}>
                {deployment.id.slice(0, 8)} · {formatObservedDeploymentTime(deployment.completedAt)}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className={styles.actionRow}>
        <button
          className={styles.primaryButton}
          disabled={!liveObservation.selectedDeploymentId || isActive || liveObservation.requestState === "loading"}
          onClick={() => void liveObservation.start()}
          type="button"
        >
          {liveObservation.requestState === "loading" && !isActive
            ? <LoaderCircle aria-hidden="true" size={15} />
            : <Play aria-hidden="true" size={15} />}
          관찰 시작
        </button>
        {isActive ? (
          <button className={styles.secondaryButton} onClick={() => void liveObservation.stop()} type="button">
            <CircleStop aria-hidden="true" size={15} /> 관찰 중지
          </button>
        ) : null}
      </div>

      {liveObservation.errorMessage ? (
        <p className={styles.inlineNotice} data-tone="warning">{liveObservation.errorMessage}</p>
      ) : null}

      {snapshot ? (
        <>
          {liveObservation.session ? (
            <section className={styles.resultSection}>
              <div className={styles.sectionTitleRow}>
                <h3>시연 요청</h3>
                <a
                  className={styles.inlineLink}
                  href={liveObservation.session.audienceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Audience 열기 <ExternalLink aria-hidden="true" size={13} />
                </a>
              </div>
              <dl className={styles.handoffFacts}>
                <div><dt>세션 만료</dt><dd>{formatObservedDeploymentTime(liveObservation.session.expiresAt)}</dd></div>
                <div><dt>수집 성공</dt><dd>{liveObservation.trafficProgress.acceptedReceipts}회</dd></div>
                <div><dt>요청 시도</dt><dd>{liveObservation.trafficProgress.attemptedRequests}회</dd></div>
                <div>
                  <dt>실패</dt>
                  <dd>{liveObservation.trafficProgress.trafficFailures + liveObservation.trafficProgress.receiptFailures}회</dd>
                </div>
              </dl>
              <div className={styles.actionRow}>
                <button
                  className={styles.primaryButton}
                  disabled={!isActive || liveObservation.trafficProgress.running}
                  onClick={liveObservation.startTraffic}
                  type="button"
                >
                  <Zap aria-hidden="true" size={15} /> 제한형 요청 시작
                </button>
                {liveObservation.trafficProgress.running ? (
                  <button className={styles.secondaryButton} onClick={liveObservation.stopTraffic} type="button">
                    <CircleStop aria-hidden="true" size={15} /> 요청 중지
                  </button>
                ) : null}
              </div>
              <p className={styles.emptyText}>초당 최대 5회, 최대 90초 동안만 요청합니다.</p>
            </section>
          ) : null}
          <div className={styles.metricGrid}>
            <article>
              <Activity aria-hidden="true" size={18} />
              <span>요청 압력</span>
              <strong>{snapshot.live.pressurePercent}%</strong>
              <small>{getLiveObservationPressureLabel(snapshot.live.pressureLevel)}</small>
            </article>
            <article>
              <span>초당 요청</span>
              <strong>{snapshot.live.rollingRequestsPerSecond}</strong>
              <small>분당 예상 {snapshot.live.projectedRequestsPerMinute}</small>
            </article>
            <article>
              <span>InService</span>
              <strong>{snapshot.capacity.inServiceInstanceCount ?? "확인 불가"}</strong>
              <small>목표 {snapshot.capacity.desiredCapacity ?? "확인 불가"}</small>
            </article>
          </div>
          <section className={styles.resultSection}>
            <div className={styles.sectionTitleRow}>
              <h3>Instance 상태</h3>
              <span>{snapshot.capacity.state}</span>
            </div>
            {markers.length > 0 ? (
              <ul className={styles.instanceMarkers}>
                {markers.map((marker) => (
                  <li data-state={marker.state} key={marker.key}>
                    <strong>{marker.label}</strong>
                    <span>{marker.key}</span>
                  </li>
                ))}
              </ul>
            ) : <p className={styles.emptyText}>Instance 상태를 아직 읽지 못했습니다.</p>}
            {snapshot.cloudWatch.state !== "available" ? (
              <p className={styles.inlineNotice}>CloudWatch 상태: {snapshot.cloudWatch.state}</p>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

// 성공한 배포 완료 시각을 현재 browser 기준으로 짧게 표시합니다.
function formatObservedDeploymentTime(value: string | null): string {
  if (!value) return "완료 시각 없음";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value)
  );
}
