import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Cloud,
  Code2,
  Database,
  FileCode2,
  GitBranch,
  History,
  Home,
  Layers3,
  LifeBuoy,
  LockKeyhole,
  Network,
  PanelTop,
  Play,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Trash2,
  UploadCloud,
  WalletCards,
  type LucideIcon
} from "lucide-react";
import { DesignDashboardAccountFooter } from "./design-dashboard-account-footer";

export type DesignDashboardView =
  | "overview"
  | "projects"
  | "project-detail"
  | "project-settings"
  | "templates"
  | "costs"
  | "settings";

type DesignDashboardPageProps = {
  readonly view: DesignDashboardView;
  readonly projectId?: string;
};

type NavItem = {
  readonly view: DesignDashboardView;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
};

type DashboardProject = {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly status: string;
  readonly risk: string;
  readonly updated: string;
  readonly cost: string;
  readonly resources: string;
};

const navItems: readonly NavItem[] = [
  { view: "overview", label: "홈", href: "/dashboard", icon: Home },
  { view: "projects", label: "프로젝트", href: "/dashboard/projects", icon: Layers3 },
  { view: "templates", label: "템플릿", href: "/dashboard/templates", icon: FileCode2 },
  { view: "costs", label: "비용", href: "/dashboard/costs", icon: CircleDollarSign },
  { view: "settings", label: "환경설정", href: "/dashboard/settings", icon: Settings }
];

const viewMeta: Record<DesignDashboardView, { readonly title: string; readonly subtitle: string }> = {
  overview: {
    title: "운영 대시보드",
    subtitle: "Requirement Input부터 Auto Cleanup까지 오늘 처리할 IaC 운영 흐름입니다."
  },
  projects: {
    title: "프로젝트",
    subtitle: "Practice Architecture와 IaC Preview 상태를 기준으로 운영 단위를 정리합니다."
  },
  "project-detail": {
    title: "프로젝트 상세",
    subtitle: "Architecture Board, Pre-Deployment Check, Terraform Preview를 함께 검토합니다."
  },
  "project-settings": {
    title: "프로젝트 설정",
    subtitle: "Git/CI/CD Deployment Path, 승인 정책, secret masking 기준을 관리합니다."
  },
  templates: {
    title: "시작 템플릿",
    subtitle: "Requirement Input, Source Repository, Reverse Engineering 입력 경로를 고릅니다."
  },
  costs: {
    title: "비용과 위험",
    subtitle: "Practice Architecture와 Deployment History 기준으로 비용 변화를 확인합니다."
  },
  settings: {
    title: "워크스페이스 설정",
    subtitle: "Provider Adapter, 알림, 배포 안전 정책을 한 곳에서 점검합니다."
  }
};

const defaultProject: DashboardProject = {
  id: "commerce-api",
  name: "Commerce API Launch",
  source: "Requirement Input",
  status: "Pre-Deployment Check",
  risk: "High risk blocked",
  updated: "12분 전",
  cost: "$42.80",
  resources: "VPC, EC2, S3, Security Group"
};

const projects: readonly DashboardProject[] = [
  defaultProject,
  {
    id: "ops-recovery",
    name: "Ops Recovery Scan",
    source: "Reverse Engineering",
    status: "IaC Preview",
    risk: "Import review",
    updated: "41분 전",
    cost: "$18.20",
    resources: "S3, IAM, CloudWatch"
  },
  {
    id: "team-handoff",
    name: "Team Git Handoff",
    source: "Source Repository",
    status: "Git/CI/CD Deployment Path",
    risk: "Ready for PR",
    updated: "어제",
    cost: "$31.10",
    resources: "VPC, EC2, ALB"
  }
];

const journey = [
  { label: "Requirement Input", detail: "텍스트 또는 음성 요구사항 확인", icon: Sparkles },
  { label: "Practice Architecture", detail: "provider-neutral 설계 초안", icon: Network },
  { label: "IaC Preview", detail: "Terraform 변경 미리보기", icon: Code2 },
  { label: "Pre-Deployment Check", detail: "비용, 보안, 설정 위험 검토", icon: ShieldCheck },
  { label: "Direct Deployment Path", detail: "승인된 plan만 실행", icon: Play },
  { label: "Git/CI/CD Deployment Path", detail: "PR과 pipeline handoff", icon: GitBranch },
  { label: "Deployment History", detail: "로그, output, 변경 이력", icon: History },
  { label: "Auto Cleanup", detail: "실습 리소스 정리 상태", icon: Trash2 }
];

