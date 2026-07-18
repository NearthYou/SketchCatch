import type {
  AwsConnection,
  AwsConnectionCloudFormationTemplateResponse,
  VerifyAwsConnectionResponse
} from "@sketchcatch/types";

export type ReverseEngineeringImportPermissionPreparation =
  | "awaiting_aws_approval"
  | "manual_template_required";

type GetAwsConnectionTemplate = (input: {
  connectionId: string;
}) => Promise<AwsConnectionCloudFormationTemplateResponse>;

type VerifyStoredAwsConnection = (input: {
  connectionId: string;
  roleArn: string;
}) => Promise<VerifyAwsConnectionResponse>;

// 기존 연결의 같은 CloudFormation Stack만 준비합니다. 이 단계에서는 연결을 새로 만들거나 검증하지 않습니다.
export async function prepareReverseEngineeringImportPermissionUpdate(input: {
  readonly connection: AwsConnection;
  readonly downloadTemplate: (fileName: string, templateBody: string) => void;
  readonly getTemplate: GetAwsConnectionTemplate;
  readonly openExternal: (url: string) => void;
}): Promise<ReverseEngineeringImportPermissionPreparation> {
  const template = await input.getTemplate({ connectionId: input.connection.id });

  if (input.connection.status === "verified") {
    input.downloadTemplate(`${template.stackName}.yaml`, template.templateBody);
    input.openExternal(createExistingCloudFormationStackUrl(template.region, template.stackName));
    return "awaiting_aws_approval";
  }

  if (!template.launchStackUrl) {
    return "manual_template_required";
  }

  input.openExternal(template.launchStackUrl);
  return "awaiting_aws_approval";
}

// 기존 Stack 목록만 열어 새 Stack을 중복 생성하지 않게 합니다.
function createExistingCloudFormationStackUrl(region: string, stackName: string): string {
  const baseUrl = new URL("https://console.aws.amazon.com/cloudformation/home");
  baseUrl.searchParams.set("region", region);
  const stackListParams = new URLSearchParams({
    filteringText: stackName,
    filteringStatus: "active",
    viewNested: "true"
  });

  return `${baseUrl.toString()}#/stacks?${stackListParams.toString()}`;
}

// 사용자가 AWS에서 Stack 변경을 승인한 뒤에만 저장된 같은 Role을 다시 검증합니다.
export async function reverifyReverseEngineeringImportPermission(input: {
  readonly connection: AwsConnection;
  readonly verify: VerifyStoredAwsConnection;
}): Promise<VerifyAwsConnectionResponse> {
  const roleArn = input.connection.roleArn?.trim();

  if (!roleArn) {
    throw new Error("AWS Role 연결을 다시 확인해 주세요.");
  }

  return input.verify({
    connectionId: input.connection.id,
    roleArn
  });
}
