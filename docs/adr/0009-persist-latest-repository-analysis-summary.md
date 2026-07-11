# 마지막 Repository Analysis 요약 저장

프로젝트 설정 화면을 다시 열어도 사용자가 마지막 Template Selection 결과와 근거를 확인할 수 있어야 한다. 따라서 active Source Repository를 분석할 때 구조화된 `AI Handoff`, 분석한 Git commit SHA, 분석 완료 시각을 `source_repositories`에 마지막 결과로 저장한다.

이 결정은 [0008](./0008-non-persistent-repository-analysis.md)의 분석 결과 비영속 결정을 대체한다. 원본 repository 파일과 installation repository 목록을 저장하지 않는 안전 경계는 유지한다.

**고려한 대안**

- 화면 메모리에만 유지: 새로고침하면 결과와 Template Selection 근거가 사라진다.
- 원본 evidence 파일까지 저장: 재현성은 높지만 민감한 source와 저장 범위가 불필요하게 커진다.
- 구조화된 마지막 요약만 저장: 사용자 연속성을 제공하면서 source 원문을 저장하지 않으므로 선택한다.

다시 분석하면 최신 revision 기준 결과로 덮어쓴다. 분석 도중 Source Repository가 inactive로 바뀌면 저장하지 않고 충돌 상태를 반환한다.
