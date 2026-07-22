# Architecture Draft 진행 표현은 구조화된 중간 결과를 사용

AI Architecture Recommendation은 대화에서 확정된 요구사항을 Draft Progress View에 즉시 표시하고, Resource 후보는 서버가 구조화된 Draft Progress Snapshot을 제공한 뒤에만 잠정 구조로 표시한다. 클라이언트가 대화 원문만으로 Resource를 추측하면 빠른 시각 피드백을 줄 수 있지만 최종 Architecture Draft와 다른 구조를 사실처럼 보일 위험이 있고, 확정 요구사항만 표시하면 안전하지만 시각적 진행감이 부족하므로 이 혼합 방식을 선택한다. Draft Progress View는 제한된 프리뷰로서 확대·축소와 화면 이동, 후보 제외만 제공하며, Resource 위치·연결·설정 편집, 후보 유지·승인·Architecture Board 수정이나 적용은 제공하지 않는다.

## Consequences

Architecture Draft 요청 계약은 확정 요구사항, 잠정 구조, 최종 결과를 구분하는 진행 상태를 표현해야 한다. 각 진행 이벤트는 순번과 현재 전체 상태를 가진 Draft Progress Snapshot이며, 같은 요청의 이전 스냅샷을 대체한다. 클라이언트는 연속된 스냅샷의 차이로 시각적 전환과 변경 이력을 계산한다. 대화로 후보가 대체되면 이전 후보는 현재 투영에서 전환되어 사라지고, 추가·제외 사실만 간결한 변경 이력에 남는다. 사용자가 `제외`를 선택하면 Draft Candidate Exclusion으로 기록해 해당 후보를 현재 프리뷰에서 제거하고 다음 추천의 제약으로 전달하지만 Architecture Board를 직접 수정하지 않는다. 제외 직후에는 되돌리기를 제공하며, 되돌리면 제약을 해제해 이후 스냅샷에 후보가 다시 나타날 수 있다. 요청 오류나 사용자 취소가 발생하면 마지막으로 정상 수신한 투영은 유지하되 업데이트가 중단됐음을 표시하고, 재시도는 그 화면에서 이어진다. 최종 Architecture Draft가 도착하면 중간 후보와 달라진 부분을 전환 과정에서 드러낸 뒤 Draft Progress View를 대체하고, 이후에는 최종 Architecture Draft만 현재 결과로 남는다. 이번 범위에서 Draft Progress View는 현재 브라우저 대화 세션에만 존재하며 새로고침이나 재진입 뒤 복원하지 않는다. 기존 User-Accepted Change 경계는 그대로 유지한다.
