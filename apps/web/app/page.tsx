import Link from "next/link";
import { LandingHeaderActions } from "./landing-auth-actions";

const proofPoints = [
  {
    label: "01 문제",
    title: "요구사항은 빠르게 나오지만 결정은 흩어집니다.",
    text: "설계, 코드, 검토가 따로 움직이면 팀의 기준이 흔들립니다."
  },
  {
    label: "02 정리",
    title: "SketchCatch는 요구를 실행 가능한 흐름으로 정리합니다.",
    text: "보드와 Terraform 변경을 같은 화면에서 맞춥니다."
  },
  {
    label: "03 확인",
    title: "배포 전에는 비용, 보안, 기록까지 확인합니다.",
    text: "바로 실행할지 Git으로 넘길지 한 번에 결정합니다."
  }
] as const;

export default function HomePage() {
  return (
    <main className="landingPage">
      <header className="siteHeader" aria-label="SketchCatch navigation">
        <Link className="brandLockup" href="/">
          <img className="brandLogoImage" src="/sketchcatch-logo.svg" alt="" />
          <span>SketchCatch</span>
        </Link>

        <LandingHeaderActions />
      </header>

      <section className="landingHero landingHeroIdentity" aria-labelledby="hero-title">
        <div className="heroCopy">
          <p className="eyebrow">Terraform-first · multi-cloud-ready IaC operations</p>
          <h1 id="hero-title">설계, 코드, 검토를 한 흐름으로.</h1>
          <p className="heroLead">
            요구사항을 보드로 정리하고 Terraform 변경과 비용·보안을 함께 확인합니다.
          </p>
          <div className="heroPainBridge" aria-label="SketchCatch value path">
            <span>요구사항</span>
            <span>Architecture Board</span>
            <span>Terraform Preview</span>
            <strong>Deployment Review</strong>
          </div>
          <div className="heroActions">
            <Link className="primaryCta" href="/workspace/new">
              새 작업 시작
            </Link>
          </div>
        </div>

        <div className="blueprintHeroDrawing blueprintHeroInteractive" aria-hidden="true">
          <div className="landingFloatCard landingFloatPrompt">
            <span>요청</span>
            <strong>API 서버와 DB를 운영 기준에 맞게 배포</strong>
          </div>
          <div className="landingFloatCard landingFloatPlan">
            <img src="/terraform.svg" alt="" />
            <span>Terraform Preview</span>
          </div>
          <div className="landingFloatCard landingFloatAws">
            <img src="/Architecture-Group-Icons_07312025/AWS-Cloud-logo_32.svg" alt="" />
            <span>AWS 연결</span>
          </div>
          <div className="blueprintProductFrame">
            <div className="blueprintPipeline">
              <span className="blueprintPipelineNode">요청</span>
              <span className="blueprintPipelineLine" />
              <span className="blueprintPipelineNode blueprintPipelineNodePrimary">Board</span>
              <span className="blueprintPipelineLine" />
              <span className="blueprintPipelineNode">Plan</span>
              <span className="blueprintPipelineLine" />
              <span className="blueprintPipelineNode blueprintPipelineNodeDanger">Review</span>
            </div>
            <div className="blueprintProductBoard">
              <span className="blueprintBoardZone">안전한 구역</span>
              <span className="blueprintBoardWire blueprintBoardWirePrimary" />
              <span className="blueprintBoardWire blueprintBoardWireWatch" />
              <span className="blueprintIconNode blueprintIconNodeEc2">
                <img src="/Architecture-Service-Icons_07312025/Arch_Compute/64/Arch_Amazon-EC2_64.svg" alt="" />
              </span>
              <span className="blueprintIconNode blueprintIconNodeS3">
                <img
                  src="/Architecture-Service-Icons_07312025/Arch_Storage/64/Arch_Amazon-Simple-Storage-Service_64.svg"
                  alt=""
                />
              </span>
              <span className="blueprintIconNode blueprintIconNodeWatch">
                <img
                  src="/Architecture-Service-Icons_07312025/Arch_Management-Governance/64/Arch_Amazon-CloudWatch_64.svg"
                  alt=""
                />
              </span>
            </div>
            <div className="blueprintHeroStatus">
              <span>MED</span>
              <strong>예상 비용과 권한 변경 확인</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="landingHighlights blueprintJourney" id="journey" aria-label="SketchCatch service flow">
        {proofPoints.map((point) => (
          <article className="highlightCard blueprintJourneyCard" key={point.label}>
            <span className="highlightKicker">{point.label}</span>
            <h2>{point.title}</h2>
            <p>{point.text}</p>
          </article>
        ))}
      </section>

      <section className="blueprintSafetyBand" id="safety" aria-labelledby="safety-title">
        <div>
          <p className="eyebrow">Review and handoff</p>
          <h2 id="safety-title">보드에서 끝나지 않고, 팀이 검토할 변경으로 남깁니다.</h2>
          <p>
            설계 화면을 Terraform 변경과 연결하고, 실행 전 검토할 근거를 남깁니다.
          </p>
        </div>
        <div className="blueprintGatePreview" aria-hidden="true">
          <span className="gateBadge gateBadgeHigh">HANDOFF</span>
          <strong>팀 리뷰로 넘길 근거 정리</strong>
          <p>변경 범위와 실행 기록을 남깁니다.</p>
        </div>
      </section>
    </main>
  );
}
