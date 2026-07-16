import Link from "next/link";
import type { ProjectSummary } from "./dashboard-data";
import { formatUsd, getProjectHref } from "./dashboard-data";
import { DashboardIcon } from "./dashboard-icons";
import { ProjectArchitectureThumbnail } from "./project-architecture-thumbnail";

// 요약 Project 카드도 임의 그림 대신 저장 시 캡처한 실제 Board image를 사용합니다.
export function ProjectCard({
  project,
  timestampLabel,
  variant = "compact"
}: {
  readonly project: ProjectSummary;
  readonly timestampLabel: string;
  readonly variant?: "compact" | "wide";
}) {
  const href = getProjectHref(project.id);

  return (
    <Link
      aria-label={`${project.title} 프로젝트 열기`}
      className={variant === "wide" ? "projectCard projectCardWide projectCardLink" : "projectCard projectCardLink"}
      href={href}
    >
      <ProjectArchitectureThumbnail projectId={project.id} projectName={project.title} />

      <div className="projectCardBody">
        <div className="projectCardTitle">
          <span>{project.cloudServices.join(" · ")}</span>
          <h3>{project.title}</h3>
        </div>
        <p>{project.description}</p>

        <div className="dashboardChipRow">
          {project.resources.map((resource) => (
            <span className="dashboardChip" key={resource}>
              {resource}
            </span>
          ))}
        </div>

        <div className="projectCardMeta">
          <span>
            <DashboardIcon name="clock" />
            {timestampLabel}
          </span>
          <span>
            <DashboardIcon name="billing" />
            {formatUsd(project.monthlyCostUsd)}
          </span>
        </div>
      </div>
    </Link>
  );
}
