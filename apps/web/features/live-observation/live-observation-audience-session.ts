import { LiveObservationAudienceError } from "./live-observation-audience-client";

export type LiveObservationAudiencePageState =
  | "connecting"
  | "ready"
  | "sending"
  | "success"
  | "error"
  | "expired"
  | "rate_limited";

export type LiveObservationAudienceViewState = Readonly<{
  bootstrapReady: boolean;
  pageState: LiveObservationAudiencePageState;
  retryAfterSeconds: number | null;
  successCount: number;
}>;

type AudienceClient = Readonly<{
  bootstrap: () => Promise<void>;
  dispose: () => void;
  request: () => Promise<Readonly<{ accepted: boolean; acceptedEventCount: number }>>;
}>;

type ActiveClient = Readonly<{
  client: AudienceClient;
  generation: number;
}>;

type SessionDependencies = Readonly<{
  createClient: (publicId: string) => AudienceClient;
  onState: (state: LiveObservationAudienceViewState) => void;
}>;

export const initialLiveObservationAudienceState: LiveObservationAudienceViewState = Object.freeze({
  bootstrapReady: false,
  pageState: "connecting",
  retryAfterSeconds: null,
  successCount: 0
});

export function createLiveObservationAudienceSession(dependencies: SessionDependencies) {
  const clientRef: { current: ActiveClient | null } = { current: null };
  let generation = 0;
  let inFlight: ActiveClient | null = null;
  let state = initialLiveObservationAudienceState;
  let cooldownTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  function publish(nextState: LiveObservationAudienceViewState): void {
    state = Object.freeze(nextState);
    dependencies.onState(state);
  }

  function isCurrent(activeClient: ActiveClient): boolean {
    return (
      clientRef.current === activeClient && clientRef.current.generation === activeClient.generation
    );
  }

  function clearCooldown(): void {
    if (cooldownTimer !== null) globalThis.clearTimeout(cooldownTimer);
    cooldownTimer = null;
  }

  function scheduleCooldown(activeClient: ActiveClient, retryAfterSeconds: number | null): void {
    clearCooldown();
    if (retryAfterSeconds === null || retryAfterSeconds <= 0) return;
    cooldownTimer = globalThis.setTimeout(() => {
      cooldownTimer = null;
      if (isCurrent(activeClient) && state.pageState === "rate_limited") {
        publish({
          ...state,
          pageState: "ready",
          retryAfterSeconds: null
        });
      }
    }, retryAfterSeconds * 1_000);
    (cooldownTimer as { unref?: () => void }).unref?.();
  }

  async function bootstrap(activeClient: ActiveClient): Promise<void> {
    if (!isCurrent(activeClient) || inFlight) return;
    clearCooldown();
    inFlight = activeClient;
    publish({
      bootstrapReady: false,
      pageState: "connecting",
      retryAfterSeconds: null,
      successCount: 0
    });
    try {
      await activeClient.client.bootstrap();
      if (isCurrent(activeClient)) {
        publish({
          bootstrapReady: true,
          pageState: "ready",
          retryAfterSeconds: null,
          successCount: 0
        });
      }
    } catch (error) {
      if (isCurrent(activeClient)) {
        const retryAfterSeconds = retryAfterSecondsFrom(error);
        publish({
          bootstrapReady: false,
          pageState: toPageState(error),
          retryAfterSeconds,
          successCount: 0
        });
        scheduleCooldown(activeClient, retryAfterSeconds);
      }
    } finally {
      if (inFlight === activeClient) inFlight = null;
    }
  }

  return Object.freeze({
    activate(publicId: string): () => void {
      const activeClient = Object.freeze({
        client: dependencies.createClient(publicId),
        generation: ++generation
      });
      clientRef.current = activeClient;
      void bootstrap(activeClient);

      return () => {
        activeClient.client.dispose();
        if (clientRef.current === activeClient) {
          clearCooldown();
          clientRef.current = null;
        }
        if (inFlight === activeClient) inFlight = null;
      };
    },

    reconnect(): void {
      const activeClient = clientRef.current;
      if (activeClient) void bootstrap(activeClient);
    },

    async request(): Promise<void> {
      const activeClient = clientRef.current;
      if (!activeClient || !state.bootstrapReady || inFlight || state.retryAfterSeconds !== null)
        return;
      inFlight = activeClient;
      publish({ ...state, pageState: "sending" });
      try {
        await activeClient.client.request();
        if (isCurrent(activeClient)) {
          publish({
            bootstrapReady: true,
            pageState: "success",
            retryAfterSeconds: null,
            successCount: state.successCount + 1
          });
        }
      } catch (error) {
        if (isCurrent(activeClient)) {
          const pageState = toPageState(error);
          const retryAfterSeconds = retryAfterSecondsFrom(error);
          publish({
            ...state,
            bootstrapReady: pageState !== "expired",
            pageState,
            retryAfterSeconds
          });
          scheduleCooldown(activeClient, retryAfterSeconds);
        }
      } finally {
        if (inFlight === activeClient) inFlight = null;
      }
    }
  });
}

function toPageState(
  error: unknown
): Extract<LiveObservationAudiencePageState, "error" | "expired" | "rate_limited"> {
  if (error instanceof LiveObservationAudienceError) {
    if (error.kind === "expired") return "expired";
    if (error.kind === "rate_limited") return "rate_limited";
  }
  return "error";
}

function retryAfterSecondsFrom(error: unknown): number | null {
  return error instanceof LiveObservationAudienceError && error.kind === "rate_limited"
    ? error.retryAfterSeconds
    : null;
}
