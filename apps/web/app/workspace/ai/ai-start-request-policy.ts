export type AiStartDraftTransport = "json" | "stream";

export function getAiStartDraftTransport(
  existingProjectId: string | undefined
): AiStartDraftTransport {
  return existingProjectId === undefined ? "stream" : "json";
}
