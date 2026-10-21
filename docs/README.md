# 문서 안내

처음에는 [README](../README.md)와 [시연 영상](https://www.youtube.com/watch?v=a18RZGg8PyM)을 보면 됩니다. 아래 문서는 목적에 따라 골라 읽습니다.

| 문서 | 내용 |
| --- | --- |
| [제품 소개](product.md) | 사용 흐름과 주요 기능, 지원 범위 |
| [아키텍처](architecture.md) | 서비스 구성과 데이터 저장, 실행 권한 |
| [데이터 모델](data-models.md) | 주요 모델의 관계와 타입 및 스키마 위치 |
| [개발 방법](development.md) | 로컬 실행과 코드 위치, 검증 및 협업 |
| [배포 절차](deployment.md) | 운영 배포와 사용자 배포, 실패 및 복구 |
| [기능별 처리 흐름](service-specification.md) | 입력부터 설계 편집과 배포까지의 연결 조건 |

[테스트와 배포 기록](../.eval/README.md)에서 주요 동작을 확인하는 테스트와 배포 시간의 원본 기록을 볼 수 있습니다. 필드와 처리 규칙의 세부 사항은 각 문서에 연결한 코드에서 확인합니다.

필드와 상태를 바꿀 때는 [공유 타입](../packages/types/src/index.ts)과 [DB 스키마](../apps/api/src/db/schema.ts), API 검증을 함께 확인합니다. 담당자별 계획과 과거 로그를 현재 구현 완료 목록으로 취급하지 않습니다.

<details>
<summary>에이전트 작업 기록</summary>

[현재 진행 상태](../agent-progress.md) | [과거 기록](./agent-history/) | [기능 검증 목록](../feature_list.json)

</details>
