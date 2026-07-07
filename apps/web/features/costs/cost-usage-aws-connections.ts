import type { AwsConnection } from "@sketchcatch/types";

export function getVerifiedCostUsageAwsConnections(
  awsConnections: readonly AwsConnection[]
): AwsConnection[] {
  return awsConnections.filter((connection) => connection.status === "verified");
}

export function selectPreferredCostUsageAwsConnection(
  awsConnections: readonly AwsConnection[],
  selectedConnectionId: string | null
): AwsConnection | null {
  const verifiedConnections = getVerifiedCostUsageAwsConnections(awsConnections);
  const selectedConnection = verifiedConnections.find(
    (connection) => connection.id === selectedConnectionId
  );

  return selectedConnection ?? verifiedConnections[0] ?? null;
}

export function formatCostUsageAwsConnectionLabel(connection: AwsConnection): string {
  const accountLabel = connection.accountId ?? "account 미확인";

  return `${accountLabel} · ${connection.region}`;
}
