---
status: superseded by ADR-0023
---

# AWS Console에서 기존 Stack 권한 갱신 승인

AWS 가져오기 권한 갱신은 환경설정에서 정확한 기존 CloudFormation Stack의 Update 화면을 열고, 사용자가 AWS Console에서 변경 내용을 직접 검토·승인한다. SketchCatch는 짧은 수명의 Template URL과 정확한 Stack 좌표를 준비하지만 사용자를 대신해 `UpdateStack`을 호출하지 않는다.

직접 Stack API를 호출하면 단계는 줄어들지만 SketchCatch Role이 자신의 권한 변경을 시작하고 AWS 측 명시 승인을 우회할 수 있다. 반대로 매번 Template 파일과 수동 절차만 제공하면 다른 Stack을 선택하거나 새 Stack을 만드는 실수가 생길 수 있다. 따라서 정확한 Update 화면을 기본으로 하고, Template 직접 업로드는 바로가기를 만들 수 없을 때만 제공한다.
