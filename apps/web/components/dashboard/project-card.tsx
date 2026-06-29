import Link from "next/link";
import type { ProjectSummary } from "./dashboard-data";
import { formatUsd, getProjectHref } from "./dashboard-data";
import { DashboardIcon } from "./dashboard-icons";

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
      <div className="projectPreview" aria-hidden="true">
        <span className="projectPreviewFrame" />
        <span className="projectPreviewNode projectPreviewNodeVpc">VPC</span>
        <span className="projectPreviewNode projectPreviewNodeApp">APP</span>
        <span className="projectPreviewNode projectPreviewNodeData">DB</span>
        <span className="projectPreviewLine projectPreviewLineOne" />
        <span className="projectPreviewLine projectPreviewLineTwo" />
      </div>

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
