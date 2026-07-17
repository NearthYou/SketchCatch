"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronLeft } from "lucide-react";
import { useCallback, useState } from "react";
import type { DiagramNode } from "../../../../../packages/types/src";
import { useAuth } from "../../../components/auth/auth-provider";
import { copyTextToClipboard } from "../../../lib/clipboard";
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
  const panelTitle = state.hasScanResult && !hasMultipleCandidates ? "자동 감지된 구조" : "보드 후보 선택";
  const panelDescription =
    state.hasScanResult && !hasMultipleCandidates
      ? "자동으로 묶은 결과입니다. 헷갈릴 때만 여러 후보가 표시됩니다."
      : "자동 판단이 애매할 때만 여러 후보를 보여줍니다.";

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
            자동 추천
          </span>
          <strong>{state.candidates[0].title}</strong>
          <span>{state.candidates[0].description}</span>
          <small>
            Resource {state.candidates[0].resourceCount}개 · 연결선 {state.candidates[0].edgeCount}개
          </small>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <strong>아직 감지된 구조가 없습니다</strong>
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

// 평소에는 스캔과 적용 흐름을, Resource를 누르면 AWS 원본 값을 보여줍니다.
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
    return (
      <ReverseResourceInspector
        node={inspectedNode}
        onBack={context.closeInspectedNode}
      />
    );
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

// 선택한 Resource의 provider identity와 읽어온 값을 수정 없이 보여줍니다.
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
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const coreValues = getInspectorCoreValues(node.type, values);

  async function copyProviderResourceId(): Promise<void> {
    if (providerResourceId === "확인되지 않음") {
      return;
    }

    try {
      await copyTextToClipboard(providerResourceId);
      setCopyMessage("AWS 원본 식별자를 복사했습니다.");
    } catch {
      setCopyMessage("복사하지 못했습니다. 원본 식별자를 직접 복사해 주세요.");
    }
  }

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
            <p className={styles.eyebrow}>Resource Inspector</p>
            <h2>{getInspectorDisplayName(node.label)}</h2>
          </div>
        </div>
        <p className={styles.hint}>AWS에서 읽은 원본 값입니다. 이 화면에서는 변경하지 않습니다.</p>
      </header>

      <div className={styles.inspectorBody}>
        <section className={styles.inspectorSection}>
          <h3>Resource 개요</h3>
          <dl className={styles.identityList}>
            <div>
              <dt>이름</dt>
              <dd>{getInspectorDisplayName(node.label)}</dd>
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
                  {isReviewOnly ? "확인 필요" : "지원됨"}
                </span>
              </dd>
            </div>
          </dl>
          <p className={styles.inspectorPurpose}>
            {getInspectorPurpose(node.type, isReviewOnly)}
          </p>
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

        <details className={styles.inspectorDetails}>
          <summary>AWS 원본 식별자</summary>
          <div className={styles.inspectorDetailsBody}>
            <code className={styles.rawValue}>{providerResourceId}</code>
            <button
              className={styles.secondaryButton}
              disabled={providerResourceId === "확인되지 않음"}
              onClick={() => void copyProviderResourceId()}
              type="button"
            >
              원본 식별자 복사
            </button>
            <span aria-live="polite" className={styles.hint}>{copyMessage ?? ""}</span>
          </div>
        </details>

        <details className={styles.inspectorDetails}>
          <summary>고급 원본 값</summary>
          <div className={styles.inspectorDetailsBody}>
            <pre className={styles.inspectorCode}>
              <code>{JSON.stringify(values, null, 2)}</code>
            </pre>
          </div>
        </details>
      </div>
    </aside>
  );
}

// 값이 없는 provider identity는 화면에서 분명하게 구분합니다.
function formatInspectorValue(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value : "확인되지 않음";
}

function getInspectorDisplayName(label: string): string {
  const displayName = label.replace(/^확인 필요 · /, "").trim();

  return displayName.startsWith("arn:") || displayName.startsWith("resource-")
    ? "이름 미확인 AWS Resource"
    : displayName || "이름 미확인 AWS Resource";
}

function getInspectorPurpose(resourceType: string, isReviewOnly: boolean): string {
  if (isReviewOnly) {
    return "이 Resource는 AWS에서 발견됐지만 현재 자동 분석과 Terraform 처리 범위가 아닙니다.";
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
  EC2: [["instanceType", "인스턴스 유형"], ["subnetId", "Subnet ID"], ["placementAvailabilityZone", "Availability Zone"], ["privateIpAddress", "사설 IP"]],
  INTERNET_GATEWAY: [],
  RDS: [["dbInstanceClass", "DB 인스턴스 유형"], ["engine", "DB 엔진"], ["availabilityZone", "Availability Zone"], ["dbName", "DB 이름"]],
  ROUTE_TABLE: [["vpcId", "VPC ID"]],
  S3: [["bucketRegion", "Bucket 리전"], ["versioningStatus", "버전 관리"], ["websiteIndexDocument", "웹 사이트 문서"]],
  SECURITY_GROUP: [["groupName", "보안 그룹 이름"], ["vpcId", "VPC ID"], ["description", "설명"]],
  SUBNET: [["vpcId", "VPC ID"], ["availabilityZone", "Availability Zone"], ["cidrBlock", "CIDR"], ["availableIpAddressCount", "사용 가능 IP"]],
  VPC: [["cidrBlock", "CIDR"], ["isDefault", "기본 VPC"]]
};

function getInspectorCoreValues(
  resourceType: string,
  values: Readonly<Record<string, unknown>>
): InspectorCoreValue[] {
  return (INSPECTOR_CORE_VALUE_ALLOWLIST[resourceType] ?? [])
    .map(([key, label]) => ({ key, label, value: formatMeaningfulInspectorValue(values[key]) }))
    .filter((value): value is InspectorCoreValue => value.value !== null)
    .slice(0, 4);
}

function formatMeaningfulInspectorValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}
