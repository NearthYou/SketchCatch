import { fetchProjectThumbnail as defaultFetchProjectThumbnail } from "./api";
import {
  captureAndUploadProjectBoardThumbnail,
  type ProjectBoardThumbnailCaptureResult
} from "./project-board-thumbnail";

export type ProjectBoardThumbnailLifecycleState =
  | "idle"
  | "checking"
  | "capturing"
  | "ready"
  | "failed";

type ThumbnailWork = {
  readonly checkExisting: boolean;
  readonly forceCapture: boolean;
  readonly revision: number;
};

type ThumbnailWaiter = {
  readonly reject: (error: unknown) => void;
  readonly resolve: () => void;
  readonly revision: number;
};

type ProjectBoardThumbnailLifecycleOptions = {
  readonly captureAndUpload?: ((input: {
    readonly element: HTMLElement;
    readonly projectId: string;
    readonly revision: number;
  }) => Promise<ProjectBoardThumbnailCaptureResult>) | undefined;
  readonly fetchProjectThumbnail?: ((projectId: string) => Promise<Blob | null>) | undefined;
  readonly onCaptureUploaded?: ((projectId: string) => void) | undefined;
  readonly onStateChange?: ((state: ProjectBoardThumbnailLifecycleState) => void) | undefined;
  readonly projectId: string;
  readonly waitForInitialCaptureStability?: (() => Promise<void>) | undefined;
};

const CAPTURE_UNAVAILABLE_ERROR = new Error(
  "Board capture unavailable for canonical server revision."
);
const DISPOSED_ERROR = new Error("Project Board thumbnail lifecycle is disposed.");
const INITIAL_CAPTURE_SETTLE_DELAY_MS = 600;

function waitForInitialCaptureStability(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, INITIAL_CAPTURE_SETTLE_DELAY_MS);
  });
}

export function createProjectBoardThumbnailLifecycle({
  captureAndUpload = ({ element, projectId }) =>
    captureAndUploadProjectBoardThumbnail({ element, projectId }),
  fetchProjectThumbnail = defaultFetchProjectThumbnail,
  onCaptureUploaded,
  onStateChange,
  projectId,
  waitForInitialCaptureStability: waitForInitialCaptureStabilityFn = waitForInitialCaptureStability
}: ProjectBoardThumbnailLifecycleOptions) {
  let state: ProjectBoardThumbnailLifecycleState = "idle";
  let boardElement: HTMLElement | null = null;
  let activeWork: ThumbnailWork | null = null;
  let pendingWork: ThumbnailWork | null = null;
  let completedRevision = -1;
  let failedWork: ThumbnailWork | null = null;
  let failedError: unknown = null;
  let disposed = false;
  const waiters: ThumbnailWaiter[] = [];

  function publish(nextState: ProjectBoardThumbnailLifecycleState): void {
    if (disposed || state === nextState) {
      return;
    }

    state = nextState;
    onStateChange?.(nextState);
  }

  function createWaiter(revision: number): Promise<void> {
    return new Promise((resolve, reject) => {
      waiters.push({ reject, resolve, revision });
    });
  }

  function resolveWaitersThrough(revision: number): void {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];

      if (waiter && waiter.revision <= revision) {
        waiters.splice(index, 1);
        waiter.resolve();
      }
    }
  }

  function rejectWaitersThrough(revision: number, error: unknown): void {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];

      if (waiter && waiter.revision <= revision) {
        waiters.splice(index, 1);
        waiter.reject(error);
      }
    }
  }

  async function performWork(work: ThumbnailWork, element: HTMLElement): Promise<void> {
    if (work.checkExisting) {
      publish("checking");
      const existingThumbnail = await fetchProjectThumbnail(projectId);

      if (existingThumbnail) {
        return;
      }

      // 기존 Project를 열 때는 React Flow의 초기 자동 맞춤과 정렬이 끝난 뒤에만 보정 캡처합니다.
      await waitForInitialCaptureStabilityFn();
    }

    publish("capturing");
    const result = await captureAndUpload({
      element,
      projectId,
      revision: work.revision
    });

    if (result.status === "skipped") {
      throw CAPTURE_UNAVAILABLE_ERROR;
    }

    try {
      onCaptureUploaded?.(projectId);
    } catch {
      // Cache refresh failures do not change the successful upload result.
    }
  }

  function startNextWork(): void {
    if (disposed || activeWork || !pendingWork || !boardElement) {
      return;
    }

    const work = pendingWork;
    const element = boardElement;
    pendingWork = null;
    activeWork = work;

    void performWork(work, element).then(
      () => {
        if (disposed || activeWork !== work) {
          return;
        }

        activeWork = null;
        completedRevision = Math.max(completedRevision, work.revision);
        failedWork = null;
        failedError = null;
        resolveWaitersThrough(work.revision);

        if (pendingWork) {
          startNextWork();
        } else {
          publish("ready");
        }
      },
      (error: unknown) => {
        if (disposed || activeWork !== work) {
          return;
        }

        activeWork = null;

        if (pendingWork && pendingWork.revision > work.revision) {
          startNextWork();
          return;
        }

        failedWork = work;
        failedError = error;
        rejectWaitersThrough(work.revision, error);
        publish("failed");
      }
    );
  }

  function requestRevision(work: ThumbnailWork): Promise<void> {
    if (disposed) {
      return Promise.reject(DISPOSED_ERROR);
    }

    if (!work.forceCapture && completedRevision >= work.revision) {
      return Promise.resolve();
    }

    if (!activeWork && !pendingWork && failedWork && failedWork.revision >= work.revision) {
      return Promise.reject(failedError);
    }

    const waiter = createWaiter(work.revision);

    if (failedWork && work.revision > failedWork.revision) {
      failedWork = null;
      failedError = null;
    }

    const needsCaptureAfterActiveWork =
      work.forceCapture && activeWork?.forceCapture !== true;

    if (!activeWork || work.revision > activeWork.revision || needsCaptureAfterActiveWork) {
      if (
        !pendingWork ||
        work.revision > pendingWork.revision ||
        (work.forceCapture && pendingWork.forceCapture !== true)
      ) {
        pendingWork = work;
      } else if (work.revision === pendingWork.revision && !work.checkExisting) {
        pendingWork = work;
      }
    }

    startNextWork();
    return waiter;
  }

  return {
    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      boardElement = null;
      activeWork = null;
      pendingWork = null;
      failedWork = null;
      failedError = null;

      for (const waiter of waiters.splice(0)) {
        waiter.reject(DISPOSED_ERROR);
      }
    },
    getState(): ProjectBoardThumbnailLifecycleState {
      return state;
    },
    requestInitialServerRevision(revision: number): Promise<void> {
      return requestRevision({ checkExisting: true, forceCapture: false, revision });
    },
    requestSavedRevision(revision: number): Promise<void> {
      return requestRevision({ checkExisting: false, forceCapture: true, revision });
    },
    retry(): Promise<void> {
      if (disposed) {
        return Promise.reject(DISPOSED_ERROR);
      }

      if (!failedWork) {
        return Promise.resolve();
      }

      const work = failedWork;
      failedWork = null;
      failedError = null;
      const waiter = createWaiter(work.revision);
      pendingWork = work;
      startNextWork();
      return waiter;
    },
    setBoardElement(element: HTMLElement): void {
      if (disposed) {
        return;
      }

      boardElement = element;
      startNextWork();
    }
  };
}
