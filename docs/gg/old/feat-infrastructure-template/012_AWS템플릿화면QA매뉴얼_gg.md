# AWS Template 화면 QA 매뉴얼

관련 문서: [`010_AWS템플릿구현마일스톤_gg.md`](./010_AWS템플릿구현마일스톤_gg.md), [`011_AWS템플릿배포검증기록_gg.md`](./011_AWS템플릿배포검증기록_gg.md)

## 목적

이 문서는 QA 담당자가 화면만 사용해 AWS Template 흐름을 점검하는 순서다. 먼저 Template 선택과 Architecture Board 표현을 확인하고, 실제 AWS 비용이 발생하는 Direct Deployment는 Static Web Hosting 한 건만 apply/destroy까지 수행한다.

## 시작 전 확인

- SketchCatch에 로그인한다.
- AWS verified connection이 준비된 환경인지 확인한다. 연결 상태가 보이지 않거나 권한 오류가 나면 apply를 시작하지 않는다.
- Deploy 테스트는 반드시 destroy까지 수행할 수 있을 때만 시작한다.
- 화면, 로그, 문서 어디에도 AWS account ID, bucket 이름, credential, cookie, token을 기록하지 않는다.

## 1. Template Library에서 여섯 Template 확인

1. 왼쪽 내비게이션에서 **템플릿**을 연다.
2. AWS Template 카드가 아래 여섯 개인지 확인한다.

   - Static Web Hosting
   - Minimal Serverless API
   - Full Serverless Web App
   - 3-Tier Web App
   - ECS Fargate Container App
   - EKS Container App

3. 각 카드에서 **프로젝트 열기** 또는 시작 동작을 눌러 Workspace로 이동한다.
4. 이동한 Workspace 상단에 선택한 Template 이름이 표시되는지 확인한다.

판정 기준: 여섯 카드가 모두 보이고, 선택한 카드가 해당 Workspace를 연다.

## 2. Architecture Board 표현 확인

각 Template Workspace에서 다음을 반복한다.

1. 왼쪽 Resource panel과 오른쪽 설정 panel을 접어 Board가 넓게 보이게 한다.
2. 상단 편집 도구의 **Fit view**를 누른다.
3. Board의 모든 노드를 눈으로 확인한다.

통과 기준은 다음과 같다.

| 확인 항목 | 통과 기준 |
| --- | --- |
| 아이콘 | 각 노드가 AWS Resource 카탈로그 아이콘으로 보인다. |
| 이름 | `s3_bucket`, `cloudfront_distribution`처럼 사람이 읽을 수 있는 Resource label이 보인다. |
| 금지 표현 | 보라색 일반 `AWS` 타일이 없다. |
| 금지 표현 | `*_workspace`가 Board의 가시 노드 이름으로 보이지 않는다. |
| 화면 배치 | 빈 이름, 서로 겹친 노드, viewport 밖으로 잘린 노드가 없다. |

오른쪽 **Resources** 설정 panel 안의 Terraform address는 내부 상세 정보다. 예를 들어 `aws_s3_bucket.bucket_static_web_hosting_workspace`가 그 panel에 보이는 것은 정상이며, Board 노드 label 판정 대상이 아니다.

하나라도 실패하면 배포하지 말고, Template 이름·문제 노드·화면 캡처만 남긴 뒤 결함으로 등록한다.

## 3. Terraform Preview와 Pre-Deployment Check 확인

1. 오른쪽 panel의 **Deploy**를 연다.
2. Terraform artifact를 저장하는 버튼이 보이면 먼저 저장한다.
3. **Terraform Preview** 또는 review 단계에서 생성된 Terraform과 Plan 요약을 확인한다.
4. **Pre-Deployment Check** 결과를 확인한다.
5. High Security Risk 또는 비용 차단 항목이 있으면 해결 또는 명시적 승인 없이는 다음 단계로 진행하지 않는다.

통과 기준: Template에 맞는 Resource 변화가 요약되고, 차단 상태가 아니면 승인 단계로 진행할 수 있다.

## 4. 실제 Direct Deployment QA: Static Web Hosting

비용과 시간을 통제하기 위해 실제 apply/destroy는 기본적으로 **Static Web Hosting**에서 수행한다.

1. Static Web Hosting Workspace의 **Deploy** panel을 연다.
2. 저장 → review → plan 순서를 모두 완료한다.
3. Plan 결과가 승인 가능하고 Pre-Deployment Check가 통과한 것을 확인한다.
4. apply 확인 카드에서 **AWS 리소스 생성**을 누른다.
5. 누른 시각을 기록한다. 분 단위가 아니라 초 단위까지 기록한다.
6. Terminal/Deployment status가 `SUCCESS`가 될 때까지 기다린다.
7. `SUCCESS` 시각을 기록하고, `클릭 시각 → SUCCESS 시각`으로 apply 시간을 계산한다.
8. 같은 Deployment의 destroy 확인 단계에서 **AWS 리소스 삭제**를 누른다.
9. 클릭 시각을 기록하고 `DESTROYED`가 될 때까지 기다린다.
10. `DESTROYED` 시각을 기록하고 destroy 시간을 계산한다.

참고 기준: 기존 Chrome 검증에서 Static Web Hosting apply는 3분 59.800초, destroy는 3분 44.716초였다. 환경에 따라 시간은 달라질 수 있으므로 값 자체가 아니라 terminal state와 cleanup 완료 여부를 우선 판정한다.

## 5. Cleanup 확인

destroy 후 다음을 확인한다.

1. Deployment 상태가 `DESTROYED`다.
2. Terraform state key가 비어 있거나 `null`이다.
3. Deployment Resources 목록이 0개다.
4. 실패하거나 중단된 partial run이 있다면 같은 Deploy panel에서 명시적으로 destroy해 남기지 않는다.

판정 기준: `DESTROYED`만으로 끝내지 않는다. state key와 Resources 0개까지 확인해야 QA 통과다.

## 6. QA 결과 기록 양식

| 항목 | 기록 |
| --- | --- |
| Template | |
| Board catalog icon/label | 통과 / 실패 |
| 일반 AWS fallback | 0개 / 발견 |
| `*_workspace` visible label | 0개 / 발견 |
| Preview/Pre-Deployment Check | 통과 / 차단 사유 |
| apply 클릭 시각 | |
| apply terminal state/시각 | |
| apply 소요 시간 | |
| destroy 클릭 시각 | |
| destroy terminal state/시각 | |
| destroy 소요 시간 | |
| state key | 비어 있음 / 값 있음 |
| Deployment Resources | 0개 / 남은 수 |
| 캡처 또는 결함 링크 | |

## 실패 시 중단 기준

다음 경우에는 apply를 진행하지 않는다.

- Board에 일반 `AWS` fallback tile 또는 `*_workspace` visible label이 보인다.
- AWS connection, Role, artifact 저장, Terraform init 중 권한 오류가 난다.
- Pre-Deployment Check가 차단 상태다.
- destroy를 수행할 수 없는 시간·권한·환경이다.

이미 apply가 시작된 뒤 오류가 난 경우에는 우선 Deployment History에서 상태와 로그를 확인하고, 가능한 경우 destroy를 실행해 리소스를 정리한다.
