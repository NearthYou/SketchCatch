export type CostRequest = {
  readonly isCurrent: () => boolean;
  readonly signal: AbortSignal;
};

export type CostRequestCoordinator = {
  readonly begin: () => CostRequest;
  readonly dispose: () => void;
};

// 서로 겹친 비용 조회가 늦게 도착해 최신 화면을 덮지 못하게 합니다.
export function createCostRequestCoordinator(): CostRequestCoordinator {
  let activeController: AbortController | null = null;
  let requestSequence = 0;

  return {
    begin: () => {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      const requestId = requestSequence + 1;
      requestSequence = requestId;

      return {
        isCurrent: () => requestId === requestSequence,
        signal: controller.signal
      };
    },
    dispose: () => activeController?.abort()
  };
}
