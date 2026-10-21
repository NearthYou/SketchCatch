---
status: accepted
---

# 가져오기 Policy Stack은 Settings API가 전용 service Role로 갱신

Import Access Manager Stack이 검증된 연결에서 Policy Stack의 생성·Template version 갱신은 환경설정에서 사용자가 읽기 권한 변경을 확인하고 한 번 명시적으로 승인한 뒤 SketchCatch Settings API가 전용 CloudFormation service Role을 지정해 즉시 수행한다. 사용자가 새 Template을 내려받아 AWS Console Update 화면에 다시 올리는 절차와 CloudFormation Change Set 사전 미리보기는 기본 흐름으로 사용하지 않는다.

이 mutation은 connection에 기록된 Policy Stack, Manager Stack의 service Role과 기존 연결 Role에 묶는다. 기존 연결 Role은 정확한 Stack ARN, service Role, connection tag, API가 `ResourceTypes` parameter로 명시한 `AWS::IAM::ManagedPolicy`, 서버가 소유한 immutable Template URL만 허용하고 `TemplateBody`는 허용하지 않는다. service Role도 connection 전용 Managed Policy ARN과 target Role attachment만 관리한다. Manager Stack과 원래 연결 Stack, 기존 Role Resource, 배포 Policy는 변경하지 않으며 사용자 승인 없는 백그라운드 갱신도 허용하지 않는다. Manager Stack 생성·contract 갱신과 두 Stack의 순서 있는 삭제는 AWS Console 승인 경계를 유지한다.

AWS는 기존 Stack Update 화면에 새 Template을 미리 채우는 공식 deep link를 제공하지 않아 수동 업로드는 실수가 생기기 쉽다. 서버 갱신은 이 단계를 줄이는 대신 제한된 mutation 권한을 사용하므로 승인 payload를 connection ID, 정확한 Stack pair, 기존 Role ARN, service Role ARN, 현재·목표 Template version과 Policy hash에 묶는다. 실행 전에 ownership·상태·version을 다시 확인하고 달라졌으면 새 승인을 요구하며, 같은 목표 version의 중복 실행과 병렬 갱신을 막는다. 완료 뒤 실제 bounded read probe를 통과해야 가져오기 준비 완료로 처리한다. 이 결정은 ADR 0023의 분리 소유 모델은 유지하면서 `UpdateStack`을 호출하지 않는 부분만 대체한다.
