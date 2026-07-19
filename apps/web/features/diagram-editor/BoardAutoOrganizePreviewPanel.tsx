import type { DiagramJson, DiagramNode } from "@sketchcatch/types";
import {
  getBoardAutoOrganizeSelectedCandidate,
  type BoardAutoOrganizePreviewSession,
  type BoardAutoOrganizePreviewView
} from "../architecture-board-compiler";
import styles from "./diagram-editor.module.css";

/** 여러 정리안을 내부 점수 없이 thumbnail과 원본 비교로 보여줍니다. */
export function BoardAutoOrganizePreviewPanel({
  onKeepOriginal,
  onSelectCandidate,
  onSelectView,
  onUseOrganized,
  session
}: {
  readonly onKeepOriginal: () => void;
  readonly onSelectCandidate: (candidateId: string) => void;
  readonly onSelectView: (view: BoardAutoOrganizePreviewView) => void;
  readonly onUseOrganized: () => void;
  readonly session: BoardAutoOrganizePreviewSession;
}) {
  const selectedCandidate = getBoardAutoOrganizeSelectedCandidate(session);

  if (!selectedCandidate) {
    return null;
  }

  return (
    <section
      aria-label="자동 정리 미리보기"
      className={`${styles.previewNotice} ${styles.compilerPreviewNotice}`}
    >
      <div className={styles.compilerPreviewHeader}>
        <div>
          <strong>Board 정리안 비교</strong>
          <span>마음에 드는 정리안을 고른 뒤 원본과 비교해 보세요.</span>
        </div>
      </div>

      <div
        aria-label="정리안 선택"
        className={styles.autoOrganizeCandidateStrip}
        role="list"
      >
        {session.candidates.map((candidate, index) => {
          const label = `정리안 ${index + 1}`;

          return (
            <button
              aria-label={`${label} 선택`}
              aria-pressed={candidate.id === session.selectedCandidateId}
              className={styles.autoOrganizeCandidateButton}
              key={candidate.id}
              onClick={() => onSelectCandidate(candidate.id)}
              role="listitem"
              type="button"
            >
              <BoardAutoOrganizeDiagramThumbnail diagram={candidate.diagram} label={label} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <div
        aria-label="모바일 비교 화면"
        className={styles.autoOrganizeMobileToggle}
        role="group"
      >
        <button
          aria-pressed={session.activeView === "original"}
          onClick={() => onSelectView("original")}
          type="button"
        >
          원본
        </button>
        <button
          aria-pressed={session.activeView === "organized"}
          onClick={() => onSelectView("organized")}
          type="button"
        >
          정리안
        </button>
      </div>

      <div>
        <strong className={styles.autoOrganizeComparisonTitle}>원본과 정리안 비교</strong>
        <div
          className={styles.autoOrganizeComparison}
          data-comparison-layout="responsive"
          data-preview-view={session.activeView}
        >
          <figure data-comparison-panel="original">
            <BoardAutoOrganizeDiagramThumbnail
              diagram={session.originalDiagram}
              label="원본"
            />
            <figcaption>원본</figcaption>
          </figure>
          <figure data-comparison-panel="organized">
            <BoardAutoOrganizeDiagramThumbnail
              diagram={selectedCandidate.diagram}
              label="선택한 정리안"
            />
            <figcaption>선택한 정리안</figcaption>
          </figure>
        </div>
      </div>

      <ul className={styles.autoOrganizeExplanations}>
        {selectedCandidate.explanations.map((explanation) => (
          <li key={explanation}>{explanation}</li>
        ))}
      </ul>

      <div className={styles.compilerPreviewActions}>
        <button onClick={onKeepOriginal} type="button">
          원본 유지
        </button>
        <button onClick={onUseOrganized} type="button">
          이 정리안 적용
        </button>
      </div>
    </section>
  );
}

/** 자동 정리 생성·적용 실패를 내부 오류 없이 한 문장으로 안내합니다. */
export function BoardAutoOrganizeFailurePanel({
  onClose,
  onRetry
}: {
  readonly onClose: () => void;
  readonly onRetry: () => void;
}) {
  return (
    <section
      aria-label="자동 정리 오류"
      className={`${styles.previewNotice} ${styles.compilerPreviewNotice}`}
      role="alert"
    >
      <div className={styles.compilerPreviewHeader}>
        <div>
          <strong>정리안을 적용하지 못했어요.</strong>
          <span>보드가 바뀌었을 수 있어요. 현재 보드를 확인한 뒤 다시 시도해 주세요.</span>
        </div>
        <div className={styles.compilerPreviewActions}>
          <button onClick={onClose} type="button">
            닫기
          </button>
          <button onClick={onRetry} type="button">
            다시 시도
          </button>
        </div>
      </div>
    </section>
  );
}

/** 실제 Board 좌표를 작은 SVG 안에 맞춰 후보 모양만 안전하게 보여줍니다. */
function BoardAutoOrganizeDiagramThumbnail({
  diagram,
  label
}: {
  readonly diagram: DiagramJson;
  readonly label: string;
}) {
  const layout = getDiagramThumbnailLayout(diagram);
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]));

  return (
    <svg
      aria-label={`${label} 그림`}
      className={styles.autoOrganizeDiagramThumbnail}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      viewBox={layout.viewBox}
    >
      <rect fill="#f8fafc" height={layout.height} width={layout.width} x={layout.x} y={layout.y} />
      {diagram.edges.map((edge) => {
        const source = nodeById.get(edge.sourceNodeId);
        const target = nodeById.get(edge.targetNodeId);

        if (!source || !target) {
          return null;
        }

        const sourceCenter = getNodeCenter(source);
        const targetCenter = getNodeCenter(target);

        return (
          <line
            key={edge.id}
            stroke="#94a3b8"
            strokeWidth={Math.max(2, layout.width / 220)}
            x1={sourceCenter.x}
            x2={targetCenter.x}
            y1={sourceCenter.y}
            y2={targetCenter.y}
          />
        );
      })}
      {[...diagram.nodes]
        .sort((left, right) => left.zIndex - right.zIndex)
        .map((node) => (
          <g key={node.id}>
            <rect
              fill={node.kind === "design" ? "#eff6ff" : "#ffffff"}
              height={node.size.height}
              rx={Math.max(4, Math.min(node.size.width, node.size.height) * 0.08)}
              stroke={node.kind === "design" ? "#93c5fd" : "#64748b"}
              strokeDasharray={node.kind === "design" ? "8 6" : undefined}
              strokeWidth={Math.max(2, layout.width / 260)}
              width={node.size.width}
              x={node.position.x}
              y={node.position.y}
            />
            <text
              fill="#334155"
              fontSize={Math.max(12, Math.min(node.size.height * 0.2, layout.width / 18))}
              textAnchor="middle"
              x={node.position.x + node.size.width / 2}
              y={node.position.y + node.size.height / 2}
            >
              {truncateDiagramLabel(node.label)}
            </text>
          </g>
        ))}
    </svg>
  );
}

/** node 전체를 감싸는 여백 포함 SVG viewBox를 계산합니다. */
function getDiagramThumbnailLayout(diagram: DiagramJson): {
  readonly height: number;
  readonly viewBox: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
} {
  if (diagram.nodes.length === 0) {
    return { x: 0, y: 0, width: 320, height: 180, viewBox: "0 0 320 180" };
  }

  const minX = Math.min(...diagram.nodes.map((node) => node.position.x));
  const minY = Math.min(...diagram.nodes.map((node) => node.position.y));
  const maxX = Math.max(...diagram.nodes.map((node) => node.position.x + node.size.width));
  const maxY = Math.max(...diagram.nodes.map((node) => node.position.y + node.size.height));
  const padding = Math.max(24, Math.max(maxX - minX, maxY - minY) * 0.08);
  const x = minX - padding;
  const y = minY - padding;
  const width = Math.max(1, maxX - minX + padding * 2);
  const height = Math.max(1, maxY - minY + padding * 2);

  return { x, y, width, height, viewBox: `${x} ${y} ${width} ${height}` };
}

/** 연결선용 node 중심 좌표만 계산합니다. */
function getNodeCenter(node: DiagramNode): { readonly x: number; readonly y: number } {
  return {
    x: node.position.x + node.size.width / 2,
    y: node.position.y + node.size.height / 2
  };
}

/** 작은 thumbnail에서 읽을 수 있게 긴 화면 이름만 줄입니다. */
function truncateDiagramLabel(label: string): string {
  return label.length > 18 ? `${label.slice(0, 17)}…` : label;
}
