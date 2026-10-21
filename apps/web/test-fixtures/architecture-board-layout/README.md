# Architecture Board Layout Fixtures

Architecture Board Compiler의 배치 품질을 검증하는 code-adjacent fixture다. 제품 문서가 아니며 일반 세션의 읽기 대상이 아니다.

## 구성

- `good/`: 재사용할 배치 원칙을 확인하는 참고 이미지
- `failure/`: 회귀 시 피해야 할 실패 이미지
- `compiler-evidence-baseline.json`: 허용 가능한 시각 이상치 상한
- `compiler-evidence-report.json`: 전체 template compiler 결과
- `compiler-evidence-review.json`: 사람의 pairwise 검토 후보

## 검증

```bash
pnpm architecture-board-evidence:check
pnpm architecture-board-evidence:generate
```

`check`은 현재 compiler 결과가 저장된 report와 같은지 확인한다. `generate`는 fixture 또는 compiler 규칙을 의도적으로 바꾼 뒤 report를 갱신한다. baseline 상향은 자동화하지 않고 변경 이유와 함께 검토한다.

이 디렉터리의 JSON에 포함된 source ID는 기존 template 계약과의 호환성을 위한 값이다. 사용자 화면이나 새 문서의 명칭으로 사용하지 않는다.
