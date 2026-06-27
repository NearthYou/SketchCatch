import Link from "next/link";
import type { Project } from "@sketchcatch/types";
import { DashboardIcon } from "./dashboard-icons";

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
  return (
    <article className={variant === "wide" ? "projectCard projectCardWide" : "projectCard"}>
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
          <span>DB saved project</span>
          <h3>
            <Link className="projectTitleLink" href={getWorkspaceHref(project)}>
              {project.name}
            </Link>
          </h3>
        </div>
        <p>{project.description ?? "설명 없음"}</p>

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
    </article>
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
