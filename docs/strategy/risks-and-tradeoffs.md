# 리스크와 트레이드오프

## 기술 리스크

| 리스크                      | 영향                     | 대응 방향                                              |
| --------------------------- | ------------------------ | ------------------------------------------------------ |
| AI가 잘못된 아키텍처를 생성 | 잘못된 학습, 위험한 배포 | rule engine, human approval, 제한된 리소스만 지원      |
| 실제 AWS 배포 비용 사고     | 사용자 비용 손실         | 예산 경고, 시간 제한, 자동 삭제, 허용 리소스 whitelist |
| DB schema 변경 실수         | 데이터 손상              | 수동 migration workflow, 백업, 리뷰                    |
| S3 presigned URL 오남용     | 원치 않는 파일 업로드    | content type, key prefix, 만료 시간, 파일 크기 제한    |
| EC2 단일 장애점             | 서비스 중단              | 추후 ECS/ASG/RDS Multi-AZ 검토                         |
| IAM 권한 과다               | 보안 위험                | 리소스 ARN 제한, 권한 주기적 축소                      |
| HTTPS 미완료 상태 유지      | 보안/신뢰 저하           | ALB + ACM 검증 후 HTTP 직접 접근 제한                  |

## 제품 리스크

SketchCatch가 단순히 "AI가 AWS 그림 그려주는 서비스"로 보이면 차별성이 약합니다. 제품의 강점은 시각화 자체가 아니라, 시각화에서 IaC, 검증, 제한 배포, 자동 삭제까지 이어지는 안전한 학습 루프입니다.

- 약한 포지션: AWS 아키텍처 그림 생성 도구
- 강한 포지션: 초보자를 위한 안전한 AWS IaC 실습 플랫폼

## 운영 비용 리스크

ALB, RDS, EC2는 사용량이 적어도 비용이 발생합니다. 학습 프로젝트라도 켜둔 리소스가 계속 비용을 만듭니다.

필요한 비용 관리:

- AWS Budgets 알림 설정
- RDS instance size 점검
- ALB 비용 인지
- 불필요한 NAT Gateway 사용 금지
- S3 lifecycle rule 설정
- 실습 리소스 자동 삭제 설계

## 개발 속도 리스크

5주 프로젝트에서 모든 기능을 정석으로 만들려고 하면 완성도가 떨어질 수 있습니다. 반대로 너무 mock만 만들면 실제 서비스성이 약해집니다.

균형점:

- UI는 보여줄 수 있을 만큼 polished
- 배포는 실제 AWS에 닿되 제한된 범위
- AI는 처음엔 mock 또는 structured output 중심
- 비용/위험은 실제 Cost Explorer보다 rule engine 먼저
- IaC는 preview와 export 먼저, apply는 마지막

## 보안 원칙

- frontend component에서 AWS SDK를 직접 호출하지 않습니다.
- AWS SDK 호출은 backend API 또는 별도 worker에서만 합니다.
- 실제 cloud credential은 저장소에 넣지 않습니다.
- GitHub Actions는 OIDC Role ARN 방식을 사용합니다.
- `.env`는 커밋하지 않고 `.env.example`만 유지합니다.
- presigned URL은 짧은 만료 시간과 제한된 object key prefix를 사용합니다.
