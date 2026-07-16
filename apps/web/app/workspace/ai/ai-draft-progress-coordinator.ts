import type {
  ArchitectureDraftCandidateExclusion,
  ArchitectureDraftProgressSnapshot,
  ArchitectureJson,
  CreateArchitectureDraftRequest
} from "@sketchcatch/types";
import {
  awaitDraftProgressInput,
  completeDraftProgress,
  createDraftProgressState,
  interruptDraftProgress,
  projectDraftProgressExclusions,
  receiveDraftProgressSnapshot,
  startDraftProgressRequest,
  type DraftProgressDifference,
  type DraftProgressState
} from "./ai-draft-progress-model";

export type AiDraftProgressRequestHandle = {
  readonly identity: number;
  readonly request: CreateArchitectureDraftRequest;
  readonly signal: AbortSignal;
};

export type AiDraftProgressCandidateRestart = {
  readonly exclusion: ArchitectureDraftCandidateExclusion;
  readonly request: CreateArchitectureDraftRequest;
  readonly state: DraftProgressState;
};

export type AiDraftProgressUndoRestart = {
  readonly request: CreateArchitectureDraftRequest;
  readonly state: DraftProgressState;
};

type ActiveRequest = {
  readonly controller: AbortController;
  readonly handle: AiDraftProgressRequestHandle;
};

// React 상태와 fetch 사이의 순서·취소·재시작 규칙을 하나의 테스트 가능한 경계로 담습니다.
export class AiDraftProgressCoordinator {
  #activeRequest: ActiveRequest | null = null;
  #candidateExclusions: readonly ArchitectureDraftCandidateExclusion[] = [];
  #lastExclusion: ArchitectureDraftCandidateExclusion | null = null;
  #lastRequest: CreateArchitectureDraftRequest | null = null;
  #requestIdentity = 0;
  #state: DraftProgressState = createDraftProgressState();

  get state(): DraftProgressState {
    return this.#state;
  }

  get lastExclusion(): ArchitectureDraftCandidateExclusion | null {
    return this.#lastExclusion;
  }

  get hasActiveRequest(): boolean {
    return this.#activeRequest !== null;
  }

  begin(input: CreateArchitectureDraftRequest): AiDraftProgressRequestHandle {
    this.#cancelActiveRequest();
    const request = this.#withCurrentCandidateExclusions(input);
    this.#candidateExclusions = request.candidateExclusions ?? [];
    this.#lastRequest = request;
    this.#state = startDraftProgressRequest(this.#state);

    const controller = new AbortController();
    const handle: AiDraftProgressRequestHandle = {
      identity: ++this.#requestIdentity,
      request,
      signal: controller.signal
    };
    this.#activeRequest = { controller, handle };
    return handle;
  }

  receive(
    handle: AiDraftProgressRequestHandle,
    snapshot: ArchitectureDraftProgressSnapshot
  ): DraftProgressState | null {
    if (!this.#isActive(handle)) {
      return null;
    }

    const nextState = receiveDraftProgressSnapshot(
      this.#state,
      snapshot,
      this.#candidateExclusions
    );
    if (nextState === this.#state) {
      return null;
    }

    this.#state = nextState;
    return nextState;
  }

  complete(handle: AiDraftProgressRequestHandle): boolean {
    if (!this.#isActive(handle)) {
      return false;
    }

    this.#activeRequest = null;
    return true;
  }

  isActive(handle: AiDraftProgressRequestHandle): boolean {
    return this.#isActive(handle);
  }

  interrupt(handle: AiDraftProgressRequestHandle): DraftProgressState | null {
    if (!this.#isActive(handle)) {
      return null;
    }

    this.#activeRequest = null;
    this.#state = interruptDraftProgress(this.#state);
    return this.#state;
  }

  cancel(markInterrupted: boolean): DraftProgressState {
    const cancelled = this.#cancelActiveRequest();
    if (cancelled && markInterrupted) {
      this.#state = interruptDraftProgress(this.#state);
    }
    return this.#state;
  }

