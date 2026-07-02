import type { AiArchitectureDraftResult, ArchitectureScenario } from "@sketchcatch/types";
import { LlmExplanationPanel } from "./LlmExplanationPanel";

type DraftMetadata = AiArchitectureDraftResult["metadata"];

type DraftMetadataPanelProps = {
  readonly llmExplanation: AiArchitectureDraftResult["llmExplanation"];
  readonly metadata: DraftMetadata;
};

// Architecture Draft metadata를 팀 발표용 화면에서 읽기 쉬운 블록으로 보여줍니다.
export function DraftMetadataPanel({ llmExplanation, metadata }: DraftMetadataPanelProps) {
  const selectedScenarioLabel =
    metadata.selectedScenario === undefined ? "선택 결과 없음" : getScenarioLabel(metadata.selectedScenario);
  const scenarioScores = metadata.scenarioScores ?? [];
  const guardrailWarnings = metadata.guardrailWarnings ?? [];

  return (
    <div className="metadataBlock">
      <div className="metadataGrid">
        <p className="metadataKicker">선택된 용도</p>
        <p className="mutedText">{selectedScenarioLabel}</p>
      </div>

      <LlmExplanationPanel explanation={llmExplanation} />

      {scenarioScores.length > 0 ? (
        <div className="metadataGrid">
          <p className="metadataKicker">auto 점수</p>
          <ul className="metadataList">
            {scenarioScores.map((score) => (
              <li key={score.scenario}>
                <strong>{getScenarioLabel(score.scenario)}</strong>
                <span>
                  {score.score}점 · {score.reasons.length > 0 ? score.reasons.join(", ") : "단서 없음"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {guardrailWarnings.length > 0 ? (
        <div className="metadataGrid">
          <p className="metadataKicker">warning</p>
          <ul className="warningList">
            {guardrailWarnings.map((warning) => (
              <li className="warningItem" key={warning.code}>
                <strong>{warning.code}</strong>
                <span>{warning.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {metadata.assumptions.length > 0 ? (
        <div className="metadataGrid">
          <p className="metadataKicker">assumptions</p>
          <ul className="metadataList">
            {metadata.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// metadata의 scenario 값을 사용자가 이해할 한국어 용도 이름으로 바꿉니다.
function getScenarioLabel(scenario: ArchitectureScenario): string {
  switch (scenario) {
    case "static_site":
      return "정적 웹사이트";
    case "api_server":
      return "API 서버";
    case "backend_with_db":
      return "DB 포함 백엔드";
    case "server_storage":
      return "서버+스토리지";
  }
}
