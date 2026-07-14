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

export const initialLiveObservationAudienceState: LiveObservationAudienceViewState =
  Object.freeze({
    bootstrapReady: false,
    pageState: "connecting",
    successCount: 0
  });

export function createLiveObservationAudienceSession(dependencies: SessionDependencies) {
  const clientRef: { current: ActiveClient | null } = { current: null };
  let generation = 0;
  let inFlight: ActiveClient | null = null;
  let state = initialLiveObservationAudienceState;

  function publish(nextState: LiveObservationAudienceViewState): void {
    state = Object.freeze(nextState);
    dependencies.onState(state);
  }

  function isCurrent(activeClient: ActiveClient): boolean {
    return (
      clientRef.current === activeClient &&
      clientRef.current.generation === activeClient.generation
    );
  }

  async function bootstrap(activeClient: ActiveClient): Promise<void> {
    if (!isCurrent(activeClient) || inFlight) return;
    inFlight = activeClient;
    publish({ bootstrapReady: false, pageState: "connecting", successCount: 0 });
    try {
      await activeClient.client.bootstrap();
      if (isCurrent(activeClient)) {
        publish({ bootstrapReady: true, pageState: "ready", successCount: 0 });
      }
    } catch (error) {
      if (isCurrent(activeClient)) {
        publish({ bootstrapReady: false, pageState: toPageState(error), successCount: 0 });
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
        if (clientRef.current === activeClient) clientRef.current = null;
        if (inFlight === activeClient) inFlight = null;
      };
    },

    reconnect(): void {
      const activeClient = clientRef.current;
      if (activeClient) void bootstrap(activeClient);
    },

    async request(): Promise<void> {
      const activeClient = clientRef.current;
      if (!activeClient || !state.bootstrapReady || inFlight) return;
      inFlight = activeClient;
      publish({ ...state, pageState: "sending" });
      try {
        await activeClient.client.request();
        if (isCurrent(activeClient)) {
          publish({
            bootstrapReady: true,
            pageState: "success",
            successCount: state.successCount + 1
          });
        }
      } catch (error) {
        if (isCurrent(activeClient)) {
          const pageState = toPageState(error);
          publish({
            ...state,
            bootstrapReady: pageState !== "expired",
            pageState
          });
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
