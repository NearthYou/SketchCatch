const TRANSCRIPT_FOLLOW_THRESHOLD_PX = 48;

export function isWorkspaceAiTranscriptNearBottom({
  clientHeight,
  scrollHeight,
  scrollTop
}: {
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly scrollTop: number;
}): boolean {
  return scrollHeight - scrollTop - clientHeight <= TRANSCRIPT_FOLLOW_THRESHOLD_PX;
}

export function removeWorkspaceAiSelectionEntries(
  selections: Readonly<Record<string, readonly string[]>>,
  removedMessageIds: ReadonlySet<string>
): Record<string, readonly string[]> {
  return Object.fromEntries(
    Object.entries(selections).filter(([messageId]) => !removedMessageIds.has(messageId))
  );
}
