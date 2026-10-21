---
status: accepted
---

# Policy Stack 요청은 immutable Template과 정확한 소유권으로 제한

Policy Stack API 요청은 IAM capability와 ResourceTypes를 함께 보내지 않는다.
대신 connection별 Stack ARN, immutable Template URL, service Role ARN, ownership tag를 제한한다.
service Role은 정확한 Managed Policy와 대상 Role attachment만 관리한다.
작업 뒤 GetTemplate 결과의 hash와 Stack ownership을 다시 검증한다.

Policy Stack API를 호출하는 주체의 `iam:PassRole`은 해당 connection의 정확한 CloudFormation service Role ARN만 허용하고, `iam:PassedToService = cloudformation.amazonaws.com` 조건을 함께 요구한다.

CloudFormation의 `Capabilities`와 `ResourceTypes`는 같은 요청에서 함께 사용할 수 없다. Policy Stack은 이름이 지정된 IAM Resource를 포함하므로 필요한 IAM capability를 사용하고, 요청 범위는 connection별 Stack·Template·service Role·ownership tag로 고정한다. 서버가 소유한 immutable Template URL만 허용하며 `TemplateBody`나 호출자가 고른 URL은 받지 않는다.

여기서 immutable Template URL은 connection별 정확한 S3 bucket·object path와 Template 본문의 SHA-256이 고정된다는 뜻이다. private object를 읽기 위한 최대 15분의 SigV4 query만 다시 발급할 수 있다. 제어 Policy의 `StringLike`는 IAM의 literal query separator `${?}` 뒤에 repository-pinned S3 signer가 만드는 SigV4 query 모양만 허용한다. base object URL은 repository-pinned signer와 같게 일반 bucket은 virtual-hosted, dot이 있는 bucket은 path-style 형식으로 만든다. Create·Update builder는 호출자가 보낸 URL 문자열을 받지 않고 내부 Template publisher 결과만 사용한다. publisher는 `IfNoneMatch: "*"` 조건부 Put으로 덮어쓰기를 막고, 409 경합은 제한적으로 재시도하며, 같은 key가 이미 있으면 저장된 본문과 hash가 모두 같을 때만 재사용한다.

service Role의 권한은 해당 connection의 읽기 Managed Policy와 기존 대상 Role attachment 수명주기에만 한정한다. Attach·Detach에는 대상 Role뿐 아니라 정확한 `iam:PolicyARN` 조건도 적용한다. 작업 완료 뒤에는 요청 성공만 믿지 않고 실제 `GetTemplate` hash, Stack ID와 ownership tag를 저장된 계약과 다시 비교한다. 이 경계는 기존 `AwsConnection` ID, account, region, Role, 원래 Stack, 배포 Policy, 배포용 `verified` 상태를 변경하지 않는다.
