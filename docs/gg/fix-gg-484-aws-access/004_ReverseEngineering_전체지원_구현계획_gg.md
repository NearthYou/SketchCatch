# Reverse Engineering 전체 지원 구현 계획

## 목표

Reverse Engineering에서 AWS에서 발견한 리소스를 프로젝트 생성 전에 빠짐없이 보여주고, 사용자가 원본 또는 정리된 미리보기를 확인한 뒤 `보드에 적용`을 눌러야만 프로젝트와 보드를 만든다.

프로젝트의 AWS 리소스 목록에 있는 항목은 더 이상 `UNKNOWN` 하나로 뭉개지지 않게 한다. AWS에서 충분한 설정과 가져오기 식별자를 읽은 리소스는 기존 Terraform 가져오기 계약을 따라 편집 대상으로 올린다. 설정을 끝까지 읽지 못한 리소스는 종류와 존재를 보존하되, 안전한 근거 없이 Terraform 배포 대상으로 올리지 않는다.

## 반드시 지킬 경계

- Preview 전에는 Project, Project Draft, Board, Terraform을 저장하지 않는다.
- 마지막 `보드에 적용`만 기존 저장 흐름을 실행한다.
- AWS 조회는 읽기 작업만 사용한다.
- Reverse Engineering 화면에서 AWS 권한을 직접 바꾸지 않는다.
- 부족한 읽기 권한은 환경설정과 AWS Console 승인 흐름으로만 보완한다.
- 기존 AWS 연결 Role, 원래 CloudFormation Stack, 배포 권한은 바꾸지 않는다.
- AWS가 찾은 리소스를 UI 단순화를 이유로 숨기거나 삭제하지 않는다.
- CloudFormation이 관리 중인 리소스는 이중 관리가 되지 않도록 기존 참고 전용 판정을 유지한다.
- 설정을 완전히 복원하지 못한 리소스를 배포 가능하다고 표시하지 않는다.
- ARN, AWS 원본 ID, Provider 오류, 내부 점수는 기본 화면에 노출하지 않는다.

## 마일스톤 1. 전체 리소스 종류 인식

### 구현

- `resourceDefinitions`를 Reverse Engineering 지원 목록의 기준으로 사용한다.
- Terraform이 새로 만드는 `random_password`, 조회용 data source, AWS Role로 읽을 수 없는 Kubernetes 내부 오브젝트는 AWS 스캔 선택 목록에서 제외한다.
- 나머지 AWS 리소스는 모두 화면의 고급 선택 목록에 포함한다.
- CloudFormation 리소스 종류와 SketchCatch `ResourceType`, Terraform 리소스 종류를 한 카탈로그에서 연결한다.
- Resource Explorer와 Tagging API에서 찾은 알려진 리소스는 `UNKNOWN` 대신 실제 `ResourceType`으로 변환한다.
- 서비스별 전용 reader가 있는 리소스는 전용 결과를 우선하고, 공통 inventory 결과는 중복 제거용 보조 근거로 사용한다.

### 테스트

- 모든 AWS `resourceDefinitions`가 Reverse Engineering 종류 카탈로그에 연결됨
- `random_password`, data source, Kubernetes 내부 오브젝트는 AWS 선택 목록에서 제외됨
- Resource Explorer와 Tagging API 결과가 알려진 종류면 실제 `ResourceType`으로 변환됨
- 전용 reader 결과와 공통 inventory 결과가 같은 AWS 리소스를 두 번 만들지 않음
- 특정 리소스만 선택했을 때 공통 inventory도 같은 종류만 남김

## 마일스톤 2. 서비스별 AWS 설정 조회와 안전한 Terraform 변환

### 구현