const templates = [
  {
    title: "Requirement Input",
    body: "서비스 요구사항을 Practice Architecture와 Terraform-first IaC Preview로 연결합니다.",
    href: "/workspace/new",
    icon: Sparkles
  },
  {
    title: "Source Repository",
    body: "기존 repo evidence를 읽어 Git/CI/CD Deployment Path로 넘길 변경 단위를 만듭니다.",
    href: "/workspace/new?source=repository",
    icon: GitBranch
  },
  {
    title: "Reverse Engineering",
    body: "기존 cloud state를 Provider Adapter로 스캔해 import 제안과 설계 초안을 복원합니다.",
    href: "/workspace/reverse",
    icon: UploadCloud
  }
];

export function DesignDashboardPage({ view, projectId = "commerce-api" }: DesignDashboardPageProps) {
  const meta = viewMeta[view];

  return (
    <main className="designDashboardPage">
      <div className="designDashboardShell">
        <aside className="designDashboardSidebar" aria-label="Dashboard navigation">
          <div className="designDashboardSidebarHeader">
            <Link className="designDashboardBrand" href="/dashboard">
              <span>SketchCatch</span>
            </Link>
            <DesignDashboardAccountFooter compact />
          </div>
          <nav className="designDashboardNav">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = isNavActive(view, item.view);

              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={isActive ? "designDashboardNavLink isActive" : "designDashboardNavLink"}
                  href={item.href}
                  key={item.href}
                >
                  <Icon aria-hidden="true" size={17} strokeWidth={1.9} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <DesignDashboardAccountFooter />
        </aside>

        <section className="designDashboardMain" aria-labelledby="dashboard-view-title">
          <header className="designDashboardTopbar">
            <div>
              <p className="designDashboardKicker">Terraform-first operations</p>
              <h1 id="dashboard-view-title">{meta.title}</h1>
              <p>{meta.subtitle}</p>
            </div>
            <div className="designDashboardTopbarActions">
              <Link className="designDashboardSecondaryAction" href="/workspace/reverse">
                <UploadCloud aria-hidden="true" size={16} />
                <span>Reverse Engineering</span>
              </Link>
              <Link className="designDashboardPrimaryAction" href="/workspace/new">
                <Sparkles aria-hidden="true" size={16} />
                <span>새 설계 시작</span>
              </Link>
            </div>
          </header>

          {renderView(view, projectId)}
        </section>
      </div>
    </main>
  );
}

function renderView(view: DesignDashboardView, projectId: string) {
  switch (view) {
    case "projects":
      return <ProjectsView />;
    case "project-detail":
      return <ProjectDetailView projectId={projectId} />;
    case "project-settings":
      return <ProjectSettingsView projectId={projectId} />;
    case "templates":
      return <TemplatesView />;
    case "costs":
      return <CostsView />;
    case "settings":
      return <SettingsView />;
    case "overview":
    default:
      return <OverviewView />;
  }
}

