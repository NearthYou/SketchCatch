import Link from "next/link";
import type { Project } from "@sketchcatch/types";
import { DashboardIcon } from "./dashboard-icons";
import { ProjectArchitectureThumbnail } from "./project-architecture-thumbnail";

export type ApiProjectCardProps = {
  readonly isDeleting?: boolean;
  readonly onDelete?: ((project: Project) => void) | undefined;
  readonly project: Project;
  readonly timestampLabel: string;
  readonly timestampValue: string;
  readonly variant?: "compact" | "wide";
};

export function ApiProjectCard({
  isDeleting = false,
  onDelete,
  project,
  timestampLabel,
  timestampValue,
  variant = "wide"
}: ApiProjectCardProps) {
  const href = getWorkspaceHref(project);
  const className =
    variant === "wide" ? "projectCard projectCardWide projectCardLink" : "projectCard projectCardLink";
  const cardContent = (
    <>
      <ProjectArchitectureThumbnail projectId={project.id} projectName={project.name} />

      <div className="projectCardBody">
        <div className="projectCardTitle">
          <h3>{project.name}</h3>
        </div>
        {project.description?.trim() ? <p>{project.description}</p> : null}

        <div className="projectCardMeta">
          <span>
            <DashboardIcon name="clock" />
            {timestampLabel}: {formatProjectDate(timestampValue)}
          </span>
        </div>
      </div>
    </>
  );

  if (onDelete) {
    return (
      <article className={`${className} projectCardWithActions`}>
        <Link aria-label={`${project.name} 프로젝트 열기`} className="projectCardContentLink" href={href}>
          {cardContent}
        </Link>
        <div className="projectCardActions">
          <button
            aria-label={`${project.name} 프로젝트 삭제`}
            className="dashboardDangerButton projectDeleteButton"
            disabled={isDeleting}
            onClick={() => onDelete(project)}
            type="button"
          >
            <DashboardIcon name="trash" />
            <span>{isDeleting ? "삭제 중" : "삭제"}</span>
          </button>
        </div>
      </article>
    );
  }

  return (
    <Link
      aria-label={`${project.name} 프로젝트 열기`}
      className={className}
      href={href}
    >
      {cardContent}
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
