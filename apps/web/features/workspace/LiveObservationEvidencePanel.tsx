import React, { type ReactNode } from "react";
import type { LiveObservationSignal } from "./live-observation-signal-dashboard";
import styles from "./live-observation-signal-dashboard.module.css";

/** Summarizes the selected signal as an infrastructure assessment and likely bottleneck area. */
export function LiveObservationEvidencePanel({
  signal
}: {
  readonly signal: LiveObservationSignal;
}) {
  return (
    <section aria-labelledby="live-observation-evidence-heading" className={styles.evidencePanel}>
      <h3 id="live-observation-evidence-heading">인프라 전체 평가</h3>
      <EvidenceGroup label="현재 평가">
        <li>{getInfrastructureAssessment(signal)}</li>
      </EvidenceGroup>
      <EvidenceGroup label="CloudWatch 관측 근거">
        {signal.evidence.map((evidence) => (
          <li key={evidence.id}>{evidence.detail}</li>
        ))}
      </EvidenceGroup>
      <EvidenceGroup label="병목 예상 지점">
        {getPredictedBottlenecks(signal).map((bottleneck) => (
          <li key={bottleneck}>{bottleneck}</li>
        ))}
      </EvidenceGroup>
    </section>
  );
}

function getPredictedBottlenecks(signal: LiveObservationSignal): readonly string[] {
  if (signal.possibleCauses.length > 0) {
    return signal.possibleCauses.map((cause) => cause.text);
  }

  if (signal.id === "request-failure") {
    return [
      "ALB 대상 그룹에서 ECS Task로 요청을 전달하는 구간",
      "ECS 컨테이너 애플리케이션에서 데이터 저장소를 호출하는 구간"
    ];
  }

  if (signal.id === "capacity-health-gap") {
    return [
      "ECS Task 컨테이너 시작과 ALB 상태 확인 구간",
      "애플리케이션 초기화 또는 런타임 의존성 구간"
    ];
  }

  if (signal.id === "capacity-running-gap") {
    return [
      "ECS Service의 Task 스케줄링과 이미지 Pull 구간",
      "서브넷 가용 용량 또는 실행 역할 권한 구간"
    ];
  }

  if (signal.id === "request-surge") {
    return [
      "ALB 대상 그룹에서 ECS Service로 전달되는 요청 분산 구간",
      "ECS Service Auto Scaling이 새 Task를 준비하는 구간"
    ];
  }

  if (signal.id === "warning-log") {
    return [
      "ECS Task 컨테이너의 재시도와 런타임 의존성 처리 구간",
      "애플리케이션이 호출하는 데이터 저장소 또는 외부 연동 구간"
    ];
  }

  return [
    "ECS Task 컨테이너의 애플리케이션 처리 구간",
    "애플리케이션이 호출하는 데이터 저장소 또는 외부 연동 구간"
  ];
}

function getInfrastructureAssessment(signal: LiveObservationSignal): string {
  const statusLabel = signal.status === "critical" ? "즉시 점검이 필요한 상태" : "주의가 필요한 상태";
  return `현재 인프라는 ${signal.title} 신호로 ${statusLabel}입니다. ${signal.userImpact}`;
}

function EvidenceGroup({
  children,
  label
}: {
  readonly children: ReactNode;
  readonly label: string;
}) {
  return (
    <div className={styles.evidenceGroup}>
      <h4>{label}</h4>
      <ul>{children}</ul>
    </div>
  );
}
