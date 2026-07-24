# Repository Analysis evidence와 정적 분석 경계

`Repository Analysis`는 Source Repository를 실행해 보는 기능이 아니라, 제한된 evidence를 읽어 deployable shape을 파악하고 Template Selection 근거를 만드는 기능이다. 1차 분석 범위는 repository tree, `package.json`, lockfile, `Dockerfile`, framework configuration, `README`로 정하며, 없는 evidence는 오류가 아니라 감지되지 않은 항목으로 기록한다.

**결정**

- Repository Analysis는 정적 분석만 수행하고 Source Repository의 코드를 실행하지 않는다.
- 분석 대상은 repository tree와 위 여섯 종류의 evidence로 제한한다.
- `package.json`, lockfile, `Dockerfile`, framework configuration, `README`가 없으면 해당 항목을 감지하지 못한 상태로 남긴다.
- 분석 결과는 하나의 Template을 선택하는 근거로 사용하고, 임의 Repository의 자동 배포 가능성을 보장하지 않는다.

**고려한 대안**

- Repository를 직접 실행해 port와 health check를 확인: 정확도는 높일 수 있지만 보안·비용·재현성 경계가 커진다.
- Repository 전체 파일을 광범위하게 읽기: 분석 범위가 불명확하고 민감한 파일을 불필요하게 수집할 수 있다.
- 제한된 evidence의 정적 분석: 설명 가능한 근거와 안전한 경계를 함께 유지하므로 선택한다.
