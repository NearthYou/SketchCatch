import type {
  AiPreDeploymentAnalysisResult,
  CheckFinding,
  DesignSimulationResult,
  LlmExplanation
} from "@sketchcatch/types";
import styles from "./workspace.module.css";

export type AiRequestState = "idle" | "loading" | "error";
export type ChoiceOption<Value extends string> = {
  readonly label: string;
  readonly value: Value;
};

// 좁은 오른쪽 패널에서 같은 select UI를 반복 사용합니다.
export function WorkspaceAiSelect<Value extends string>({
  label,
  onChange,
  options,
  value
}: {
  readonly label: string;
  readonly onChange: (value: Value) => void;
  readonly options: readonly ChoiceOption<Value>[];
  readonly value: Value;
}) {
  function handleChange(nextValue: string): void {
    const selectedOption = options.find((option) => option.value === nextValue);

    if (selectedOption) {
      onChange(selectedOption.value);
    }
  }

  return (
    <label className={styles.aiField}>
      <span>{label}</span>
      <select onChange={(event) => handleChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// 각 AI 작업의 실행 버튼과 섹션 제목을 같은 형태로 맞춥니다.
export function WorkspaceAiActionHeader({
  buttonLabel,
  disabled,
  onClick,
  title
}: {
  readonly buttonLabel: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly title: string;
}) {
  return (
    <div className={styles.aiActionHeader}>
      <h3>{title}</h3>
      <button className={styles.aiSecondaryButton} disabled={disabled} onClick={onClick} type="button">
        {buttonLabel}
      </button>
    </div>
  );
}

// AI 요청 상태를 패널 안에서 같은 경고/진행 문구로 보여줍니다.
export function WorkspaceAiRequestMessage({
  message,
  state
}: {
  readonly message: string;
  readonly state: AiRequestState;
}) {
  if (state === "loading") {
    return <p className={styles.aiNotice}>요청 처리 중입니다.</p>;
  }

  if (state === "error") {
    return (
      <p className={styles.aiError} role="alert">
        {message}
      </p>
    );
  }

  return null;
}

// LLM 설명을 요약, 핵심, 다음 행동 순서로 한 번씩만 묶어 보여줍니다.
export function WorkspaceAiExplanation({ explanation }: { readonly explanation: LlmExplanation | undefined }) {
  if (explanation === undefined) {
    return null;
  }

  return (
    <div className={styles.aiExplanation}>
      <div className={styles.aiExplanationHeader}>
        <strong>AI 설명</strong>
        <span>{explanation.fallbackUsed ? "기본 설명" : "OpenAI 설명"}</span>
      </div>
      <p>{explanation.summary}</p>
      {explanation.highlights.length > 0 ? <WorkspaceAiTextList title="핵심" items={explanation.highlights} /> : null}
      {explanation.nextActions.length > 0 ? (
        <WorkspaceAiTextList title="다음 행동" items={explanation.nextActions} />
      ) : null}
    </div>
  );
}

// Pre-Deployment Check 결과를 요약과 Check Finding 중심으로 압축 표시합니다.
export function WorkspaceAiPreDeploymentResult({
  analysis
}: {
  readonly analysis: AiPreDeploymentAnalysisResult;
}) {
  return (
    <div className={styles.aiResultStack}>
      <p className={styles.aiResultSummary}>{analysis.summary}</p>
      <WorkspaceAiExplanation explanation={analysis.llmExplanation} />
      <WorkspaceAiFindingList findings={analysis.findings} />
      <WorkspaceAiTextList
        title="체크리스트"
        items={analysis.checklist.map((item) => `${item.status.toUpperCase()} · ${item.label}`)}
      />
    </div>
  );
}

// Design Simulation 결과를 흐름, 병목, 장애, 비용 검토 순서로 묶어 표시합니다.
export function WorkspaceAiDesignSimulationResult({
  simulation
}: {
  readonly simulation: DesignSimulationResult;
}) {
  return (
    <div className={styles.aiResultStack}>
      <p className={styles.aiResultSummary}>{simulation.summary}</p>
      <WorkspaceAiExplanation explanation={simulation.llmExplanation} />
      <WorkspaceAiTextList
        title="요청 흐름"
        items={simulation.requestFlow.map((step) => `${step.fromResourceId} -> ${step.toResourceId}: ${step.description}`)}
      />
      <WorkspaceAiTextList
        title="병목 후보"
        items={simulation.bottlenecks.map((item) => `${item.severity.toUpperCase()} · ${item.title}`)}
      />
      <WorkspaceAiTextList
        title="장애 시나리오"
        items={simulation.failureScenarios.map((item) => `${item.title}: ${item.mitigation}`)}
      />
      <WorkspaceAiTextList
        title="비용과 다음 검토"
        items={[...simulation.costPressure, ...simulation.recommendations]}
      />
    </div>
  );
}

// 짧은 텍스트 목록을 AI 설명과 분석 결과에서 같은 마크업으로 사용합니다.
function WorkspaceAiTextList({ items, title }: { readonly items: readonly string[]; readonly title: string }) {
  return (
    <div className={styles.aiListBlock}>
      <strong>{title}</strong>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

// Check Finding은 Resource 연결 여부를 잃지 않도록 한 줄씩 표시합니다.
function WorkspaceAiFindingList({ findings }: { readonly findings: readonly CheckFinding[] }) {
  if (findings.length === 0) {
    return <p className={styles.aiHint}>표시할 Check Finding이 없습니다.</p>;
  }

  return (
    <div className={styles.aiListBlock}>
      <strong>Check Finding</strong>
      <ul>
        {findings.map((finding) => (
          <li key={finding.id}>
            {finding.severity.toUpperCase()} · {finding.title}
            {finding.resourceId ? ` · ${finding.resourceId}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
