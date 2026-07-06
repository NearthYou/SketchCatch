# YS 플랫폼/인증 문서 인덱스

이 폴더는 플랫폼, 인증, 사용자/프로젝트 소유권 관련 참고 문서를 모은다. 확정 계약은 `docs/data-models.md`, 개발 절차는 `docs/development.md`를 우선한다.

## 빠른 읽기 순서

1. 전체 플랫폼 방향은 [001-ys&gg협업문서.md](./001-ys&gg협업문서.md)와 [002-구현계획-ys.md](./002-구현계획-ys.md)를 본다.
2. API/DB 계약은 [003-API명세-ys.md](./003-API명세-ys.md), [004-DB설계-ys.md](./004-DB설계-ys.md)를 참고하되 최신 확정은 `docs/data-models.md`에서 확인한다.
3. 로그인/회원가입은 [005-로그인&회원가입_구현-ys.md](./005-로그인&회원가입_구현-ys.md)를 본다.
4. 익명 workspace 제거와 사용자 소유권 기준은 [006-로그인&익명로그인_삭제관련.md](./006-로그인&익명로그인_삭제관련.md)를 본다.
5. JWT와 소셜 로그인은 [007_JWT고도화정리_ys.md](./007_JWT고도화정리_ys.md), [008_소셜로그인구현가이드_ys.md](./008_소셜로그인구현가이드_ys.md)를 본다.
6. Reverse Engineering / Cost Analysis / Deployment Safety Gate 작업은 [009_배포안전게이트구현계획_ys.md](./009_배포안전게이트구현계획_ys.md), [010_비용위험분석구현계획_ys.md](./010_비용위험분석구현계획_ys.md), [011_ReverseEngineering구현계획_ys.md](./011_ReverseEngineering구현계획_ys.md)를 본다.

## 문서 목록

| 문서 | 책임 |
| --- | --- |
| [001-ys&gg협업문서.md](./001-ys&gg협업문서.md) | ys Codex용 플랫폼 선택지 |
| [002-구현계획-ys.md](./002-구현계획-ys.md) | 플랫폼/품질 구현 계획 |
| [003-API명세-ys.md](./003-API명세-ys.md) | 플랫폼/품질 백엔드 API 명세 |
| [004-DB설계-ys.md](./004-DB설계-ys.md) | 플랫폼/품질 데이터베이스 설계 |
| [005-로그인&회원가입_구현-ys.md](./005-로그인&회원가입_구현-ys.md) | 로그인/회원가입 기능 구현 계획 |
| [006-로그인&익명로그인_삭제관련.md](./006-로그인&익명로그인_삭제관련.md) | 익명 workspace 제거와 로그인 기반 프로젝트 소유권 정리 |
| [007_JWT고도화정리_ys.md](./007_JWT고도화정리_ys.md) | JWT 고도화 정리 |
| [008_소셜로그인구현가이드_ys.md](./008_소셜로그인구현가이드_ys.md) | 소셜 로그인 구현 가이드 |
| [009_배포안전게이트구현계획_ys.md](./009_배포안전게이트구현계획_ys.md) | Deployment Safety Gate 구현 계획 |
| [010_비용위험분석구현계획_ys.md](./010_비용위험분석구현계획_ys.md) | Cost Risk 분석 구현 계획 |
| [011_ReverseEngineering구현계획_ys.md](./011_ReverseEngineering구현계획_ys.md) | Provider Adapter 기반 Reverse Engineering 구현 계획 |

## 정리 규칙

- 인증/사용자/프로젝트 소유권 모델이 바뀌면 `docs/data-models.md`를 함께 갱신한다.
- API 명세가 코드와 달라지면 이 폴더 문서는 참고 상태로 두고 canonical 문서를 우선한다.
- secret, refresh token 원문, OAuth client secret 같은 실제 비밀값은 문서에 남기지 않는다.
