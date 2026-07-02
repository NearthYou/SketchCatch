"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-provider";
import { getApiErrorMessage } from "../../lib/api-client";
import { DashboardIcon, type DashboardIconName } from "./dashboard-icons";

const navItems: ReadonlyArray<{
  readonly href: string;
  readonly icon: DashboardIconName;
  readonly label: string;
}> = [
  { href: "/mypage", icon: "home", label: "홈 화면" },
  { href: "/projects", icon: "folder", label: "내 프로젝트" },
  { href: "/templates", icon: "layers", label: "템플릿 허브" },
  { href: "/costs", icon: "billing", label: "비용관리" },
  { href: "/settings", icon: "settings", label: "환경설정" }
];

type DashboardShellProps = {
  readonly children: ReactNode;
  readonly projectSearchQuery?: string | undefined;
};

export function DashboardShell({ children, projectSearchQuery = "" }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, status, user } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [projectSearchInput, setProjectSearchInput] = useState(projectSearchQuery);
  const isCheckingSession = status === "loading";
  const canSearchProjects = pathname === "/mypage" || pathname === "/projects";
  const projectSearchPath = pathname === "/projects" ? "/projects" : "/mypage";
  const displayName = user?.nickname ?? user?.username ?? "사용자";
  const avatarText = displayName.slice(0, 1).toUpperCase();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  useEffect(() => {
    setProjectSearchInput(projectSearchQuery);
  }, [projectSearchQuery]);

  async function handleLogout(): Promise<void> {
    setErrorMessage(null);

    try {
      await logout();
      router.replace("/login");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "로그아웃에 실패했습니다."));
    }
  }

  function handleProjectSearchSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const query = projectSearchInput.trim();

    if (!query) {
      router.push(projectSearchPath);
      return;
    }

    const params = new URLSearchParams({
      q: query
    });

    router.push(`${projectSearchPath}?${params.toString()}`);
  }

  if (isCheckingSession) {
    return (
      <main className="workspaceShell workspaceStateShell">
        <p className="workspaceStateText">Checking session</p>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className="workspaceShell workspaceStateShell">
        <p className="workspaceStateText">Redirecting to login</p>
      </main>
    );
  }

  return (
    <main className="dashboardShell">
      <aside className="dashboardSidebar" aria-label="SketchCatch dashboard">
        <Link className="dashboardBrand" href="/mypage" aria-label="SketchCatch 홈">
          <span className="dashboardBrandMark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>SketchCatch</span>
        </Link>

        <nav className="dashboardNav" aria-label="주요 메뉴">
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "dashboardNavItem dashboardNavItemActive" : "dashboardNavItem"}
                href={item.href}
                key={item.href}
              >
                <DashboardIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="dashboardSidebarSpacer" />

        <div className="dashboardSidebarUser">
          <span className="dashboardAvatar" aria-hidden="true">
            {avatarText}
          </span>
          <div>
            <strong>{displayName}</strong>
            <button className="dashboardLogout" onClick={handleLogout} type="button">
              로그아웃
            </button>
          </div>
        </div>
      </aside>

      <section className="dashboardMain">
        <header className="dashboardTopbar">
          {canSearchProjects ? (
            <form className="dashboardSearch" aria-label="프로젝트 검색" onSubmit={handleProjectSearchSubmit}>
              <DashboardIcon name="search" />
              <input
                aria-label="내 프로젝트 검색"
                onChange={(event) => setProjectSearchInput(event.target.value)}
                placeholder="내 프로젝트에서 검색"
                type="search"
                value={projectSearchInput}
              />
              <button className="dashboardSearchButton" title="프로젝트 검색" type="submit">
                <DashboardIcon name="search" />
              </button>
            </form>
          ) : null}
          <Link className="dashboardTopbarAction" href="/workspace/new">
            <DashboardIcon name="plus" />
            <span>새로 만들기</span>
          </Link>
          <button className="dashboardIconButton" title="알림" type="button">
            <DashboardIcon name="bell" />
          </button>
        </header>

        {errorMessage ? (
          <p className="dashboardMessage" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {children}
      </section>
    </main>
  );
}
