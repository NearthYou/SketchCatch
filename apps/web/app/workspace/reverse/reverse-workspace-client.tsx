"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronLeft } from "lucide-react";
import { useCallback, useState } from "react";
import type { DiagramNode } from "../../../../../packages/types/src";
import { useAuth } from "../../../components/auth/auth-provider";
import { DiagramEditor, type DiagramEditorPanelContext } from "../../../features/diagram-editor";
import { EMPTY_DIAGRAM } from "../../../features/diagram-editor/constants";
import {
  ReverseEngineeringPanel,
  type ReverseEngineeringCandidatePanelState
} from "../../../features/workspace/ReverseEngineeringPanel";
import styles from "../../../features/workspace/reverse-engineering.module.css";
import { getReverseEngineeringServiceLabel } from "../../../features/workspace/reverse-engineering-presentation";

type ReverseWorkspaceClientProps = {
  readonly projectName: string;
};

const REVERSE_PREVIEW_PROJECT_ID = "reverse-preview-project";
const EMPTY_CANDIDATE_PANEL_STATE: ReverseEngineeringCandidatePanelState = {
  candidates: [],
  hasScanResult: false,
  onCandidateSelect: () => undefined,
  selectedCandidateId: null
};

// Reverse 전용 전체 화면에서 AWS scan 후보를 보드 미리보기로 보여줍니다.
export function ReverseWorkspaceClient({ projectName }: ReverseWorkspaceClientProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [candidatePanelState, setCandidatePanelState] =
    useState<ReverseEngineeringCandidatePanelState>(EMPTY_CANDIDATE_PANEL_STATE);
  const workspaceUserName =
    user?.nickname?.trim() || user?.username?.trim() || user?.email?.trim() || "Personal workspace";

  const chooseAnotherStartMode = useCallback((): void => {
    router.push("/workspace/new");
  }, [router]);

  return (
    <DiagramEditor
      allowPreviewInspection
      emptyBoardDescription="기존 AWS를 가져오면 복원한 구조가 여기에 표시됩니다."
      initialDiagram={EMPTY_DIAGRAM}
      leftPanel={
        <ReverseBoardCandidateSelectionPanel
          onChooseAnotherStartMode={chooseAnotherStartMode}
          state={candidatePanelState}
        />
      }
      projectName={projectName}
      rightPanel={(context) => (
        <ReverseDockedPanel
          context={context}
          onCandidatePanelChange={setCandidatePanelState}
          projectName={projectName}
        />
      )}
      saveStatus="미리보기"
      showSaveAction={false}
      workspaceUserName={workspaceUserName}
    />
  );
}

// 자동 판단 결과가 하나면 추천 구조만, 애매할 때만 여러 선택지를 보여줍니다.
function ReverseBoardCandidateSelectionPanel({
  onChooseAnotherStartMode,
  state
}: {
  readonly onChooseAnotherStartMode: () => void;
  readonly state: ReverseEngineeringCandidatePanelState;
}) {
  const hasMultipleCandidates = state.candidates.length > 1;
  const panelTitle =
    state.hasScanResult && !hasMultipleCandidates ? "가져온 원본" : "보드 후보 선택";
  const panelDescription =
    state.hasScanResult && !hasMultipleCandidates
      ? "AWS에서 가져온 Resource와 관계를 바꾸지 않은 원본입니다."
      : "AWS에서 가져온 구조가 여기에 표시됩니다.";

  return (
    <aside className={styles.candidatePanel} aria-label={panelTitle}>
      <div className={styles.candidateIntro}>
        <p className={styles.eyebrow}>Reverse Engineering</p>
        <h2>{panelTitle}</h2>
        <span>{panelDescription}</span>
      </div>

      {state.hasScanResult && hasMultipleCandidates ? (
        <div className={styles.candidateList} role="radiogroup" aria-label={panelTitle}>
          {state.candidates.map((candidate) => (
            <button
              aria-checked={candidate.id === state.selectedCandidateId}
              className={
                candidate.id === state.selectedCandidateId
                  ? styles.candidateCardSelected
                  : styles.candidateCard
              }
              key={candidate.id}
              onClick={() => state.onCandidateSelect(candidate.id)}
              role="radio"
              type="button"
            >
              <strong>{candidate.title}</strong>
              <span>{candidate.description}</span>
              <small>
                Resource {candidate.resourceCount}개 · 연결선 {candidate.edgeCount}개
              </small>
            </button>
          ))}
        </div>
      ) : state.hasScanResult && state.candidates[0] ? (
        <div className={styles.recommendedStructure}>
          <span className={styles.recommendationLabel}>
            <CheckCircle2 aria-hidden="true" size={15} />
            가져온 결과
          </span>
          <strong>{state.candidates[0].title}</strong>
          <span>{state.candidates[0].description}</span>
          <small>
            Resource {state.candidates[0].resourceCount}개 · 연결선 {state.candidates[0].edgeCount}
            개
          </small>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <strong>아직 가져온 구조가 없습니다</strong>
          <span>가져온 AWS 구조가 여기에 표시됩니다.</span>
        </div>
      )}

      <button className={styles.startBackButton} onClick={onChooseAnotherStartMode} type="button">
        <ArrowLeft aria-hidden="true" size={15} />
        시작 방식 다시 선택
      </button>
    </aside>
  );
}

