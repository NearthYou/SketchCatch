import Link from "next/link";

const flowSteps = [
  {
    description: "텍스트, Voice Requirement Input, Source Repository, 기존 cloud state를 Requirement Prompt로 정리합니다.",
    label: "01",
    title: "Requirement Input"
  },
  {
    description: "AI Architecture Recommendation을 사용자가 검토 가능한 Practice Architecture 초안으로 전환합니다.",
    label: "02",
    title: "Practice Architecture"
  },
  {
    description: "Architecture Board와 같은 설계 데이터를 바라보는 Terraform-first IaC Preview를 생성합니다.",
    label: "03",
    title: "IaC Preview"
  },
  {
    description: "비용, 보안, 변경 영향, High Security Risk를 Pre-Deployment Check에서 먼저 확인합니다.",
    label: "04",
    title: "Pre-Deployment Check"
  }
] as const;

const pathCards = [
  {
    description: "Plan, 승인, Apply, 로그, Outputs, Auto Cleanup까지 한 흐름으로 추적합니다.",
    title: "Direct Deployment Path"
  },
  {
    description: "Terraform 변경을 Source Repository PR과 pipeline 상태로 넘겨 팀 리뷰를 이어갑니다.",
    title: "Git/CI/CD Deployment Path"
  },
  {
    description: "Provider Adapter로 기존 cloud state를 읽고 Practice Architecture와 import 제안으로 복원합니다.",
    title: "Reverse Engineering"
  }
] as const;

export default function HomePage() {
  return (
    <main className="sketchLandingPage">
      <header className="sketchLandingNav" aria-label="SketchCatch landing navigation">
        <Link className="sketchLandingBrand" href="/">
          <span>SketchCatch</span>
        </Link>
        <nav className="sketchLandingNavLinks" aria-label="Landing sections">
          <a href="#flow">제품 흐름</a>
          <a href="#safety">안전 검토</a>
          <a href="#paths">운영 경로</a>
        </nav>
        <Link className="sketchLandingNavLogin" href="/login">
          로그인
        </Link>
      </header>

      <section className="sketchLandingHero" aria-labelledby="landing-title">
        <div className="sketchLandingHeroCopy">
          <p className="sketchLandingBadge">Terraform-first operations</p>
          <h1 id="landing-title">SketchCatch</h1>
          <p className="sketchLandingHeroLead">multi-cloud-ready IaC 운영 서비스</p>
          <p className="sketchLandingHeroText">
            요구사항, repository evidence, 기존 클라우드 상태를 Practice Architecture로 만들고 IaC Preview와
            Pre-Deployment Check를 거쳐 승인된 배포 경로로 연결합니다.
          </p>
          <div className="sketchLandingHeroActions">
            <Link className="sketchLandingPrimaryButton" href="/workspace/new">
              새 작업 시작
            </Link>
            <Link className="sketchLandingSecondaryButton" href="/workspace/reverse">
              Reverse Engineering 보기
            </Link>
          </div>
        </div>

        <div className="sketchLandingDevice" aria-label="SketchCatch product preview">
          <div className="sketchLandingLaptop">
            <div className="sketchLandingWindowBar">
              <span />
              <span />
              <span />
              <strong>Practice Architecture</strong>
            </div>
            <div className="sketchLandingPreviewGrid">
              <section className="sketchLandingBoard" aria-label="Architecture Board preview">
                <div className="sketchLandingBoardHeader">
                  <span>Architecture Board</span>
                  <strong>User-Accepted Change 대기</strong>
                </div>
                <div className="sketchLandingNode sketchLandingNodePrimary">Requirement Prompt</div>
                <div className="sketchLandingNode sketchLandingNodeDraft">Architecture Draft</div>
                <div className="sketchLandingNode sketchLandingNodeIac">IaC Preview</div>
                <div className="sketchLandingNode sketchLandingNodeGate">Pre-Deployment Check</div>
              </section>
              <section className="sketchLandingCode" aria-label="Terraform preview sample">
                <div className="sketchLandingCodeHeader">
                  <span>terraform plan</span>
                  <strong>provider-neutral model</strong>
                </div>
                <pre>{`resource "service_boundary" "practice" {
  source = "accepted_architecture"
  target = "terraform_preview"
}`}</pre>
              </section>
            </div>
          </div>
          <aside className="sketchLandingPhone" aria-label="Deployment gate status">
            <span>Safety Gate</span>
            <strong>HIGH RISK 차단</strong>
            <p>사용자 승인 후 Direct Deployment Path 또는 Git/CI/CD Deployment Path로 진행합니다.</p>
          </aside>
        </div>
      </section>

      <section className="sketchLandingProof" aria-label="SketchCatch operating promise">
        <span>Requirement Input</span>
        <span>AI Architecture Recommendation</span>
        <span>Deployment History</span>
        <span>Auto Cleanup</span>
      </section>

      <section className="sketchLandingSection" id="flow" aria-labelledby="flow-title">
        <div className="sketchLandingSectionHeader">
          <p className="sketchLandingBadge">Service flow</p>
          <h2 id="flow-title">요구에서 운영 가능한 IaC까지 한 화면의 흐름으로.</h2>
          <p>
            SketchCatch는 다이어그램만 그리는 도구가 아니라, 설계 근거와 Terraform 변경, 승인 전 위험을 함께
            검토하는 IaC operations flow입니다.
          </p>
        </div>
        <div className="sketchLandingFlow">
          {flowSteps.map((step) => (
            <article className="sketchLandingFlowCard" key={step.title}>
              <span>{step.label}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sketchLandingSafety" id="safety" aria-labelledby="safety-title">
        <div>
          <p className="sketchLandingBadge">Safety before execution</p>
          <h2 id="safety-title">AI가 제안하고, 사용자가 결정합니다.</h2>
          <p>
            AI, Bedrock, Amazon Q Assistance는 추천과 설명을 보강하지만 Architecture 변경, Git handoff,
            Deployment action은 사용자 승인 전까지 실행되지 않습니다.
          </p>
        </div>
        <div className="sketchLandingSafetyPanel">
          <span>Pre-Deployment Check</span>
          <strong>Plan summary + risk finding + approval gate</strong>
          <p>실제 계정, secret, region 값은 노출하지 않고 영향과 다음 선택을 보여줍니다.</p>
        </div>
      </section>

      <section className="sketchLandingSection" id="paths" aria-labelledby="paths-title">
        <div className="sketchLandingSectionHeader">
          <p className="sketchLandingBadge">Operation paths</p>
          <h2 id="paths-title">직접 실행과 팀 리뷰 경로를 모두 준비합니다.</h2>
        </div>
        <div className="sketchLandingPathGrid">
          {pathCards.map((path) => (
            <article className="sketchLandingPathCard" key={path.title}>
              <h3>{path.title}</h3>
              <p>{path.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sketchLandingFinal" aria-labelledby="final-title">
        <p className="sketchLandingBadge">Start controlled</p>
        <h2 id="final-title">Practice Architecture부터 안전하게 시작하세요.</h2>
        <Link className="sketchLandingPrimaryButton" href="/workspace/new">
          새 작업 시작
        </Link>
      </section>
    </main>
  );
}
