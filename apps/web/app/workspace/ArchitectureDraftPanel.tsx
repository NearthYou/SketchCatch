import type {
  ArchitectureDraftBudgetLevel,
  ArchitectureDraftScenarioHint,
  ArchitectureDraftSecurityPriority,
  ArchitectureDraftTrafficLevel
} from "@sketchcatch/types";
import { budgetOptions, scenarioOptions, securityOptions, trafficOptions } from "./workspace-options";

type ArchitectureDraftPanelProps = {
  readonly budgetLevel: ArchitectureDraftBudgetLevel;
  readonly isLoading: boolean;
  readonly onBudgetLevelChange: (value: ArchitectureDraftBudgetLevel) => void;
  readonly onGitHubDraft: () => void;
  readonly onPromptChange: (value: string) => void;
  readonly onPromptDraft: () => void;
  readonly onRepositoryUrlChange: (value: string) => void;
  readonly onScenarioHintChange: (value: ArchitectureDraftScenarioHint) => void;
  readonly onSecurityPriorityChange: (value: ArchitectureDraftSecurityPriority) => void;
  readonly onTrafficLevelChange: (value: ArchitectureDraftTrafficLevel) => void;
  readonly prompt: string;
  readonly repositoryUrl: string;
  readonly scenarioHint: ArchitectureDraftScenarioHint;
  readonly securityPriority: ArchitectureDraftSecurityPriority;
  readonly trafficLevel: ArchitectureDraftTrafficLevel;
};

// Architecture Draft 입력 폼을 분리해 AI workspace가 결과 패널과 요청 상태에만 집중하게 합니다.
export function ArchitectureDraftPanel({
  budgetLevel,
  isLoading,
  onBudgetLevelChange,
  onGitHubDraft,
  onPromptChange,
  onPromptDraft,
  onRepositoryUrlChange,
  onScenarioHintChange,
  onSecurityPriorityChange,
  onTrafficLevelChange,
  prompt,
  repositoryUrl,
  scenarioHint,
  securityPriority,
  trafficLevel
}: ArchitectureDraftPanelProps) {
  return (
    <section className="workspacePanel toolPanel">
      <h2>Architecture Draft</h2>
      <label className="fieldLabel" htmlFor="prompt-input">
        자연어 요청
      </label>
      <textarea
        className="textArea"
        id="prompt-input"
        onChange={(event) => onPromptChange(event.target.value)}
        rows={5}
        value={prompt}
      />

      <span className="fieldLabel">용도 선택</span>
      <div className="choiceGrid">
        {scenarioOptions.map((option) => (
          <button
            className={option.value === scenarioHint ? "choiceButton choiceButtonActive" : "choiceButton"}
            key={option.value}
            onClick={() => onScenarioHintChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <span className="fieldLabel">예산</span>
      <div className="choiceGrid choiceGridCompact">
        {budgetOptions.map((option) => (
          <button
            className={option.value === budgetLevel ? "choiceButton choiceButtonActive" : "choiceButton"}
            key={option.value}
            onClick={() => onBudgetLevelChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <span className="fieldLabel">트래픽</span>
      <div className="choiceGrid choiceGridCompact">
        {trafficOptions.map((option) => (
          <button
            className={option.value === trafficLevel ? "choiceButton choiceButtonActive" : "choiceButton"}
            key={option.value}
            onClick={() => onTrafficLevelChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <span className="fieldLabel">보안 우선순위</span>
      <div className="choiceGrid choiceGridCompact">
        {securityOptions.map((option) => (
          <button
            className={option.value === securityPriority ? "choiceButton choiceButtonActive" : "choiceButton"}
            key={option.value}
            onClick={() => onSecurityPriorityChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <button className="primaryButton" disabled={isLoading} onClick={onPromptDraft}>
        자연어 초안 생성
      </button>

      <label className="fieldLabel" htmlFor="github-url-input">
        GitHub public repository URL
      </label>
      <input
        className="textInput"
        id="github-url-input"
        onChange={(event) => onRepositoryUrlChange(event.target.value)}
        placeholder="https://github.com/owner/repo"
        type="url"
        value={repositoryUrl}
      />
      <button
        className="secondaryButton"
        disabled={isLoading || repositoryUrl.trim().length === 0}
        onClick={onGitHubDraft}
      >
        GitHub 초안 생성
      </button>
    </section>
  );
}
