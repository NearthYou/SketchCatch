# SketchCatch 다이어그램 패턴 지식 저장소

이 디렉터리는 SketchCatch Architecture Draft와 Amazon Q Business가 공통으로 참조할 검증된 AWS 아키텍처 패턴의 Git 원본이다. 실제 Amazon Q Business 인덱싱 대상은 `documents/` 아래 문서이며, `source-inventory.md`와 `source-review.md`는 검토 증거라서 기본 인덱싱 대상에서 제외한다.

## 디렉터리 구조

```text
docs/diagram-templates/
├── manifest.json
├── source-inventory.md
├── source-review.md
├── documents/
│   └── architecture-patterns/
│       ├── alb-asg-ec2.md
│       ├── serverless-api.md
│       ├── spa-cloudfront-s3.md
│       ├── ecs-fargate.md
│       ├── github-cicd-codedeploy.md
│       └── multi-az-rds.md
└── metadata/
    └── documents/
        └── architecture-patterns/
            └── <문서명>.md.metadata.json
```

## 문서 사용 규칙

1. 사용자 요구를 먼저 정규화하고 `적용 조건`과 `금지 조건`을 모두 비교한다.
2. 하나의 패턴을 선택한 뒤 `필수 리소스`와 `리소스 연결 순서`를 보존한다.
3. 사용자가 수량이나 배치를 명시하면 패턴 기본값보다 사용자 요구를 우선한다.
4. SketchCatch `ResourceType`만 다이어그램 노드 타입으로 사용한다.
5. Terraform 생성 전 `Terraform 필수 파라미터`와 `배포 전 검증 조건`을 통과시킨다.
6. 패턴 문서의 `잘못된 구조 예시`와 일치하는 초안은 재생성하거나 backend validator에서 거부한다.

## S3와 Amazon Q Business

권장 S3 키 매핑은 다음과 같다.

```text
s3://<bucket>/<prefix>/documents/architecture-patterns/alb-asg-ec2.md
s3://<bucket>/<prefix>/metadata/documents/architecture-patterns/alb-asg-ec2.md.metadata.json
```

Amazon Q Business 데이터 소스의 포함 prefix는 `<prefix>/documents/`로 제한한다. metadata prefix를 지원하는 커넥터를 사용할 때만 `<prefix>/metadata/`를 `metadataFilesPrefix`로 지정한다.

주의: Amazon Q Business의 새 Amazon S3 커넥터는 custom metadata를 지원하지 않는다. 새 커넥터에서는 Markdown 본문과 `manifest.json`을 기준으로 검색 품질을 확보하고, metadata sidecar를 사용하려면 해당 기능을 지원하는 커넥터인지 먼저 확인한다.

## 완료 판정

다음 공통 증거와 ingestion 방식별 증거가 있어야 “Q Business 인덱싱 완료”로 판정한다.

- 여섯 Markdown 문서와 `manifest.json` 로컬 검증 통과
- 대상 S3 prefix에서 여섯 객체의 key, ETag, size 확인
- Q Business index가 `ACTIVE`
- 각 패턴별 대표 질의에서 해당 문서 citation 또는 기대 리소스 집합 확인

S3 connector 방식은 data source가 `ACTIVE`이고 최신 sync job이 `SUCCEEDED`여야 한다. Direct ingestion 방식은 `BatchPutDocument`의 실패 문서가 0개이고, 여섯 document ID와 대표 질의 citation이 일치해야 한다. Direct ingestion은 자동 S3 재동기화를 제공하지 않으므로 문서 변경 시 다시 실행해야 한다.

현재 AWS 반영 여부는 로컬 파일 존재만으로 판단하지 않는다.
