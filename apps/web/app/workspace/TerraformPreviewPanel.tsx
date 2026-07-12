import type {
  AiTerraformPreviewExplanationResult,
  WellArchitectedPillar,
  TerraformDiagnostic
} from "@sketchcatch/types";

type TerraformPreviewPanelProps = {
  readonly hasStaleTerraformDiagnostics: boolean;
  readonly hasValidatedTerraform: boolean;
  readonly isLoading: boolean;
  readonly isValidatingTerraform: boolean;
  readonly onDiagramToTerraform: () => void;
  readonly onTerraformCodeChange: (value: string) => void;
  readonly onTerraformPreview: () => void;
  readonly onTerraformValidate: () => void;
  readonly terraformCode: string;
  readonly terraformDiagnostics: TerraformDiagnostic[];
  readonly terraformDiagnosticsError: string | null;
  readonly terraformPreview: AiTerraformPreviewExplanationResult | null;
};

// Terraform Preview 입력과 결과 표시를 작업대 본문에서 분리해 conflict 범위를 줄입니다.
export function TerraformPreviewPanel({
  hasStaleTerraformDiagnostics,
  hasValidatedTerraform,
  isLoading,
  isValidatingTerraform,
  onDiagramToTerraform,
  onTerraformCodeChange,
  onTerraformPreview,
  onTerraformValidate,
  terraformCode,
  terraformDiagnostics,
  terraformDiagnosticsError,
  terraformPreview
}: TerraformPreviewPanelProps) {
  const hasTerraformCode = terraformCode.trim().length > 0;

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
      <button
        className="secondaryButton"
        disabled={isLoading || isValidatingTerraform || !hasTerraformCode}
        onClick={onTerraformValidate}
      >
        {isValidatingTerraform ? "점검 중..." : "문법 점검"}
      </button>
      <button className="primaryButton" disabled={isLoading} onClick={onTerraformPreview}>
        코드 설명 생성
      </button>
      <TerraformDiagnosticsPanel
        diagnostics={terraformDiagnostics}
        errorMessage={terraformDiagnosticsError}
        hasStaleDiagnostics={hasStaleTerraformDiagnostics}
        hasValidated={hasValidatedTerraform}
      />
      {terraformPreview === null ? null : (
        <div className="terraformPreviewAssessment">
          <p className="resultTitle">{terraformPreview.summary}</p>
          <section className="terraformPreviewConclusion">
            <strong>결론</strong>
            <p>{terraformPreview.consensusRecommendation}</p>
          </section>
          <div className="terraformPreviewAgentGrid">
            {terraformPreview.wellArchitectedGuidance.map((guidance) => (
              <section key={guidance.pillar} className="terraformPreviewAgentCard">
                <span>{guidance.title}</span>
                <strong>{formatWellArchitectedPillar(guidance.pillar)}</strong>
                <p>{guidance.observation}</p>
                <p>{guidance.recommendation}</p>
              </section>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

type TerraformDiagnosticsPanelProps = {
  readonly diagnostics: TerraformDiagnostic[];
  readonly errorMessage: string | null;
  readonly hasStaleDiagnostics: boolean;
  readonly hasValidated: boolean;
};

function TerraformDiagnosticsPanel({
  diagnostics,
  errorMessage,
  hasStaleDiagnostics,
  hasValidated
}: TerraformDiagnosticsPanelProps) {
  if (errorMessage !== null) {
    return <p className="errorBanner">{errorMessage}</p>;
  }

  if (!hasValidated) {
    return <p className="emptyState">문법 점검을 실행하면 정적 diagnostics가 여기에 표시됩니다.</p>;
  }

  return (
    <>
      {hasStaleDiagnostics ? (
        <p className="mutedText">Terraform 코드가 수정되었습니다. 다시 문법 점검을 실행하세요.</p>
      ) : null}
      {diagnostics.length === 0 ? (
        <p className="emptyState">정적 diagnostics에서 발견된 문제가 없습니다.</p>
      ) : (
        <ul className="resultList">
          {diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code ?? "diagnostic"}-${diagnostic.line ?? "unknown"}-${index}`}>
              <strong>{formatDiagnosticTitle(diagnostic)}</strong>
              <span>{diagnostic.message}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function formatDiagnosticTitle(diagnostic: TerraformDiagnostic): string {
  const parts = [diagnostic.severity.toUpperCase()];

  if (diagnostic.line !== undefined) {
    parts.push(
      diagnostic.sourceFileName
        ? `${diagnostic.sourceFileName}:${diagnostic.line}`
        : `${diagnostic.line}행`
    );
  }

  if (diagnostic.resourceAddress !== undefined) {
    parts.push(diagnostic.resourceAddress);
  }

  return parts.join(" · ");
}

function formatWellArchitectedPillar(pillar: WellArchitectedPillar): string {
  const labels: Record<WellArchitectedPillar, string> = {
    operational_excellence: "운영 우수성",
    security: "보안",
    reliability: "신뢰성",
    performance_efficiency: "성능 효율성",
    cost_optimization: "비용 최적화",
    sustainability: "지속 가능성"
  };

  return labels[pillar];
}
