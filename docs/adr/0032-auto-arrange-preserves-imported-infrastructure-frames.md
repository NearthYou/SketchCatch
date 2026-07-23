---
status: accepted
---

# 자동 정리는 가져온 인프라 프레임을 보존

Reverse Engineering이 Tag와 관계로 만든 인프라 프레임은 사용자가 이해하는 서비스 경계다. Board Auto Arrange는 각 프레임 안의 Resource 배치만 정리하고, Resource를 다른 프레임으로 옮기거나 프레임의 위치·크기를 바꾸고 프레임을 합치고 쪼개고 삭제하지 않는다. 이 프레임은 화면 표현일 뿐 AWS 소속·Terraform 모듈·배포 경계는 아니다.
