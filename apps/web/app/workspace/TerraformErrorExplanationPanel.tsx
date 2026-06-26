import type { AiTerraformErrorExplanationResult, AiTerraformStage } from "@sketchcatch/types";
import { ResultList } from "./ResultList";

type TerraformErrorExplanationPanelProps = {
  readonly explanation: AiTerraformErrorExplanationResult | null;
  readonly isLoading: boolean;
  readonly onRawMessageChange: (value: string) => void;
  readonly onRelatedResourceIdChange: (value: string) => void;
  readonly onStageChange: (value: AiTerraformStage) => void;
  readonly onTerraformErrorExplanation: () => void;
  readonly rawMessage: string;
  readonly relatedResourceId: string;
  readonly stage: AiTerraformStage;
};

const stageOptions: readonly AiTerraformStage[] = ["validate", "export", "plan", "apply"];

// Terraform Preview 설명과 실제 오류 메시지 설명을 UI에서 분리해 혼동을 막습니다.
export function TerraformErrorExplanationPanel({
  explanation,
  isLoading,
  onRawMessageChange,
  onRelatedResourceIdChange,
  onStageChange,
  onTerraformErrorExplanation,
  rawMessage,
  relatedResourceId,
  stage
}: TerraformErrorExplanationPanelProps) {
  return (
    <section className="workspacePanel toolPanel">
      <h2>Terraform 오류 설명</h2>
      <label className="fieldLabel" htmlFor="terraform-error-stage">
        stage
      </label>
      <select
        className="selectInput"
        id="terraform-error-stage"
        onChange={(event) => onStageChange(parseTerraformStage(event.target.value))}
        value={stage}
      >
        {stageOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <label className="fieldLabel" htmlFor="terraform-error-message">
        rawMessage
      </label>
      <textarea
        className="textArea"
        id="terraform-error-message"
        onChange={(event) => onRawMessageChange(event.target.value)}
        rows={5}
        value={rawMessage}
      />

      <label className="fieldLabel" htmlFor="terraform-error-resource">
        relatedResourceId
      </label>
      <input
        className="textInput"
        id="terraform-error-resource"
        onChange={(event) => onRelatedResourceIdChange(event.target.value)}
        placeholder="ec2-backend"
        value={relatedResourceId}
      />

      <button
        className="primaryButton"
        disabled={isLoading || rawMessage.trim().length === 0}
        onClick={onTerraformErrorExplanation}
      >
        오류 설명 생성
      </button>

      {explanation === null ? null : (
        <ResultList
          items={[
            {
              id: "likely-cause",
              label: `${explanation.severity.toUpperCase()} · ${explanation.category}`,
              text: explanation.likelyCause
            },
            ...explanation.nextActions.map((action) => ({
              id: action,
              label: "다음 행동",
              text: action
            }))
          ]}
          summary={explanation.summary}
        />
      )}
    </section>
  );
}

// select 값은 DOM에서 string으로 나오므로 허용된 stage만 다시 좁힙니다.
function parseTerraformStage(value: string): AiTerraformStage {
  switch (value) {
    case "validate":
    case "export":
    case "plan":
    case "apply":
      return value;
    default:
      return "validate";
  }
}
