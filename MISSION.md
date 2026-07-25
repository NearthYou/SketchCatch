# Mission: SketchCatch AWS 연결 이해

## Why
SketchCatch의 AWS 연결과 Reverse Engineering을 설계할 때 Role, CloudFormation Stack, S3의 책임을 정확히 나누고 안전한 제품 결정을 내린다.

## Success looks like
- Role, Stack, S3를 한 문장씩 설명할 수 있다.
- 설계도 파일이나 Stack을 지웠을 때 무엇이 남는지 판단할 수 있다.
- SketchCatch가 AWS 계정에 접근하는 흐름을 설명할 수 있다.

## Constraints
- 쉬운 한국어와 SketchCatch의 실제 코드 흐름으로 배운다.
- 한 수업에서는 한 가지 관계만 다룬다.
- 그림과 비유를 먼저 보고, AWS 용어는 나중에 붙인다.

## Out of scope
- IAM Policy 문법 전체
- CloudFormation Template 직접 작성법
- AWS 자격증 범위의 전체 서비스 학습
