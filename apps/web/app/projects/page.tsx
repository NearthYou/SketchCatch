import Link from "next/link";
import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import { DashboardIcon } from "../../components/dashboard/dashboard-icons";
import { ProjectsClient } from "./projects-client";

type ProjectsPageProps = {
  readonly searchParams?: Promise<{
    readonly q?: string | string[] | undefined;
  }>;
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const params = await searchParams;
  const projectSearchQuery = getProjectSearchQuery(params?.q);

  return (
    <DashboardShell projectSearchQuery={projectSearchQuery}>
      <div className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Projects</p>
          <h1>내 프로젝트</h1>
        </div>
        <div className="dashboardHeaderActions">
          <Link className="dashboardSecondaryButton" href="/workspace/new">
            <DashboardIcon name="plus" />
            <span>새 설계 시작</span>
          </Link>
        </div>
      </div>

      <ProjectsClient searchQuery={projectSearchQuery} />
    </DashboardShell>
  );
}

function getProjectSearchQuery(value: string | string[] | undefined): string {
  const searchQuery = Array.isArray(value) ? value[0] : value;

  return searchQuery?.trim() ?? "";
}
