# Repository mismatch 시 Template Selection Failure 반환

Repository Analysis가 어떤 지원 Template과도 저장소 전체의 Application Units를 안전하게 표현하지 못하면 Template Selection 단계는 Template을 억지로 선택하지 않는다. 대신 `Template Selection Failure`를 반환해 선택되지 않은 상태, 불일치 이유, 감지되지 않은 evidence를 AI 파트가 보완 판단에 사용할 수 있게 한다.

**고려한 대안**

- 가장 비슷한 Template을 자동 선택: 사용자가 지원되지 않는 구조를 지원되는 구조로 오해할 수 있다.
- 맞는 Application Unit만 부분 선택: 하나의 Repository Analysis와 저장소 전체 Template Selection이라는 경계가 깨진다.
- Template을 선택하지 않고 불일치 이유를 반환: 잘못된 구조를 숨기지 않고 다음 보완 또는 재분석 판단을 남길 수 있으므로 선택한다.
