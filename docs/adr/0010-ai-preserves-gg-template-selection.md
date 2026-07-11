# AI는 gg의 Template Selection을 유지

gg는 Repository Analysis로 지원 Template 하나를 확정하거나 Template Selection Failure를 반환한다. 성공한 `AI Handoff`를 받은 AI 파트는 선택된 Template을 임의로 다른 Template로 교체하지 않고, 부족한 요구사항을 보완해 Architecture Draft로 발전시킨다.

이 결정은 [0003](./0003-gg-template-selection-ai-handoff.md)에 남아 있던 AI의 Template 교체 가능성 미결정 상태를 대체한다.

**고려한 대안**

- AI가 후보를 다시 비교: Template Selection 책임이 gg와 AI 사이에 섞인다.
- AI가 다른 Template로 자동 교체: 사용자가 본 선택 근거와 Architecture Draft의 기반이 달라진다.
- 선택한 Template을 유지하고 부족한 요구사항만 보완: 책임 경계와 사용자 설명이 일치하므로 선택한다.

불일치를 발견하면 AI가 대체 Template을 고르지 않고 재분석이 필요한 상태로 돌려보낸다. Template Selection Failure도 fallback Template 없이 그대로 전달한다.
