# AWS Role·Stack·S3 Resources

## Knowledge

- [AWS IAM User Guide: IAM roles](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html)
  Role이 권한을 가진 AWS 신원이며, 장기 Access Key 대신 임시 자격 증명을 제공한다는 공식 설명. Role의 정체와 수명을 확인할 때 사용한다.
- [AWS CloudFormation User Guide: Stacks](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/stacks.html)
  Stack이 여러 AWS Resource를 하나로 생성·갱신·삭제하는 관리 단위라는 공식 설명. Stack과 실제 Resource를 구분할 때 사용한다.
- [AWS CloudFormation User Guide: How CloudFormation works](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cloudformation-overview.html)
  Template을 로컬 파일이나 S3 URL로 전달하고, 그 Template으로 Stack을 만드는 흐름. S3에 보이는 파일과 Stack을 구분할 때 사용한다.
- [Amazon S3 User Guide: What is Amazon S3?](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html)
  S3가 Bucket 안에 Object를 보관하는 객체 저장소라는 공식 설명. Template, Terraform state, 사용자의 서비스 파일이 모두 서로 다른 Object일 수 있음을 이해할 때 사용한다.
- [AWS IAM Identity Center: Manage AWS accounts with permission sets](https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsetsconcept.html)
  Permission Set을 계정에 배정하면 IAM Identity Center가 대응하는 IAM Role을 만들고, 로그인한 사용자가 그 Role을 맡는다는 공식 설명. 사람용 Role과 서비스용 Role을 구분할 때 사용한다.
- [AWS IAM Identity Center: Configure access to AWS accounts](https://docs.aws.amazon.com/singlesignon/latest/userguide/manage-your-accounts.html)
  사용자가 AWS Access Portal에서 계정과 Role을 선택해 Console에 들어가거나 임시 자격 증명을 받는 흐름. SSO 로그인이 Stack 승인에 어떻게 연결되는지 확인할 때 사용한다.
- [SketchCatch AWS 연결 Template 저장 코드](apps/api/src/aws-connections/aws-connection-template-storage.ts)
  연결용 YAML을 `aws-connections/{connectionId}/cloudformation-template.yaml`에 저장하고 만료되는 접근 URL을 만드는 실제 코드.
- [SketchCatch AWS 연결 Stack과 Role 생성 코드](apps/api/src/aws-connections/aws-connection-service.ts)
  하나의 Template이 Stack 이름을 정하고 IAM Role과 Policy를 만들도록 선언하는 실제 코드.
- [SketchCatch AWS 연결 소유 데이터](apps/api/src/db/schema.ts)
  현재 `aws_connections.user_id`가 연결을 SketchCatch 사용자 개인에게 귀속시키는 실제 구조. 현재 동작과 권장 팀 공유 구조를 구분할 때 사용한다.

## Wisdom

- [AWS re:Post](https://repost.aws/)
  실제 운영 중 Stack update, IAM Role, 권한 오류 사례를 AWS 사용자와 전문가에게 확인할 때 사용한다.
