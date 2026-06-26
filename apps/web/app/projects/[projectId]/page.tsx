import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "../../../components/dashboard/dashboard-shell";
import {
  formatUsd,
  getProjectById,
  projects
} from "../../../components/dashboard/dashboard-data";
import { DashboardIcon } from "../../../components/dashboard/dashboard-icons";
import { ProjectCard } from "../../../components/dashboard/project-card";

type ProjectDetailPageProps = {
  readonly params: Promise<{
    readonly projectId: string;
  }>;
};

export function generateStaticParams() {
  return projects.map((project) => ({
    projectId: project.id
  }));
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectId } = await params;
  const project = getProjectById(projectId);

  if (!project) {
    notFound();
  }

  return (
    <DashboardShell>
      <div className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Project detail</p>
          <h1>{project.title}</h1>
        </div>
        <div className="dashboardHeaderActions">
          <Link className="dashboardSecondaryButton" href="/projects">
            <DashboardIcon name="folder" />
            <span>목록으로</span>
          </Link>
          <Link className="dashboardTopbarAction" href="/workspace">
            <DashboardIcon name="edit" />
            <span>작업대 열기</span>
          </Link>
        </div>
      </div>

      <section className="dashboardPanel projectDetailHero" aria-labelledby="project-detail-title">
        <ProjectCard project={project} timestampLabel={project.lastOpenedLabel} variant="wide" />
        <div className="projectDetailSummary">
          <h2 id="project-detail-title">프로젝트 요약</h2>
          <p>{project.description}</p>
          <div className="projectDetailMetricGrid">
            <article>
              <DashboardIcon name="cloud" />
              <span>클라우드</span>
              <strong>{project.cloudServices.join(", ")}</strong>
            </article>
            <article>
              <DashboardIcon name="rocket" />
              <span>배포 상태</span>
              <strong>{project.deploymentStatus}</strong>
            </article>
            <article>
              <DashboardIcon name="billing" />
              <span>월 예상 비용</span>
              <strong>{formatUsd(project.monthlyCostUsd)}</strong>
            </article>
          </div>
        </div>
      </section>

      <div className="dashboardTwoColumn">
        <section className="dashboardPanel" aria-labelledby="project-resources-title">
          <div className="dashboardPanelHeader">
            <div>
              <p className="dashboardPanelKicker">Resources</p>
              <h2 id="project-resources-title">리소스 구성</h2>
            </div>
            <span className="dashboardCountBadge">{project.resources.length}개</span>
          </div>
          <div className="dashboardChipRow">
            {project.resources.map((resource) => (
              <span className="dashboardChip" key={resource}>
                {resource}
              </span>
            ))}
          </div>
        </section>

        <section className="dashboardPanel" aria-labelledby="project-activity-title">
          <div className="dashboardPanelHeader">
            <div>
              <p className="dashboardPanelKicker">Activity</p>
              <h2 id="project-activity-title">최근 상태</h2>
            </div>
          </div>
          <div className="projectDetailActivity">
            <p>
              <DashboardIcon name="clock" />
              <span>{project.updatedLabel}</span>
            </p>
            <p>
              <DashboardIcon name="rocket" />
              <span>{project.lastDeployedLabel ?? "아직 배포 기록 없음"}</span>
            </p>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