function OverviewView() {
  return (
    <div className="designDashboardStack">
      <section className="designDashboardHeroGrid" aria-label="오늘의 운영 상태">
        <article className="designDashboardPanel designDashboardCommandPanel">
          <div className="designDashboardPanelHeader">
            <div>
              <h2>오늘 이어갈 작업</h2>
              <p>승인 대기 중인 Terraform 변경과 cleanup 상태를 먼저 정리했습니다.</p>
            </div>
            <Badge status="warning">승인 필요</Badge>
          </div>
          <div className="designDashboardTaskList">
            <TaskRow
              icon={ShieldCheck}
              title="Pre-Deployment Check"
              body="Commerce API Launch의 public SSH rule이 High Security Risk로 차단됨"
              href="/dashboard/projects/commerce-api"
            />
            <TaskRow
              icon={GitBranch}
              title="Git/CI/CD Deployment Path"
              body="Team Git Handoff의 Terraform PR 초안이 repository 연결을 기다림"
              href="/dashboard/projects/team-handoff/settings"
            />
            <TaskRow
              icon={Trash2}
              title="Auto Cleanup"
              body="어제 실행한 sandbox 리소스 cleanup 확인 필요"
              href="/dashboard/costs"
            />
          </div>
        </article>

        <article className="designDashboardPanel designDashboardDarkPanel">
          <div className="designDashboardPanelHeader">
            <div>
              <h2>IaC Preview</h2>
              <p>승인 전 plan 요약</p>
            </div>
            <TerminalSquare aria-hidden="true" size={20} />
          </div>
          <pre>
            <code>{`terraform plan
  + aws_vpc.practice
  + aws_subnet.public
  + aws_instance.api
  ~ aws_security_group.web

blocked: public SSH ingress`}</code>
          </pre>
        </article>
      </section>

      <section className="designDashboardPanel" aria-labelledby="journey-title">
        <div className="designDashboardPanelHeader">
          <div>
            <h2 id="journey-title">대표 서비스 여정</h2>
            <p>데모 전용 흐름이 아니라 실제 운영 경로의 현재 단계입니다.</p>
          </div>
        </div>
        <div className="designDashboardJourneyGrid">
          {journey.map((step) => {
            const Icon = step.icon;

            return (
              <article className="designDashboardJourneyStep" key={step.label}>
                <span className="designDashboardIconPlate">
                  <Icon aria-hidden="true" size={17} />
                </span>
                <div>
                  <strong>{step.label}</strong>
                  <p>{step.detail}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ProjectsView() {
  return (
    <div className="designDashboardStack">
      <section className="designDashboardPanel" aria-labelledby="project-list-title">
        <div className="designDashboardPanelHeader designDashboardPanelHeaderSplit">
          <div>
            <h2 id="project-list-title">Project inventory</h2>
            <p>Source Repository, Requirement Input, Reverse Engineering에서 생성된 작업 단위입니다.</p>
          </div>
          <label className="designDashboardSearch">
            <Search aria-hidden="true" size={16} />
            <span className="designDashboardSrOnly">프로젝트 검색</span>
            <input placeholder="프로젝트 검색" type="search" />
          </label>
        </div>
        <div className="designDashboardProjectList">
          {projects.map((project) => (
            <Link className="designDashboardProjectRow" href={`/dashboard/projects/${project.id}`} key={project.id}>
              <div>
                <strong>{project.name}</strong>
                <p>{project.resources}</p>
              </div>
              <span>{project.source}</span>
              <span>{project.status}</span>
              <span>{project.risk}</span>
              <span>{project.updated}</span>
              <ChevronRight aria-hidden="true" size={17} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProjectDetailView({ projectId }: { readonly projectId: string }) {
  const project = projects.find((item) => item.id === projectId) ?? defaultProject;

  return (
    <div className="designDashboardStack">
      <section className="designDashboardHeroGrid" aria-label="프로젝트 상세">
        <article className="designDashboardPanel">
          <div className="designDashboardPanelHeader">
            <div>
              <h2>{project.name}</h2>
              <p>{project.source}에서 시작한 Practice Architecture입니다.</p>
            </div>
            <Badge status="info">{project.status}</Badge>
          </div>
          <div className="designDashboardArchitecture">
            <ArchitectureNode icon={Cloud} label="VPC" detail="10.0.0.0/16" />
            <ArchitectureNode icon={Network} label="Public Subnet" detail="2 AZ" />
            <ArchitectureNode icon={Database} label="S3 Bucket" detail="artifact store" />
            <ArchitectureNode icon={Activity} label="EC2 API" detail="t3.micro" />
          </div>
        </article>

        <article className="designDashboardPanel">
          <div className="designDashboardPanelHeader">
            <div>
              <h2>Pre-Deployment Check</h2>
              <p>사용자 승인 전 차단되는 항목입니다.</p>
            </div>
            <ShieldCheck aria-hidden="true" size={20} />
          </div>
          <ul className="designDashboardCheckList">
            <li>
              <LockKeyhole aria-hidden="true" size={16} />
              <span>High Security Risk: SSH 0.0.0.0/0</span>
            </li>
            <li>
              <WalletCards aria-hidden="true" size={16} />
              <span>월 예상 비용 {project.cost}</span>
            </li>
            <li>
              <CheckCircle2 aria-hidden="true" size={16} />
              <span>Terraform syntax diagnostics 통과</span>
            </li>
          </ul>
          <Link className="designDashboardInlineAction" href={`/dashboard/projects/${project.id}/settings`}>
            승인 정책 보기 <ArrowRight aria-hidden="true" size={15} />
          </Link>
        </article>
      </section>

      <section className="designDashboardPanel designDashboardCodePanel" aria-labelledby="terraform-preview-title">
        <div className="designDashboardPanelHeader">
          <div>
            <h2 id="terraform-preview-title">Terraform Preview</h2>
            <p>실행은 backend safety gate 뒤에서만 연결됩니다.</p>
          </div>
        </div>
        <pre>
          <code>{`resource "aws_security_group" "web" {
  name = "practice-web"

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}`}</code>
        </pre>
      </section>
    </div>
  );
}

function ProjectSettingsView({ projectId }: { readonly projectId: string }) {
  return (
    <div className="designDashboardStack">
      <section className="designDashboardPanel" aria-labelledby="project-settings-title">
        <div className="designDashboardPanelHeader">
          <div>
            <h2 id="project-settings-title">Git handoff settings</h2>
            <p>{projectId}의 승인, PR, pipeline 상태 추적 기준입니다.</p>
          </div>
          <Badge status="success">secret masking on</Badge>
        </div>
        <div className="designDashboardSettingsGrid">
          <SettingRow icon={GitBranch} title="Repository" value="krafton-jungle/sketchcatch-infra" />
          <SettingRow icon={PanelTop} title="Default branch" value="dev" />
          <SettingRow icon={BadgeCheck} title="Approval rule" value="Plan 확인 후 사용자 승인" />
          <SettingRow icon={LifeBuoy} title="Rollback note" value="Auto Cleanup 기록과 연결" />
        </div>
      </section>
    </div>
  );
}

function TemplatesView() {
  return (
    <section className="designDashboardTemplateGrid" aria-label="시작 템플릿">
      {templates.map((template) => {
        const Icon = template.icon;

        return (
          <Link className="designDashboardTemplate" href={template.href} key={template.title}>
            <span className="designDashboardIconPlate">
              <Icon aria-hidden="true" size={18} />
            </span>
            <div>
              <h2>{template.title}</h2>
              <p>{template.body}</p>
            </div>
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        );
      })}
    </section>
  );
}

function CostsView() {
  return (
    <div className="designDashboardStack">
      <section className="designDashboardPanel" aria-labelledby="cost-title">
        <div className="designDashboardPanelHeader">
          <div>
            <h2 id="cost-title">Cost risk queue</h2>
            <p>Practice Architecture, IaC Preview, Deployment History 단위의 비용 변화입니다.</p>
          </div>
          <Badge status="warning">budget watch</Badge>
        </div>
        <div className="designDashboardCostTable">
          {projects.map((project) => (
            <div className="designDashboardCostRow" key={project.id}>
              <span>{project.name}</span>
              <strong>{project.cost}</strong>
              <span>{project.risk}</span>
              <Link href={`/dashboard/projects/${project.id}`}>검토</Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SettingsView() {
  return (
    <div className="designDashboardStack">
      <section className="designDashboardPanel" aria-labelledby="workspace-settings-title">
        <div className="designDashboardPanelHeader">
          <div>
            <h2 id="workspace-settings-title">Workspace controls</h2>
            <p>Provider Adapter와 deployment safety policy를 운영 기준에 맞춥니다.</p>
          </div>
        </div>
        <div className="designDashboardSettingsGrid">
          <SettingRow icon={Cloud} title="Provider Adapter" value="AWS-first, multi-cloud-ready model" />
          <SettingRow icon={ShieldCheck} title="High risk gate" value="차단 후 사용자 승인 필요" />
          <SettingRow icon={History} title="Deployment History" value="로그, output, cleanup 상태 보존" />
          <SettingRow icon={Trash2} title="Auto Cleanup" value="sandbox 리소스 정리 추적" />
        </div>
      </section>
    </div>
  );
}

function TaskRow({
  icon: Icon,
  title,
  body,
  href
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
  readonly href: string;
}) {
  return (
    <Link className="designDashboardTaskRow" href={href}>
      <span className="designDashboardIconPlate">
        <Icon aria-hidden="true" size={17} />
      </span>
      <span>
        <strong>{title}</strong>
        <p>{body}</p>
      </span>
      <ChevronRight aria-hidden="true" size={16} />
    </Link>
  );
}

function ArchitectureNode({
  icon: Icon,
  label,
  detail
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly detail: string;
}) {
  return (
    <div className="designDashboardArchitectureNode">
      <Icon aria-hidden="true" size={17} />
      <strong>{label}</strong>
      <span>{detail}</span>
    </div>
  );
}

function SettingRow({
  icon: Icon,
  title,
  value
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly value: string;
}) {
  return (
    <div className="designDashboardSettingRow">
      <span className="designDashboardIconPlate">
        <Icon aria-hidden="true" size={17} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{value}</p>
      </div>
    </div>
  );
}

function Badge({
  status,
  children
}: {
  readonly status: "info" | "success" | "warning";
  readonly children: ReactNode;
}) {
  return <span className={`designDashboardBadge is-${status}`}>{children}</span>;
}

function isNavActive(current: DesignDashboardView, item: DesignDashboardView): boolean {
  if (current === "project-detail" || current === "project-settings") {
    return item === "projects";
  }

  return current === item;
}
