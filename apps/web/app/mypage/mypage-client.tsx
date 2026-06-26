"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../../components/auth/auth-provider";
import { getApiErrorMessage } from "../../lib/api-client";

type IconName =
  | "alert"
  | "bell"
  | "billing"
  | "chevron"
  | "clock"
  | "folder"
  | "grid"
  | "home"
  | "layers"
  | "list"
  | "plus"
  | "search"
  | "settings"
  | "shield"
  | "stack";

const sidebarItems: Array<{ href: string; icon: IconName; label: string; active?: boolean }> = [
  { href: "/mypage", icon: "home", label: "홈", active: true },
  { href: "#projects", icon: "folder", label: "내 프로젝트" },
  { href: "#billing", icon: "billing", label: "요금 현황" },
  { href: "#templates", icon: "layers", label: "템플릿 hub" },
  { href: "#settings", icon: "settings", label: "설정" }
];

const architectures = [
  {
    cloud: "AWS",
    editedAt: "2시간 전 수정",
    name: "VPC subnet practice",
    project: "Project 1",
    resources: ["VPC", "Subnet", "EC2"],
    status: "Dev"
  },
  {
    cloud: "AWS",
    editedAt: "어제 수정",
    name: "Cost guard starter",
    project: "Team demo",
    resources: ["S3", "RDS", "Alarm"],
    status: "Review"
  }
];

const templates = ["AWS 3-tier web", "Private subnet lab", "RDS backup check"];

function Icon({ name }: { name: IconName }) {
  let content: ReactNode;

  switch (name) {
    case "alert":
      content = (
        <>
          <path d="M12 4 3 20h18z" />
          <path d="M12 9v5" />
          <path d="M12 17h.01" />
        </>
      );
      break;
    case "bell":
      content = (
        <>
          <path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
          <path d="M10 21h4" />
        </>
      );
      break;
    case "billing":
      content = (
        <>
          <path d="M3 7h18v11H3z" />
          <path d="M3 10h18" />
          <path d="M15 15h3" />
        </>
      );
      break;
    case "chevron":
      content = (
        <>
          <path d="M4 5h16" />
          <path d="M4 12h10" />
          <path d="M4 19h16" />
          <path d="m18 9-3 3 3 3" />
        </>
      );
      break;
    case "clock":
      content = (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      );
      break;
    case "folder":
      content = (
        <>
          <path d="M3 6h6l2 2h10v10H3z" />
          <path d="M3 10h18" />
        </>
      );
      break;
    case "grid":
      content = (
        <>
          <path d="M4 4h6v6H4z" />
          <path d="M14 4h6v6h-6z" />
          <path d="M4 14h6v6H4z" />
          <path d="M14 14h6v6h-6z" />
        </>
      );
      break;
    case "home":
      content = (
        <>
          <path d="m3 10 9-7 9 7" />
          <path d="M5 10v10h14V10" />
          <path d="M9 20v-6h6v6" />
        </>
      );
      break;
    case "layers":
      content = (
        <>
          <path d="m12 3 9 5-9 5-9-5z" />
          <path d="m3 12 9 5 9-5" />
          <path d="m3 16 9 5 9-5" />
        </>
      );
      break;
    case "list":
      content = (
        <>
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3 6h.01" />
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
        </>
      );
      break;
    case "plus":
      content = (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      );
      break;
    case "search":
      content = (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </>
      );
      break;
    case "settings":
      content = (
        <>
          <path d="M4 7h4" />
          <path d="M14 7h6" />
          <circle cx="11" cy="7" r="3" />
          <path d="M4 17h7" />
          <path d="M17 17h3" />
          <circle cx="14" cy="17" r="3" />
        </>
      );
      break;
    case "shield":
      content = (
        <>
          <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z" />
          <path d="m9 12 2 2 4-5" />
        </>
      );
      break;
    case "stack":
      content = (
        <>
          <path d="M12 3 4 7l8 4 8-4z" />
          <path d="m4 12 8 4 8-4" />
          <path d="m4 17 8 4 8-4" />
        </>
      );
      break;
  }

  return (
    <svg
      aria-hidden="true"
      className="myPageIcon"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9">
        {content}
      </g>
    </svg>
  );
}

