"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./product-entry.module.css";

const RESOURCE_ICONS = {
  alb: "/Architecture-Service-Icons_07312025/Arch_Networking-Content-Delivery/64/Arch_Elastic-Load-Balancing_64.svg",
  ec2: "/Architecture-Service-Icons_07312025/Arch_Compute/64/Arch_Amazon-EC2_64.svg",
  rds: "/Architecture-Service-Icons_07312025/Arch_Database/64/Arch_Amazon-RDS_64.svg",
  s3: "/Resource-Icons_07312025/Res_Storage/Res_Amazon-Simple-Storage-Service_S3-Standard_48.svg"
} as const;

const RESOURCE_DATA = {
  alb: { label: "web-alb", type: "AWS::ALB", values: ["application", "public-a, public-c", "$18.25"] },
  ec2: { label: "web-01", type: "AWS::EC2", values: ["t3.micro", "public-a", "$8.47"] },
  ec2b: { label: "web-02", type: "AWS::EC2", values: ["t3.micro", "public-c", "$8.47"] },
  rds: { label: "app-db", type: "AWS::RDS", values: ["db.t4g.micro", "private-a, private-c", "$14.60"] },
  s3: { label: "assets", type: "AWS::S3", values: ["standard", "global", "$1.20"] }
} as const;

const PREVIEW_TABS = [
  { label: "Board", value: "board" },
  { label: "IaC Preview", shortLabel: "IaC", value: "iac" },
  { label: "Pre-Deployment Check", shortLabel: "Check", value: "check" }
] as const;

const NODE_CLASS_NAMES = {
  alb: "nodeAlb",
  ec2: "nodeEc2",
  ec2b: "nodeEc2b",
  rds: "nodeRds",
  s3: "nodeS3"
} as const;

type PreviewMode = (typeof PREVIEW_TABS)[number]["value"];
type ResourceId = keyof typeof RESOURCE_DATA;

