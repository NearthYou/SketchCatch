import type { AiTerraformPreviewExplanationResult } from "@sketchcatch/types";
import { ResultList } from "./ResultList";

type TerraformPreviewPanelProps = {
  readonly isLoading: boolean;
  readonly onDiagramToTerraform: () => void;
  readonly onTerraformCodeChange: (value: string) => void;
  readonly onTerraformPreview: () => void;
  readonly terraformCode: string;
  readonly terraformPreview: AiTerraformPreviewExplanationResult | null;
};

// Terraform Preview 입력과 결과 표시를 작업대 본문에서 분리해 conflict 범위를 줄입니다.
export function TerraformPreviewPanel({
  isLoading,
  onDiagramToTerraform,
  onTerraformCodeChange,
  onTerraformPreview,
  terraformCode,
  terraformPreview
}: TerraformPreviewPanelProps) {
  return (
    <section className="workspacePanel toolPanel">
      <h2>Terraform Preview 설명</h2>
      <label className="fieldLabel" htmlFor="terraform-input">
        Terraform 코드
      </label>
      <textarea
        className="codeArea"
        id="terraform-input"
        onChange={(event) => onTerraformCodeChange(event.target.value)}
        rows={11}
        value={terraformCode}
      />
      <button className="secondaryButton" disabled={isLoading} onClick={onDiagramToTerraform}>
        샘플 다이어그램 변환
      </button>
      <button className="primaryButton" disabled={isLoading} onClick={onTerraformPreview}>
        코드 설명 생성
      </button>
      {terraformPreview === null ? null : (
        <ResultList
          items={terraformPreview.detectedResources.map((resource) => ({
            id: `${resource.terraformType}-${resource.label}`,
            label: resource.label,
            text: resource.explanation
          }))}
          summary={terraformPreview.summary}
        />
      )}
    </section>
  );
}
