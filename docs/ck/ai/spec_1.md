# Terraform 오류 Issues 고정 및 AI 해결 적용 스펙

## 1. 목적

Terraform 코드 오류를 사용자가 놓치지 않게 Issues 탭 중심으로 고정하고, 각 오류에 대해 AI가 원인과 해결 방향을 설명한 뒤 사용자가 승인한 경우에만 안전한 수정안을 적용한다.

이 기능은 SketchCatch의 IaC Preview와 Pre-Deployment Check 사이에서 사용자가 Terraform 문제를 이해하고 수정하도록 돕는 UX다. 실제 AWS apply/destroy, Git/CI/CD handoff, cloud mutation은 포함하지 않는다.

## 2. 현재 문제

- Terraform 코드 검증 오류가 하단 상세 영역에 직접 노출되어 Issues 탭의 역할이 약하다.
- Terraform 코드를 편집하면 기존 diagnostics가 즉시 비워져, 실제 오류를 고치기 전에도 Issues 탭에서 오류가 사라진 것처럼 보인다.
- Issues 탭에는 오류 원인, 해결 방향, AI 지원 진입점, 안전한 적용 흐름이 없다.
- AI 설명은 기존 Terraform error explanation 흐름이 있지만 Well-Architected 6개 관점으로 구조화되어 있지 않고, 적용 가능한 수정 metadata가 없다.

## 3. 목표 사용자 경험

1. Terraform 오류가 있으면 Terraform 코드 패널 하단에 상세 오류를 직접 펼치지 않는다.
2. Terraform 코드 패널 상단에는 "Terraform 오류가 있으니 Issues 탭에서 확인" 안내와 `Issues 탭으로 이동` 버튼을 표시한다.
3. 버튼을 누르면 오른쪽 패널이 즉시 Issues 탭으로 전환된다.
4. Issues 탭은 마지막 Terraform 진단을 프로젝트별 `localStorage`에 저장해 새로고침 후에도 복원한다.
5. 코드 편집 중에는 기존 오류를 지우지 않고 `재검증 필요` 상태로 표시한다.
6. 다음 Terraform 검증에서 해결된 진단은 Issues 탭에서 제거하고, 남은 진단은 최신 내용으로 갱신한다.
7. 각 Terraform 이슈에는 `AI 해결` 버튼을 표시한다.
8. `AI 해결`을 누르면 기존 Workspace AI chat dock이 열리고 Terraform 이슈 전용 메시지가 추가된다.
9. AI 메시지는 원인, 영향, Well-Architected 6개 관점, 최종 권고, 적용 가능 여부를 보여준다.
10. 사용자가 `적용`을 클릭한 경우에만 Terraform 코드가 바뀐다.
11. 적용 가능한 자동 수정은 `terraform.trailing_comma`, `terraform.quoted_reference`로 제한한다.
12. 적용 클릭 후에는 코드 수정, 재검증, 저장/다이어그램 동기화까지 한 번의 User-Accepted Change로 수행한다.

## 4. 범위

### 포함

- Terraform diagnostics 유지/복원 상태
- Issues 탭 Terraform 진단 목록 UX 개선
- Terraform 코드 패널 상단 안내 배너
- Workspace AI chat dock의 Terraform issue 메시지
- Well-Architected 6개 관점 guidance payload
- `terraform.trailing_comma`, `terraform.quoted_reference` 안전 수정 적용
- 관련 타입, API DTO, 테스트 갱신

### 제외

- 새 Amazon Q 인증, 새 환경변수, 새 인프라 연동
- 실제 Terraform apply/destroy 실행
- 실제 AWS 리소스 생성/수정/삭제
- Git/CI/CD handoff 실행
- 모든 Terraform 오류에 대한 AI 자동 패치
- RDS 기반 전역 이슈 저장

## 5. 결정 사항

- AI 해결 화면은 새 모달이 아니라 기존 Workspace AI chat dock을 사용한다.
- Amazon Q 연동 지점이 이미 있으면 활용하고, 없으면 기존 SketchCatch AI explanation 흐름으로 fallback한다.
- Issues 유지 범위는 프로젝트별 `localStorage`다.
- 코드 편집은 diagnostics를 삭제하지 않고 stale 상태만 만든다.
- 자동 적용은 rule-based safe fix만 허용한다.
- AI 수정안은 자동 적용하지 않는다. 사용자가 `적용` 버튼을 누른 경우에만 반영한다.

## 6. 데이터와 상태

### Terraform issue state

프론트엔드에서 프로젝트별로 유지할 최소 상태:

- `diagnosticKey`: 진단 식별자
- `diagnostic`: `TerraformDiagnostic`
- `isStale`: 코드 편집 후 재검증 필요 여부
- `lastValidatedAt`: 마지막 검증 시각
- `lastSeenAt`: 마지막으로 이 진단이 검증 결과에 나타난 시각
- `sourceFileName`, `line`, `column`: 표시용 위치 정보

저장 키는 프로젝트 단위로 분리한다.

예: `sketchcatch:terraform-issues:${projectId}`

### AI guidance result

기존 `AiTerraformErrorExplanationResult`에 다음 개념을 추가한다.

- `wellArchitectedGuidance`: 6개 pillar별 짧은 판단
- `consensusRecommendation`: 최종 권고
- `safeFix`: 적용 가능한 경우에만 제공하는 rule-based 수정 metadata

Well-Architected pillar는 다음 6개다.

- 운영 우수성
- 보안
- 신뢰성
- 성능 효율성
- 비용 최적화
- 지속 가능성

## 7. 안전 수정 정책

### 적용 가능

- `terraform.trailing_comma`
  - 위치가 특정 line으로 식별되는 경우 해당 line의 trailing comma를 제거한다.
- `terraform.quoted_reference`
  - Terraform reference가 단순 quoted reference로 감지된 경우 quote를 제거한다.

### 적용 불가

- `terraform.unbalanced`
- `terraform.duplicate_address`
- `terraform.attribute_empty`
- `terraform.attribute_syntax`
- `terraform.block_header`
- `terraform.unsupported_block`
- `terraform.undefined_reference`
- 기타 의미 추론이 필요한 진단

적용 불가 진단은 AI가 원인과 수동 수정 방향을 설명하되 `적용` 버튼을 비활성화하거나 `수동 수정 필요`로 표시한다.

## 8. 성공 조건

- Terraform 오류 발생 시 하단 상세 오류 패널이 보이지 않는다.
- Terraform 코드 패널 상단에 Issues 안내와 이동 버튼이 보인다.
- Issues 이동 버튼은 즉시 Issues 탭을 연다.
- 코드 편집 중에도 기존 Terraform 이슈가 사라지지 않고 `재검증 필요`로 표시된다.
- 새로고침 후에도 프로젝트별 마지막 Terraform 이슈가 복원된다.
- 재검증에서 해결된 이슈는 제거된다.
- `AI 해결`은 AI chat dock을 열고 Well-Architected guidance를 표시한다.
- `trailing_comma`, `quoted_reference`만 적용 버튼이 활성화된다.
- 적용은 사용자가 클릭한 후에만 실행되고, 코드 수정/재검증/저장/동기화가 이어진다.
- 관련 단위 테스트와 정적 검증이 통과한다.
