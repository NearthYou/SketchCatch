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
          <h2 id="cta-title">인프라를 설계하고,<br />검토한 뒤 배포하세요.</h2>
          <p>직접 설계하거나 요구사항, 소스 저장소, 기존 클라우드 환경을 불러와 프로젝트를 시작할 수 있습니다.</p>
          <Link className={`${styles.button} ${styles.buttonPrimary}`} href="/signup">
            새 프로젝트 시작하기 <span className={styles.buttonIcon} aria-hidden="true">→</span>
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
          <h2 id="reverse-title">기존 AWS 인프라를,<br />편집 가능한 설계로.</h2>
          <p>
            연결된 AWS 계정의 리소스와 네트워크 관계를 분석해 현재 인프라 구성을 자동으로
            복원합니다. 가져온 구성은 검토 후 아키텍처 보드에서 편집하고 Terraform 작업으로
            이어갈 수 있습니다.
          </p>
          <ul className={styles.reverseList}>
            <li><span className={styles.checkIcon}>✓</span><span>리소스 설정과 네트워크 관계까지 자동 분석</span></li>
            <li><span className={styles.checkIcon}>✓</span><span>지원 범위와 권한 부족 항목을 구분해 명확하게 표시</span></li>
            <li><span className={styles.checkIcon}>✓</span><span>검토한 구성을 프로젝트로 가져와 설계와 Terraform 작업에 활용</span></li>
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
          <p className={styles.sectionKicker}>Deployment Options</p>
          <h2 id="deployment-title">검토가 끝난 변경을,<br />팀의 운영 방식에 맞게.</h2>
          <p>
            검토와 승인이 완료된 Terraform 변경을 직접 배포하거나 Git 저장소와 CI/CD
            파이프라인으로 전달할 수 있습니다. 모든 실행 과정과 결과는 프로젝트 이력에 기록됩니다.
          </p>
        </header>

        <div className={styles.deploymentPaths}>
          <DeploymentPath
            description="검토한 Terraform Plan을 승인하고 즉시 적용합니다. 실행 로그와 Outputs를 프로젝트에서 확인할 수 있습니다."
            label="Direct Deployment"
            steps={["Plan", "Approve", "Apply", "Outputs"]}
            title="검증된 변경을 즉시 배포"
          />
          <DeploymentPath
            description="Terraform 변경을 Git 저장소로 전달하고 Pull Request와 CI/CD 실행 상태를 추적합니다."
            label="Git/CI/CD Handoff"
            steps={["Repository", "Pull Request", "CI/CD", "Status"]}
            title="기존 배포 파이프라인으로 연결"
          />
        </div>

        <div className={styles.deploymentOutcomes} aria-label="배포 후 확인할 정보">
          <DeploymentOutcome description="배포 주체, 변경 내역, 실행 시간을 기록합니다." label="Deployment History" />
          <DeploymentOutcome description="생성된 리소스와 주요 접속 정보를 한곳에서 확인합니다." label="Outputs" />
          <DeploymentOutcome description="임시 환경의 만료와 리소스 정리 상태를 추적합니다." label="Auto Cleanup" />
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
