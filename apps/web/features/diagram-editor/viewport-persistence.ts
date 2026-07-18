export type ViewportPersistenceContext = {
  readonly automaticMoveRequestId: number;
  readonly isPreviewActive: boolean;
  readonly isViewer: boolean;
};

export function shouldPersistViewportAfterMove({
  automaticMoveRequestId,
  isPreviewActive,
  isViewer
}: ViewportPersistenceContext): boolean {
  return automaticMoveRequestId === 0 && !isPreviewActive && !isViewer;
}

/** 편집 보드에서 사용자가 직접 이동한 viewport만 저장합니다. */
export function persistViewportAfterMove<TViewport>(
  context: ViewportPersistenceContext,
  viewport: TViewport,
  persistViewport: (viewport: TViewport) => void
): void {
  if (!shouldPersistViewportAfterMove(context)) {
    return;
  }

  persistViewport(viewport);
}
