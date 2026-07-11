"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./product-entry.module.css";

const WORKFLOW_STEPS = [
  {
    description: "Requirement Input을 편집 가능한 Architecture Draft로 만듭니다.",
    label: "AI Architecture Recommendation",
    value: "draft"
  },
  {
    description: "Practice Architecture가 어떤 코드가 되는지 Resource별로 확인합니다.",
    label: "IaC Preview 확인하기",
    value: "terraform"
  },
  {
    description: "Cost Risk, Security Risk와 Plan 변경 내용을 보고 Deployment를 승인합니다.",
    label: "Pre-Deployment Check",
    value: "deploy"
  }
] as const;

type WorkflowStep = (typeof WORKFLOW_STEPS)[number]["value"];

export function LandingWorkflowSection() {
  const [activeStep, setActiveStep] = useState<WorkflowStep>("draft");

  return (
    <section className={`${styles.section} ${styles.sectionSoft}`} id="workspace" aria-labelledby="workspace-title">
      <div className={styles.container}>
        <header className={styles.sectionHeading}>
          <p className={styles.sectionKicker}>One continuous workspace</p>
          <h2 id="workspace-title">설계와 코드와 배포가<br />따로 놀지 않도록.</h2>
          <p>
            Architecture Board에서 바꾼 구조는 IaC Preview로 이어지고, Check Finding은 어떤
            Resource가 문제인지 다시 보드를 가리킵니다. 사용자는 창을 옮겨 다니지 않고 같은
            프로젝트 안에서 판단할 수 있습니다.
          </p>
        </header>

        <div className={styles.workflowLayout}>
          <div className={styles.workflowControls} role="tablist" aria-label="제품 흐름 선택">
            {WORKFLOW_STEPS.map((step, index) => (
              <button
                aria-selected={activeStep === step.value}
                className={styles.workflowControl}
                key={step.value}
                onClick={() => setActiveStep(step.value)}
                role="tab"
                type="button"
              >
                <span className={styles.workflowControlNumber}>{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <strong>{step.label}</strong>
                  <span>{step.description}</span>
                </span>
              </button>
            ))}
          </div>

          <div className={styles.workflowVisual}>
            <div className={styles.workflowVisualTopbar}>
              <span className={styles.windowDots} aria-hidden="true"><span /><span /><span /></span>
              <span>commerce-production</span>
              <span>saved</span>
            </div>
            <div className={styles.workflowScene}>
              <div className={`${styles.workflowPanel} ${activeStep === "draft" ? styles.workflowPanelActive : ""}`}>
                <div className={styles.chatBubble}>
                  서울 리전에 쇼핑몰 API 서버를 만들고 싶어요. DB는 외부에서 접근할 수 없게 해주세요.
                </div>
                <div className={styles.aiResponse}>
                  <strong>Architecture Draft를 준비했습니다.</strong>
                  <p>Public Subnet에는 ALB를, Private Subnet에는 EC2와 RDS를 배치했습니다.</p>
                  <div className={styles.miniResources}>
                    <MiniResource icon="/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Elastic-Load-Balancing_64.svg" label="ALB" />
                    <MiniResource icon="/Architecture-Service-Icons_07312025/Arch_Compute/64/Arch_Amazon-EC2_64.svg" label="EC2 × 2" />
                    <MiniResource icon="/Architecture-Service-Icons_07312025/Arch_Database/64/Arch_Amazon-RDS_64.svg" label="RDS" />
                  </div>
                </div>
              </div>

              <div className={`${styles.workflowPanel} ${activeStep === "terraform" ? styles.workflowPanelActive : ""}`}>
                <p className={styles.codeLabel}>Generated · main.tf</p>
                <pre className={styles.terraformSample}>{`module "network" {
  source = "./modules/network"
  cidr   = "10.0.0.0/16"
}

module "application" {
  source             = "./modules/application"
  instance_count     = 2
  private_subnet_ids = module.network.private_subnet_ids
}

module "database" {
  source              = "./modules/database"
  publicly_accessible = false
}`}</pre>
              </div>

              <div className={`${styles.workflowPanel} ${activeStep === "deploy" ? styles.workflowPanelActive : ""}`}>
                <div className={styles.planSummary}>
                  <PlanStat label="생성" value="12" />
                  <PlanStat label="수정" value="0" />
                  <PlanStat label="삭제" value="0" />
                </div>
                <PlanRow label="Terraform validate" value="통과" />
                <PlanRow label="월 예상 비용" value="$42–48" />
                <PlanRow label="보안 검사" value="경고 1개" />
                <PlanRow label="AWS 연결" value="검증됨" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniResource({ icon, label }: { readonly icon: string; readonly label: string }) {
  return <span className={styles.miniResource}><Image alt="" height={20} src={icon} width={20} />{label}</span>;
}

function PlanStat({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className={styles.planStat}><span>{label}</span><strong>{value}</strong></div>;
}

function PlanRow({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className={styles.planRow}><span>{label}</span><strong>{value}</strong></div>;
}
