import type {
  ArchitectureJson,
  DiscoveredResource,
  ReverseEngineeringScanLogLine,
  ReverseEngineeringScanResponse,
  ReverseEngineeringScanError
} from "@sketchcatch/types";
import type { ReverseEngineeringDraftNodeUpdate } from "./reverse-engineering-draft-edits";
import type { ReverseEngineeringBoardComparison } from "./reverse-engineering-board-application";
import type { ReverseEngineeringBoardCandidate } from "./reverse-engineering-board-candidates";
import { ReverseEngineeringFindingsPanel } from "./ReverseEngineeringFindingsPanel";
import { ReverseEngineeringImportSuggestionsPanel } from "./ReverseEngineeringImportSuggestionsPanel";
import { ReverseEngineeringResourceParametersPanel } from "./ReverseEngineeringResourceParametersPanel";
import styles from "./workspace.module.css";

export type ReverseEngineeringApplyState = "idle" | "saving" | "saved" | "error";

export type ReverseEngineeringResultPanelProps = {
  readonly applyMessage: string | null;
  readonly applyState: ReverseEngineeringApplyState;
  readonly boardCandidates: readonly ReverseEngineeringBoardCandidate[];
  readonly comparison: ReverseEngineeringBoardComparison;
  readonly hasCurrentBoardResources: boolean;
  readonly logs: ReverseEngineeringScanLogLine[];
  readonly onAppendToCurrentBoard: () => void;
  readonly onCandidateSelect: (candidateId: string) => void;
  readonly onDraftNodeEdit: (nodeId: string, update: ReverseEngineeringDraftNodeUpdate) => void;
  readonly onOpenAsNewBoard: () => void;
  readonly onRetryScan: () => void;
  readonly response: ReverseEngineeringScanResponse;
  readonly selectedCandidateId: string;
};

