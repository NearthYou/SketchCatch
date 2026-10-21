# 구현 검증과 배포 측정

코드에서 재현하는 회귀 테스트와 과거 운영 배포의 측정을 구분합니다.

## 설계와 코드 동기화

[공통 그래프 테스트](../apps/api/src/services/terraform/infrastructure-graph.test.ts)와 [Terraform 해석 테스트](../apps/api/src/services/terraform/terraform-to-diagram.test.ts)에서 양쪽 편집 결과와 해석하지 못한 블록의 보존을 확인합니다. [코드 왕복 테스트](../apps/web/features/architecture-board-compiler/authored-terraform-round-trip.test.ts)도 함께 볼 수 있습니다.

## 배포 작업 추적

[Dispatcher 테스트](../apps/api/src/deployments/deployment-worker-dispatcher.test.ts)와 [Worker 테스트](../apps/api/src/deployments/deployment-worker-service.test.ts)에서 실행 요청과 상태 전이, 재시작과 충돌 처리를 확인합니다. 테스트용 AWS 응답으로 재현한 결과를 실제 AWS 장애나 모든 상황의 자동 복구로 확대하지 않습니다.

ECS 요청에 DB 작업 번호를 `startedBy`로 전달해 API가 실행 식별자를 저장하기 전에 꺼져도 기존 ECS 작업을 조회할 수 있게 했습니다. Worker는 DB 상태가 RUNNING인지 확인한 뒤에만 Terraform을 실행합니다. DISPATCHING 상태가 풀리지 않으면 대기 후 종료하므로 추적 복구가 모든 경우의 자동 재개를 뜻하지는 않습니다.

## 운영 배포 측정

[GitHub Actions 원본 시각과 작업 단계](deployment-build-results.json)를 보관했습니다. 캐시를 먼저 채운 실행과 배포 실행은 같은 커밋이며 개선 전 기준선 4회는 서로 다른 이전 커밋입니다.

| 비교 항목 | 표본과 조건 | 시간 |
| --- | --- | ---: |
| 개선 전 전체 실행 | 캐시 개선 전 성공 4회 중앙값 | 470.5초 |
| 캐시 준비 | 동일 커밋의 build-only 실행 | 비교에서 제외 |
| 개선 후 전체 실행 | 캐시 준비 후 배포 1회 | 369초 |
| 이미지 build/push | 개선 전 순차 실행 4회 중앙값 | 81초 |
| 이미지 build/push | 개선 후 두 이미지 중 긴 단계 | 7초 |

전체 실행 시간은 이 관측에서 약 21.6% 줄었습니다. 여러 커밋의 중앙값과 한 번의 warm-cache 실행을 비교했으므로 동일 입력의 반복 성능 시험은 아닙니다. 기존 문서의 21.7%는 기준선을 471초로 먼저 반올림해 계산한 값이며 여기서는 원본 중앙값 470.5초로 계산했습니다.

- [개선 후 배포](https://github.com/NearthYou/SketchCatch/actions/runs/29333857003)
- [동일 커밋 캐시 준비](https://github.com/NearthYou/SketchCatch/actions/runs/29333603312)

아래 명령은 보관한 시각과 수치를 다시 계산하며 AWS나 GitHub에 요청하지 않습니다.

```bash
python .eval/verify_results.py
```

실제 AWS 실행이나 새 배포 측정은 별도 승인된 작업으로 진행합니다. 이 자료를 갱신하기 위해 운영 workflow를 다시 실행하지 않습니다.
