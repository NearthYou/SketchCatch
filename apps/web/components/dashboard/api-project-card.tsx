import Link from "next/link";
import type { Project } from "@sketchcatch/types";
import { DashboardIcon } from "./dashboard-icons";
import { ProjectArchitectureThumbnail } from "./project-architecture-thumbnail";

export type ApiProjectCardProps = {
  readonly project: Project;
  readonly timestampLabel: string;
  readonly timestampValue: string;
  readonly variant?: "compact" | "wide";
};

export function ApiProjectCard({
  project,
  timestampLabel,
  timestampValue,
  variant = "wide"
}: ApiProjectCardProps) {
  const href = getWorkspaceHref(project);

  return (
    <Link
      aria-label={`${project.name} 프로젝트 열기`}
      className={variant === "wide" ? "projectCard projectCardWide projectCardLink" : "projectCard projectCardLink"}
      href={href}
    >
      <ProjectArchitectureThumbnail projectId={project.id} projectName={project.name} />

      <div className="projectCardBody">
        <div className="projectCardTitle">
          <span>DB saved project</span>
          <h3>{project.name}</h3>
        </div>
        {project.description?.trim() ? <p>{project.description}</p> : null}

        <div className="dashboardChipRow">
          <span className="dashboardChip">Diagram draft</span>
          <span className="dashboardChip">Auto save</span>
        </div>

        <div className="projectCardMeta">
          <span>
            <DashboardIcon name="clock" />
            {timestampLabel}: {formatProjectDate(timestampValue)}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function getWorkspaceHref(project: Project): string {
  const params = new URLSearchParams({
    projectId: project.id,
    projectName: project.name
  });

  return `/workspace?${params.toString()}`;
}

export function formatProjectDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}
