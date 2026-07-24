export const apiRuntimeContractVersion = "v1";

export type ApiRuntimeIdentity = {
  readonly apiRevision: string;
  readonly contractVersion: typeof apiRuntimeContractVersion;
  readonly databaseMigrationHead: string | null;
};

type CreateApiRuntimeIdentityInput = {
  readonly apiRevision?: string | undefined;
  readonly databaseMigrationHead: string | null;
};

export function createApiRuntimeIdentity({
  apiRevision = process.env.SKETCHCATCH_API_REVISION,
  databaseMigrationHead
}: CreateApiRuntimeIdentityInput): ApiRuntimeIdentity {
  return {
    apiRevision: normalizeApiRevision(apiRevision),
    contractVersion: apiRuntimeContractVersion,
    databaseMigrationHead
  };
}

function normalizeApiRevision(value: string | undefined): string {
  const revision = value?.trim();

  if (!revision || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(revision)) {
    return "unconfigured";
  }

  return revision;
}