export function LandingWorkspacePreview() {
  const [mode, setMode] = useState<PreviewMode>("board");
  const [selectedResource, setSelectedResource] = useState<ResourceId>("ec2");
  const [copyLabel, setCopyLabel] = useState("코드 복사");
  const resource = RESOURCE_DATA[selectedResource];

  async function copyTerraformCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(TERRAFORM_CODE);
      setCopyLabel("복사됨");
    } catch {
      setCopyLabel("선택해서 복사");
    }
    window.setTimeout(() => setCopyLabel("코드 복사"), 1600);
  }

  return (
    <div className={styles.workspaceStage} aria-label="SketchCatch 워크스페이스 미리보기">
      <div className={styles.workspaceFrame}>
        <div className={styles.workspaceTopbar}>
          <div className={styles.workspaceBrand}>
            <span>SketchCatch</span>
          </div>
          <div className={styles.projectTitle}>commerce-production · ap-northeast-2</div>
          <div className={styles.modeTabs} role="tablist" aria-label="워크스페이스 보기 전환">
            {PREVIEW_TABS.map((tab) => (
              <button
                aria-selected={mode === tab.value}
                className={styles.modeTab}
                key={tab.value}
                onClick={() => setMode(tab.value)}
                role="tab"
                type="button"
              >
                <span className={styles.tabLong}>{tab.label}</span>
                <span className={styles.tabShort}>{"shortLabel" in tab ? tab.shortLabel : tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.workspaceBody}>
          <aside className={styles.resourceRail} aria-label="Resource 팔레트">
            <p className={styles.panelLabel}>Resources</p>
            <div className={styles.resourcePalette}>
              <PaletteItem icon={RESOURCE_ICONS.alb} label="ALB" />
              <PaletteItem icon={RESOURCE_ICONS.ec2} label="EC2" />
              <PaletteItem icon={RESOURCE_ICONS.rds} label="RDS" />
              <PaletteItem icon={RESOURCE_ICONS.s3} label="S3" />
            </div>
          </aside>

          <div className={styles.architectureCanvas}>
            <span className={styles.canvasBadge}><strong>Practice Architecture</strong> · saved</span>
            <div className={styles.vpcBox}><span className={styles.groupLabel}>VPC · 10.0.0.0/16</span></div>
            <div className={`${styles.subnetBox} ${styles.subnetPublic}`}><span className={styles.groupLabel}>Public subnet</span></div>
            <div className={`${styles.subnetBox} ${styles.subnetPrivate}`}><span className={styles.groupLabel}>Private subnet</span></div>
            <svg className={styles.canvasLines} viewBox="0 0 720 352" preserveAspectRatio="none" aria-hidden="true">
              <path className={`${styles.canvasLine} ${styles.canvasLineActive}`} d="M360 78 C300 108 236 128 180 174" />
              <path className={styles.canvasLine} d="M360 78 C430 112 500 148 540 202" />
              <path className={styles.canvasLine} d="M180 196 L180 270" />
              <path className={styles.canvasLine} d="M220 190 C330 188 430 194 510 210" />
            </svg>
            <ResourceNode id="alb" icon={RESOURCE_ICONS.alb} label="web-alb" onSelect={setSelectedResource} selected={selectedResource === "alb"} />
            <ResourceNode id="ec2" icon={RESOURCE_ICONS.ec2} label="web-01" onSelect={setSelectedResource} selected={selectedResource === "ec2"} />
            <ResourceNode id="ec2b" icon={RESOURCE_ICONS.ec2} label="web-02" onSelect={setSelectedResource} selected={selectedResource === "ec2b"} />
            <ResourceNode id="rds" icon={RESOURCE_ICONS.rds} label="app-db" onSelect={setSelectedResource} selected={selectedResource === "rds"} />
            <ResourceNode id="s3" icon={RESOURCE_ICONS.s3} label="assets" onSelect={setSelectedResource} selected={selectedResource === "s3"} />

            <div className={`${styles.workspaceOverlay} ${styles.codeOverlay} ${mode === "iac" ? styles.workspaceOverlayVisible : ""}`} aria-hidden={mode !== "iac"}>
              <aside className={styles.codeFiles}>
                <p className={styles.codeLabel}>Files</p>
                <span className={styles.codeFileActive}>main.tf</span>
                <span>network.tf</span><span>variables.tf</span><span>outputs.tf</span>
              </aside>
              <div className={styles.codeEditor}>
                <button className={styles.copyCodeButton} onClick={() => void copyTerraformCode()} type="button">{copyLabel}</button>
                <pre>{TERRAFORM_CODE}</pre>
              </div>
            </div>

            <div className={`${styles.workspaceOverlay} ${styles.checkOverlay} ${mode === "check" ? styles.workspaceOverlayVisible : ""}`} aria-hidden={mode !== "check"}>
              <div className={styles.checkSummary}>
                <CheckMetric label="월 예상 비용" value="$42" />
                <CheckMetric label="보안 경고" value="1" />
                <CheckMetric label="Check 통과" value="8" />
              </div>
              <div className={styles.findingList}>
                <Finding description="0.0.0.0/0 대신 관리 IP만 허용하세요." label="SSH 접근 범위가 넓습니다" tag="보안" />
                <Finding description="외부 인터넷에서 데이터베이스로 직접 접근할 수 없습니다." label="RDS는 Private Subnet에 있습니다" passed tag="통과" />
                <Finding description="현재 구성에서 문법 오류를 찾지 못했습니다." label="IaC Preview 문법 검사가 끝났습니다" passed tag="준비됨" />
              </div>
            </div>
          </div>

          <aside className={styles.inspector} aria-live="polite">
            <p className={styles.panelLabel}>Properties</p>
            <div className={styles.inspectorHeader}>
              <span className={styles.inspectorIcon}><Image alt="" height={28} src={getResourceIcon(selectedResource)} width={28} /></span>
              <div><strong>{resource.label}</strong><span>{resource.type}</span></div>
            </div>
            <dl className={styles.propertyList}>
              <PropertyRow label="Configuration" value={resource.values[0]} />
              <PropertyRow label="Network" value={resource.values[1]} />
              <PropertyRow label="Monthly estimate" value={resource.values[2]} />
            </dl>
            <span className={styles.statusChip}>● 배포 준비됨</span>
          </aside>
        </div>
      </div>
    </div>
  );
}

function PaletteItem({ icon, label }: { readonly icon: string; readonly label: string }) {
  return <div className={styles.paletteItem}><Image alt="" height={28} src={icon} width={28} /><span>{label}</span></div>;
}

function ResourceNode({ id, icon, label, onSelect, selected }: { readonly id: ResourceId; readonly icon: string; readonly label: string; readonly onSelect: (id: ResourceId) => void; readonly selected: boolean }) {
  return <button aria-label={`${label} 선택`} aria-pressed={selected} className={`${styles.resourceNode} ${styles[NODE_CLASS_NAMES[id]]}`} onClick={() => onSelect(id)} type="button"><Image alt="" height={32} src={icon} width={32} /><span>{label}</span></button>;
}

function CheckMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className={styles.checkMetric}><span>{label}</span><strong>{value}</strong></div>;
}

function Finding({ description, label, passed = false, tag }: { readonly description: string; readonly label: string; readonly passed?: boolean; readonly tag: string }) {
  return <div className={styles.finding}><span className={passed ? `${styles.findingDot} ${styles.findingDotSuccess}` : styles.findingDot} /><div><strong>{label}</strong><span>{description}</span></div><em className={styles.findingTag}>{tag}</em></div>;
}

function PropertyRow({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className={styles.propertyRow}><dt>{label}</dt><dd>{value}</dd></div>;
}

function getResourceIcon(resourceId: ResourceId): string {
  return resourceId === "ec2b" ? RESOURCE_ICONS.ec2 : RESOURCE_ICONS[resourceId];
}

const TERRAFORM_CODE = `resource "aws_instance" "web" {
  ami           = "ami-0c9c942bd7bf113a2"
  instance_type = "t3.micro"
  subnet_id     = aws_subnet.public.id

  tags = {
    Name = "commerce-web"
  }
}

resource "aws_db_instance" "app" {
  engine         = "postgres"
  instance_class = "db.t4g.micro"
}`;
