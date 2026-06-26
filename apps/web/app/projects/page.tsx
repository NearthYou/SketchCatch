import Link from "next/link";
import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import { getProjectHref, projects } from "../../components/dashboard/dashboard-data";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { ProjectCard } from "../../components/dashboard/project-card";

export default function ProjectsPage() {
  const deployedProjects = projects.filter((project) => project.lastDeployedLabel !== null);

  return (
    <DashboardShell>
      <div className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Projects</p>
          <h1>내 프로젝트</h1>
        </div>
        <div className="dashboardHeaderActions">
          <button className="dashboardSecondaryButton" type="button">
            <DashboardIcon name="folder" />
            <span>전체 보기</span>
          </button>
        </div>
      </div>

      <section className="dashboardPanel" aria-labelledby="all-projects-title">
        <div className="dashboardPanelHeader">
          <div>
            <p className="dashboardPanelKicker">All projects</p>
            <h2 id="all-projects-title">내 프로젝트 전부</h2>
          </div>
          <span className="dashboardCountBadge">{projects.length}개</span>
        </div>
        <div className="dashboardCardGrid">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              timestampLabel={project.lastOpenedLabel}
              variant="wide"
            />
          ))}
        </div>
      </section>

      <section className="dashboardPanel" aria-labelledby="deployed-projects-title">
        <div className="dashboardPanelHeader">
          <div>
            <p className="dashboardPanelKicker">Deployments</p>
            <h2 id="deployed-projects-title">배포한 프로젝트 전부</h2>
          </div>
          <span className="dashboardCountBadge">{deployedProjects.length}개</span>
        </div>
        <div className="dashboardTable">
          <div className="dashboardTableHeader">
            <span>프로젝트</span>
            <span>상태</span>
            <span>최근 배포</span>
            <span>예상 비용</span>
          </div>
          {deployedProjects.map((project) => (
            <div className="dashboardTableRow" key={project.id}>
              <strong>
                <Link className="dashboardTableLink" href={getProjectHref(project.id)}>
                  {project.title}
                </Link>
              </strong>
              <span className={`deploymentStatus deploymentStatus-${project.deploymentStatus}`}>
                {project.deploymentStatus}
              </span>
              <span>{project.lastDeployedLabel}</span>
              <span>${project.monthlyCostUsd.toFixed(2)} / month</span>
            </div>
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}
