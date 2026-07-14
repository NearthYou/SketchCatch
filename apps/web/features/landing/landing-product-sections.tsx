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
      <div className={`${styles.container} ${styles.reverseLayout}`} id="reverse-content">
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

function DeploymentSection() {
  return (
    <section className={styles.section} id="deployment" aria-labelledby="deployment-title">
      <div className={styles.container} id="deployment-content">
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
