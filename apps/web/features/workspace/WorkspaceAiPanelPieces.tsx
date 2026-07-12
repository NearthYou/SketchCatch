import type {
  ArchitectureGuardrailWarning,
  AiProvider,
  AiPreDeploymentAnalysisResult,
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  CheckFinding,
  DesignSimulationResult,
  LlmExplanation
} from "@sketchcatch/types";
import { SelectMenu } from "../../components/ui/SelectMenu";
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
    <div className={styles.aiField}>
      <span>{label}</span>
      <SelectMenu
        ariaLabel={`${label} 선택`}
        emptyLabel="값 선택"
        onChange={handleChange}
        options={options}
        value={value}
      />
    </div>
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
        <span>{explanation.fallbackUsed ? "기본 설명" : getWorkspaceAiProviderLabel(explanation.providerMetadata?.provider)}</span>
      </div>
      <p>{explanation.summary}</p>
      {explanation.wellArchitectedConclusion ? (
        <WorkspaceAiTextList title="종합 평가" items={[explanation.wellArchitectedConclusion]} />
      ) : null}
      {explanation.highlights.length > 0 ? <WorkspaceAiTextList title="핵심" items={explanation.highlights} /> : null}
      {explanation.nextActions.length > 0 ? (
        <WorkspaceAiTextList title="다음 행동" items={explanation.nextActions} />
      ) : null}
    </div>
  );
}

function getWorkspaceAiProviderLabel(provider: AiProvider | undefined): string {
  switch (provider) {
    case "bedrock":
      return "Bedrock 설명";
    case "amazon_q":
      return "Amazon Q 설명";
    case "amazon_transcribe":
      return "Amazon Transcribe";
    case "openai":
      return "OpenAI legacy 설명";
    case "fallback":
    case undefined:
      return "AI 설명";
  }
}

