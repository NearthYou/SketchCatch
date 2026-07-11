"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Shapes,
  X
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-provider";

const DASHBOARD_NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { href: "/dashboard/projects", icon: FolderKanban, label: "Projects" },
  { href: "/dashboard/templates", icon: Shapes, label: "Templates" }
] as const;

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

  async function handleLogout(): Promise<void> {
    await logout();
    router.replace("/login");
  }

  if (status !== "authenticated") {
    return (
      <main className="dashboardSessionState" aria-live="polite">
        <Image alt="SketchCatch" height={48} priority src="/sketchcatch-logo.png" width={32} />
        <strong>SketchCatch</strong>
        <p>{status === "loading" ? "세션을 확인하고 있습니다." : "로그인 화면으로 이동합니다."}</p>
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
          <Link className="dashboardBrand" href="/dashboard" aria-label="SketchCatch Dashboard">
            <Image alt="" height={24} priority src="/sketchcatch-logo.png" width={16} />
            <span>SketchCatch</span>
          </Link>
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
              <span>Dashboard</span>
              <strong>{pageTitle}</strong>
            </div>
          </div>

          {shouldShowCreateAction ? (
            <Link className="dashboardPrimaryAction" href="/workspace/new">
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

function isDashboardNavItemActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function getDashboardPageTitle(pathname: string): string {
  if (pathname.startsWith("/dashboard/projects/")) {
    return pathname.endsWith("/settings") ? "Project Settings" : "Project Detail";
  }

  return (
    DASHBOARD_NAV_ITEMS.find((item) => isDashboardNavItemActive(pathname, item.href))?.label ??
    "Overview"
  );
}
