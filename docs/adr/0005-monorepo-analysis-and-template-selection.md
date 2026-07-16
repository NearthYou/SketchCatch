# monorepo Repository Analysis와 Template Selection

Source Repository는 monorepo인 경우가 많고 frontend와 backend처럼 여러 실행 단위를 포함할 수 있다. 이를 여러 Repository Analysis로 쪼개면 하나의 Source Repository에서 나오는 설계와 AI Handoff의 경계가 흔들리므로, Repository Analysis 하나 안에 Application Unit을 담고 Template은 저장소 전체에 하나를 선택한다.

**결정**

- Repository Analysis는 Source Repository마다 하나를 만든다.
- frontend, backend 등 독립적으로 식별할 수 있는 부분은 Application Unit으로 표현한다.
- Template Selection은 Application Unit별이 아니라 Repository Analysis 전체에 대해 한 번 수행한다.
- AI Handoff에는 저장소 전체에 선택된 Template을 전달하고, Application Unit별 분석 결과는 선택 근거로 함께 전달할 수 있다.

**고려한 대안**

- Application Unit마다 별도 Template을 선택: 여러 Template을 하나의 Architecture Draft로 합치는 책임이 새로 생긴다.
- monorepo를 하나의 단일 실행 단위로 취급: frontend/backend의 서로 다른 runtime evidence를 잃는다.
