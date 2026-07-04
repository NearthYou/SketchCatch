import Link from "next/link";
import { LandingHeaderActions } from "./landing-auth-actions";

export default function HomePage() {
  const journey = [
    ["01", "Requirement Input"],
    ["02", "Architecture Board"],
    ["03", "IaC Preview"],
    ["04", "Safety Gate"],
    ["05", "Deployment History"]
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
          <a href="#journey">Journey</a>
          <a href="#safety">Safety Gate</a>
          <a href="#operations">Operations</a>
        </nav>

        <LandingHeaderActions />
      </header>

      <section className="landingHero" aria-labelledby="hero-title">
        <div className="blueprintHeroDrawing" aria-hidden="true">
          <div className="blueprintBoardFrame">
            <div className="blueprintNode blueprintNodeInput">REQ</div>
            <div className="blueprintNode blueprintNodeVpc">VPC</div>
            <div className="blueprintNode blueprintNodeEc2">EC2</div>
            <div className="blueprintNode blueprintNodeS3">S3</div>
            <div className="blueprintNode blueprintNodeGate">HIGH GATE</div>
            <span className="blueprintTrace blueprintTraceOne" />
            <span className="blueprintTrace blueprintTraceTwo" />
            <span className="blueprintTrace blueprintTraceThree" />
          </div>
          <div className="blueprintTitleblock">
            <div>
              <span>PRODUCT</span>
              <strong>SketchCatch</strong>
            </div>
            <div>
              <span>DIRECTION</span>
              <strong>Terraform-first · multi-cloud-ready</strong>
            </div>
            <div>
              <span>MVP ADAPTER</span>
              <strong>AWS-first</strong>
            </div>
            <div>
              <span>DEPLOYMENT</span>
              <strong>Direct / Git-CI-CD</strong>
            </div>
          </div>
        </div>

        <div className="heroCopy">
          <p className="eyebrow">Terraform-first, multi-cloud-ready IaC operations</p>
          <h1 id="hero-title">SketchCatch</h1>
          <p className="heroLead">
            요구사항을 Practice Architecture로 정리하고 Terraform IaC Preview와 배포 전
            안전 게이트를 거쳐 운영 기록까지 연결하는 IaC 운영 서비스입니다.
          </p>
          <div className="heroActions">
            <Link className="primaryCta" href="/workspace/new">
              새 아키텍처 시작
            </Link>
            <Link className="navButton navButtonGhost" href="/login">
              로그인
            </Link>
          </div>
        </div>
      </section>

      <section className="landingHighlights blueprintJourney" id="journey" aria-label="SketchCatch service journey">
        {journey.map(([step, label]) => (
          <article className="highlightCard blueprintJourneyCard" key={label}>
            <span className="highlightKicker">{step}</span>
            <h2>{label}</h2>
          </article>
        ))}
      </section>

      <section className="blueprintSafetyBand" id="safety" aria-labelledby="safety-title">
        <div>
          <p className="eyebrow">Pre-Deployment Check</p>
          <h2 id="safety-title">잠긴 상태가 의도된 상태로 보이는 Safety Gate</h2>
          <p>
            차단 사유, plan warning, pre-deployment finding을 HIGH/MED/LOW로 정리해
            Apply와 Destroy 전 사용자가 멈춰야 하는 이유를 먼저 이해하게 합니다.
          </p>
        </div>
        <div className="blueprintGatePreview" aria-hidden="true">
          <span className="gateBadge gateBadgeHigh">HIGH</span>
          <strong>missing_approval</strong>
          <p>Plan approval required before direct deployment.</p>
        </div>
      </section>

      <section className="landingHighlights blueprintOps" id="operations" aria-label="SketchCatch operations">
        <article className="highlightCard">
          <span className="highlightKicker">AWS-first</span>
          <h2>Provider Adapter</h2>
          <p>MVP는 AWS 연결과 Direct Deployment가 전면에 드러나지만 도메인은 공급자 중립으로 유지합니다.</p>
        </article>
        <article className="highlightCard">
          <span className="highlightKicker">Terraform</span>
          <h2>IaC Preview</h2>
          <p>Board 변경을 Terraform 산출물과 비교하고 배포 기준 저장 후 실행 단계로 넘깁니다.</p>
        </article>
        <article className="highlightCard">
          <span className="highlightKicker">History</span>
          <h2>Deployment Records</h2>
          <p>실행 결과, 로그, 출력, 정리 상태를 같은 운영 화면 안에서 확인합니다.</p>
        </article>
      </section>
    </main>
  );
}
