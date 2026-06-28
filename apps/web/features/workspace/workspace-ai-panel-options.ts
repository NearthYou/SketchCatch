import type {
  ArchitectureDraftBudgetLevel,
  ArchitectureDraftScenarioHint,
  ArchitectureDraftSecurityPriority,
  ArchitectureDraftTrafficLevel
} from "@sketchcatch/types";
import type { ChoiceOption } from "./WorkspaceAiPanelPieces";

export const DEFAULT_REQUIREMENT_PROMPT =
  "작은 트래픽의 백엔드 API 서버와 PostgreSQL 데이터베이스를 연습용으로 설계해주세요.";

export const scenarioOptions: readonly ChoiceOption<ArchitectureDraftScenarioHint>[] = [
  { label: "자동", value: "auto" },
  { label: "백엔드+DB", value: "backend_with_db" },
  { label: "정적 웹", value: "static_site" },
  { label: "API 서버", value: "api_server" }
];

export const budgetOptions: readonly ChoiceOption<ArchitectureDraftBudgetLevel>[] = [
  { label: "낮음", value: "low" },
  { label: "보통", value: "normal" }
];

export const trafficOptions: readonly ChoiceOption<ArchitectureDraftTrafficLevel>[] = [
  { label: "작음", value: "small" },
  { label: "보통", value: "normal" }
];

export const securityOptions: readonly ChoiceOption<ArchitectureDraftSecurityPriority>[] = [
  { label: "기본", value: "basic" },
  { label: "높음", value: "high" }
];
