import styles from "./TerraformIssueAnalysisButton.module.css";

export type TerraformIssueAnalysisButtonProps = {
  readonly onAnalyze: () => void;
};

export function TerraformIssueAnalysisButton({ onAnalyze }: TerraformIssueAnalysisButtonProps) {
  return (
    <button
      className={styles.button}
      data-terraform-issue-ai-resolution
      onClick={onAnalyze}
      type="button"
    >
      <span aria-hidden="true" className={styles.mark}>
        AI
      </span>
      <span>오류 분석</span>
    </button>
  );
}
