import type { ArchitectureDiagnostic } from "@sketchcatch/types";

export function createArchitectureDiagnosticKey(diagnostic: ArchitectureDiagnostic): string {
  return `${diagnostic.ruleId}:${diagnostic.resourceNodeId}`;
}

export function replaceArchitectureDiagnostics(
  _current: readonly ArchitectureDiagnostic[],
  next: readonly ArchitectureDiagnostic[]
): ArchitectureDiagnostic[] {
  return [...next];
}
