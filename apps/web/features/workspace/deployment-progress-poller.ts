import type { DeploymentProgressSnapshot } from "@sketchcatch/types";

type FetchDeploymentProgressSnapshot = (
  deploymentId: string,
  signal: AbortSignal
) => Promise<DeploymentProgressSnapshot>;

type Schedule = (callback: () => void, delayMs: number) => unknown;
type CancelSchedule = (handle: unknown) => void;

export type DeploymentProgressPollerOptions = {
  readonly fetchSnapshot: FetchDeploymentProgressSnapshot;
  readonly schedule?: Schedule;
  readonly cancelSchedule?: CancelSchedule;
};

export class DeploymentProgressPoller {
  readonly #fetchSnapshot: FetchDeploymentProgressSnapshot;
  readonly #schedule: Schedule;
  readonly #cancelSchedule: CancelSchedule;
  #controller: AbortController | null = null;
  #generation = 0;
  #scheduledHandle: unknown;

  constructor(options: DeploymentProgressPollerOptions) {
    this.#fetchSnapshot = options.fetchSnapshot;
    this.#schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.#cancelSchedule =
      options.cancelSchedule ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  start(
    deploymentId: string,
    onSnapshot: (snapshot: DeploymentProgressSnapshot) => void,
    onError: (error: unknown) => void
  ): void {
    this.stop();
    const generation = this.#generation;

    const scheduleNext = (poll: () => Promise<void>) => {
      if (generation !== this.#generation) return;

      this.#scheduledHandle = this.#schedule(() => {
        this.#scheduledHandle = undefined;
        void poll();
      }, 1_000);
    };

    const poll = async (): Promise<void> => {
      if (generation !== this.#generation) return;

      const controller = new AbortController();
      this.#controller = controller;

      try {
        const snapshot = await this.#fetchSnapshot(deploymentId, controller.signal);

        if (generation !== this.#generation || controller.signal.aborted) return;
        onSnapshot(snapshot);

        if (snapshot.status === "PENDING" || snapshot.status === "RUNNING") {
          scheduleNext(poll);
        }
      } catch (error) {
        if (generation !== this.#generation || controller.signal.aborted) return;
        onError(error);
        scheduleNext(poll);
      } finally {
        if (this.#controller === controller) {
          this.#controller = null;
        }
      }
    };

    void poll();
  }

  stop(): void {
    this.#generation += 1;
    this.#controller?.abort();
    this.#controller = null;

    if (this.#scheduledHandle !== undefined) {
      this.#cancelSchedule(this.#scheduledHandle);
      this.#scheduledHandle = undefined;
    }
  }
}
