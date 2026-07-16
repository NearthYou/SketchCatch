"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings,
  Shapes,
  WalletCards,
  X
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-provider";
import { ProductBrand } from "../ui/ProductBrand";
import { ProductState } from "../ui/ProductState";

const DASHBOARD_NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "작업 현황" },
  { href: "/dashboard/projects", icon: FolderKanban, label: "내 프로젝트" },
  { href: "/dashboard/templates", icon: Shapes, label: "템플릿" },
  { href: "/dashboard/costs", icon: WalletCards, label: "비용 관리" },
  { href: "/dashboard/settings", icon: Settings, label: "설정" }
] as const;

// 인증된 Dashboard 화면의 공통 탐색 영역과 세션 상태를 책임집니다.
export function DashboardShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, status, user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pageTitle = getDashboardPageTitle(pathname);
  const shouldShowCreateAction =
    pathname === "/dashboard" || pathname === "/dashboard/projects";

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (status === "unauthenticated") {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [router, status]);

  // 로그아웃을 마친 뒤 인증 화면으로 되돌립니다.
  async function handleLogout(): Promise<void> {
    await logout();
    router.replace("/login");
  }

  if (status !== "authenticated") {
    return (
      <main className="dashboardSessionState">
        <ProductBrand />
        <ProductState
          compact
          description={
            status === "loading"
              ? "프로젝트와 배포 기록을 안전하게 불러오고 있습니다."
              : "로그인이 필요한 화면입니다. 로그인 화면으로 이동합니다."
          }
          kind={status === "loading" ? "loading" : "waiting"}
          title={status === "loading" ? "세션 확인 중" : "로그인 필요"}
        />
      </main>
    );
  }

  return (
    <div className="dashboardShell">
      <aside
        aria-label="Dashboard navigation"
        className={isMobileMenuOpen ? "dashboardSidebar dashboardSidebarOpen" : "dashboardSidebar"}
      >
        <div className="dashboardSidebarHeader">
          <ProductBrand />
          <button
            aria-label="Dashboard 메뉴 닫기"
            className="dashboardMobileClose"
            onClick={() => setIsMobileMenuOpen(false)}
            title="메뉴 닫기"
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        <nav className="dashboardNavigation" aria-label="Dashboard 메뉴">
          {DASHBOARD_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = isDashboardNavItemActive(pathname, item.href);

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "dashboardNavItem dashboardNavItemActive" : "dashboardNavItem"}
                href={item.href}
                key={item.href}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="dashboardAccount">
          <div className="dashboardAvatar" aria-hidden="true">
            {(user?.nickname || user?.username || "S").slice(0, 1).toUpperCase()}
          </div>
          <div className="dashboardAccountText">
            <strong>{user?.nickname || user?.username}</strong>
            <span>{user?.email}</span>
          </div>
          <button
            aria-label="로그아웃"
            className="dashboardLogoutButton"
            onClick={() => void handleLogout()}
            title="로그아웃"
            type="button"
          >
            <LogOut aria-hidden="true" size={18} />
          </button>
        </div>
      </aside>

      {isMobileMenuOpen ? (
        <button
          aria-label="Dashboard 메뉴 닫기"
          className="dashboardSidebarBackdrop"
          onClick={() => setIsMobileMenuOpen(false)}
          type="button"
        />
      ) : null}

      <div className="dashboardMainColumn">
        <header className="dashboardTopbar">
          <div className="dashboardTopbarTitle">
            <button
              aria-label="Dashboard 메뉴 열기"
              className="dashboardMobileMenuButton"
              onClick={() => setIsMobileMenuOpen(true)}
              title="메뉴 열기"
              type="button"
            >
              <Menu aria-hidden="true" size={20} />
            </button>
            <div>
              <strong>{pageTitle}</strong>
            </div>
          </div>

          {shouldShowCreateAction ? (
            <Link className="dashboardPrimaryAction" href="/workspace/new?fresh=1">
              <Plus aria-hidden="true" size={17} />
              <span>새 프로젝트</span>
            </Link>
          ) : null}
        </header>

        <main className="dashboardContent">{children}</main>
      </div>
    </div>
  );
}

// 현재 route와 가장 가까운 Dashboard 메뉴를 선택 상태로 표시합니다.
function isDashboardNavItemActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

// route 이름을 사용자가 이해할 수 있는 짧은 화면 제목으로 바꿉니다.
function getDashboardPageTitle(pathname: string): string {
  if (pathname.startsWith("/dashboard/projects/")) {
    return pathname.endsWith("/repository")
      ? "소스 저장소"
      : pathname.endsWith("/settings")
        ? "프로젝트 설정"
        : "프로젝트 상세";
  }

  return (
    DASHBOARD_NAV_ITEMS.find((item) => isDashboardNavItemActive(pathname, item.href))?.label ??
    "작업 현황"
  );
}
