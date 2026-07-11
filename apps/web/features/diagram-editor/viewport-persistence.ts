/** 자동 화면 맞춤 중에는 viewport 저장을 건너뛰고, 사용자 이동만 저장합니다. */
export function persistViewportAfterMove<TViewport>(
  automaticMoveRequestId: number,
  viewport: TViewport,
  persistViewport: (viewport: TViewport) => void
): void {
  if (automaticMoveRequestId !== 0) {
    return;
  }

  persistViewport(viewport);
}
