# Workspace AI는 선택 기록, 장식 장면, 최종 Preview를 분리

Workspace AI 대화가 Architecture Draft를 만드는 동안에는 서로 다른 정확성 경계를 가진 세 표현을 분리한다. **Selected Option Trail**은 사용자가 assistant가 제시한 option을 명시적으로 선택한 사실을 시간순으로 남기는 현재 대화 세션의 의미 기록이다. 직접 입력과 음성 입력, Draft Candidate Exclusion은 이 기록에 포함하지 않으며, 선택 수를 진척도나 완성도로 해석하지 않는다. **Decorative Resource Orbit**은 Selected Option Trail에 결정적으로 반응하는 presentation-only 장면이다. Resource Catalog의 실제 AWS Resource icon만 사용하지만, 표시된 Resource의 정확성·추천·후보성·진척도·확정 여부를 보장하지 않고 Architecture Draft의 일부로 취급하지 않는다. 이를 위해 별도 AI 요청, backend persistence, 구조화된 progress 상태를 만들지 않는다.

최종 결과는 이 장식 장면을 재사용하거나 점진적으로 확정하는 방식으로 만들지 않는다. Architecture Draft가 도착하면 Architecture Board Compiler가 제안을 만들고, Workspace AI Diagram Adapter가 그 제안을 읽기 전용 Diagram으로 변환하며, 최종 Resource 표시는 Resource Catalog의 실제 icon URL을 사용한다. **Compiled Architecture Preview**는 Compiler 성공 뒤에만 공개하고, Compiler가 실패하면 대체 Diagram이나 장식 장면을 최종 결과처럼 보여주지 않는다. Preview는 사용자가 저장 대상으로 검토하는 것과 동일한 Diagram이며 viewport 탐색만 허용한다. Resource 이동·연결·설정 변경은 허용하지 않고, 사용자가 명시적으로 적용하기 전에는 Project나 Architecture Board를 변경하지 않는다.

Compiled Architecture Preview의 기본 설명은 `초안이 준비됐어요`, 쉬운 구조 설명 한 문장, Resource·연결 수, 확인할 점 최대 3개로 제한한다. 추가 안전 정보는 `모두 보기`로 접근 가능하게 유지하되 Compiler provenance, 후보 식별자, 내부 상태와 처리 방식은 사용자 화면에 노출하지 않는다.

이 결정은 [0012-structured-draft-progress-view.md](./0012-structured-draft-progress-view.md)를 supersede한다. 서버가 구조화된 Draft Progress Snapshot과 잠정 Resource 구조를 계속 제공해야 한다는 이전 결정은 폐기한다. 실제 server candidate ID와 label이 있는 Draft Candidate Exclusion은 대화의 독립된 가역 제약으로 유지하지만, Selected Option Trail 또는 Decorative Resource Orbit과 결합하지 않는다. [0001-ai-assists-deterministic-architecture-flow.md](./0001-ai-assists-deterministic-architecture-flow.md)의 deterministic flow와 User-Accepted Change 경계는 그대로 유지한다.

## Consequences

- 같은 Selected Option Trail은 같은 Decorative Resource Orbit 구성을 만들지만, 그 일관성은 표현의 안정성일 뿐 Architecture Draft의 의미적 정확성을 뜻하지 않는다.
- Decorative Resource Orbit은 Resource 관계, 수량, 설정, 추천 근거 또는 후보 제외 대상을 표현하지 않는다. Architecture Draft가 도착하면 완전히 폐기된다.
- 최종 Diagram의 Resource와 관계는 Architecture Draft를 입력으로 한 Architecture Board Compiler 제안에서만 나온다. Preview의 icon은 이 Diagram의 Resource identity를 Resource Catalog에 대응한 결과다.
- 대화 중 선택 기록과 실제 후보 제외 기록은 서로 다른 사용자 의도이며, 오류·취소·재시도에서도 독립된 의미를 유지한다.
- 명시적 적용 전까지 Compiled Architecture Preview는 제안 상태이고, 기존 Project와 Architecture Board는 변경되지 않는다.
