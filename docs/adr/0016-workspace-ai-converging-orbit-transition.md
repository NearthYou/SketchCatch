# Workspace AI는 수렴하는 Orbit에서 실제 Preview로 전환

Workspace AI의 데스크톱 대화 중 화면은 전체 Canvas 위에 큰 채팅 Dock을 두고, Decorative Resource Orbit의 중심을 화면 가운데보다 살짝 오른쪽에 배치한다. 궤도 일부가 채팅 Dock 뒤에 가려질 수 있다. 최종 초안이 준비되면 채팅은 좁은 왼쪽 rail로 바뀌고 Compiled Architecture Preview가 넓은 작업 공간을 차지한다.

평상시 AWS Resource icon 공전은 유지한다. option 선택, 직접 입력이나 확인된 음성 답변 전송, assistant 응답 도착은 짧은 반응 animation을 일으킨다. 답변이 누적되면 바깥 궤도부터 사라지고 icon이 중앙으로 모인다. 다만 질문 총수가 정해져 있지 않으므로 이 장면을 percentage나 정확한 완성도로 설명하지 않는다.

Architecture Draft가 준비되어 Compiler가 처리하는 동안 장식 icon은 한 점으로 수렴한다. Compiler 성공 뒤에만 장식 장면을 폐기하고 실제 Diagram Preview를 공개한다. 장식 icon과 최종 Resource 사이에 의미적 morph 관계를 만들지 않는다.

모바일에서는 채팅을 전체 화면으로 유지하고 Orbit은 뒤에서 일부만 보이게 한다. Preview가 준비된 뒤에만 `미리보기 보기`를 제공하며, 전체 화면 Preview에서 `대화로 돌아가기`로 복귀할 수 있다.

이 결정은 ADR 0014의 정확성 경계와 server progress 비의존 원칙을 유지하면서, Decorative Resource Orbit이 대화 수렴을 표현하는 방식과 화면 전환을 구체화한다.
