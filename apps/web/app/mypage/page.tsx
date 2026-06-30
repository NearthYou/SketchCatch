import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import { MyPageClient } from "./mypage-client";

type MyPageProps = {
  readonly searchParams?: Promise<{
    readonly q?: string | string[] | undefined;
  }>;
};

export default async function MyPage({ searchParams }: MyPageProps) {
  const params = await searchParams;
  const projectSearchQuery = getProjectSearchQuery(params?.q);

  return (
    <DashboardShell projectSearchQuery={projectSearchQuery}>
      <div className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Home</p>
          <h1>홈 화면</h1>
        </div>
      </div>

      <MyPageClient searchQuery={projectSearchQuery} />
    </DashboardShell>
  );
}

function getProjectSearchQuery(value: string | string[] | undefined): string {
  const searchQuery = Array.isArray(value) ? value[0] : value;

  return searchQuery?.trim() ?? "";
}
