import type { TerraformDiagnostic } from "@sketchcatch/types";

const TERRAFORM_ISSUES_STORAGE_PREFIX = "sketchcatch:terraform-issues";

export type TerraformIssueRecord = {
  readonly diagnosticKey: string;
  readonly diagnostic: TerraformDiagnostic;
  readonly isStale: boolean;
  readonly lastValidatedAt: string;
  readonly lastSeenAt: string;
};

export function createTerraformIssuesStorageKey(projectId: string): string {
  return `${TERRAFORM_ISSUES_STORAGE_PREFIX}:${projectId}`;
}

export function createTerraformDiagnosticKey(diagnostic: TerraformDiagnostic | null): string {
  if (!diagnostic) {
    return "";
  }

  return JSON.stringify({
    code: diagnostic.code ?? "",
    line: diagnostic.line ?? 0,
    message: diagnostic.message,
    nodeId: diagnostic.nodeId ?? "",
    resourceAddress: diagnostic.resourceAddress ?? "",
    severity: diagnostic.severity,
    sourceFileName: diagnostic.sourceFileName ?? ""
  });
}

export function combineTerraformDiagnostics(
  ...diagnosticGroups: readonly (readonly TerraformDiagnostic[])[]
): TerraformDiagnostic[] {
  const seenDiagnosticKeys = new Set<string>();
  const combinedDiagnostics: TerraformDiagnostic[] = [];

  for (const diagnostics of diagnosticGroups) {
    for (const diagnostic of diagnostics) {
      const diagnosticKey = createTerraformDiagnosticKey(diagnostic);

      if (seenDiagnosticKeys.has(diagnosticKey)) {
        continue;
      }

      seenDiagnosticKeys.add(diagnosticKey);
      combinedDiagnostics.push(diagnostic);
    }
  }

  return combinedDiagnostics;
}

export function mergeTerraformValidationDiagnostics(
  _currentIssues: readonly TerraformIssueRecord[],
  diagnostics: readonly TerraformDiagnostic[],
  validatedAt: string
): TerraformIssueRecord[] {
  return diagnostics.map((diagnostic) => {
    const diagnosticKey = createTerraformDiagnosticKey(diagnostic);

    return {
      diagnosticKey,
      diagnostic,
      isStale: false,
      lastValidatedAt: validatedAt,
      lastSeenAt: validatedAt
    };
  });
}

export function markTerraformIssuesStale(
  issues: readonly TerraformIssueRecord[]
): TerraformIssueRecord[] {
  return issues.map((issue) => ({
    ...issue,
    isStale: true
  }));
}

export function readStoredTerraformIssues(
  storage: Pick<Storage, "getItem">,
  projectId: string
): TerraformIssueRecord[] {
  try {
    const rawPayload = storage.getItem(createTerraformIssuesStorageKey(projectId));

    if (!rawPayload) {
      return [];
    }

    const parsedPayload: unknown = JSON.parse(rawPayload);
    return isTerraformIssueRecordArray(parsedPayload) ? parsedPayload : [];
  } catch {
    return [];
  }
}

export function storeTerraformIssues(
  storage: Pick<Storage, "removeItem" | "setItem">,
  projectId: string,
  issues: readonly TerraformIssueRecord[]
): void {
  const storageKey = createTerraformIssuesStorageKey(projectId);

  try {
    if (issues.length === 0) {
      storage.removeItem(storageKey);
      return;
    }

    storage.setItem(storageKey, JSON.stringify(issues));
  } catch (error) {
    console.error("Failed to store terraform issues in localStorage:", error);
  }
}

function isTerraformIssueRecordArray(value: unknown): value is TerraformIssueRecord[] {
  return Array.isArray(value) && value.every(isTerraformIssueRecord);
}

function isTerraformIssueRecord(value: unknown): value is TerraformIssueRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<TerraformIssueRecord>;

  return (
    typeof candidate.diagnosticKey === "string" &&
    typeof candidate.isStale === "boolean" &&
    typeof candidate.lastValidatedAt === "string" &&
    typeof candidate.lastSeenAt === "string" &&
    isTerraformDiagnostic(candidate.diagnostic)
  );
}

function isTerraformDiagnostic(value: unknown): value is TerraformDiagnostic {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<TerraformDiagnostic>;

  return (
    (candidate.severity === "info" ||
      candidate.severity === "warning" ||
      candidate.severity === "error") &&
    typeof candidate.message === "string"
  );
}
