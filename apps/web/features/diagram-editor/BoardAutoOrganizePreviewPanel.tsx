import type { BoardAutoOrganizePreviewSession } from "../architecture-board-compiler";
import styles from "./diagram-editor.module.css";

export function BoardAutoOrganizePreviewPanel({
  onKeepOriginal,
  onUseOrganized
}: {
  readonly onKeepOriginal: () => void;
  readonly onUseOrganized: () => void;
  readonly session: BoardAutoOrganizePreviewSession;
}) {
  return (
    <section
      aria-label="자동 정리 미리보기"
      className={`${styles.previewNotice} ${styles.compilerPreviewNotice}`}
    >
      <div className={styles.compilerPreviewHeader}>
        <div>
          <strong>자동 정리 미리보기</strong>
          <span>정리 결과를 보고 있어요</span>
        </div>
      </div>

      <div className={styles.compilerPreviewActions}>
        <button onClick={onKeepOriginal} type="button">
          원본 유지
        </button>
        <button onClick={onUseOrganized} type="button">
          이 정리 사용
        </button>
      </div>
    </section>
  );
}

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
          <strong>자동 정리를 준비하지 못했어요.</strong>
          <span>잠시 후 다시 시도해 주세요.</span>
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