export function MyPageClient() {
  const router = useRouter();
  const { logout, status, user } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isCheckingSession = status === "loading";
  const displayName = user?.nickname ?? user?.username ?? "사용자";
  const avatarText = displayName.slice(0, 1).toUpperCase();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  async function handleLogout(): Promise<void> {
    setErrorMessage(null);

    try {
      await logout();
      router.replace("/login");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Logout failed."));
    }
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
    <main className="myPageShell">
      <aside className="myPageSidebar" aria-label="sketchcatch sidebar">
        <Link className="myPageBrand" href="/mypage" aria-label="sketchcatch 홈">
          <span className="myPageBrandMark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>sketchcatch</span>
        </Link>

        <div className="myPageSidebarLabel">MY WORKSPACE</div>
        <nav className="myPageNav" aria-label="주요 메뉴">
          {sidebarItems.map((item) => (
            <Link
              className={item.active ? "myPageNavItem myPageNavItemActive" : "myPageNavItem"}
              href={item.href}
              key={item.label}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <section className="myPagePlan" aria-labelledby="plan-title">
          <div className="myPagePlanHeader">
            <h2 id="plan-title">Starter</h2>
            <span>Trial</span>
          </div>
          <p>무료 실습 크레딧</p>
          <div className="myPagePlanProgress" aria-hidden="true">
            <span />
          </div>
          <strong>24일 남음</strong>
        </section>

        <div className="myPageSidebarSpacer" />

        <Link className="myPageSidebarAction" href="/workspace">
          <Icon name="plus" />
          <span>새 설계 시작</span>
        </Link>

        <div className="myPageSidebarUser" id="settings">
          <span className="myPageAvatar" aria-hidden="true">
            {avatarText}
          </span>
          <div>
            <strong>{displayName}</strong>
            <button className="myPageLogout" onClick={handleLogout} type="button">
              로그아웃
            </button>
          </div>
        </div>
      </aside>

      <section className="myPageContent">
        <header className="myPageTopbar">
          <button className="myPageIconButton" title="사이드바 접기" type="button">
            <Icon name="chevron" />
          </button>
          <div className="myPageGreeting">
            <p>Good evening, {displayName}!</p>
            <span>오늘은 비용과 보안 검토가 필요한 설계가 2개 있습니다.</span>
          </div>
          <label className="myPageSearch">
            <Icon name="search" />
            <input aria-label="검색" placeholder="Search or go to..." type="search" />
            <kbd>Ctrl K</kbd>
          </label>
          <button className="myPageIconButton" title="알림" type="button">
            <Icon name="bell" />
          </button>
        </header>

        {errorMessage ? (
          <p className="myPageMessage" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <section className="myPageOverview" aria-labelledby="overview-title">
          <div>
            <p className="myPageEyebrow">Terraform-first workspace</p>
            <h1 id="overview-title">인프라 설계 대시보드</h1>
          </div>
          <div className="myPageStats" aria-label="요약">
            <article>
              <Icon name="stack" />
              <span>아키텍처</span>
              <strong>8</strong>
            </article>
            <article>
              <Icon name="billing" />
              <span>월 예상 비용</span>
              <strong>$42.80</strong>
            </article>
            <article>
              <Icon name="alert" />
              <span>검토 필요</span>
              <strong>2</strong>
            </article>
          </div>
        </section>

        <div className="myPageGrid">
          <section className="myPagePanel myPageArchitectures" id="projects">
            <div className="myPagePanelHeader">
              <div>
                <p className="myPagePanelKicker">Recent architectures</p>
                <h2>최근 아키텍처</h2>
              </div>
              <div className="myPagePanelActions">
                <Link className="myPagePrimaryAction" href="/workspace">
                  <Icon name="plus" />
                  <span>새 아키텍처</span>
                </Link>
                <button className="myPageIconButton myPageIconButtonMuted" title="목록 보기" type="button">
                  <Icon name="list" />
                </button>
                <button className="myPageIconButton myPageIconButtonActive" title="그리드 보기" type="button">
                  <Icon name="grid" />
                </button>
              </div>
            </div>

            <div className="myPageArchitectureGrid">
              {architectures.map((architecture) => (
                <article className="myPageArchitectureCard" key={architecture.name}>
                  <div className="myPageArchitecturePreview" aria-hidden="true">
                    <span className="myPageDiagramFrame" />
                    <span className="myPageDiagramNode myPageDiagramVpc">VPC</span>
                    <span className="myPageDiagramNode myPageDiagramApp">EC2</span>
                    <span className="myPageDiagramNode myPageDiagramData">RDS</span>
                    <span className="myPageDiagramLine myPageDiagramLineOne" />
                    <span className="myPageDiagramLine myPageDiagramLineTwo" />
                  </div>

                  <div className="myPageArchitectureTitle">
                    <span>{architecture.cloud}</span>
                    <h3>{architecture.name}</h3>
                  </div>

                  <div className="myPageChipRow">
                    <span className="myPageChip">
                      <Icon name="folder" />
                      {architecture.project}
                    </span>
                    <span className="myPageChip myPageChipAccent">{architecture.status}</span>
                  </div>

                  <div className="myPageChipRow">
                    {architecture.resources.map((resource) => (
                      <span className="myPageResourceChip" key={resource}>
                        {resource}
                      </span>
                    ))}
                  </div>

                  <p className="myPageTimestamp">
                    <Icon name="clock" />
                    {architecture.editedAt}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <aside className="myPageRail">
            <section className="myPagePanel myPageCompactPanel" id="billing">
              <div className="myPagePanelHeader">
                <div>
                  <p className="myPagePanelKicker">Billing</p>
                  <h2>요금 현황</h2>
                </div>
                <Icon name="billing" />
              </div>
              <div className="myPageBillingAmount">
                <span>이번 달 예상</span>
                <strong>$42.80</strong>
              </div>
              <div className="myPageBillingRows">
                <span>EC2 practice</span>
                <strong>$18.20</strong>
                <span>RDS sandbox</span>
                <strong>$16.40</strong>
                <span>S3 template</span>
                <strong>$8.20</strong>
              </div>
            </section>

            <section className="myPagePanel myPageCompactPanel" id="templates">
              <div className="myPagePanelHeader">
                <div>
                  <p className="myPagePanelKicker">Templates</p>
                  <h2>템플릿 hub</h2>
                </div>
                <Icon name="layers" />
              </div>
              <div className="myPageTemplateList">
                {templates.map((template) => (
                  <Link href="/workspace" key={template}>
                    <span>{template}</span>
                    <Icon name="stack" />
                  </Link>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <section className="myPagePanel myPageSimulationPanel" aria-labelledby="simulation-title">
          <div className="myPagePanelHeader">
            <div>
              <p className="myPagePanelKicker">Simulation runs</p>
              <h2 id="simulation-title">최근 시뮬레이션</h2>
            </div>
            <button className="myPageIconButton myPageIconButtonMuted" title="전체 화면" type="button">
              <Icon name="grid" />
            </button>
          </div>
          <div className="myPageEmptyState">
            <div className="myPageEmptyIcon" aria-hidden="true">
              <Icon name="shield" />
            </div>
            <h3>아직 실행된 시뮬레이션이 없습니다</h3>
            <p>Terraform plan, 비용, 보안 검토 결과가 생성되면 이 영역에 표시됩니다.</p>
            <Link className="myPagePrimaryAction" href="/workspace">
              <Icon name="plus" />
              <span>첫 설계 만들기</span>
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
