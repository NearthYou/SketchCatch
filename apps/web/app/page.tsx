import Link from "next/link";
import { LandingHeaderActions } from "./landing-auth-actions";

export default function HomePage() {
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
          <a href="#workspace">Workspace</a>
          <a href="#safety">Safety</a>
          <a href="#templates">Templates</a>
        </nav>

        <LandingHeaderActions />
      </header>

      <section className="landingHero" aria-labelledby="hero-title">
        <div className="heroCanvas" aria-hidden="true">
          <div className="gridPlane" />
          <div className="floatingNote noteTerraform">
            <strong>Terraform</strong>
            <span>plan reviewed</span>
          </div>
          <div className="floatingNote noteVpc">
            <strong>VPC</strong>
            <span>3 resources</span>
          </div>
          <div className="selectionFrame">
            <span className="selectionHandle selectionHandleTopLeft" />
            <span className="selectionHandle selectionHandleTopRight" />
            <span className="selectionHandle selectionHandleBottomLeft" />
            <span className="selectionHandle selectionHandleBottomRight" />
            <span className="resourceChip chipEc2">EC2</span>
            <span className="resourceChip chipRds">RDS</span>
            <span className="resourceChip chipS3">S3</span>
          </div>
          <div className="providerTile providerAws">AWS</div>
          <div className="providerTile providerCost">$24</div>
          <div className="commentBubble commentBuilder">Yoon | Builder</div>
          <div className="commentBubble commentReviewer">AI safety check</div>
        </div>

        <div className="heroCopy">
          <p className="eyebrow">Terraform-first AWS learning workspace</p>
          <h1 id="hero-title">SketchCatch</h1>
          <p className="heroLead">
            클라우드 인프라를 캔버스에 그리듯 설계하고, Terraform 구조와 비용/보안 위험을
            배포 전에 함께 확인하는 안전한 IaC 학습 플랫폼입니다.
          </p>
          <div className="heroActions">
            <Link className="primaryCta" href="/login">
              시작하기
            </Link>
          </div>
        </div>
      </section>

      <section className="landingHighlights" aria-label="SketchCatch highlights">
        <article className="highlightCard" id="workspace">
          <span className="highlightKicker">01</span>
          <h2>시각적 설계</h2>
          <p>AWS 리소스 관계를 보드에서 빠르게 잡고 프로젝트로 저장합니다.</p>
        </article>
        <article className="highlightCard" id="safety">
          <span className="highlightKicker">02</span>
          <h2>사전 검토</h2>
          <p>비용 사고와 공개 접근 위험을 배포 전에 확인하는 흐름을 둡니다.</p>
        </article>
        <article className="highlightCard" id="templates">
          <span className="highlightKicker">03</span>
          <h2>재사용 템플릿</h2>
          <p>검토된 실습 구조를 템플릿으로 저장해 반복 학습에 활용합니다.</p>
        </article>
      </section>
    </main>
  );
}