// 평소에는 스캔과 적용 흐름을, Resource를 누르면 사람이 이해할 핵심 값만 보여줍니다.
function ReverseDockedPanel({
  context,
  onCandidatePanelChange,
  projectName
}: {
  readonly context: DiagramEditorPanelContext;
  readonly onCandidatePanelChange: (state: ReverseEngineeringCandidatePanelState) => void;
  readonly projectName: string;
}) {
  const inspectedNode = context.nodes.find((node) => node.id === context.inspectedNodeId) ?? null;

  if (inspectedNode) {
    return <ReverseResourceInspector node={inspectedNode} onBack={context.closeInspectedNode} />;
  }

  return (
    <section className={styles.rightPanel} aria-label="기존 AWS 가져오기 패널">
      <ReverseEngineeringPanel
        context={context}
        createProjectOnApply
        onCandidatePanelChange={onCandidatePanelChange}
        projectId={REVERSE_PREVIEW_PROJECT_ID}
        projectName={projectName}
      />
    </section>
  );
}

// provider identity와 전체 원본 JSON은 보존하되 사용자 화면에는 노출하지 않습니다.
function ReverseResourceInspector({
  node,
  onBack
}: {
  readonly node: DiagramNode;
  readonly onBack: () => void;
}) {
  const values = node.parameters?.values ?? {};
  const providerResourceId = formatInspectorValue(values["providerResourceId"]);
  const providerResourceType = formatInspectorValue(values["providerResourceType"]);
  const isReviewOnly = node.type === "UNKNOWN" || values["analysisExcluded"] === true;
  const coreValues = getInspectorCoreValues(node.type, values);
  const displayName = getInspectorDisplayName(
    node.label,
    providerResourceId,
    providerResourceType
  );

  return (
    <aside className={styles.inspector} aria-label="Reverse Resource 상세">
      <header className={styles.inspectorHeader}>
        <div className={styles.inspectorHeaderTop}>
          <button
            aria-label="스캔 결과로 돌아가기"
            className={styles.iconButton}
            onClick={onBack}
            title="스캔 결과로 돌아가기"
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={17} />
          </button>
          <div className={styles.panelHeaderTitle}>
            <p className={styles.eyebrow}>Resource 정보</p>
            <h2>{displayName}</h2>
          </div>
        </div>
        <p className={styles.hint}>AWS에서 읽은 핵심 정보입니다. 이 화면에서는 변경하지 않습니다.</p>
      </header>

      <div className={styles.inspectorBody}>
        <section className={styles.inspectorSection}>
          <h3>Resource 개요</h3>
          <dl className={styles.identityList}>
            <div>
              <dt>이름</dt>
              <dd>{displayName}</dd>
            </div>
            <div>
              <dt>AWS 서비스</dt>
              <dd>{getReverseEngineeringServiceLabel(providerResourceType)}</dd>
            </div>
            <div>
              <dt>리전</dt>
              <dd>{formatInspectorValue(values["region"])}</dd>
            </div>
            <div>
              <dt>상태</dt>
              <dd>
                <span className={isReviewOnly ? styles.reviewOnlyBadge : styles.supportedBadge}>
                  {isReviewOnly ? "보드에서만 확인" : "Terraform 편집 대상"}
                </span>
              </dd>
            </div>
          </dl>
          <p className={styles.inspectorPurpose}>{getInspectorPurpose(node.type, isReviewOnly)}</p>
        </section>

        {coreValues.length > 0 ? (
          <section className={styles.inspectorSection}>
            <h3>핵심 값</h3>
            <dl className={styles.identityList}>
              {coreValues.map((value) => (
                <div key={value.key}>
                  <dt>{value.label}</dt>
                  <dd>{value.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

// 값이 없는 provider identity는 화면에서 분명하게 구분합니다.
function formatInspectorValue(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value : "확인되지 않음";
}

function getInspectorDisplayName(
  label: string,
  providerResourceId: string,
  providerResourceType: string
): string {
  const displayName = label.replace(/^확인 필요 · /, "").trim();

  return isHumanInspectorDisplayName(displayName, providerResourceId)
    ? displayName
    : `이름 미확인 ${getReverseEngineeringServiceLabel(providerResourceType)}`;
}

function isHumanInspectorDisplayName(displayName: string, providerResourceId: string): boolean {
  return !(
    !displayName ||
    displayName === providerResourceId ||
    displayName.startsWith("arn:") ||
    displayName.startsWith("resource-") ||
    /^(?:vpc|subnet|i|igw|rtb|sg|eni|nat|eipalloc|eipassoc|vol|ami|snap|acl|vpce)-[0-9a-f]{8,}$/i.test(
      displayName
    )
  );
}

function getInspectorPurpose(resourceType: string, isReviewOnly: boolean): string {
  if (isReviewOnly) {
    return "AWS에서 찾은 리소스입니다. 보드에서 구조를 확인할 수 있지만 Terraform 생성과 배포에는 자동으로 사용하지 않습니다.";
  }

  const purposes: Readonly<Record<string, string>> = {
    EC2: "애플리케이션을 실행하는 가상 서버입니다.",
    INTERNET_GATEWAY: "VPC와 인터넷 사이의 통신을 연결합니다.",
    RDS: "애플리케이션 데이터를 저장하는 관리형 데이터베이스입니다.",
    ROUTE_TABLE: "네트워크 트래픽의 경로를 정합니다.",
    S3: "파일과 객체 데이터를 저장합니다.",
    SECURITY_GROUP: "Resource에 허용할 네트워크 통신을 제어합니다.",
    SUBNET: "VPC 안에서 Resource를 배치할 네트워크 구역입니다.",
    VPC: "AWS Resource가 통신하는 사설 네트워크 범위입니다."
  };

  return purposes[resourceType] ?? "AWS에서 읽은 구성을 보드에서 검토할 수 있습니다.";
}

type InspectorCoreValue = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
};

const INSPECTOR_CORE_VALUE_ALLOWLIST: Readonly<Record<string, readonly [string, string][]>> = {
  EC2: [
    ["instanceType", "인스턴스 유형"],
    ["placementAvailabilityZone", "Availability Zone"],
    ["privateIpAddress", "사설 IP"]
  ],
  INTERNET_GATEWAY: [],
  RDS: [
    ["dbInstanceClass", "DB 인스턴스 유형"],
    ["engine", "DB 엔진"],
    ["availabilityZone", "Availability Zone"],
    ["dbName", "DB 이름"]
  ],
  ROUTE_TABLE: [],
  S3: [
    ["bucketRegion", "Bucket 리전"],
    ["versioningStatus", "버전 관리"],
    ["websiteIndexDocument", "웹 사이트 문서"]
  ],
  SECURITY_GROUP: [
    ["groupName", "보안 그룹 이름"],
    ["description", "설명"]
  ],
  SUBNET: [
    ["availabilityZone", "Availability Zone"],
    ["cidrBlock", "CIDR"],
    ["availableIpAddressCount", "사용 가능 IP"]
  ],
  VPC: [
    ["cidrBlock", "CIDR"],
    ["isDefault", "기본 VPC"]
  ]
};

function getInspectorCoreValues(
  resourceType: string,
  values: Readonly<Record<string, unknown>>
): InspectorCoreValue[] {
  return (INSPECTOR_CORE_VALUE_ALLOWLIST[resourceType] ?? [])
    .map(([key, label]) => ({
      key,
      label,
      value: formatMeaningfulInspectorValue(key, values[key])
    }))
    .filter((value): value is InspectorCoreValue => value.value !== null)
    .slice(0, 4);
}

function formatMeaningfulInspectorValue(key: string, value: unknown): string | null {
  if (key === "versioningStatus" && typeof value === "string") {
    const versioningStatusLabels: Readonly<Record<string, string>> = {
      Enabled: "사용 중",
      Suspended: "일시 중지"
    };

    return versioningStatusLabels[value] ?? "설정 상태 확인 필요";
  }

  if (key === "isDefault" && typeof value === "boolean") {
    return value ? "예" : "아니요";
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}