- 모든 AWS 종류는 우선 실제 이름과 종류를 가진 보드 리소스로 표시한다.
- Resource Explorer, Tagging API, Cloud Control 같은 공통 조회 결과는 리소스 발견과 보조 정보에만 사용한다.
- Terraform으로 안전하게 관리하려면 서비스별 전용 reader, 관계 복원, 설정 완전성 검사, 정확한 import ID 변환을 한 묶음으로 구현한다.
- 공통 조회 결과만으로 설정이 충분하다고 추측하거나 Terraform 관리 가능 상태로 올리지 않는다.
- 서비스별 AWS 속성 이름을 SketchCatch의 canonical parameter 이름으로 정규화한다.
- 읽기 전용 속성, 원본 식별자, 계정 정보, Provider 원문은 Terraform 설정에서 제외한다.
- 리소스별 가져오기 ID를 만들 수 있고 설정 읽기가 완전한 경우에만 `Terraform으로 관리할 리소스 선택`에 올린다.
- 설정이 부족하면 리소스는 보드에 남기고 상세 정보에 짧은 읽기 제한 안내를 표시한다.
- 기존 completeness, ownership, CloudFormation reference 판정을 우회하지 않는다.

### 권한

- 새 서비스별 reader가 요구하는 조회 action은 기존 reader, Policy builder, readiness probe가 같은 카탈로그를 공유하도록 추가한다.
- Cloud Control을 보조 조회에 사용할 때만 `ListResources`, `GetResource`를 추가한다.
- Create, Update, Delete, PassRole 같은 쓰기 action은 추가하지 않는다.
- 새 권한은 코드 merge만으로 기존 AWS 계정에 적용하지 않는다. 사용자가 환경설정에서 범위를 확인하고 AWS Console에서 승인해야 한다.

### 테스트

- 서비스별 목록과 상세 설정을 페이지 끝까지 읽음
- 한 종류의 실패가 다른 리소스 결과를 지우지 않음
- 지원하지 않는 종류는 전체 스캔 실패가 아니라 부분 결과로 남음
- 공개 결과에 원본 ARN, 계정 ID, Provider 속성 원문이 없음
- 읽기 action 카탈로그에 write action이 없음
- reader, Policy builder, readiness probe가 같은 action 집합을 사용함
- 설정과 import ID가 완전할 때만 Terraform 관리 가능
- 공통 조회로 발견한 리소스는 전용 완전성 계약 없이는 Terraform 관리 가능으로 바뀌지 않음
- CloudFormation 소유 리소스는 계속 참고 전용

## 마일스톤 3. 프로젝트 생성 전 Preview와 명시적 적용

### 구현

- 새 프로젝트 화면에서 Reverse Engineering을 선택하면 독립 Preview 화면으로 이동한다.
- 스캔 완료 뒤 원본 Architecture Preview를 먼저 보여준다.
- Project와 Project Draft는 아직 만들지 않는다.
- 사용자가 `보드에 적용`을 누르면 기존 preview claim 저장 흐름을 한 번만 실행하고 Workspace로 이동한다.
- Workspace 안의 `AWS 가져오기`, 기존 AWS 가져오기, 다시 스캔, 새로고침 아이콘 진입점을 제거한다.
- 스캔 API와 AWS 승인 계약은 유지한다.

### 테스트

- 스캔 완료 뒤 Workspace로 자동 이동하지 않음
- Preview가 먼저 표시됨
- 적용 전 Project, Draft, Board가 바뀌지 않음
- 적용 뒤에만 프로젝트 생성과 Workspace 이동 실행
- Workspace 내부 재스캔 진입점이 렌더링되지 않음

## 마일스톤 4. 간결한 결과 화면과 상세 정보 모달

### 구현

- 기본 화면에는 Architecture Preview, `리소스 N개 · 연결 N개`, `보드에 적용`, `보기 좋게 정리`, `상세 정보`만 남긴다.
- Terraform 관리 대상 선택은 의미를 유지하되 기본 화면의 접힌 영역으로 둔다.
- 부분 실패와 배포 제한은 짧은 한 줄 요약만 기본 화면에 표시한다.
- `상세 정보`는 오른쪽 좁은 목록 대신 큰 modal로 연다.
- modal 첫 화면에 네트워크, 서버·컴퓨팅, 데이터·저장소, 보안·권한, 기타 개수를 표시한다.
- 그 아래에서 검색, 개별 리소스 목록, 읽기 제한, 배포 제한을 필요할 때만 확인한다.
- modal을 닫아도 Preview 위치, 정리 결과, Terraform 선택 상태를 유지한다.
- 같은 뜻의 반복 문장과 개발자용 설명은 제거한다.

