# Repository Analysis 결과는 저장하지 않음

Repository Analysis는 요청이 들어온 시점에 Source Repository를 정적으로 읽어 AI Handoff를 만드는 일회성 분석으로 둔다. 분석 결과, 원본 파일 내용, Template Selection 상태를 별도 저장하지 않으며 다음 요청은 최신 Source Repository를 다시 분석한다.

**고려한 대안**

- RDS에 분석 요약을 저장: 재사용은 쉽지만 오래된 분석 결과와 현재 Repository 상태가 섞일 수 있다.
- 원본 evidence를 S3에 저장: 재현성은 높아지지만 저장 범위와 민감한 파일 관리가 커진다.
- 요청 시 새로 정적 분석: 저장·만료·재분석 조건을 단순하게 유지할 수 있으므로 선택한다.
