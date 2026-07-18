import { Suspense } from "react";
import { ProductState } from "../../../components/ui/ProductState";
import { SettingsDashboardClient } from "./settings-dashboard-client";

// AWS Role 연결과 검증 상태를 관리하는 Dashboard route입니다.
export default function DashboardSettingsPage() {
  return (
    <Suspense
      fallback={
        <ProductState
          compact
          description="설정을 준비하고 있습니다."
          kind="loading"
          title="설정 불러오는 중"
        />
      }
    >
      <SettingsDashboardClient />
    </Suspense>
  );
}