### 테스트

- 기본 화면에 리소스 수와 연결 수만 간단히 표시
- ARN, Resource ID, Provider 오류가 기본 화면에 없음
- 상세 정보가 큰 modal로 열림
- 분류별 수와 검색 결과가 정확함
- modal 닫기 뒤 Preview와 선택 상태 유지

## 마일스톤 5. 보기 좋게 정리 상태

### 구현

- 정리 버튼을 누르면 버튼 안에 spinner와 `정리하는 중…`을 표시한다.
- 처리 중 버튼을 비활성화하고 중복 실행을 막는다.
- 캔버스 overlay와 별도 안내 modal은 만들지 않는다.
- 정리 완료 뒤에도 자동 적용하거나 저장하지 않는다.
- 마지막 `보드에 적용`을 눌러야만 저장한다.

### 테스트

- 정리 중 `aria-busy`, spinner, 문구, disabled가 표시됨
- 빠른 두 번 클릭에도 정리 함수가 한 번만 실행됨
- 정리 완료 뒤 Project와 Board가 저장되지 않음

## 마일스톤 6. 인프라 그룹 프레임

### 그룹 결정

다음 순서로 한 리소스의 표시 그룹을 정한다.

1. AWS Tag `Project`
2. AWS Tag `Service`
3. AWS Tag `Environment`
4. 같은 VPC
5. 실제 연결 관계의 가장 가까운 그룹
6. `공통 리소스`

### 구현

- 그룹마다 Terraform parameter가 없는 Design Group 프레임을 만든다.
- 프레임 ID와 metadata에 Reverse Engineering 표시 소유권과 안정적인 그룹 ID를 남긴다.
- 각 리소스 metadata에는 표시 그룹 ID만 남긴다. AWS 소속, parent, 관계, Terraform 값으로 사용하지 않는다.
- 프레임 위치와 크기는 원본 Preview가 만들어질 때 확정한다.
- 자동 정리는 그룹별 부분 Diagram을 따로 정리하고 결과를 원래 프레임 안 좌표로 합친다.
- 프레임의 위치, 크기, 이름, 그룹 구성은 자동 정리 전후 동일하게 유지한다.
- 리소스는 자기 프레임 경계를 벗어나거나 다른 프레임으로 이동하지 않는다.
- 프레임 사이 관계선은 보존하고 경로만 안전하게 다시 계산할 수 있다.

### 테스트

- Tag 우선순위대로 프레임 생성
- Tag가 없으면 VPC와 연결 관계 사용
- 미분류 리소스는 `공통 리소스`
- 프레임에 Terraform parameter와 parent가 없음
- 자동 정리 전후 프레임 위치·크기·이름·구성 동일
- 자동 정리 뒤 모든 리소스가 원래 프레임 안에 있음
- 리소스 설정과 관계 fingerprint 동일

## 마일스톤 7. 검증과 커밋

### 기능 단위 검증

- Reverse Engineering API·adapter·gateway 테스트
- AWS 읽기 권한 action catalog 테스트
- Preview claim·apply 테스트
- Result Panel·상세 modal 테스트
- 인프라 프레임·자동 정리 테스트
- Workspace 진입점 테스트
- Import 선택 테스트

### 마지막 검증

- Web typecheck
- API typecheck
- `pnpm harness:check`
- `git diff --check`

전체 lint, 전체 build, 전체 test와 실제 AWS 환경 검증은 Terra 검증 단계에서 실행한다.

### 커밋 경계

1. 문서와 지원 카탈로그
2. 공통 AWS 읽기와 안전 변환
3. Preview와 명시적 적용
4. 결과 요약과 상세 정보 modal
5. 정리 loading
6. 인프라 그룹 프레임과 그룹 내부 정리
7. Workspace 재스캔 진입점 제거
