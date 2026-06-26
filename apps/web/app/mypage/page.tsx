import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import {
  formatUsd,
  recentDeployedProjects,
  recentOpenedProjects,
  runningDeployments
} from "../../components/dashboard/dashboard-data";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { ProjectCard } from "../../components/dashboard/project-card";

export default function MyPage() {
  const totalRunningCost = runningDeployments.reduce(
    (sum, project) => sum + project.monthlyCostUsd,
    0
  );

  return (
    <DashboardShell>
      <div className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Home</p>
          <h1>홈 화면</h1>
        </div>
        <div className="dashboardStatGrid dashboardStatGridCompact" aria-label="홈 요약">
          <article>
            <DashboardIcon name="folder" />
            <span>전체 프로젝트</span>
            <strong>5</strong>
          </article>
          <article>
            <DashboardIcon name="rocket" />
            <span>실행 중 배포</span>
            <strong>{runningDeployments.length}</strong>
          </article>
          <article>
            <DashboardIcon name="billing" />
            <span>예상 월 비용</span>
            <strong>{formatUsd(totalRunningCost)}</strong>
          </article>
        </div>
      </div>

      <section className="dashboardPanel" aria-labelledby="recent-opened-title">
        <div className="dashboardPanelHeader">
          <div>
            <p className="dashboardPanelKicker">Recent opened</p>
            <h2 id="recent-opened-title">최근 열어본 항목</h2>
          </div>
          <span className="dashboardCountBadge">최대 3개</span>
        </div>
        <div className="dashboardCardGrid dashboardCardGridThree">
          {recentOpenedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              timestampLabel={project.lastOpenedLabel}
            />
          ))}
        </div>
      </section>

      <section className="dashboardPanel" aria-labelledby="recent-deployed-title">
        <div className="dashboardPanelHeader">
          <div>
            <p className="dashboardPanelKicker">Recent deployed</p>
            <h2 id="recent-deployed-title">최근 배포한 항목</h2>
          </div>
          <span className="dashboardCountBadge">최대 3개</span>
        </div>
        <div className="dashboardCardGrid dashboardCardGridThree">
          {recentDeployedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              timestampLabel={project.lastDeployedLabel ?? project.updatedLabel}
            />
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}
