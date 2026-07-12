import Link from "next/link";
import { Plus } from "lucide-react";
import type { DeploymentStatus, Project } from "@sketchcatch/types";
import { getWorkspaceHref } from "../../components/dashboard/api-project-card";

// Dashboard 자료를 기다리는 동안 최종 배치와 같은 크기의 뼈대를 유지합니다.
export function DashboardOverviewLoading() {
  return (
    <div className="dashboardOverview" aria-label="Dashboard 로딩">
      <div className="dashboardSkeleton dashboardSkeletonTitle" />
      <div className="dashboardMetricStrip dashboardMetricStripLoading">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="dashboardSkeleton dashboardSkeletonMetric" key={index} />
        ))}
      </div>
    </div>
  );
}

// 첫 프로젝트가 없는 사용자에게 다음 행동을 바로 제공합니다.
export function DashboardOverviewEmpty() {
  return (
    <div className="dashboardOverview">
      <header className="dashboardPageHeader">
        <div>
          <h1>첫 프로젝트를 시작하세요</h1>
        </div>
      </header>
      <section className="dashboardEmptyState">
        <Plus aria-hidden="true" size={24} />
        <h2>아직 프로젝트가 없습니다.</h2>
        <p>시작 방식을 고르고 첫 Architecture Board를 만들어보세요.</p>
        <Link className="dashboardPrimaryAction" href="/workspace/new">
          <Plus aria-hidden="true" size={16} />
          새 프로젝트
        </Link>
      </section>
    </div>
  );
}

// 핵심 수치를 보여주고 연결된 상세 화면이 있으면 바로 이동할 수 있게 합니다.
export function DashboardMetric({
  detail,
  href,
  label,
  tone = "neutral",
  value
}: {
  readonly detail: string;
  readonly href?: string | undefined;
  readonly label: string;
  readonly tone?: "error" | "neutral" | "progress" | "success";
  readonly value: string;
}) {
  const content = (
    <>
      <span>{label}</span>
      <strong className={`dashboardMetricValue dashboardMetricValue${tone}`}>{value}</strong>
      <p>{detail}</p>
    </>
  );

  return href ? (
    <Link className="dashboardMetric dashboardMetricLink" href={href}>
      {content}
    </Link>
  ) : (
    <article className="dashboardMetric">{content}</article>
  );
}

export function ProjectOverviewRow({ project }: { readonly project: Project }) {
  return (
    <Link className="dashboardProjectRow" href={getWorkspaceHref(project)}>
      <div>
        <strong>{project.name}</strong>
        <span>{project.description?.trim() || "설명 없음"}</span>
      </div>
      <time dateTime={project.updatedAt}>{formatDateTime(project.updatedAt)}</time>
    </Link>
  );
}

export function getDeploymentStatusLabel(status: DeploymentStatus): string {
  const labels: Record<DeploymentStatus, string> = {
    CANCELLED: "취소",
    DESTROYED: "정리 완료",
    FAILED: "실패",
    PENDING: "대기",
    RUNNING: "진행 중",
    SUCCESS: "성공"
  };

  return labels[status];
}

export function getDeploymentTone(
  status: DeploymentStatus
): "error" | "neutral" | "progress" | "success" {
  if (status === "SUCCESS" || status === "DESTROYED") {
    return "success";
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return "error";
  }

  return status === "RUNNING" ? "progress" : "neutral";
}

export function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Seoul"
  });
}

// 비용 값이 없을 때 거짓 숫자를 만들지 않고 확인 불가로 표시합니다.
export function formatMoney(
  value: { readonly amount: number; readonly currency: string } | null
): string {
  if (!value) {
    return "확인 불가";
  }

  return new Intl.NumberFormat("ko-KR", {
    currency: value.currency,
    maximumFractionDigits: 2,
    style: "currency"
  }).format(value.amount);
}
