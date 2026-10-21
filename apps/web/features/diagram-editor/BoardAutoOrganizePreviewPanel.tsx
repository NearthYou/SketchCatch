import {
  type BoardAutoOrganizePreviewSession,
  type BoardAutoOrganizePreviewView
} from "../architecture-board-compiler";
import styles from "./diagram-editor.module.css";

/** 실제 Board를 원본과 단일 정리본으로 전환할 수 있는 미리보기 제어를 보여줍니다. */
export function BoardAutoOrganizePreviewPanel({
  onKeepOriginal,
  onSelectView,
  onUseOrganized,
  session
}: {
  readonly onKeepOriginal: () => void;
  readonly onSelectView: (view: BoardAutoOrganizePreviewView) => void;
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
          <span>같은 Board에서 원본과 정리본을 전환해 확인하세요.</span>
        </div>
      </div>

      <div
        aria-label="원본과 정리본 보기"
        className={styles.autoOrganizeViewToggle}
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
          정리본
        </button>
      </div>

      <ul className={styles.autoOrganizeExplanations}>
        {session.organizedResult.explanations.map((explanation) => (
          <li key={explanation}>{explanation}</li>
        ))}
      </ul>

      <div className={styles.compilerPreviewActions}>
        <button onClick={onKeepOriginal} type="button">
          원본 유지
        </button>
        <button onClick={onUseOrganized} type="button">
          이 정리본 적용
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
