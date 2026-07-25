---
status: accepted
---

# Reverse Engineering은 가져온 원본을 먼저 보여준 뒤 자동 정리를 실행

Reverse Engineering은 AWS 조회 결과를 source-exact 방식으로 먼저 표시하고, 사용자가 `자동 정리 해보기`를 선택하기 전에는 Architecture Board Compiler를 실행하지 않는다. 원본 변환은 현재 지원하는 Resource·관계·설정·containment를 그대로 유지하고 화면 표시를 위한 결정론적 최초 좌표만 계산한다. 일반 AI 변환이 Region·AZ, 기본 설정, 요약 edge, containment 또는 Terraform 이름을 새로 추론해서는 안 된다.

자동 정리를 즉시 실행하면 사용자는 AWS에서 실제로 읽은 구조와 SketchCatch가 바꾼 배치를 구분하기 어렵다. 원본 우선 흐름은 부분 실패 결과도 숨기지 않고, Compiler 실행 여부와 정리안 적용 여부를 서로 다른 사용자 결정으로 유지한다. 정리 후보는 ADR 0015의 visual-only 경계와 ADR 0027의 후보 갤러리를 사용하며, 후보 생성·전환만으로 Project·Board·Terraform을 저장하지 않는다.
