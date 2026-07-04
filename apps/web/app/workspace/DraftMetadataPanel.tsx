import type {
  AiArchitectureDraftResult,
  ArchitectureDraftPattern,
  ArchitectureRequirementFact
} from "@sketchcatch/types";
import { LlmExplanationPanel } from "./LlmExplanationPanel";

type DraftMetadata = AiArchitectureDraftResult["metadata"];

type DraftMetadataPanelProps = {
  readonly llmExplanation: AiArchitectureDraftResult["llmExplanation"];
  readonly metadata: DraftMetadata;
};

// Architecture Draft metadata를 팀 발표용 화면에서 읽기 쉬운 블록으로 보여줍니다.
export function DraftMetadataPanel({ llmExplanation, metadata }: DraftMetadataPanelProps) {
  const selectedDraftPatternLabel =
    metadata.selectedDraftPattern === undefined ? "대표 패턴 없음" : getDraftPatternLabel(metadata.selectedDraftPattern);
  const requirementFacts = metadata.requirementFacts ?? [];
  const guardrailWarnings = metadata.guardrailWarnings ?? [];

  return (
    <div className="metadataBlock">
      <div className="metadataGrid">
        <p className="metadataKicker">대표 패턴</p>
        <p className="mutedText">{selectedDraftPatternLabel}</p>
      </div>

      <LlmExplanationPanel explanation={llmExplanation} />

      {requirementFacts.length > 0 ? (
        <div className="metadataGrid">
          <p className="metadataKicker">요구사항 단서</p>
          <ul className="metadataList">
            {requirementFacts.map((fact) => (
              <li key={fact}>
                <strong>{getRequirementFactLabel(fact)}</strong>
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

// metadata의 대표 패턴 값을 사용자가 이해할 한국어 이름으로 바꿉니다.
function getDraftPatternLabel(pattern: ArchitectureDraftPattern): string {
  switch (pattern) {
    case "static_site":
      return "정적 웹사이트";
    case "api_server":
      return "API 서버";
    case "backend_with_db":
      return "DB 포함 백엔드";
    case "server_storage":
      return "서버+스토리지";
    case "serverless_function":
      return "Lambda 함수";
  }
}

function getRequirementFactLabel(fact: ArchitectureRequirementFact): string {
  switch (fact) {
    case "auth_or_user_data":
      return "로그인/사용자 데이터";
    case "database":
      return "데이터 보관";
    case "encryption":
      return "암호화";
    case "file_upload":
      return "파일 업로드";
    case "iam_permissions":
      return "실행 권한";
    case "network_boundary":
      return "네트워크 경계";
    case "object_storage":
      return "객체 저장소";
    case "observability":
      return "로그/알림";
    case "server_runtime":
      return "서버 실행 공간";
    case "serverless_runtime":
      return "서버리스 실행";
    case "static_delivery":
      return "정적 배포";
    case "web_frontend":
      return "웹 화면";
  }
}
