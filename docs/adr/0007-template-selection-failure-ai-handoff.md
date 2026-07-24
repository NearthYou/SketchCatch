# Template Selection Failure도 AI Handoff로 전달

Repository Analysis에서 Template을 선택하지 못해도 결과를 AI 파트와 단절하지 않는다. 선택 성공 시에는 `templateId`와 선택 근거를 보내고, 선택 실패 시에는 `templateId: null`, `Template Selection Failure` 상태, 불일치 이유, 감지되지 않은 evidence를 같은 AI Handoff로 전달한다.

**결정**

- Template Selection 결과는 성공과 실패 모두 AI Handoff로 전달한다.
- 실패 결과에는 fallback Template을 넣지 않는다.
- AI 파트는 실패 정보를 바탕으로 부족한 요구사항을 보완하거나 재분석 필요 여부를 판단한다.
- Template Selection 단계는 AI 파트의 판단을 대신해 Template을 임의로 선택하지 않는다.

**고려한 대안**

- 실패 시 AI Handoff를 만들지 않음: AI 파트가 부족한 요구사항을 보완할 기회를 잃는다.
- 실패 시 가장 비슷한 Template을 넣음: 지원되지 않는 구조를 지원 가능한 것으로 오해하게 만든다.
