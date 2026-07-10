import Link from "next/link";
import { Cloud, Layers3, PanelTop, Settings, Sparkles } from "lucide-react";
import { WorkspaceStartClient } from "./workspace-start-client";

export default function NewWorkspacePage() {
  return (
    <main className="designDashboardPage workspaceNewPage">
      <div className="designDashboardShell">
        <aside className="designDashboardSidebar" aria-label="새 프로젝트 메뉴">
          <Link className="designDashboardBrand" href="/dashboard">
            <span>SketchCatch</span>
          </Link>
          <nav className="designDashboardNav" aria-label="새 프로젝트 관련 화면">
            <Link className="designDashboardNavLink" href="/dashboard">
              <PanelTop aria-hidden="true" size={17} strokeWidth={1.9} />
              <span>대시보드</span>
            </Link>
            <Link className="designDashboardNavLink" href="/dashboard/projects">
              <Layers3 aria-hidden="true" size={17} strokeWidth={1.9} />
              <span>프로젝트</span>
            </Link>
            <Link aria-current="page" className="designDashboardNavLink isActive" href="/workspace/new">
              <Sparkles aria-hidden="true" size={17} strokeWidth={1.9} />
              <span>새 프로젝트</span>
            </Link>
            <Link className="designDashboardNavLink" href="/dashboard/settings">
              <Settings aria-hidden="true" size={17} strokeWidth={1.9} />
              <span>환경설정</span>
            </Link>
          </nav>
          <div className="designDashboardSidebarFooter">
            <p>Start flow</p>
            <strong>AI 초안, 기존 AWS 가져오기, 빈 보드 중 하나로 시작합니다.</strong>
          </div>
        </aside>

        <section className="designDashboardMain workspaceNewMain" aria-labelledby="workspace-start-title">
          <header className="designDashboardTopbar workspaceNewTopbar">
            <div>
              <p className="designDashboardKicker">New project</p>
              <h1 id="workspace-start-title">새 프로젝트 시작</h1>
              <p>
                프로젝트 이름을 정하고 시작 방식을 고르면 바로 다음 작업 화면으로 이어집니다.
              </p>
            </div>
            <Link className="designDashboardSecondaryAction" href="/dashboard">
              <PanelTop aria-hidden="true" size={16} />
              <span>대시보드로 이동</span>
            </Link>
          </header>

          <div className="workspaceNewLayout">
            <section className="designDashboardPanel workspaceNewPanel" aria-labelledby="workspace-new-form-title">
              <div className="designDashboardPanelHeader">
                <div>
                  <h2 id="workspace-new-form-title">프로젝트 설정</h2>
                  <p>먼저 이름을 입력한 뒤, 어떤 방식으로 보드를 시작할지 선택합니다.</p>
                </div>
              </div>
              <WorkspaceStartClient />
            </section>

            <aside className="designDashboardPanel workspaceNewGuide" aria-label="시작 방식 안내">
              <div className="workspaceNewGuideIcon">
                <Cloud aria-hidden="true" size={22} />
              </div>
              <h2>처음엔 이것만 알면 됩니다</h2>
              <ul className="workspaceNewGuideList">
                <li>
                  <strong>AI로 시작</strong>
                  <span>요구사항을 적고 초안 보드를 만듭니다.</span>
                </li>
                <li>
                  <strong>기존 AWS 가져오기</strong>
                  <span>연결된 AWS를 읽고 보드 후보를 만듭니다.</span>
                </li>
                <li>
                  <strong>빈 보드로 열기</strong>
                  <span>아무 리소스 없이 직접 그리기 시작합니다.</span>
                </li>
              </ul>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
