import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import { MyPageClient } from "./mypage-client";

export default function MyPage() {
  return (
    <DashboardShell>
      <div className="dashboardPageHeader">
        <div>
          <p className="dashboardEyebrow">Home</p>
          <h1>홈 화면</h1>
        </div>
      </div>

      <MyPageClient />
    </DashboardShell>
  );
}