  dispose(): void {
    this.#cancelActiveRequest();
  }

  awaitInput(): DraftProgressState {
    this.#state = awaitDraftProgressInput(this.#state);
    return this.#state;
  }

  markInterrupted(): DraftProgressState {
    this.#state = interruptDraftProgress(this.#state);
    return this.#state;
  }

  retryRequest(): CreateArchitectureDraftRequest | null {
    return this.#lastRequest;
  }

  exclude(candidateId: string): AiDraftProgressCandidateRestart | null {
    const visibleSnapshot = this.#state.visibleSnapshot;
    const serverSnapshot = this.#state.serverSnapshot;
    if (
      visibleSnapshot === null ||
      serverSnapshot === null ||
      this.#lastRequest === null ||
      !visibleSnapshot.excludableCandidateIds.includes(candidateId)
    ) {
      return null;
    }

    const candidate = serverSnapshot.provisionalArchitectureJson?.nodes.find(
      (node) => node.id === candidateId
    );
    if (candidate === undefined) {
      return null;
    }

    const exclusion: ArchitectureDraftCandidateExclusion = {
      candidateId,
      resourceType: candidate.type,
      label: candidate.label?.trim() || candidate.type
    };
    const nextExclusions = [
      ...this.#candidateExclusions.filter(
        (current) =>
          current.candidateId !== exclusion.candidateId ||
          current.resourceType !== exclusion.resourceType
      ),
      exclusion
    ];
    const request = {
      ...this.#lastRequest,
      candidateExclusions: nextExclusions
    };

    this.#candidateExclusions = nextExclusions;
    this.#lastExclusion = exclusion;
    this.#lastRequest = request;
    this.#state = projectDraftProgressExclusions(this.#state, nextExclusions);
    this.#cancelActiveRequest();

    return { exclusion, request, state: this.#state };
  }

  undoLastExclusion(): AiDraftProgressUndoRestart | null {
    if (this.#lastExclusion === null || this.#lastRequest === null) {
      return null;
    }

    const exclusion = this.#lastExclusion;
    const remainingExclusions = this.#candidateExclusions.filter(
      (candidate) =>
        candidate.candidateId !== exclusion.candidateId ||
        candidate.resourceType !== exclusion.resourceType
    );
    const request = {
      ...this.#lastRequest,
      candidateExclusions: remainingExclusions
    };

    this.#candidateExclusions = remainingExclusions;
    this.#lastExclusion = null;
    this.#lastRequest = request;
    this.#state = projectDraftProgressExclusions(this.#state, remainingExclusions);
    this.#cancelActiveRequest();

    return { request, state: this.#state };
  }

  finalize<Value>(
    finalArchitectureJson: ArchitectureJson,
    createValue: () => Value
  ): {
    readonly difference: DraftProgressDifference | null;
    readonly state: DraftProgressState;
    readonly value: Value;
  } {
    const completedProgress = completeDraftProgress(this.#state, finalArchitectureJson);
    const value = createValue();

    this.#state = completedProgress.state;
    this.#lastExclusion = null;
    return { ...completedProgress, value };
  }

  #cancelActiveRequest(): boolean {
    if (this.#activeRequest === null) {
      return false;
    }

    const { controller } = this.#activeRequest;
    this.#activeRequest = null;
    this.#requestIdentity += 1;
    controller.abort();
    return true;
  }

  #isActive(handle: AiDraftProgressRequestHandle): boolean {
    return (
      this.#activeRequest?.handle === handle &&
      handle.identity === this.#requestIdentity &&
      !handle.signal.aborted
    );
  }

  #withCurrentCandidateExclusions(
    request: CreateArchitectureDraftRequest
  ): CreateArchitectureDraftRequest {
    if (request.candidateExclusions !== undefined || this.#candidateExclusions.length === 0) {
      return request;
    }

    return {
      ...request,
      candidateExclusions: this.#candidateExclusions
    };
  }
}
