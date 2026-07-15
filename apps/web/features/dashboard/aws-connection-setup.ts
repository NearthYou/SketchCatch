import type {
  AwsConnection,
  AwsConnectionCloudFormationTemplateResponse
} from "@sketchcatch/types";

type AwsConnectionTemplateLoader = (input: {
  connectionId: string;
}) => Promise<AwsConnectionCloudFormationTemplateResponse>;

export type RestoredAwsConnectionSetup = {
  connection: AwsConnection;
  cloudFormation: AwsConnectionCloudFormationTemplateResponse;
  accountId: string;
  region: string;
};

export async function restoreAwsConnectionSetup(
  connection: AwsConnection,
  loadTemplate: AwsConnectionTemplateLoader
): Promise<RestoredAwsConnectionSetup> {
  const cloudFormation = await loadTemplate({ connectionId: connection.id });

  return {
    connection,
    cloudFormation,
    accountId: connection.accountId ?? "",
    region: connection.region
  };
}
