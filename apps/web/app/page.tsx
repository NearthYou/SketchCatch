import Link from "next/link";
import { LandingHeaderActions } from "./landing-auth-actions";

export default function HomePage() {
  const proofPoints = [
    ["Build", "요구사항을 아키텍처 보드로 정리"],
    ["Review", "Terraform 변경과 위험을 먼저 확인"],
    ["Release", "승인된 실행과 기록만 남김"]
  ] as const;

  return (
    <main className="landingPage">
      <header className="siteHeader" aria-label="SketchCatch navigation">
        <Link className="brandLockup" href="/">
          <span className="brandMark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>SketchCatch</span>
        </Link>

        <nav className="siteNav" aria-label="Primary navigation">
          <a href="#journey">Flow</a>
          <a href="#safety">Safety Gate</a>
        </nav>

        <LandingHeaderActions />
      </header>

      <section className="landingHero" aria-labelledby="hero-title">
        <div className="blueprintHeroDrawing" aria-hidden="true">
          <div className="blueprintProductFrame">
            <div className="blueprintPipeline">
              <span className="blueprintPipelineNode">Prompt</span>
              <span className="blueprintPipelineLine" />
              <span className="blueprintPipelineNode blueprintPipelineNodePrimary">Board</span>
              <span className="blueprintPipelineLine" />
              <span className="blueprintPipelineNode">Plan</span>
              <span className="blueprintPipelineLine" />
              <span className="blueprintPipelineNode blueprintPipelineNodeDanger">Gate</span>
            </div>
            <div className="blueprintProductBoard">
              <span className="blueprintMiniNode blueprintMiniNodeVpc">VPC</span>
              <span className="blueprintMiniNode blueprintMiniNodeEc2">EC2</span>
              <span className="blueprintMiniNode blueprintMiniNodeS3">S3</span>
              <span className="blueprintMiniConnector blueprintMiniConnectorOne" />
              <span className="blueprintMiniConnector blueprintMiniConnectorTwo" />
            </div>
            <div className="blueprintHeroStatus">
              <span>HIGH</span>
              <strong>승인 전 배포 잠금</strong>
            </div>
          </div>
        </div>

        <div className="heroCopy">
          <p className="eyebrow">Terraform-first, multi-cloud-ready IaC operations</p>
          <h1 id="hero-title">요구사항에서 안전한 배포까지</h1>
          <p className="heroLead">
            SketchCatch는 아키텍처 설계, Terraform 검토, 배포 승인 흐름을 한 화면에서 이어주는
            IaC 운영 서비스입니다.
          </p>
          <div className="heroActions">
            <Link className="primaryCta" href="/workspace/new">
              새 작업 시작
            </Link>
            <Link className="navButton navButtonGhost" href="/login">
              로그인
            </Link>
          </div>
        </div>
      </section>

      <section className="landingHighlights blueprintJourney" id="journey" aria-label="SketchCatch service flow">
        {proofPoints.map(([label, text]) => (
          <article className="highlightCard blueprintJourneyCard" key={label}>
            <span className="highlightKicker">{label}</span>
            <h2>{text}</h2>
          </article>
        ))}
      </section>

      <section className="blueprintSafetyBand" id="safety" aria-labelledby="safety-title">
        <div>
          <p className="eyebrow">Safety Gate</p>
          <h2 id="safety-title">위험한 배포는 잠기고, 이유는 바로 보입니다.</h2>
          <p>HIGH/MED/LOW 신호로 승인, 비용, 설정 위험을 먼저 확인합니다.</p>
        </div>
        <div className="blueprintGatePreview" aria-hidden="true">
          <span className="gateBadge gateBadgeHigh">HIGH</span>
          <strong>승인 대기</strong>
          <p>Plan 승인 전 Apply는 비활성화됩니다.</p>
        </div>
      </section>
    </main>
  );
}