// Architecture Draft가 MVP 범위 밖 요구를 감지했을 때 사용자가 놓치지 않게 보여줍니다.
export function WorkspaceAiGuardrailWarnings({
  warnings
}: {
  readonly warnings: readonly ArchitectureGuardrailWarning[] | undefined;
}) {
  if (warnings === undefined || warnings.length === 0) {
    return null;
  }

  return (
    <div className={styles.aiWarning} role="status">
      <strong>지원 범위 경고</strong>
      <ul>
        {warnings.map((warning) => (
          <li key={`${warning.code}-${warning.message}`}>
            <span>{getGuardrailWarningLabel(warning.code)}</span>
            <p>{warning.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 내부 warning code를 발표 화면에서 읽기 쉬운 짧은 한국어 라벨로 바꿉니다.
function getGuardrailWarningLabel(code: ArchitectureGuardrailWarning["code"]): string {
  const warningLabels = {
    low_budget_rds_cost: "예산 확인",
    unsupported_resource_omitted: "일부 제외",
    unsupported_requirement_substituted: "대체 생성",
    partial_generation: "부분 생성",
    guardrail_adjusted_config: "설정 조정",
    board_replacement_required: "전체 교체"
  } satisfies Record<ArchitectureGuardrailWarning["code"], string>;

  return warningLabels[code];
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
        items={analysis.checklist.map((item) => `${formatAiSignalLabel(item.status)} · ${item.label}`)}
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
  const costReviewItems = simulation.costEstimate?.reviewMessages ?? simulation.costPressure;
  const costRecommendationItems = simulation.recommendations.filter(
    (item) => !costReviewItems.includes(item)
  );

  return (
    <div className={`${styles.aiResultStack} ${styles.aiSimulationResult}`}>
      <p className={styles.aiResultSummary}>{simulation.summary}</p>
      <div className={styles.aiSimulationGrid}>
        <section className={styles.aiSimulationCard}>
          <strong>요청 흐름</strong>
          <ul>
            {simulation.requestFlow.map((step, index) => (
              <li key={`flow-${index}-${step.fromResourceId}-${step.toResourceId}`}>
                <span>{step.fromResourceId} -&gt; {step.toResourceId}</span>
                <p>{step.description}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className={styles.aiSimulationCard}>
          <strong>병목 후보</strong>
          <ul>
            {simulation.bottlenecks.map((item, index) => (
              <li key={`bottleneck-${index}-${item.title}`}>
                <span>{item.severity.toUpperCase()}</span>
                <p>{item.title}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className={styles.aiSimulationCard}>
          <strong>장애 대응</strong>
          <ul>
            {simulation.failureScenarios.map((item, index) => (
              <li key={`failure-${index}-${item.title}`}>
                <span>{item.title}</span>
                <p>{item.mitigation}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className={styles.aiSimulationCard}>
          <strong>비용·다음 검토</strong>
          {simulation.costEstimate !== undefined ? (
            <div className={styles.aiSimulationCostMeta}>
              <span>${formatMoney(simulation.costEstimate.totalEstimate.amount)}</span>
            </div>
          ) : null}
          <ul>
            {[...costReviewItems, ...costRecommendationItems].map((item, index) => (
              <li key={`cost-${index}-${item}`}>
                <p>{item}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <WorkspaceAiExplanation explanation={simulation.llmExplanation} />
    </div>
  );
}

// Terraform Preview 설명은 코드에서 감지한 Resource와 점검 결과를 실제 실행 없이 보여줍니다.
export function WorkspaceAiTerraformPreviewResult({
  preview
}: {
  readonly preview: AiTerraformPreviewExplanationResult;
}) {
  return (
    <div className={`${styles.aiResultStack} ${styles.aiTerraformPreviewAssessment}`}>
      <p className={styles.aiResultSummary}>{preview.summary}</p>
      <section className={styles.aiTerraformPreviewConclusion}>
        <strong>결론</strong>
        <p>{preview.consensusRecommendation}</p>
      </section>
      <div className={styles.aiTerraformPreviewAgentGrid}>
        {preview.wellArchitectedGuidance.map((guidance) => (
          <section key={guidance.pillar} className={styles.aiTerraformPreviewAgentCard}>
            <span>{guidance.title}</span>
            <strong>{formatAiSignalLabel(guidance.pillar)}</strong>
            <p>{guidance.observation}</p>
            <p>{guidance.recommendation}</p>
          </section>
        ))}
      </div>
      <WorkspaceAiFindingList findings={preview.findings} />
    </div>
  );
}

// Terraform 오류 설명은 stage, 원인, 다음 행동을 한 번씩만 묶어 보여줍니다.
export function WorkspaceAiTerraformErrorResult({
  explanation
}: {
  readonly explanation: AiTerraformErrorExplanationResult;
}) {
  return (
    <div className={styles.aiResultStack}>
      <p className={styles.aiResultSummary}>{explanation.summary}</p>
      <WorkspaceAiExplanation explanation={explanation.llmExplanation} />
      <WorkspaceAiTextList
        title="원인"
        items={[
          `${formatAiSignalLabel(explanation.stage)} · ${formatAiSignalLabel(explanation.severity)} · ${formatAiSignalLabel(explanation.category)}: ${
            explanation.likelyCause
          }`
        ]}
      />
      <WorkspaceAiTextList title="다음 행동" items={explanation.nextActions} />
    </div>
  );
}

// 짧은 텍스트 목록을 AI 설명과 분석 결과에서 같은 마크업으로 사용합니다.
function WorkspaceAiTextList({ items, title }: { readonly items: readonly string[]; readonly title: string }) {
  if (items.length === 0) {
    return null;
  }

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

type AiSignalLabelKey =
  | "apply"
  | "architecture"
  | "availability"
  | "configuration"
  | "cost"
  | "critical"
  | "error"
  | "export"
  | "fail"
  | "failed"
  | "high"
  | "info"
  | "low"
  | "medium"
  | "network"
  | "operational_excellence"
  | "pass"
  | "performance"
  | "performance_efficiency"
  | "permission"
  | "plan"
  | "cost_optimization"
  | "reliability"
  | "security"
  | "success"
  | "sustainability"
  | "validate"
  | "warning";

const AI_SIGNAL_LABELS = {
  apply: "적용",
  architecture: "아키텍처",
  availability: "가용성",
  configuration: "구성",
  cost: "비용",
  critical: "치명",
  error: "오류",
  export: "내보내기",
  fail: "실패",
  failed: "실패",
  high: "높음",
  info: "정보",
  low: "낮음",
  medium: "중간",
  network: "네트워크",
  operational_excellence: "운영 우수성",
  pass: "통과",
  performance: "성능",
  performance_efficiency: "성능 효율성",
  permission: "권한",
  plan: "계획",
  cost_optimization: "비용 최적화",
  reliability: "신뢰성",
  security: "보안",
  success: "성공",
  sustainability: "지속 가능성",
  validate: "검증",
  warning: "경고"
} satisfies Record<AiSignalLabelKey, string>;

function isAiSignalLabelKey(value: string): value is AiSignalLabelKey {
  return Object.hasOwn(AI_SIGNAL_LABELS, value);
}

function formatAiSignalLabel(value: string): string {
  const normalizedValue = value.toLowerCase();

  if (isAiSignalLabelKey(normalizedValue)) {
    return AI_SIGNAL_LABELS[normalizedValue];
  }

  return value;
}

// Check Finding은 Resource 연결 여부를 잃지 않도록 한 줄씩 표시합니다.
function WorkspaceAiFindingList({ findings }: { readonly findings: readonly CheckFinding[] }) {
  if (findings.length === 0) {
    return <p className={styles.aiHint}>표시할 점검 결과가 없습니다.</p>;
  }

  return (
    <div className={styles.aiListBlock}>
      <strong>점검 결과</strong>
      <ul>
        {findings.map((finding) => (
          <li key={finding.id}>
            {formatAiSignalLabel(finding.severity)} · {finding.title}
            {finding.resourceId ? ` · ${finding.resourceId}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatMoney(amount: number): string {
  return amount.toFixed(2);
}
