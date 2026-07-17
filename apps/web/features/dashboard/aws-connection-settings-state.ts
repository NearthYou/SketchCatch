import type { AwsConnection, AwsConnectionListResponse } from "@sketchcatch/types";

export type AwsConnectionCleanupRetryDisplay = {
  readonly id: string;
  readonly accountId: string | null;
  readonly region: string;
};

export type AwsConnectionSettingsState = {
  readonly activeConnections: readonly AwsConnection[];
  readonly verifiedConnections: readonly AwsConnection[];
  readonly cleanupRetries: readonly AwsConnectionCleanupRetryDisplay[];
};

export function deriveAwsConnectionSettingsState(
  settings: AwsConnectionListResponse
): AwsConnectionSettingsState {
  return {
    activeConnections: settings.awsConnections,
    verifiedConnections: settings.awsConnections.filter(
      (connection) => connection.status === "verified"
    ),
    cleanupRetries: settings.cleanupRetries.map(({ awsConnection }) => ({
      id: awsConnection.id,
      accountId: awsConnection.accountId,
      region: awsConnection.region
    }))
  };
}
