import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import { formatUsd, runningDeployments } from "../../components/dashboard/dashboard-data";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";

export default function CostsPage() {
  const totalMonthlyCost = runningDeployments.reduce(
    (sum, project) => sum + project.monthlyCostUsd,
    0
  );
  const dailyCost = totalMonthlyCost / 30;

  return (
    <DashboardShell>
      <div className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Cost management</p>
          <h1>비용관리</h1>
        </div>
      </div>

      <section className="dashboardPanel costSummaryPanel" aria-labelledby="cost-summary-title">
        <div>
          <p className="dashboardPanelKicker">Running deployments</p>
          <h2 id="cost-summary-title">켜둔 배포 프로젝트 예상 비용 합계</h2>
        </div>
        <div className="costSummaryAmount">
          <span>월 예상 비용</span>
          <strong>{formatUsd(totalMonthlyCost)}</strong>
          <p>일 평균 약 {formatUsd(dailyCost)} 기준</p>
        </div>
      </section>

      <section className="dashboardPanel" aria-labelledby="active-deployment-cost-title">
        <div className="dashboardPanelHeader">
          <div>
            <p className="dashboardPanelKicker">Active costs</p>
            <h2 id="active-deployment-cost-title">실행 중 배포 프로젝트</h2>
          </div>
          <span className="dashboardCountBadge">{runningDeployments.length}개</span>
        </div>
        <div className="dashboardTable">
          <div className="dashboardTableHeader">
            <span>프로젝트</span>
            <span>클라우드</span>
            <span>리소스</span>
            <span>예상 월 비용</span>
          </div>
          {runningDeployments.map((project) => (
            <div className="dashboardTableRow" key={project.id}>
              <strong>{project.title}</strong>
              <span>{project.cloudServices.join(", ")}</span>
              <span>{project.resources.join(", ")}</span>
              <span>{formatUsd(project.monthlyCostUsd)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboardPanel costNoticePanel" aria-labelledby="cost-notice-title">
        <DashboardIcon name="shield" />
        <div>
          <h2 id="cost-notice-title">현재 비용은 추정치입니다</h2>
          <p>
            실제 청구액은 리전, 사용량, 네트워크 트래픽, 중지 여부에 따라 달라질 수 있습니다.
          </p>
        </div>
      </section>
    </DashboardShell>
  );
}
