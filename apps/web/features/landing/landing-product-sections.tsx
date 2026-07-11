import Image from "next/image";
import Link from "next/link";
import styles from "./product-entry.module.css";

const RADAR_RESOURCES = [
  { alt: "EC2", icon: "/Architecture-Service-Icons_07312025/Arch_Compute/64/Arch_Amazon-EC2_64.svg" },
  { alt: "RDS", icon: "/Architecture-Service-Icons_07312025/Arch_Database/64/Arch_Amazon-RDS_64.svg" },
  { alt: "S3", icon: "/Resource-Icons_07312025/Res_Storage/Res_Amazon-Simple-Storage-Service_S3-Standard_48.svg" },
  { alt: "ALB", icon: "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Elastic-Load-Balancing_64.svg" }
] as const;

export function LandingProductSections() {
  return (
    <>
      <ReverseEngineeringSection />
      <SafetySection />
      <DeploymentSection />
      <section className={styles.ctaSection} id="start" aria-labelledby="cta-title">
        <div className={styles.container}>
          <h2 id="cta-title">구조를 이해한 뒤,<br />확신을 갖고 배포하세요.</h2>
          <p>빈 Architecture Board, AI Architecture Recommendation, Reverse Engineering 중 원하는 방식으로 시작할 수 있습니다.</p>
          <Link className={`${styles.button} ${styles.buttonPrimary}`} href="/signup">
            SketchCatch 시작하기 <span className={styles.buttonIcon} aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </>
  );
}

function ReverseEngineeringSection() {
  return (
    <section className={styles.section} id="reverse" aria-labelledby="reverse-title">
      <div className={`${styles.container} ${styles.reverseLayout}`}>
        <div className={styles.reverseCopy}>
          <p className={styles.sectionKicker}>Reverse Engineering</p>
          <h2 id="reverse-title">이미 AWS에 있다면,<br />처음부터 다시 그리지 마세요.</h2>
          <p>
            검증된 AWS Role과 Provider Adapter로 Resource를 읽고, VPC와 Subnet의 포함 관계와 실제
            연결 정보를 기준으로 Practice Architecture 후보를 만듭니다. 가져온 결과는 Architecture
            Board에 적용하기 전에 먼저 확인할 수 있습니다.
          </p>
          <ul className={styles.reverseList}>
            <li><span className={styles.checkIcon}>✓</span><span>지원하는 리소스는 이름과 주요 파라미터까지 복원</span></li>
            <li><span className={styles.checkIcon}>✓</span><span>지원하지 못한 리소스와 권한 부족도 숨기지 않고 표시</span></li>
            <li><span className={styles.checkIcon}>✓</span><span>확인한 Practice Architecture만 프로젝트로 생성</span></li>
          </ul>
        </div>

        <div className={styles.reverseRadar} aria-label="AWS 리소스 검색 시각화">
          {RADAR_RESOURCES.map((resource) => (
            <span className={styles.radarResource} key={resource.alt}>
              <Image alt={resource.alt} height={36} src={resource.icon} width={36} />
            </span>
          ))}
          <span className={styles.radarStatus}>34개 리소스 발견 · 관계 분석 중</span>
        </div>
      </div>
    </section>
  );
}

function SafetySection() {
  return (
    <section className={`${styles.section} ${styles.sectionDark}`} id="safety" aria-labelledby="safety-title">
      <div className={styles.container}>
        <header className={styles.sectionHeading}>
          <p className={styles.sectionKicker}>Pre-deployment check</p>
          <h2 id="safety-title">Deployment를 승인하기 전에<br />알아야 할 것을 먼저.</h2>
          <p>
            IaC Preview 문법만 맞는지 보는 데서 끝나지 않습니다. 공개된 포트, 비싼 Resource,
            삭제 예정 항목과 AWS 권한 문제를 사람이 이해할 수 있는 말로 보여줍니다.
          </p>
        </header>
        <div className={styles.findingList}>
          <SafetyFinding description="관리자 IP만 허용하면 SSH 접근 위험을 줄일 수 있습니다." label="SSH 포트가 인터넷 전체에 열려 있습니다" tag="high · security" />
          <SafetyFinding description="트래픽과 학습 환경 사용 시간을 확인한 뒤 배포하세요." label="NAT Gateway가 월 예상 비용의 39%를 차지합니다" tag="medium · cost" />
          <SafetyFinding description="애플리케이션 서버에서만 접근할 수 있습니다." label="RDS 외부 접근이 차단되어 있습니다" passed tag="passed" />
        </div>
      </div>
    </section>
  );
}

function SafetyFinding({ description, label, passed = false, tag }: { readonly description: string; readonly label: string; readonly passed?: boolean; readonly tag: string }) {
  return (
    <div className={styles.finding}>
      <span className={passed ? `${styles.findingDot} ${styles.findingDotSuccess}` : styles.findingDot} />
      <div><strong>{label}</strong><span>{description}</span></div>
      <em className={styles.findingTag}>{tag}</em>
    </div>
  );
}

function DeploymentSection() {
  return (
    <section className={styles.section} id="deployment" aria-labelledby="deployment-title">
      <div className={styles.container}>
        <header className={styles.sectionHeading}>
          <p className={styles.sectionKicker}>Two deployment paths</p>
          <h2 id="deployment-title">승인한 변경은,<br />팀의 방식으로 배포하세요.</h2>
          <p>
            빠른 검증은 Direct Deployment Path로, 팀 운영 변경은 Git/CI/CD Deployment Path로
            이어집니다. 어느 쪽이든 사용자가 승인한 IaC Preview에서 시작합니다.
          </p>
        </header>

        <div className={styles.deploymentPaths}>
          <DeploymentPath
            description="학습 환경과 빠른 검증에 맞습니다. 실행 로그와 결과를 같은 프로젝트에서 확인합니다."
            label="Direct Deployment Path"
            steps={["Plan", "승인", "Apply", "Outputs"]}
            title="지금 바로 검증하고 싶을 때"
          />
          <DeploymentPath
            description="IaC Preview를 Source Repository로 넘기고, 리뷰와 파이프라인 상태를 연결해 확인합니다."
            label="Git/CI/CD Deployment Path"
            steps={["Repository", "Pull Request", "CI/CD", "Status"]}
            title="팀과 검토하며 운영에 반영할 때"
          />
        </div>

        <div className={styles.deploymentOutcomes} aria-label="배포 후 확인할 정보">
          <DeploymentOutcome description="누가 언제 어떤 변경을 실행했는지 남깁니다." label="Deployment History" />
          <DeploymentOutcome description="접속 주소와 생성된 Resource 정보를 확인합니다." label="Outputs" />
          <DeploymentOutcome description="학습·검증용 Resource의 정리 상태까지 추적합니다." label="Auto Cleanup" />
        </div>
      </div>
    </section>
  );
}

function DeploymentPath({ description, label, steps, title }: { readonly description: string; readonly label: string; readonly steps: readonly string[]; readonly title: string }) {
  return (
    <article className={styles.deploymentPath}>
      <p className={styles.deploymentPathLabel}>{label}</p>
      <h3>{title}</h3>
      <ol className={styles.pathSteps}>{steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol>
      <p>{description}</p>
    </article>
  );
}

function DeploymentOutcome({ description, label }: { readonly description: string; readonly label: string }) {
  return <div className={styles.deploymentOutcome}><strong>{label}</strong><span>{description}</span></div>;
}
