import styles from "./TerraformAgentReviewButton.module.css";

export type TerraformAgentReviewButtonProps = {
  readonly disabled: boolean;
  readonly isLoading?: boolean | undefined;
  readonly onRequest: () => void;
  readonly title: string;
};

export function TerraformAgentReviewButton({
  disabled,
  isLoading = false,
  onRequest,
  title
}: TerraformAgentReviewButtonProps) {
  return (
    <button
      className={styles.button}
      disabled={disabled}
      onClick={onRequest}
      title={title}
      type="button"
    >
      <span aria-hidden="true" className={styles.mark}>
        AI
      </span>
      <span>{isLoading ? "Amazon Q 리뷰 중" : "에이전트 리뷰"}</span>
    </button>
  );
}
