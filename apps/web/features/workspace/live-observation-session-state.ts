import type {
  LiveObservationV2Session,
  LiveObservationV2Snapshot
} from "@sketchcatch/types";

export type LiveObservationSessionState = {
  readonly projectId: string;
  readonly session: LiveObservationV2Session | null;
  readonly snapshot: LiveObservationV2Snapshot | null;
};

export function createLiveObservationSessionState(
  projectId: string
): LiveObservationSessionState {
  return { projectId, session: null, snapshot: null };
}

export function retainLiveObservationSession(
  state: LiveObservationSessionState,
  projectId: string,
  session: LiveObservationV2Session | null
): LiveObservationSessionState {
  const current =
    state.projectId === projectId ? state : createLiveObservationSessionState(projectId);

  return current.session === session ? current : { ...current, session };
}

export function retainLiveObservationSnapshot(
  state: LiveObservationSessionState,
  projectId: string,
  snapshot: LiveObservationV2Snapshot | null
): LiveObservationSessionState {
  const current =
    state.projectId === projectId ? state : createLiveObservationSessionState(projectId);

  return current.snapshot === snapshot ? current : { ...current, snapshot };
}

export function readLiveObservationSessionState(
  state: LiveObservationSessionState,
  projectId: string
): {
  readonly session: LiveObservationV2Session | null;
  readonly snapshot: LiveObservationV2Snapshot | null;
} {
  return state.projectId === projectId
    ? { session: state.session, snapshot: state.snapshot }
    : { session: null, snapshot: null };
}
