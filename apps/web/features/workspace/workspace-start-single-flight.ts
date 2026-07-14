export type WorkspaceStartRunResult<T> =
  | { readonly status: "completed"; readonly value: T }
  | { readonly status: "ignored" };

export type WorkspaceStartSingleFlight = {
  readonly isRunning: () => boolean;
  readonly run: <T>(operation: () => Promise<T>) => Promise<WorkspaceStartRunResult<T>>;
};

// 시작 요청 하나가 끝날 때까지 다른 시작 버튼에서 들어온 요청을 함께 막습니다.
export function createWorkspaceStartSingleFlight(): WorkspaceStartSingleFlight {
  let running = false;

  return {
    // React 상태 반영 전에도 현재 요청 점유 상태를 확인할 수 있게 합니다.
    isRunning(): boolean {
      return running;
    },
    // 실패해도 잠금을 반드시 풀어 사용자가 같은 화면에서 다시 시도할 수 있게 합니다.
    async run<T>(operation: () => Promise<T>): Promise<WorkspaceStartRunResult<T>> {
      if (running) {
        return { status: "ignored" };
      }

      running = true;

      try {
        return { status: "completed", value: await operation() };
      } finally {
        running = false;
      }
    }
  };
}
