# gg Template Selection 결과와 AI Handoff 계약

Repository Analysis 이후 gg는 여러 Template 후보를 AI 파트에 넘기지 않고, 선택한 Template 하나와 그 선택을 뒷받침하는 분석 근거를 `AI Handoff`로 전달한다. Template을 선택하는 책임은 gg에 있으며, AI가 선택된 Template을 바꿀 수 있는지는 AI 파트가 별도로 결정한다.

**고려한 대안**

- 여러 Template 후보와 점수를 전달: AI 파트의 선택 책임과 gg의 Template Selection 책임이 섞인다.
- 선택한 Template ID만 전달: AI가 왜 그 Template이 선택되었는지 판단하기 어렵다.
- 선택한 Template 하나와 분석 근거를 전달: gg의 선택을 유지하면서 AI가 부족한 요구사항을 보완할 수 있으므로 선택한다.

확신도 점수는 AI Handoff에 포함하지 않는다. Template Selection의 판단을 숫자 점수로 다시 비교하게 만들기보다, 선택 근거와 감지되지 않은 evidence를 전달하는 데 집중한다.
