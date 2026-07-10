import Link from "next/link";
import { Plus } from "lucide-react";
import type { DeploymentStatus, Project } from "@sketchcatch/types";
import { getWorkspaceHref } from "../../components/dashboard/api-project-card";

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
      </section>
    </div>
  );
}

export function DashboardMetric({
  detail,
  label,
  tone = "neutral",
  value
}: {
  readonly detail: string;
  readonly label: string;
  readonly tone?: "error" | "neutral" | "progress" | "success";
  readonly value: string;
}) {
  return (
    <article className="dashboardMetric">
      <span>{label}</span>
      <strong className={`dashboardMetricValue dashboardMetricValue${tone}`}>{value}</strong>
      <p>{detail}</p>
    </article>
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
    timeStyle: "short"
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