// 스캔 결과와 사용자가 누를 적용 버튼을 한 화면에 모아 보여줍니다.
export function ReverseEngineeringResultPanel({
  applyMessage,
  applyState,
  boardCandidates,
  comparison,
  hasCurrentBoardResources,
  logs,
  onAppendToCurrentBoard,
  onCandidateSelect,
  onDraftNodeEdit,
  onOpenAsNewBoard,
  onRetryScan,
  response,
  selectedCandidateId
}: ReverseEngineeringResultPanelProps) {
  const result = response.result;

  if (!result) {
    return null;
  }

  const isApplying = applyState === "saving";
  const unsupportedResources = result.discoveredResources.filter(
    (resource) => resource.resourceType === "UNKNOWN"
  );

  return (
    <>
      <section className={styles.deploymentSection}>
        <h3>복원된 Practice Architecture 미리보기</h3>
        <div className={styles.deploymentPreflightStats}>
          <span>
            찾은 리소스
            <strong>{result.discoveredResources.length}</strong>
          </span>
          <span>
            보드 노드
            <strong>{result.architectureJson.nodes.length}</strong>
          </span>
          <span>
            연결선
            <strong>{result.architectureJson.edges.length}</strong>
          </span>
        </div>
        <p className={styles.deploymentHint}>
          스캔 결과는 지금 보드에 미리보기로만 표시됩니다. 아래 적용 버튼을 누르기 전에는 현재 보드를 바꾸지 않습니다.
        </p>
      </section>

      <ReverseEngineeringScanCoveragePanel
        scanErrors={result.scanErrors}
        unsupportedResourceCount={unsupportedResources.length}
      />

      <ReverseEngineeringCandidateSelector
        candidates={boardCandidates}
        onCandidateSelect={onCandidateSelect}
        selectedCandidateId={selectedCandidateId}
      />

      <ReverseEngineeringDraftEditor
        architectureJson={result.architectureJson}
        onDraftNodeEdit={onDraftNodeEdit}
      />

      <section className={styles.deploymentSection}>
        <h3>현재 보드와 비교</h3>
        <div className={styles.deploymentPreflightStats}>
          <span>
            추가 후보
            <strong>{comparison.additions.length}</strong>
          </span>
          <span>
            변경 후보
            <strong>{comparison.changes.length}</strong>
          </span>
          <span>
            삭제 후보
            <strong>{comparison.deletions.length}</strong>
          </span>
          <span>
            중복 후보
            <strong>{comparison.duplicates.length}</strong>
          </span>
          <span>
            확인 필요
            <strong>{comparison.manualReviews.length}</strong>
          </span>
        </div>
        {comparison.manualReviews.length > 0 ? (
          <p className={styles.deploymentNotice}>
            AWS 원본 ID가 없거나 Terraform 이름만 겹치는 Resource는 자동으로 합치지 않습니다.
          </p>
        ) : null}
        <div className={styles.deploymentApplyActions}>
          <button
            className={styles.deploymentPrimaryButton}
            disabled={isApplying}
            onClick={onOpenAsNewBoard}
            type="button"
          >
            <span className={styles.deploymentButtonText}>
              {hasCurrentBoardResources ? "새 보드로 열기" : "보드에 적용"}
            </span>
          </button>
          {hasCurrentBoardResources ? (
            <button
              className={styles.deploymentSecondaryButton}
              disabled={isApplying || comparison.additions.length === 0}
              onClick={onAppendToCurrentBoard}
              type="button"
            >
              현재 보드에 추가
            </button>
          ) : null}
        </div>
        {applyMessage ? (
          <p className={applyState === "error" ? styles.deploymentError : styles.deploymentNotice}>
            {applyMessage}
          </p>
        ) : null}
      </section>

      <section className={styles.deploymentSection}>
        <h3>발견한 리소스</h3>
        {result.discoveredResources.length === 0 ? (
          <p className={styles.deploymentHint}>아직 발견한 리소스가 없습니다.</p>
        ) : (
          <ul className={styles.reverseResultList}>
            {result.discoveredResources.slice(0, 8).map((resource) => (
              <li key={resource.id} className={styles.reverseResultItem}>
                <strong>{resource.displayName}</strong>
                <span>
                  {resource.resourceType} · {resource.providerResourceId}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReverseEngineeringResourceParametersPanel discoveredResources={result.discoveredResources} />

      <ReverseEngineeringFindingsPanel
        analysisExclusions={result.analysisExclusions}
        findings={result.findings}
        onRetryScan={onRetryScan}
        scanErrors={result.scanErrors}
      />

      <UnsupportedResourceList resources={unsupportedResources} />

      <ReverseEngineeringImportSuggestionsPanel importSuggestions={result.importSuggestions} />

      <section className={styles.deploymentSection}>
        <h3>스캔 로그</h3>
        {logs.length === 0 ? (
          <p className={styles.deploymentHint}>표시할 로그가 없습니다.</p>
        ) : (
          <ul className={styles.reverseLogList}>
            {logs.map((log) => (
              <li key={log.id} data-level={log.level}>
                <strong>{log.stage}</strong>
                <span>{log.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// 여러 인프라가 섞여 있을 때 사용자가 맞는 보드 후보를 고르게 합니다.
function ReverseEngineeringCandidateSelector({
  candidates,
  onCandidateSelect,
  selectedCandidateId
}: {
  readonly candidates: readonly ReverseEngineeringBoardCandidate[];
  readonly onCandidateSelect: (candidateId: string) => void;
  readonly selectedCandidateId: string;
}) {
  if (candidates.length <= 1) {
    return null;
  }

  return (
    <section className={styles.deploymentSection}>
      <h3>보드 후보 선택</h3>
      <p className={styles.deploymentHint}>
        AWS에 여러 구조가 섞여 있을 수 있습니다. 맞는 후보를 고르면 보드 미리보기도 같이 바뀝니다.
      </p>
      <div className={styles.reverseCandidateGrid} role="radiogroup" aria-label="보드 후보 선택">
        {candidates.map((candidate) => (
          <button
            aria-checked={candidate.id === selectedCandidateId}
            className={
              candidate.id === selectedCandidateId
                ? `${styles.reverseCandidateCard} ${styles.reverseCandidateCardSelected}`
                : styles.reverseCandidateCard
            }
            key={candidate.id}
            onClick={() => onCandidateSelect(candidate.id)}
            role="radio"
            type="button"
          >
            <strong>{candidate.title}</strong>
            <span>{candidate.description}</span>
            <small>
              노드 {candidate.nodeCount}개 · 연결선 {candidate.edgeCount}개
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}

// 사용자가 적용하기 전에 이번 스캔이 전체 결과인지 부분 결과인지 먼저 알려줍니다.
function ReverseEngineeringScanCoveragePanel({
  scanErrors,
  unsupportedResourceCount
}: {
  readonly scanErrors: ReverseEngineeringScanError[];
  readonly unsupportedResourceCount: number;
}) {
  const notice = getScanCoverageNotice(scanErrors);

  return (
    <section className={styles.deploymentSection}>
      <h3>스캔 범위</h3>
      <div className={styles.deploymentPreflightStats}>
        <span>
          못 읽은 서비스
          <strong>{scanErrors.length}</strong>
        </span>
        <span>
          확인 필요
          <strong>{unsupportedResourceCount}</strong>
        </span>
      </div>
      <p className={scanErrors.length > 0 ? styles.deploymentNotice : styles.deploymentHint}>
        {notice}
      </p>
    </section>
  );
}

// Resource Explorer 실패처럼 전체 스캔 범위에 영향을 주는 상태를 쉬운 말로 바꿉니다.
function getScanCoverageNotice(scanErrors: ReverseEngineeringScanError[]): string {
  if (scanErrors.some((scanError) => scanError.id === "scan-error-resource-explorer")) {
    return "Resource Explorer를 읽지 못했습니다. 가져온 결과가 전체 AWS 상태가 아닐 수 있습니다.";
  }

  if (scanErrors.length > 0) {
    return "일부 AWS 서비스를 읽지 못했습니다. 가져온 결과가 전체 AWS 상태가 아닐 수 있습니다.";
  }

  return "현재 권한으로 읽을 수 있는 범위에서는 부분 실패 없이 스캔했습니다.";
}

// 원본 AWS 값은 그대로 두고, 사용자가 적용할 후보 설계의 안전한 표시값만 수정합니다.
function ReverseEngineeringDraftEditor({
  architectureJson,
  onDraftNodeEdit
}: {
  readonly architectureJson: ArchitectureJson;
  readonly onDraftNodeEdit: (nodeId: string, update: ReverseEngineeringDraftNodeUpdate) => void;
}) {
  if (architectureJson.nodes.length === 0) {
    return null;
  }

  return (
    <section className={styles.deploymentSection}>
      <h3>Draft 수정</h3>
      <ul className={styles.reverseResultList}>
        {architectureJson.nodes.map((node) => (
          <li key={node.id} className={styles.reverseResultItem}>
            <label className={styles.deploymentField}>
              표시 이름
              <input
                onChange={(event) => onDraftNodeEdit(node.id, { label: event.currentTarget.value })}
                value={node.label}
              />
            </label>
            <label className={styles.deploymentField}>
              설명
              <input
                onChange={(event) =>
                  onDraftNodeEdit(node.id, { description: event.currentTarget.value })
                }
                value={typeof node.config["description"] === "string" ? node.config["description"] : ""}
              />
            </label>
            <div className={styles.deploymentApplyActions}>
              <label className={styles.deploymentField}>
                X
                <input
                  onChange={(event) =>
                    onDraftNodeEdit(node.id, { positionX: Number(event.currentTarget.value) })
                  }
                  type="number"
                  value={node.positionX}
                />
              </label>
              <label className={styles.deploymentField}>
                Y
                <input
                  onChange={(event) =>
                    onDraftNodeEdit(node.id, { positionY: Number(event.currentTarget.value) })
                  }
                  type="number"
                  value={node.positionY}
                />
              </label>
            </div>
            <span>
              {node.type} · {String(node.config["providerResourceId"] ?? "providerResourceId 없음")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function UnsupportedResourceList({ resources }: { readonly resources: DiscoveredResource[] }) {
  if (resources.length === 0) {
    return null;
  }

  return (
    <section className={styles.deploymentSection}>
      <h3>미지원 Resource</h3>
      <p className={styles.deploymentHint}>
        AWS에서 발견했지만 아직 SketchCatch 정식 ResourceType으로 매핑하지 못한 항목입니다.
      </p>
      <ul className={styles.reverseResultList}>
        {resources.map((resource) => (
          <li key={resource.id} className={styles.reverseResultItem}>
            <strong>{resource.displayName}</strong>
            <span>{resource.providerResourceType}</span>
            <span>
              {resource.providerResourceId} · {resource.region}
            </span>
            <span>Terraform 생성, 배포, 확정 비용/보안 판단에서는 제외됩니다.</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
