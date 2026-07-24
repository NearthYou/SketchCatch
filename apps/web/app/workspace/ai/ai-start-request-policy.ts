import type { CreateArchitectureDraftRequest } from "@sketchcatch/types";

export type AiStartDraftTransport = "json" | "stream";

export function getAiStartDraftTransport(
  request: CreateArchitectureDraftRequest
): AiStartDraftTransport {
  return request.repositoryAnalysis === undefined && request.repositoryEvidence === undefined
    ? "stream"
    : "json";
}
