"use client";

import { LogOut, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../../components/auth/auth-provider";
import { getApiErrorMessage } from "../../lib/api-client";

export function DesignDashboardAccountFooter() {
  const router = useRouter();
  const { logout, status, user } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const displayName = user?.nickname || user?.username || "로그인 사용자";
  const accountDetail = user?.email ?? "세션 확인 중";
  const isLoggingOutDisabled = status === "loading";

  async function handleLogout(): Promise<void> {
    setErrorMessage(null);

    try {
      await logout();
      router.replace("/login");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "로그아웃에 실패했습니다."));
    }
  }

  return (
    <div className="designDashboardSidebarFooter">
      <div className="designDashboardAccountSummary">
        <span className="designDashboardAccountIcon" aria-hidden="true">
          <UserRound size={16} strokeWidth={1.9} />
        </span>
        <div>
          <strong>{displayName}</strong>
          <span>{accountDetail}</span>
        </div>
      </div>
      <button
        className="designDashboardLogoutButton"
        disabled={isLoggingOutDisabled}
        onClick={handleLogout}
        type="button"
      >
        <LogOut aria-hidden="true" size={15} strokeWidth={1.9} />
        <span>로그아웃</span>
      </button>
      {errorMessage ? (
        <p className="designDashboardAccountError" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
